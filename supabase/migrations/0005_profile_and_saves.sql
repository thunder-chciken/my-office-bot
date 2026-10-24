-- My Office Bot — business profile + the first things the app can save (decision D51).
-- Signed-in people never write tables directly: each change goes through one of these functions,
-- which works out the person's own account from auth.uid() and checks what they're allowed to do.

alter table public.accounts
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists trades text[] not null default '{}';

-- The signed-in person's account and role (one account per person for now).
create or replace function private.my_membership()
returns table (account_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.account_id, m.role from public.memberships m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1
$$;

-- Settings are for owners and admins; anyone on the account can work leads.
create or replace function private.require_account(p_settings boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  acct uuid;
  r text;
begin
  select m.account_id, m.role into acct, r from private.my_membership() m;
  if acct is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_settings and r not in ('owner', 'admin') then
    raise exception 'Only the owner can change settings' using errcode = '42501';
  end if;
  return acct;
end;
$$;

-- ---------------------------------------------------------------- business profile

create or replace function public.update_my_business(
  p_name text,
  p_phone text,
  p_city text,
  p_timezone text,
  p_trades text[],
  p_website text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Business name is required' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  update public.accounts set
    name = left(trim(p_name), 120),
    phone = nullif(left(trim(coalesce(p_phone, '')), 40), ''),
    city = nullif(left(trim(coalesce(p_city, '')), 80), ''),
    timezone = p_timezone,
    trades = coalesce((select array_agg(distinct left(trim(t), 40)) from unnest(p_trades) t where trim(t) <> ''), '{}')
  where id = acct;

  update public.sites set
    domain = lower(regexp_replace(coalesce(trim(p_website), ''), '^(https?://)?(www\.)?|/.*$', '', 'g'))
  where account_id = acct;
end;
$$;

-- ---------------------------------------------------------------- team & alerts (email only in the beta)

create or replace function public.save_contact(
  p_id uuid,
  p_name text,
  p_role text,
  p_phone text,
  p_email text,
  p_alert_email boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  cid uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'That email address doesn''t look right' using errcode = '22023';
  end if;
  if p_alert_email and v_email is null then
    raise exception 'Add an email address to send alerts there' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(acct::text));

  if p_id is null then
    insert into public.contacts (account_id, name, role_label, phone, email, alert_email)
      values (acct, left(trim(p_name), 120), nullif(left(trim(coalesce(p_role, '')), 40), ''),
              nullif(left(trim(coalesce(p_phone, '')), 40), ''), v_email, p_alert_email)
      returning id into cid;
  else
    update public.contacts set
      name = left(trim(p_name), 120),
      role_label = nullif(left(trim(coalesce(p_role, '')), 40), ''),
      phone = nullif(left(trim(coalesce(p_phone, '')), 40), ''),
      email = v_email,
      alert_email = p_alert_email
    where id = p_id and account_id = acct and removed_at is null
    returning id into cid;
    if cid is null then
      raise exception 'Person not found' using errcode = 'P0002';
    end if;
  end if;

  if not exists (select 1 from public.contacts c
                 where c.account_id = acct and c.removed_at is null and c.alert_email and c.email is not null) then
    raise exception 'At least one person has to get lead alerts' using errcode = '23514';
  end if;
  return cid;
end;
$$;

create or replace function public.remove_contact(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
begin
  perform pg_advisory_xact_lock(hashtext(acct::text));
  update public.contacts set removed_at = now(), alert_email = false
  where id = p_id and account_id = acct and removed_at is null;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contacts c
                 where c.account_id = acct and c.removed_at is null and c.alert_email and c.email is not null) then
    raise exception 'At least one person has to get lead alerts' using errcode = '23514';
  end if;
end;
$$;

-- ---------------------------------------------------------------- lead status (new / replied / booked)

create or replace function public.set_lead_status(p_lead uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
  next_state text := case p_status when 'new' then 'notified' when 'contacted' then 'contacted' when 'booked' then 'closed' end;
begin
  if next_state is null then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.leads set
    state = next_state,
    contacted_at = case when p_status in ('contacted', 'booked') then coalesce(contacted_at, now()) else contacted_at end,
    contact_evidence = case when p_status in ('contacted', 'booked') then coalesce(contact_evidence, 'self_reported') else contact_evidence end
  where id = p_lead and account_id = acct;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  insert into public.lead_events (account_id, lead_id, type, actor, data)
    values (acct, p_lead, 'status_changed', 'user', jsonb_build_object('status', p_status, 'by', auth.uid()));
end;
$$;

revoke all on function private.my_membership(), private.require_account(boolean),
  public.update_my_business(text, text, text, text, text[], text),
  public.save_contact(uuid, text, text, text, text, boolean),
  public.remove_contact(uuid), public.set_lead_status(uuid, text) from public, anon;
grant execute on function public.update_my_business(text, text, text, text, text[], text),
  public.save_contact(uuid, text, text, text, text, boolean),
  public.remove_contact(uuid), public.set_lead_status(uuid, text) to authenticated;
