-- My Office Bot — council R&D 013 (decision D64): three ways to make sure no lead is left waiting.
--   B. "I'm on it": one tap claims a lead, everyone sees who has it, it can be handed to someone else.
--   A. An instant "we got your request" email to the homeowner, in the business's own words (off until turned on).
--   C. A second reminder (phone notification + email) when nobody has claimed or replied after N minutes.
-- The reminder check runs every minute inside the database (pg_cron) and calls the app only when a lead is due.

-- ---------------------------------------------------------------- leads: who's on it, and whether we reminded

-- acknowledged_at / acknowledged_by_contact_id already exist (0001); the claim fills them in.
alter table public.leads add column if not exists acknowledged_by_name text;
alter table public.leads add column if not exists acknowledged_by_user uuid references auth.users (id) on delete set null;
alter table public.leads add column if not exists reminded_at timestamptz;

-- Leads from before this change never get a late reminder.
update public.leads set reminded_at = received_at where reminded_at is null and received_at < now();

create index if not exists leads_waiting_idx on public.leads (received_at)
  where reminded_at is null and acknowledged_at is null;

-- ---------------------------------------------------------------- accounts: the homeowner email and the reminder

alter table public.accounts add column if not exists confirm_email_on boolean not null default false;
-- Null subject/body = the built-in wording. Null reply-to = the first person who gets email alerts.
alter table public.accounts add column if not exists confirm_email_subject text;
alter table public.accounts add column if not exists confirm_email_body text;
alter table public.accounts add column if not exists confirm_reply_to text;
-- 0 = off.
alter table public.accounts add column if not exists remind_after_min int not null default 15;
do $$ begin
  alter table public.accounts add constraint accounts_remind_after_min_check check (remind_after_min in (0, 5, 10, 15, 30, 60));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- claiming a lead

-- The one place a claim happens, for the app and for the "I'm on it" link in the alert email.
-- Without p_force, a lead someone else already has stays theirs (two people tapping at once).
create or replace function private.claim_lead(
  p_acct uuid, p_lead uuid, p_contact uuid, p_name text, p_user uuid, p_force boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
begin
  select * into l from public.leads where id = p_lead and account_id = p_acct for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  -- Already theirs: nothing to change.
  if l.acknowledged_at is not null
     and ((p_contact is not null and l.acknowledged_by_contact_id = p_contact)
          or (p_contact is null and p_user is not null and l.acknowledged_by_user = p_user)) then
    return jsonb_build_object('claimed', true, 'name', l.acknowledged_by_name, 'at', l.acknowledged_at,
      'contact', l.acknowledged_by_contact_id, 'user', l.acknowledged_by_user);
  end if;

  if l.acknowledged_at is not null and not p_force then
    return jsonb_build_object('claimed', false, 'name', l.acknowledged_by_name, 'at', l.acknowledged_at,
      'contact', l.acknowledged_by_contact_id, 'user', l.acknowledged_by_user);
  end if;

  update public.leads set
    acknowledged_at = now(),
    acknowledged_by_contact_id = p_contact,
    acknowledged_by_name = left(p_name, 80),
    acknowledged_by_user = p_user
  where id = p_lead
  returning * into l;

  insert into public.lead_events (account_id, lead_id, type, actor, data)
    values (p_acct, p_lead, 'claimed', case when p_user is null then 'system' else 'user' end,
      jsonb_build_object('name', left(p_name, 80), 'contact', p_contact, 'by', auth.uid()));

  return jsonb_build_object('claimed', true, 'name', l.acknowledged_by_name, 'at', l.acknowledged_at,
    'contact', l.acknowledged_by_contact_id, 'user', l.acknowledged_by_user);
end;
$$;

-- From the app. No p_contact = "I'm on it" for the signed-in person (named after their entry on the team, matched
-- by email). With p_contact = hand the lead to that person. p_force takes it over from whoever has it.
create or replace function public.claim_lead(p_lead uuid, p_contact uuid default null, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_contact uuid;
  v_name text;
  v_user uuid;
begin
  if p_contact is null then
    select c.id, c.name into v_contact, v_name
    from public.contacts c
    where c.account_id = acct and c.removed_at is null and my_email <> '' and lower(c.email) = my_email
    order by c.created_at
    limit 1;
    v_name := coalesce(v_name, nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
                       nullif(split_part(my_email, '@', 1), ''), 'Someone');
    v_user := auth.uid();
  else
    select c.id, c.name into v_contact, v_name
    from public.contacts c
    where c.id = p_contact and c.account_id = acct and c.removed_at is null;
    if v_contact is null then
      raise exception 'Person not found' using errcode = 'P0002';
    end if;
    -- Handing it to yourself counts as yours.
    if my_email <> '' and exists (select 1 from public.contacts c where c.id = v_contact and lower(c.email) = my_email) then
      v_user := auth.uid();
    end if;
  end if;
  return private.claim_lead(acct, p_lead, v_contact, v_name, v_user, p_force or p_contact is not null);
end;
$$;

-- "Nobody's on it": the lead goes back to waiting (no second reminder if one already went out).
create or replace function public.release_lead(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
begin
  update public.leads set acknowledged_at = null, acknowledged_by_contact_id = null,
    acknowledged_by_name = null, acknowledged_by_user = null
  where id = p_lead and account_id = acct;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  insert into public.lead_events (account_id, lead_id, type, actor, data)
    values (acct, p_lead, 'released', 'user', jsonb_build_object('by', auth.uid()));
end;
$$;

-- From the "I'm on it" link in an alert email (server only; the link is signed for that lead and person).
create or replace function public.claim_lead_from_link(p_lead uuid, p_contact uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid;
  v_name text;
begin
  select l.account_id into acct from public.leads l where l.id = p_lead;
  select c.name into v_name from public.contacts c
  where c.id = p_contact and c.account_id = acct and c.removed_at is null;
  if acct is null or v_name is null then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  return private.claim_lead(acct, p_lead, p_contact, v_name, null, p_force);
end;
$$;

-- ---------------------------------------------------------------- settings (owner/admin)

create or replace function public.save_confirm_email(p_on boolean, p_subject text, p_body text, p_reply_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_reply text := nullif(lower(trim(coalesce(p_reply_to, ''))), '');
begin
  if char_length(v_subject) > 150 then
    raise exception 'Keep the subject under 150 characters' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep the email under 2,000 characters' using errcode = '22023';
  end if;
  if v_reply is not null and v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That reply-to email doesn''t look right' using errcode = '22023';
  end if;
  update public.accounts set
    confirm_email_on = coalesce(p_on, false),
    confirm_email_subject = v_subject,
    confirm_email_body = v_body,
    confirm_reply_to = v_reply
  where id = acct;
end;
$$;

create or replace function public.save_reminder(p_minutes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
begin
  if p_minutes is null or p_minutes not in (0, 5, 10, 15, 30, 60) then
    raise exception 'Pick 5, 10, 15, 30 or 60 minutes, or Off' using errcode = '22023';
  end if;
  update public.accounts set remind_after_min = p_minutes where id = acct;
end;
$$;

-- ---------------------------------------------------------------- the reminder check

-- Quiet hours ({"start":"21:00","end":"07:00"}) in the business's own time zone. Overnight windows wrap midnight.
create or replace function private.in_quiet_hours(p_quiet jsonb, p_tz text, p_now timestamptz)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  t time;
  s time;
  e time;
begin
  begin
    t := (p_now at time zone p_tz)::time;
    s := (p_quiet ->> 'start')::time;
    e := (p_quiet ->> 'end')::time;
  exception when others then
    return false;
  end;
  if s is null or e is null or s = e then
    return false;
  end if;
  if s < e then
    return t >= s and t < e;
  end if;
  return t >= s or t < e;
end;
$$;

-- Leads still waiting: nobody claimed or replied, older than the business's reminder time, from the last day,
-- not yet reminded. Overnight the reminder waits for morning, unless the lead is urgent.
create or replace function private.due_reminders(p_now timestamptz default now())
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
  from public.leads l
  join public.accounts a on a.id = l.account_id
  where l.reminded_at is null
    and l.acknowledged_at is null
    and l.state in ('received', 'notified')
    and l.risk_status in ('ok', 'released')
    and a.remind_after_min > 0
    and a.billing_status <> 'suspended'
    and l.received_at <= p_now - make_interval(mins => a.remind_after_min)
    and l.received_at > p_now - interval '24 hours'
    and (l.urgency = 'urgent' or not private.in_quiet_hours(a.quiet_hours, a.timezone, p_now))
  order by l.received_at
  limit 50;
$$;

-- Where the check calls the app, and the secret it proves itself with. Made here, so nobody has to copy a key.
create table if not exists private.reminder_settings (
  id int primary key default 1 check (id = 1),
  url text not null,
  token text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into private.reminder_settings (id, url)
  values (1, 'https://myofficebot.app/api/cron/reminders')
  on conflict (id) do nothing;

-- The server reads the secret to check the caller.
create or replace function public.reminder_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select token from private.reminder_settings where id = 1;
$$;

-- The server takes the due leads it was told about; each lead is taken (and reminded) once.
create or replace function public.take_due_reminders(p_ids uuid[])
returns table (id uuid, account_id uuid, site_id uuid, name text, phone text, email text, service text,
               message text, urgency text, received_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.leads l set reminded_at = now()
  where l.id = any (p_ids) and l.id in (select private.due_reminders(now()))
  returning l.id, l.account_id, l.site_id, l.name, l.phone, l.email, l.service, l.message, l.urgency, l.received_at;
$$;

-- Every minute: if any lead is due, call the app with their ids. Quiet (no call) when nothing is waiting.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  cfg private.reminder_settings;
begin
  select array_agg(d) into ids from private.due_reminders(now()) d;
  if ids is null then
    return;
  end if;
  select * into cfg from private.reminder_settings where id = 1;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object('leads', to_jsonb(ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.token),
    timeout_milliseconds := 30000
  );
end;
$$;

select cron.schedule('mob-lead-reminders', '* * * * *', 'select private.send_due_reminders()');

-- ---------------------------------------------------------------- access

revoke all on function private.claim_lead(uuid, uuid, uuid, text, uuid, boolean), private.in_quiet_hours(jsonb, text, timestamptz),
  private.due_reminders(timestamptz), private.send_due_reminders() from public, anon, authenticated;
revoke all on function public.claim_lead(uuid, uuid, boolean), public.release_lead(uuid),
  public.save_confirm_email(boolean, text, text, text), public.save_reminder(int),
  public.claim_lead_from_link(uuid, uuid, boolean), public.reminder_token(), public.take_due_reminders(uuid[])
  from public, anon;
grant execute on function public.claim_lead(uuid, uuid, boolean), public.release_lead(uuid),
  public.save_confirm_email(boolean, text, text, text), public.save_reminder(int) to authenticated;
revoke all on function public.claim_lead_from_link(uuid, uuid, boolean), public.reminder_token(),
  public.take_due_reminders(uuid[]) from authenticated;
grant execute on function public.claim_lead_from_link(uuid, uuid, boolean), public.reminder_token(),
  public.take_due_reminders(uuid[]) to service_role;
