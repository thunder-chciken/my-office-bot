-- Check for 0013_push_notifications.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  ep text := 'https://fcm.googleapis.com/fcm/send/test-device-123';
  key text := repeat('A', 87);
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Save a phone.
  perform public.save_push_subscription(ep, key, 'abcdefghijklmnopqrstuv', 'iPhone');
  r := r || case when (select count(*) from public.push_subscriptions s where s.endpoint = ep and s.account_id = acct and s.user_id = owner_id) = 1
                 then '1 ok' else '1 FAIL' end;

  -- 2. Saving the same phone again updates it instead of adding a second row.
  perform public.save_push_subscription(ep, key, 'zyxwvutsrqponmlkjihgfe', 'iPhone 16');
  r := r || case when (select count(*) = 1 and max(s.device) = 'iPhone 16' from public.push_subscriptions s where s.endpoint = ep)
                 then ' | 2 ok' else ' | 2 FAIL' end;

  -- 3. Only real push services: an arbitrary web address is refused.
  begin
    perform public.save_push_subscription('https://evil.example/collect', key, 'abcdefghijklmnopqrstuv', null);
    r := r || ' | 3 FAIL';
  exception when invalid_parameter_value then r := r || ' | 3 ok';
  end;

  -- 4. Apple's push service is accepted.
  perform public.save_push_subscription('https://web.push.apple.com/QGx-test', key, 'abcdefghijklmnopqrstuv', 'iPhone');
  r := r || case when exists (select 1 from public.push_subscriptions s where s.endpoint = 'https://web.push.apple.com/QGx-test')
                 then ' | 4 ok' else ' | 4 FAIL' end;

  -- 5. People only see their own phones.
  r := r || case when (select count(*) from public.push_subscriptions) = (select count(*) from public.push_subscriptions s where s.user_id = owner_id)
                 then ' | 5 ok' else ' | 5 FAIL' end;

  -- 6. Turning it off removes the phone.
  perform public.delete_push_subscription(ep);
  r := r || case when not exists (select 1 from public.push_subscriptions s where s.endpoint = ep) then ' | 6 ok' else ' | 6 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
