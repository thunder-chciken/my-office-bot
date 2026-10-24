-- Check for 0005_profile_and_saves.sql. Paste into the Supabase SQL editor and run.
-- Acts as the first real signed-up owner, tries each save, then raises an error whose message is the
-- results, so every change rolls back. Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  cid uuid;
  lead uuid;
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct
  from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  if owner_id is null then
    raise exception 'RESULTS: no signed-up owner to test with';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Profile saves, and the website is cleaned to a bare domain.
  perform public.update_my_business('Test Roofing Co', '(512) 555-0100', 'Austin', 'America/Chicago',
                                    array['Roofing', 'Roofing', 'Tile'], 'https://www.testroofing.com/contact');
  r := r || case when (select a.name = 'Test Roofing Co' and a.trades = array['Roofing', 'Tile'] from public.accounts a where a.id = acct)
                  and (select bool_and(s.domain = 'testroofing.com') from public.sites s where s.account_id = acct)
                 then '1 ok' else '1 FAIL' end;

  -- 2. A made-up time zone is refused.
  begin
    perform public.update_my_business('X', null, null, 'Mars/Olympus', '{}', null);
    r := r || ' | 2 FAIL';
  exception when invalid_parameter_value then r := r || ' | 2 ok';
  end;

  -- 3. Add a person who gets alert emails.
  cid := public.save_contact(null, 'Jenna', 'Office', null, 'Jenna@Example.com', true);
  r := r || case when (select c.email = 'jenna@example.com' from public.contacts c where c.id = cid) then ' | 3 ok' else ' | 3 FAIL' end;

  -- 4. A bad email is refused.
  begin
    perform public.save_contact(null, 'Bad', null, null, 'not-an-email', true);
    r := r || ' | 4 FAIL';
  exception when invalid_parameter_value then r := r || ' | 4 ok';
  end;

  -- 5. Removing everyone who gets alerts is refused (the last one stays).
  begin
    perform public.remove_contact(cid);
    perform public.remove_contact(c.id) from public.contacts c
      where c.account_id = acct and c.removed_at is null and c.alert_email;
    r := r || ' | 5 FAIL';
  exception when check_violation then r := r || ' | 5 ok';
  end;

  -- 6. Someone else's lead can't be touched (the hand-made beta account isn't this owner's).
  select l.id into lead from public.leads l where l.account_id <> acct limit 1;
  begin
    perform public.set_lead_status(lead, 'booked');
    r := r || case when lead is null then ' | 6 skip' else ' | 6 FAIL' end;
  exception when no_data_found then r := r || ' | 6 ok';
  end;

  -- 7. Signed out: nothing works.
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.update_my_business('Hacked', null, null, 'America/Chicago', '{}', null);
    r := r || ' | 7 FAIL';
  exception when insufficient_privilege then r := r || ' | 7 ok';
  end;

  raise exception 'RESULTS: %', r;
end $$;
