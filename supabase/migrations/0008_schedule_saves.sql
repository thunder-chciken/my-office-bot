-- My Office Bot — saving the schedule, and the evening-before crew email (decision D54).
-- The app thinks in "day + minutes after midnight"; the database stores real timestamps in the
-- business's time zone. These functions convert both ways so the two always agree.

-- Local day + minutes → timestamp in the business's time zone (1440 minutes = the next midnight).
create or replace function private.local_ts(p_day date, p_minutes int, p_tz text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_day + make_interval(mins => p_minutes)) at time zone p_tz
$$;

-- Last working day of a project that starts on p_first and runs p_workdays days (same rule as the app).
create or replace function private.project_last_day(p_first date, p_workdays int, p_skip_weekends boolean)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  d date := p_first;
  n int := 0;
begin
  if p_skip_weekends then
    while extract(isodow from d) > 5 loop d := d + 1; end loop;
  end if;
  loop
    if not p_skip_weekends or extract(isodow from d) <= 5 then n := n + 1; end if;
    exit when n >= greatest(p_workdays, 1);
    d := d + 1;
  end loop;
  return d;
end;
$$;

create or replace function private.try_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- ---------------------------------------------------------------- save a booking (event + its job + who's going)
-- p_event: {id?, job_id?, type, kind, title, status, date, from, to, workdays, skip_weekends,
--           arrive_from?, arrive_to?, override_reason?, crew_ids[], person_ids[]}
-- p_job (only for a new job): {lead_id?, title, customer_name, phone, email, address}
-- Double-booking is still enforced by the 0003 triggers when the transaction commits.

create or replace function public.save_booking(p_event jsonb, p_job jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
  tz text;
  eid uuid := private.try_uuid(p_event->>'id');
  jid uuid := private.try_uuid(p_event->>'job_id');
  lid uuid;
  e_type text := p_event->>'type';
  e_day date := (p_event->>'date')::date;
  e_from int := (p_event->>'from')::int;
  e_to int := (p_event->>'to')::int;
  e_workdays int := greatest(coalesce((p_event->>'workdays')::int, 1), 1);
  e_skip boolean := coalesce((p_event->>'skip_weekends')::boolean, true);
  starts timestamptz;
  ends timestamptz;
  new_crews uuid[];
  new_people uuid[];
  old_crews uuid[];
  old_people uuid[];
begin
  select a.timezone into tz from public.accounts a where a.id = acct;
  if e_type not in ('appointment', 'work_block', 'unavailable') or e_day is null
     or e_from is null or e_to is null or e_from < 0 or e_to > 1440 or e_to <= e_from then
    raise exception 'That booking''s day or time doesn''t look right' using errcode = '22023';
  end if;

  -- A new job (customer + work), e.g. scheduling a visit straight from a lead.
  if p_job is not null then
    lid := private.try_uuid(p_job->>'lead_id');
    if lid is not null and not exists (select 1 from public.leads l where l.id = lid and l.account_id = acct) then
      lid := null;
    end if;
    insert into public.jobs (account_id, lead_id, title, customer_name, phone, email, address)
      values (acct, lid, left(coalesce(nullif(trim(p_job->>'title'), ''), 'Job'), 200),
              nullif(left(trim(coalesce(p_job->>'customer_name', '')), 120), ''),
              nullif(left(trim(coalesce(p_job->>'phone', '')), 40), ''),
              nullif(lower(left(trim(coalesce(p_job->>'email', '')), 200)), ''),
              nullif(left(trim(coalesce(p_job->>'address', '')), 300), ''))
      returning id into jid;
  elsif jid is not null and not exists (select 1 from public.jobs j where j.id = jid and j.account_id = acct) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if e_type = 'work_block' then
    if e_to >= 1440 then
      raise exception 'A project day has to end before midnight' using errcode = '22023';
    end if;
    starts := private.local_ts(e_day, e_from, tz);
    ends := private.local_ts(private.project_last_day(e_day, e_workdays, e_skip), e_to, tz);
  else
    starts := private.local_ts(e_day, e_from, tz);
    ends := private.local_ts(e_day, e_to, tz);
  end if;

  if eid is not null and exists (select 1 from public.schedule_events s where s.id = eid and s.account_id = acct) then
    update public.schedule_events set
      job_id = jid,
      type = e_type,
      kind = case when e_type = 'appointment' then nullif(p_event->>'kind', '') end,
      title = left(coalesce(nullif(trim(p_event->>'title'), ''), 'Booking'), 200),
      status = coalesce(nullif(p_event->>'status', ''), status),
      starts_at = starts,
      ends_at = ends,
      timezone = tz,
      day_start = case when e_type = 'work_block' then make_time(e_from / 60, e_from % 60, 0) end,
      day_end = case when e_type = 'work_block' then make_time(e_to / 60, e_to % 60, 0) end,
      skip_weekends = e_skip,
      arrive_from = case when p_event ? 'arrive_from' and p_event->>'arrive_from' is not null
                         then private.local_ts(e_day, (p_event->>'arrive_from')::int, tz) end,
      arrive_to = case when p_event ? 'arrive_to' and p_event->>'arrive_to' is not null
                       then private.local_ts(e_day, (p_event->>'arrive_to')::int, tz) end,
      conflict_override_reason = nullif(trim(coalesce(p_event->>'override_reason', '')), ''),
      updated_at = now()
    where id = eid;
  else
    insert into public.schedule_events (account_id, job_id, type, kind, title, status, starts_at, ends_at, timezone,
                                        day_start, day_end, skip_weekends, arrive_from, arrive_to, conflict_override_reason)
      values (acct, jid, e_type,
              case when e_type = 'appointment' then nullif(p_event->>'kind', '') end,
              left(coalesce(nullif(trim(p_event->>'title'), ''), 'Booking'), 200),
              coalesce(nullif(p_event->>'status', ''), 'scheduled'),
              starts, ends, tz,
              case when e_type = 'work_block' then make_time(e_from / 60, e_from % 60, 0) end,
              case when e_type = 'work_block' then make_time(e_to / 60, e_to % 60, 0) end,
              e_skip,
              case when p_event->>'arrive_from' is not null then private.local_ts(e_day, (p_event->>'arrive_from')::int, tz) end,
              case when p_event->>'arrive_to' is not null then private.local_ts(e_day, (p_event->>'arrive_to')::int, tz) end,
              nullif(trim(coalesce(p_event->>'override_reason', '')), ''))
      returning id into eid;
  end if;

  -- Who's going. Only rewritten when it changed, so moving a job doesn't re-check clashes it already had.
  select coalesce(array_agg(distinct x order by x), '{}') into new_crews
    from (select private.try_uuid(v) x from jsonb_array_elements_text(coalesce(p_event->'crew_ids', '[]')) v) t where x is not null;
  select coalesce(array_agg(distinct x order by x), '{}') into new_people
    from (select private.try_uuid(v) x from jsonb_array_elements_text(coalesce(p_event->'person_ids', '[]')) v) t where x is not null;
  select coalesce(array_agg(distinct a.crew_id order by a.crew_id) filter (where a.crew_id is not null), '{}'),
         coalesce(array_agg(distinct a.contact_id order by a.contact_id) filter (where a.contact_id is not null), '{}')
    into old_crews, old_people
    from public.event_assignments a where a.event_id = eid;

  if new_crews is distinct from old_crews or new_people is distinct from old_people then
    delete from public.event_assignments where event_id = eid;
    insert into public.event_assignments (account_id, event_id, crew_id) select acct, eid, c from unnest(new_crews) c;
    insert into public.event_assignments (account_id, event_id, contact_id) select acct, eid, p from unnest(new_people) p;
  end if;

  return jsonb_build_object('event_id', eid, 'job_id', jid);
end;
$$;

create or replace function public.set_event_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
begin
  if p_status not in ('scheduled', 'confirmed', 'done', 'canceled') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.schedule_events set status = p_status, updated_at = now() where id = p_id and account_id = acct;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------- load the schedule in the app's terms

create or replace function public.my_schedule()
returns table (
  id uuid,
  job_id uuid,
  type text,
  kind text,
  title text,
  status text,
  day date,
  from_min int,
  to_min int,
  workdays int,
  skip_weekends boolean,
  arrive_from_min int,
  arrive_to_min int,
  override_reason text,
  crew_ids uuid[],
  person_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.job_id, e.type, e.kind, e.title, e.status,
    (e.starts_at at time zone e.timezone)::date,
    case when e.type = 'work_block' then extract(hour from e.day_start)::int * 60 + extract(minute from e.day_start)::int
         else (extract(epoch from (e.starts_at at time zone e.timezone) - (e.starts_at at time zone e.timezone)::date::timestamp) / 60)::int end,
    case when e.type = 'work_block' then extract(hour from e.day_end)::int * 60 + extract(minute from e.day_end)::int
         else (extract(epoch from (e.ends_at at time zone e.timezone) - (e.starts_at at time zone e.timezone)::date::timestamp) / 60)::int end,
    case when e.type = 'work_block' then (select count(*) from private.event_slots(e))::int else 1 end,
    e.skip_weekends,
    (extract(epoch from (e.arrive_from at time zone e.timezone) - (e.starts_at at time zone e.timezone)::date::timestamp) / 60)::int,
    (extract(epoch from (e.arrive_to at time zone e.timezone) - (e.starts_at at time zone e.timezone)::date::timestamp) / 60)::int,
    e.conflict_override_reason,
    coalesce((select array_agg(a.crew_id) from public.event_assignments a where a.event_id = e.id and a.crew_id is not null), '{}'),
    coalesce((select array_agg(a.contact_id) from public.event_assignments a where a.event_id = e.id and a.contact_id is not null), '{}')
  from public.schedule_events e
  where e.account_id = private.require_account(false)
    and e.status <> 'canceled'
    and e.ends_at > now() - interval '120 days'
$$;

-- ---------------------------------------------------------------- evening-before crew email
-- Everyone with something on p_day: one row per person per booking slot, in the business's local time.

create or replace function public.digest_rows(p_account uuid, p_day date)
returns table (
  contact_id uuid,
  contact_name text,
  email text,
  event_id uuid,
  type text,
  kind text,
  title text,
  from_min int,
  to_min int,
  day_number int,
  day_count int,
  arrive_from_min int,
  arrive_to_min int,
  customer_name text,
  phone text,
  address text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.name, c.email, e.id, e.type, e.kind, e.title,
    (extract(epoch from (lower(sl.s) at time zone e.timezone) - p_day::timestamp) / 60)::int,
    (extract(epoch from (upper(sl.s) at time zone e.timezone) - p_day::timestamp) / 60)::int,
    sl.n::int,
    (select count(*) from private.event_slots(e))::int,
    (extract(epoch from (e.arrive_from at time zone e.timezone) - p_day::timestamp) / 60)::int,
    (extract(epoch from (e.arrive_to at time zone e.timezone) - p_day::timestamp) / 60)::int,
    j.customer_name, j.phone, j.address
  from public.schedule_events e
  cross join lateral private.event_slots(e) with ordinality as sl(s, n)
  cross join lateral private.event_people(e.id) as p(cid)
  join public.contacts c on c.id = p.cid and c.removed_at is null and c.email is not null
  left join public.jobs j on j.id = e.job_id
  where e.account_id = p_account
    and e.status in ('scheduled', 'confirmed')
    and (lower(sl.s) at time zone e.timezone)::date = p_day
  order by c.id, lower(sl.s)
$$;

-- ---------------------------------------------------------------- security

revoke all on function private.local_ts(date, int, text), private.project_last_day(date, int, boolean), private.try_uuid(text),
  public.save_booking(jsonb, jsonb), public.set_event_status(uuid, text), public.my_schedule(),
  public.digest_rows(uuid, date) from public, anon;
grant execute on function public.save_booking(jsonb, jsonb), public.set_event_status(uuid, text), public.my_schedule() to authenticated;
revoke all on function public.digest_rows(uuid, date) from authenticated;
grant execute on function public.digest_rows(uuid, date) to service_role;
