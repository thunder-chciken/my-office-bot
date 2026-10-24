-- My Office Bot — scheduling calendar MVP (docs/SCHEDULING.md, decision D48).
-- Kept apart from the lead-alert tables: the only link back is jobs.lead_id.
-- Same tenant pattern as 0001: every row carries account_id, composite foreign keys, RLS read by membership.

-- ---------------------------------------------------------------- crews

create table public.crews (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  color text not null default '#0A6CFF',
  created_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id)
);

create table public.crew_members (
  account_id uuid not null,
  crew_id uuid not null,
  contact_id uuid not null,
  primary key (crew_id, contact_id),
  foreign key (account_id, crew_id) references public.crews (account_id, id) on delete cascade,
  foreign key (account_id, contact_id) references public.contacts (account_id, id) on delete cascade
);

-- ---------------------------------------------------------------- jobs (the customer + the work)

create table public.jobs (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lead_id uuid,
  title text not null,
  customer_name text,
  phone text,
  email text,
  address text,
  notes text,
  status text not null default 'open' check (status in ('open','done','canceled')),
  created_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id),
  foreign key (account_id, lead_id) references public.leads (account_id, id) on delete set null (lead_id)
);

create index jobs_account_status_idx on public.jobs (account_id, status);

-- ---------------------------------------------------------------- schedule events
-- appointment / unavailable: one exact range [starts_at, ends_at).
-- work_block: a multi-day project. starts_at = first day at day_start, ends_at = last day at day_end,
-- and it only reserves day_start..day_end on each working day — never the nights in between.

create table public.schedule_events (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  job_id uuid,
  type text not null check (type in ('appointment','work_block','unavailable')),
  kind text check (kind in ('estimate','inspection','service')),
  title text not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','done','canceled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Chicago',
  day_start time,
  day_end time,
  skip_weekends boolean not null default true,
  -- What the homeowner is told ("we'll arrive 9–11"); deliberately separate from starts_at.
  arrive_from timestamptz,
  arrive_to timestamptz,
  notes text,
  -- Booking over a conflict is allowed, but only with a recorded reason.
  conflict_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id),
  foreign key (account_id, job_id) references public.jobs (account_id, id) on delete cascade,
  check (ends_at > starts_at),
  check ((type = 'work_block') = (day_start is not null and day_end is not null)),
  check (day_end is null or day_end > day_start),
  check ((arrive_from is null) = (arrive_to is null) and (arrive_to is null or arrive_to > arrive_from))
);

create index schedule_events_account_time_idx on public.schedule_events (account_id, starts_at, ends_at);
create index schedule_events_job_idx on public.schedule_events (job_id);

create table public.event_assignments (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  event_id uuid not null,
  crew_id uuid,
  contact_id uuid,
  check (num_nonnulls(crew_id, contact_id) = 1),
  unique nulls not distinct (event_id, crew_id, contact_id),
  foreign key (account_id, event_id) references public.schedule_events (account_id, id) on delete cascade,
  foreign key (account_id, crew_id) references public.crews (account_id, id) on delete cascade,
  foreign key (account_id, contact_id) references public.contacts (account_id, id) on delete cascade
);

create index event_assignments_event_idx on public.event_assignments (event_id);

-- Staff reminder ledger: one row per (contact, day) digest, so a retried cron never double-sends.
create table public.schedule_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  contact_id uuid not null,
  kind text not null check (kind in ('daily_digest')),
  for_date date not null,
  status text not null default 'dispatching' check (status in ('dispatching','sent','failed','uncertain')),
  idempotency_key text not null unique,
  provider_sid text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, contact_id) references public.contacts (account_id, id) on delete cascade
);

-- ---------------------------------------------------------------- conflict detection

-- The time an event actually occupies, as half-open ranges (a job ending at noon doesn't clash with one starting at noon).
create or replace function private.event_slots(e public.schedule_events)
returns setof tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange(e.starts_at, e.ends_at, '[)')
  where e.type <> 'work_block'
  union all
  select tstzrange((d.day + e.day_start) at time zone e.timezone, (d.day + e.day_end) at time zone e.timezone, '[)')
  from generate_series(
    (e.starts_at at time zone e.timezone)::date,
    (e.ends_at at time zone e.timezone)::date,
    interval '1 day'
  ) as g(ts)
  cross join lateral (select g.ts::date as day) d
  where e.type = 'work_block'
    and not (e.skip_weekends and extract(isodow from d.day) > 5)
$$;

-- Everyone an event ties up: people assigned directly plus members of assigned crews, each counted once.
create or replace function private.event_people(ev uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select a.contact_id from public.event_assignments a where a.event_id = ev and a.contact_id is not null
  union
  select m.contact_id
  from public.event_assignments a
  join public.crew_members m on m.crew_id = a.crew_id
  where a.event_id = ev
$$;

-- Other live events that share a person and overlapping time with this event (as given, saved or not).
create or replace function private.conflicts_for(me public.schedule_events)
returns table (other_event_id uuid, other_title text, contact_id uuid, contact_name text, overlap tstzrange)
language sql
stable
set search_path = ''
as $$
  select distinct on (o.id, p.cid) o.id, o.title, p.cid, c.name, ms.s * os.s
  from private.event_slots(me) ms(s)
  join public.schedule_events o
    on o.account_id = me.account_id
   and o.id <> me.id
   and o.status <> 'canceled'
   and o.starts_at < me.ends_at
   and o.ends_at > me.starts_at
  cross join lateral private.event_slots(o) os(s)
  cross join lateral private.event_people(o.id) op(cid)
  join lateral private.event_people(me.id) p(cid) on p.cid = op.cid
  join public.contacts c on c.id = p.cid
  where me.status <> 'canceled'
    and ms.s && os.s
  order by o.id, p.cid, lower(ms.s * os.s)
$$;

-- For the app: what a saved event currently clashes with.
create or replace function public.schedule_conflicts(p_event uuid)
returns table (other_event_id uuid, other_title text, contact_id uuid, contact_name text, overlap tstzrange)
language sql
stable
set search_path = ''
as $$
  select c.* from public.schedule_events e cross join lateral private.conflicts_for(e) c where e.id = p_event
$$;

-- Raises unless the event is clash-free or carries an override reason.
-- When an event moves (prev = its old row), only clashes the move creates count: a clash that was
-- already accepted, e.g. an inspection booked over the job with a reason, doesn't block a rain shift.
create or replace function private.check_event_conflicts(ev_id uuid, prev public.schedule_events)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.schedule_events;
  clash record;
begin
  select * into ev from public.schedule_events where id = ev_id;
  if not found or ev.status = 'canceled' or ev.conflict_override_reason is not null then
    return;
  end if;
  select * into clash from private.conflicts_for(ev) c
  where prev.id is null
     or prev.status = 'canceled'
     or prev.conflict_override_reason is not null
     or not exists (
       select 1 from private.conflicts_for(prev) p
       where p.other_event_id = c.other_event_id and p.contact_id = c.contact_id
     )
  limit 1;
  if found then
    raise exception 'Schedule conflict: % is already booked for "%"', clash.contact_name, clash.other_title
      using errcode = '23P01', hint = 'Set conflict_override_reason to book anyway.';
  end if;
end;
$$;

-- Checked at commit, after the event and its assignments are both written, so the check sees the whole booking.
create or replace function private.schedule_events_conflict_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_event_conflicts(new.id, case when tg_op = 'UPDATE' then old end);
  return null;
end;
$$;

create or replace function private.event_assignments_conflict_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_event_conflicts(new.event_id, null);
  return null;
end;
$$;

create constraint trigger schedule_events_conflicts_on_insert
  after insert on public.schedule_events
  deferrable initially deferred
  for each row execute function private.schedule_events_conflict_trigger();

create constraint trigger schedule_events_conflicts_on_move
  after update on public.schedule_events
  deferrable initially deferred
  for each row
  when (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at
     or old.day_start is distinct from new.day_start or old.day_end is distinct from new.day_end
     or old.skip_weekends is distinct from new.skip_weekends or old.status is distinct from new.status
     or old.conflict_override_reason is distinct from new.conflict_override_reason)
  execute function private.schedule_events_conflict_trigger();

create constraint trigger event_assignments_conflicts
  after insert or update on public.event_assignments
  deferrable initially deferred
  for each row execute function private.event_assignments_conflict_trigger();

grant usage on schema private to service_role;
revoke all on function private.event_slots(public.schedule_events), private.event_people(uuid),
  private.conflicts_for(public.schedule_events), public.schedule_conflicts(uuid),
  private.check_event_conflicts(uuid, public.schedule_events),
  private.schedule_events_conflict_trigger(), private.event_assignments_conflict_trigger() from public, anon;
grant execute on function private.event_slots(public.schedule_events), private.event_people(uuid),
  private.conflicts_for(public.schedule_events), public.schedule_conflicts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- security

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.jobs enable row level security;
alter table public.schedule_events enable row level security;
alter table public.event_assignments enable row level security;
alter table public.schedule_notifications enable row level security;

revoke all on public.crews, public.crew_members, public.jobs, public.schedule_events,
  public.event_assignments, public.schedule_notifications from anon, authenticated;
grant select on public.crews, public.crew_members, public.jobs, public.schedule_events,
  public.event_assignments, public.schedule_notifications to authenticated;
grant select, insert, update, delete on public.crews, public.crew_members, public.jobs, public.schedule_events,
  public.event_assignments, public.schedule_notifications to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy crews_read on public.crews for select to authenticated using (private.is_member(account_id));
create policy crew_members_read on public.crew_members for select to authenticated using (private.is_member(account_id));
create policy jobs_read on public.jobs for select to authenticated using (private.is_member(account_id));
create policy schedule_events_read on public.schedule_events for select to authenticated using (private.is_member(account_id));
create policy event_assignments_read on public.event_assignments for select to authenticated using (private.is_member(account_id));
create policy schedule_notifications_read on public.schedule_notifications for select to authenticated using (private.is_member(account_id));
