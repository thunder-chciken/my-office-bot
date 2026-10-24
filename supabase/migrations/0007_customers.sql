-- My Office Bot — customers (decision D53).
-- Every homeowner a business hears from becomes a customer, matched by phone (last 10 digits) or email
-- so repeat customers aren't duplicated. Contractors can also add customers by hand.

create table public.customers (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null default '',
  phone text,
  email text,
  address text,
  notes text,
  source text not null default 'lead' check (source in ('lead', 'manual')),
  -- Matching keys, kept in step with phone/email by the trigger below.
  phone_key text,
  email_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id)
);

create index customers_account_name_idx on public.customers (account_id, lower(name));
create index customers_phone_key_idx on public.customers (account_id, phone_key) where phone_key is not null;
create index customers_email_key_idx on public.customers (account_id, email_key) where email_key is not null;

create or replace function private.customer_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  new.phone_key := case when length(digits) >= 10 then right(digits, 10) end;
  new.email_key := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger customers_keys
  before insert or update of phone, email, name, address, notes on public.customers
  for each row execute function private.customer_keys();

alter table public.leads add column customer_id uuid;
alter table public.leads
  add constraint leads_customer_fk foreign key (account_id, customer_id)
  references public.customers (account_id, id) on delete set null (customer_id);
create index leads_customer_idx on public.leads (customer_id);

-- Find the customer for a lead's phone/email, or create one. Used by intake (service role) and the backfill.
create or replace function private.match_customer(
  p_account uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  pkey text := case when length(digits) >= 10 then right(digits, 10) end;
  ekey text := nullif(lower(trim(coalesce(p_email, ''))), '');
  cid uuid;
begin
  if pkey is null and ekey is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('customer:' || p_account::text));

  select c.id into cid from public.customers c
  where c.account_id = p_account and ((pkey is not null and c.phone_key = pkey) or (ekey is not null and c.email_key = ekey))
  order by c.created_at
  limit 1;

  if cid is null then
    insert into public.customers (account_id, name, phone, email, address, source)
      values (p_account, coalesce(nullif(trim(p_name), ''), 'Website visitor'), nullif(trim(p_phone), ''), ekey,
              nullif(trim(coalesce(p_address, '')), ''), 'lead')
      returning id into cid;
  else
    -- Fill in anything the customer record was missing; never overwrite what the contractor typed.
    update public.customers c set
      name = case when c.name in ('', 'Website visitor') and coalesce(trim(p_name), '') <> '' then trim(p_name) else c.name end,
      phone = coalesce(c.phone, nullif(trim(p_phone), '')),
      email = coalesce(c.email, ekey),
      address = coalesce(c.address, nullif(trim(coalesce(p_address, '')), ''))
    where c.id = cid;
  end if;
  return cid;
end;
$$;

-- Backfill: every existing real lead gets a customer.
do $$
declare
  l record;
begin
  for l in select id, account_id, name, phone, email, address from public.leads
           where customer_id is null and risk_status in ('ok', 'released') order by received_at
  loop
    update public.leads set customer_id = private.match_customer(l.account_id, l.name, l.phone, l.email, l.address)
    where id = l.id;
  end loop;
end $$;

-- ---------------------------------------------------------------- saves from the app

create or replace function public.save_customer(
  p_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  cid uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'That email address doesn''t look right' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.customers (account_id, name, phone, email, address, notes, source)
      values (acct, left(trim(p_name), 120), nullif(left(trim(coalesce(p_phone, '')), 40), ''), v_email,
              nullif(left(trim(coalesce(p_address, '')), 300), ''), nullif(left(trim(coalesce(p_notes, '')), 4000), ''), 'manual')
      returning id into cid;
  else
    update public.customers set
      name = left(trim(p_name), 120),
      phone = nullif(left(trim(coalesce(p_phone, '')), 40), ''),
      email = v_email,
      address = nullif(left(trim(coalesce(p_address, '')), 300), ''),
      notes = nullif(left(trim(coalesce(p_notes, '')), 4000), '')
    where id = p_id and account_id = acct
    returning id into cid;
    if cid is null then
      raise exception 'Customer not found' using errcode = 'P0002';
    end if;
  end if;
  return cid;
end;
$$;

-- Deleting a customer keeps their leads (they just stop being linked).
create or replace function public.delete_customer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
begin
  delete from public.customers where id = p_id and account_id = acct;
  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------- security

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant select, insert, update, delete on public.customers to service_role;
create policy customers_read on public.customers for select to authenticated using (private.is_member(account_id));

revoke all on function private.customer_keys(), private.match_customer(uuid, text, text, text, text),
  public.save_customer(uuid, text, text, text, text, text), public.delete_customer(uuid) from public, anon;
grant execute on function public.save_customer(uuid, text, text, text, text, text), public.delete_customer(uuid) to authenticated;
-- Intake runs as the service role and links each new lead to its customer.
create or replace function public.link_lead_customer(p_lead uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.leads l
  set customer_id = private.match_customer(l.account_id, l.name, l.phone, l.email, l.address)
  where l.id = p_lead and l.customer_id is null and l.risk_status in ('ok', 'released')
  returning l.customer_id
$$;
revoke all on function public.link_lead_customer(uuid) from public, anon, authenticated;
grant execute on function public.link_lead_customer(uuid) to service_role;
