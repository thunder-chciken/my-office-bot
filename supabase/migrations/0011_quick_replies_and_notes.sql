-- My Office Bot — creature comforts (docs/ENHANCEMENTS.md, decision D58): your own quick text replies
-- and notes on a lead. Both stay inside the business's own data, like everything else.

-- ---------------------------------------------------------------- quick replies (up to 10 per business)

-- Null means "use the built-in replies" until the owner writes their own.
alter table public.accounts add column if not exists quick_replies text[];

create or replace function public.save_quick_replies(p_replies text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  cleaned text[];
begin
  -- Null puts the built-in replies back.
  if p_replies is null then
    update public.accounts set quick_replies = null where id = acct;
    return null;
  end if;

  select coalesce(array_agg(trim(r) order by i), '{}') into cleaned
  from unnest(p_replies) with ordinality as t(r, i)
  where trim(coalesce(r, '')) <> '';

  if cardinality(cleaned) > 10 then
    raise exception 'Keep it to 10 quick replies' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(cleaned) r where char_length(r) > 320) then
    raise exception 'Keep each quick reply under 320 characters' using errcode = '22023';
  end if;

  update public.accounts set quick_replies = cleaned where id = acct;
  return cleaned;
end;
$$;

-- ---------------------------------------------------------------- lead notes

create table public.lead_notes (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lead_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (id),
  foreign key (account_id, lead_id) references public.leads (account_id, id) on delete cascade
);

create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at);

alter table public.lead_notes enable row level security;
create policy lead_notes_read on public.lead_notes for select to authenticated using (private.is_member(account_id));
grant select on public.lead_notes to authenticated;
grant select, insert, update, delete on public.lead_notes to service_role;

-- Anyone on the account can add a note to a lead, like working the lead itself.
create or replace function public.add_lead_note(p_lead uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
  v_body text := trim(coalesce(p_body, ''));
  note public.lead_notes;
begin
  if v_body = '' then
    raise exception 'Write a note first' using errcode = '22023';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Keep notes under 1,000 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.leads l where l.id = p_lead and l.account_id = acct) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  insert into public.lead_notes (account_id, lead_id, body, created_by)
    values (acct, p_lead, v_body, auth.uid())
    returning * into note;
  return jsonb_build_object('id', note.id, 'created_at', note.created_at);
end;
$$;

create or replace function public.delete_lead_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
begin
  delete from public.lead_notes where id = p_id and account_id = acct;
  if not found then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_quick_replies(text[]), public.add_lead_note(uuid, text),
  public.delete_lead_note(uuid) from public, anon;
grant execute on function public.save_quick_replies(text[]), public.add_lead_note(uuid, text),
  public.delete_lead_note(uuid) to authenticated;
