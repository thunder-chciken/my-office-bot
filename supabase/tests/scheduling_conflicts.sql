-- Conflict-rule check for 0003_scheduling.sql. Paste into the Supabase SQL editor and run.
-- It builds a throwaway account, runs the acceptance scenario, then deliberately raises an error
-- whose message is the results — so everything rolls back and nothing is left behind.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok".

do $$
declare
  acct uuid; matt uuid; luis uuid; crew_a uuid; crew_b uuid; job uuid; roof uuid; ev uuid;
  r text := '';
  tz text := 'America/Chicago';
  mon date := date '2026-11-02'; -- a Monday
begin
  set constraints all immediate; -- check at each statement instead of at commit, so the test can see each result

  insert into public.accounts (name) values ('conflict test') returning id into acct;
  insert into public.contacts (account_id, name) values (acct, 'Matt') returning id into matt;
  insert into public.contacts (account_id, name) values (acct, 'Luis') returning id into luis;
  insert into public.crews (account_id, name) values (acct, 'Crew A') returning id into crew_a;
  insert into public.crews (account_id, name) values (acct, 'Crew B') returning id into crew_b;
  insert into public.crew_members (account_id, crew_id, contact_id)
    values (acct, crew_a, matt), (acct, crew_a, luis), (acct, crew_b, luis);
  insert into public.jobs (account_id, title) values (acct, 'Roof replacement') returning id into job;

  -- Three-day roof job Mon–Wed, 8–5, Crew A.
  insert into public.schedule_events (account_id, job_id, type, title, starts_at, ends_at, day_start, day_end)
    values (acct, job, 'work_block', 'Roof — Johnson',
            (mon + time '08:00') at time zone tz, (mon + 2 + time '17:00') at time zone tz, '08:00', '17:00')
    returning id into roof;
  insert into public.event_assignments (account_id, event_id, crew_id) values (acct, roof, crew_a);

  -- 1. Tuesday 10–11 inspection for Crew A clashes with the roof job.
  insert into public.schedule_events (account_id, type, kind, title, starts_at, ends_at)
    values (acct, 'appointment', 'inspection', 'Inspection — Lee',
            (mon + 1 + time '10:00') at time zone tz, (mon + 1 + time '11:00') at time zone tz)
    returning id into ev;
  begin
    insert into public.event_assignments (account_id, event_id, crew_id) values (acct, ev, crew_a);
    r := r || '1 FAIL (no conflict raised)';
  exception when exclusion_violation then r := r || '1 ok';
  end;

  -- 2. Same slot with a recorded override reason is allowed.
  update public.schedule_events set conflict_override_reason = 'Luis can step away for an hour' where id = ev;
  begin
    insert into public.event_assignments (account_id, event_id, crew_id) values (acct, ev, crew_a);
    r := r || ' | 2 ok';
  exception when exclusion_violation then r := r || ' | 2 FAIL (override ignored)';
  end;

  -- 3. Tuesday 6–7pm is outside the 8–5 working hours, so no clash (nights aren't blocked).
  insert into public.schedule_events (account_id, type, kind, title, starts_at, ends_at)
    values (acct, 'appointment', 'estimate', 'Evening estimate',
            (mon + 1 + time '18:00') at time zone tz, (mon + 1 + time '19:00') at time zone tz)
    returning id into ev;
  begin
    insert into public.event_assignments (account_id, event_id, contact_id) values (acct, ev, matt);
    r := r || ' | 3 ok';
  exception when exclusion_violation then r := r || ' | 3 FAIL (evening blocked)';
  end;

  -- 4. Crew B shares Luis with Crew A, so Crew B on Wednesday clashes too.
  insert into public.schedule_events (account_id, type, kind, title, starts_at, ends_at)
    values (acct, 'appointment', 'service', 'Service call',
            (mon + 2 + time '13:00') at time zone tz, (mon + 2 + time '14:00') at time zone tz)
    returning id into ev;
  begin
    insert into public.event_assignments (account_id, event_id, crew_id) values (acct, ev, crew_b);
    r := r || ' | 4 FAIL (shared member missed)';
  exception when exclusion_violation then r := r || ' | 4 ok';
  end;

  -- 5. A job ending at noon doesn't clash with one starting at noon (half-open ranges).
  insert into public.schedule_events (account_id, type, title, starts_at, ends_at)
    values (acct, 'appointment', 'Morning', (mon + 7 + time '10:00') at time zone tz, (mon + 7 + time '12:00') at time zone tz)
    returning id into ev;
  insert into public.event_assignments (account_id, event_id, contact_id) values (acct, ev, matt);
  insert into public.schedule_events (account_id, type, title, starts_at, ends_at)
    values (acct, 'appointment', 'Noon', (mon + 7 + time '12:00') at time zone tz, (mon + 7 + time '13:00') at time zone tz)
    returning id into ev;
  begin
    insert into public.event_assignments (account_id, event_id, contact_id) values (acct, ev, matt);
    r := r || ' | 5 ok';
  exception when exclusion_violation then r := r || ' | 5 FAIL (back-to-back blocked)';
  end;

  -- 6. Rain: shift the roof job one workday (Tue–Thu). Crew A keeps it, and the moved job now
  --    clashes with nothing new on Thursday, so the move saves.
  begin
    update public.schedule_events
      set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day'
      where id = roof;
    r := r || case when (select count(*) from public.event_assignments where event_id = roof and crew_id = crew_a) = 1
                   then ' | 6 ok' else ' | 6 FAIL (crew lost)' end;
  exception when exclusion_violation then r := r || ' | 6 FAIL (' || sqlerrm || ')';
  end;

  -- 7. A Fri–Mon project with skip_weekends does not occupy Saturday.
  insert into public.schedule_events (account_id, type, title, starts_at, ends_at, day_start, day_end)
    values (acct, 'work_block', 'Tile', (mon + 4 + time '08:00') at time zone tz, (mon + 7 + time '17:00') at time zone tz,
            '08:00', '17:00')
    returning id into ev;
  r := r || case when (select count(*) from private.event_slots((select e from public.schedule_events e where e.id = ev))) = 2
                 then ' | 7 ok' else ' | 7 FAIL (weekend counted)' end;

  raise exception 'RESULTS: %', r;
end $$;
