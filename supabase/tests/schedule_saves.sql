-- Check for 0008_schedule_saves.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  me uuid;
  appt jsonb;
  block jsonb;
  block_id uuid;
  r text := '';
  rec record;
begin
  set constraints all immediate; -- check double-booking at each statement so the test can see it
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select c.id into me from public.contacts c where c.account_id = acct and c.removed_at is null and c.email is not null order by c.created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. A new estimate with a new job, Tue Nov 3, 9–10am, arrival window 9–11.
  appt := public.save_booking(
    jsonb_build_object('type', 'appointment', 'kind', 'estimate', 'title', 'Estimate', 'date', '2026-11-03', 'from', 540, 'to', 600,
                       'arrive_from', 540, 'arrive_to', 660, 'person_ids', jsonb_build_array(me)),
    jsonb_build_object('title', 'Roof repair', 'customer_name', 'Test Customer', 'phone', '512-555-0100', 'address', '1 Main St'));
  select * into rec from public.my_schedule() s where s.id = (appt->>'event_id')::uuid;
  r := r || case when rec.day = '2026-11-03' and rec.from_min = 540 and rec.to_min = 600 and rec.arrive_to_min = 660
                  and rec.job_id = (appt->>'job_id')::uuid and me = any(rec.person_ids) then '1 ok' else '1 FAIL' end;

  -- 2. A 3-workday project from Fri Nov 6, 8–5, skipping the weekend: Fri, Mon, Tue.
  block := public.save_booking(jsonb_build_object('type', 'work_block', 'title', 'Roof replacement', 'date', '2026-11-06',
                                                  'from', 480, 'to', 1020, 'workdays', 3, 'skip_weekends', true,
                                                  'person_ids', jsonb_build_array(me)));
  block_id := (block->>'event_id')::uuid;
  select * into rec from public.my_schedule() s where s.id = block_id;
  r := r || case when rec.day = '2026-11-06' and rec.workdays = 3 and rec.from_min = 480 and rec.to_min = 1020 then ' | 2 ok' else ' | 2 FAIL' end;

  -- 3. Booking the same person Mon Nov 9, 10–11 clashes with the project.
  begin
    perform public.save_booking(jsonb_build_object('type', 'appointment', 'kind', 'inspection', 'title', 'Inspection', 'date', '2026-11-09',
                                                   'from', 600, 'to', 660, 'person_ids', jsonb_build_array(me)));
    r := r || ' | 3 FAIL';
  exception when exclusion_violation then r := r || ' | 3 ok';
  end;

  -- 4. Same booking with a reason is allowed.
  begin
    perform public.save_booking(jsonb_build_object('type', 'appointment', 'kind', 'inspection', 'title', 'Inspection', 'date', '2026-11-09',
                                                   'from', 600, 'to', 660, 'override_reason', 'Quick visit', 'person_ids', jsonb_build_array(me)));
    r := r || ' | 4 ok';
  exception when exclusion_violation then r := r || ' | 4 FAIL';
  end;

  -- 5. Rain: move the project to Mon Nov 9 (Mon–Wed). The accepted clash doesn't block the move.
  begin
    perform public.save_booking(jsonb_build_object('id', block_id, 'type', 'work_block', 'title', 'Roof replacement', 'date', '2026-11-09',
                                                   'from', 480, 'to', 1020, 'workdays', 3, 'skip_weekends', true,
                                                   'person_ids', jsonb_build_array(me)));
    select * into rec from public.my_schedule() s where s.id = block_id;
    r := r || case when rec.day = '2026-11-09' and me = any(rec.person_ids) then ' | 5 ok' else ' | 5 FAIL' end;
  exception when exclusion_violation then r := r || ' | 5 FAIL (' || sqlerrm || ')';
  end;

  -- 6. The evening-before email for Mon Nov 9 lists both stops for this person.
  perform set_config('role', 'postgres', true);
  r := r || case when (select count(*) from public.digest_rows(acct, '2026-11-09') d where d.contact_id = me) = 2
                  and (select bool_and(d.from_min in (480, 600)) from public.digest_rows(acct, '2026-11-09') d where d.contact_id = me)
                 then ' | 6 ok' else ' | 6 FAIL' end;
  perform set_config('role', 'authenticated', true);

  -- 7. Canceling hides it from the schedule.
  perform public.set_event_status((appt->>'event_id')::uuid, 'canceled');
  r := r || case when not exists (select 1 from public.my_schedule() s where s.id = (appt->>'event_id')::uuid) then ' | 7 ok' else ' | 7 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
