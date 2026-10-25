-- Check for 0014_claims_confirmations_reminders.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok | 8 ok | 9 ok | 10 ok | 11 ok | 12 ok".

do $$
declare
  owner_id uuid;
  owner_email text;
  acct uuid;
  site uuid;
  helper uuid;
  lead1 uuid;
  lead2 uuid;
  old_lead uuid;
  res jsonb;
  ids uuid[];
  t0 timestamptz := '2026-06-01 15:00:00+00'; -- 10:00 in Chicago
  night timestamptz := '2026-06-02 05:00:00+00'; -- midnight in Chicago
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select u.email into owner_email from auth.users u where u.id = owner_id;
  select s.id into site from public.sites s where s.account_id = acct limit 1;
  update public.accounts set remind_after_min = 15, timezone = 'America/Chicago',
    quiet_hours = '{"start":"21:00","end":"07:00"}' where id = acct;
  insert into public.contacts (account_id, name, email, alert_email) values (acct, 'Helper Test', 'helper-test@example.com', true)
    returning id into helper;
  insert into public.leads (account_id, site_id, external_event_id, name, phone, state, received_at)
    values (acct, site, 'test-c1', 'Claim Test', '512-555-0144', 'notified', t0 - interval '20 minutes') returning id into lead1;
  insert into public.leads (account_id, site_id, external_event_id, name, phone, state, received_at)
    values (acct, site, 'test-c2', 'Waiting Test', '512-555-0145', 'notified', t0 - interval '5 minutes') returning id into lead2;
  insert into public.leads (account_id, site_id, external_event_id, name, phone, state, received_at)
    values (acct, site, 'test-c3', 'Old Test', '512-555-0146', 'notified', t0 - interval '2 days') returning id into old_lead;

  -- 1. Due at 10:00: the 20-minute-old lead, not the 5-minute-old one, not the two-day-old one.
  select array_agg(d) into ids from private.due_reminders(t0) d;
  r := r || case when lead1 = any (ids) and not lead2 = any (ids) and not old_lead = any (ids) then '1 ok' else '1 FAIL' end;

  -- 2. At midnight a normal lead waits for morning; an urgent one doesn't.
  update public.leads set received_at = night - interval '20 minutes' where id in (lead1, lead2);
  update public.leads set urgency = 'urgent' where id = lead2;
  select array_agg(d) into ids from private.due_reminders(night) d;
  r := r || case when not lead1 = any (coalesce(ids, '{}')) and lead2 = any (coalesce(ids, '{}')) then ' | 2 ok' else ' | 2 FAIL' end;
  update public.leads set received_at = t0 - interval '20 minutes', urgency = 'normal' where id in (lead1, lead2);

  -- 3. Reminders off: nothing is due.
  update public.accounts set remind_after_min = 0 where id = acct;
  select array_agg(d) into ids from private.due_reminders(t0) d where d in (lead1, lead2);
  r := r || case when ids is null then ' | 3 ok' else ' | 3 FAIL' end;
  update public.accounts set remind_after_min = 15 where id = acct;

  -- 4. The "I'm on it" email link claims for that person; a second link (someone else) doesn't steal it.
  res := public.claim_lead_from_link(lead1, helper, false);
  r := r || case when (res ->> 'claimed')::boolean and res ->> 'name' = 'Helper Test'
                      and (select l.acknowledged_by_contact_id = helper from public.leads l where l.id = lead1)
                 then ' | 4 ok' else ' | 4 FAIL' end;

  -- 5. A claimed lead is no longer due.
  select array_agg(d) into ids from private.due_reminders(t0) d where d = lead1;
  r := r || case when ids is null then ' | 5 ok' else ' | 5 FAIL' end;

  -- Now as the signed-in owner.
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated', 'email', owner_email)::text, true);
  perform set_config('role', 'authenticated', true);

  -- 6. "I'm on it" on a lead someone else has: not taken, and says who has it.
  res := public.claim_lead(lead1);
  r := r || case when not (res ->> 'claimed')::boolean and res ->> 'name' = 'Helper Test' then ' | 6 ok' else ' | 6 FAIL' end;

  -- 7. Take it over: now it's the owner's.
  res := public.claim_lead(lead1, null, true);
  r := r || case when (res ->> 'claimed')::boolean and (res ->> 'user')::uuid = owner_id then ' | 7 ok' else ' | 7 FAIL' end;

  -- 8. Hand it to the helper.
  res := public.claim_lead(lead1, helper);
  r := r || case when (res ->> 'contact')::uuid = helper and res ->> 'user' is null then ' | 8 ok' else ' | 8 FAIL' end;

  -- 9. Release: nobody has it, and the history says so.
  perform public.release_lead(lead1);
  r := r || case when (select l.acknowledged_at is null and l.acknowledged_by_name is null from public.leads l where l.id = lead1)
                      and (select count(*) from public.lead_events e where e.lead_id = lead1 and e.type = 'claimed') = 3
                      and exists (select 1 from public.lead_events e where e.lead_id = lead1 and e.type = 'released')
                 then ' | 9 ok' else ' | 9 FAIL' end;

  -- 10. Homeowner email settings save; a bad reply-to is refused.
  perform public.save_confirm_email(true, '  Thanks, {name}!  ', 'We got it.', 'Office@Example.com');
  r := r || case when (select a.confirm_email_on and a.confirm_email_subject = 'Thanks, {name}!' and a.confirm_reply_to = 'office@example.com'
                       from public.accounts a where a.id = acct)
                 then ' | 10 ok' else ' | 10 FAIL' end;
  begin
    perform public.save_confirm_email(true, null, null, 'not-an-email');
    r := r || ' FAIL';
  exception when invalid_parameter_value then null;
  end;

  -- 11. Reminder minutes: 10 saves, 7 is refused.
  perform public.save_reminder(10);
  begin
    perform public.save_reminder(7);
    r := r || ' | 11 FAIL';
  exception when invalid_parameter_value then
    r := r || case when (select a.remind_after_min = 10 from public.accounts a where a.id = acct) then ' | 11 ok' else ' | 11 FAIL' end;
  end;

  -- 12. The signed-in app can't read the reminder secret or take reminders.
  begin
    perform public.reminder_token();
    r := r || ' | 12 FAIL';
  exception when insufficient_privilege then r := r || ' | 12 ok';
  end;

  raise exception 'RESULTS: %', r;
end $$;
