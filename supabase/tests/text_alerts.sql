-- Check for 0009_text_alerts.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  me uuid;
  helper uuid;
  st text;
  reply text;
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select c.id into me from public.contacts c
    join auth.users u on lower(u.email) = lower(c.email)
    where c.account_id = acct and u.id = owner_id and c.removed_at is null limit 1;
  update public.contacts set phone = coalesce(phone, '(512) 555-0142') where id = me;
  insert into public.contacts (account_id, name, phone, email, alert_email)
    values (acct, 'Helper', '(512) 555-0199', null, false) returning id into helper;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. The owner ticks the consent box for their own number: on right away, with evidence.
  st := public.request_text_alerts(me, true, 'Send me automated new-lead alerts by text…');
  r := r || case when st = 'on' then '1 ok' else '1 FAIL' end;

  -- 2. The owner can't tick the box for someone else.
  begin
    perform public.request_text_alerts(helper, true, 'x');
    r := r || ' | 2 FAIL';
  exception when insufficient_privilege then r := r || ' | 2 ok';
  end;

  -- 3. Someone else starts as pending, waiting for YES.
  st := public.request_text_alerts(helper, false, null);
  r := r || case when st = 'pending' then ' | 3 ok' else ' | 3 FAIL' end;

  perform set_config('role', 'postgres', true);

  -- 4. They text "Yes!" back: confirmed, and we reply.
  reply := public.sms_inbound('+15125550199', 'Yes!', 'SMtest1');
  r := r || case when reply like 'My Office Bot: You''re set%'
                  and (select consent_status = 'confirmed' and consent_evidence->>'message_sid' = 'SMtest1' from public.contacts where id = helper)
                 then ' | 4 ok' else ' | 4 FAIL' end;

  -- 5. STOP opts that number out.
  perform public.sms_inbound('+1 (512) 555-0199', 'STOP', 'SMtest2');
  r := r || case when (select phone_opted_out from public.contacts where id = helper) then ' | 5 ok' else ' | 5 FAIL' end;

  -- 6. Turning texts back on for an opted-out person is refused until they text START.
  perform set_config('role', 'authenticated', true);
  begin
    perform public.request_text_alerts(helper, false, null);
    r := r || ' | 6 FAIL';
  exception when invalid_parameter_value then r := r || ' | 6 ok';
  end;

  -- 7. START reverses it.
  perform set_config('role', 'postgres', true);
  perform public.sms_inbound('+15125550199', 'start', 'SMtest3');
  r := r || case when not (select phone_opted_out from public.contacts where id = helper) then ' | 7 ok' else ' | 7 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
