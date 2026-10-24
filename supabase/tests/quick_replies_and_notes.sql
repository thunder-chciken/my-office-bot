-- Check for 0011_quick_replies_and_notes.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok | 7 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  site uuid;
  lead1 uuid;
  other_lead uuid;
  saved text[];
  note jsonb;
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select s.id into site from public.sites s where s.account_id = acct limit 1;
  insert into public.leads (account_id, site_id, external_event_id, name, phone)
    values (acct, site, 'test-n1', 'Note Test', '512-555-0144') returning id into lead1;
  -- A lead in another business, if there is one.
  select l.id into other_lead from public.leads l where l.account_id <> acct limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Save replies: blanks dropped, spaces trimmed, order kept.
  saved := public.save_quick_replies(array['  On my way, {name}!  ', '', 'Can you send photos?']);
  r := r || case when saved = array['On my way, {name}!', 'Can you send photos?']
                  and (select a.quick_replies = saved from public.accounts a where a.id = acct)
                 then '1 ok' else '1 FAIL' end;

  -- 2. More than 10 is refused.
  begin
    perform public.save_quick_replies(array_fill('Hi'::text, array[11]));
    r := r || ' | 2 FAIL';
  exception when invalid_parameter_value then r := r || ' | 2 ok';
  end;

  -- 3. Null puts the built-in replies back.
  perform public.save_quick_replies(null);
  r := r || case when (select a.quick_replies is null from public.accounts a where a.id = acct) then ' | 3 ok' else ' | 3 FAIL' end;

  -- 4. Add a note; it's trimmed and tied to the signed-in person.
  note := public.add_lead_note(lead1, '  Left a voicemail  ');
  r := r || case when (select n.body = 'Left a voicemail' and n.created_by = owner_id and n.account_id = acct
                       from public.lead_notes n where n.id = (note->>'id')::uuid)
                 then ' | 4 ok' else ' | 4 FAIL' end;

  -- 5. An empty note is refused.
  begin
    perform public.add_lead_note(lead1, '   ');
    r := r || ' | 5 FAIL';
  exception when invalid_parameter_value then r := r || ' | 5 ok';
  end;

  -- 6. Can't add a note to another business's lead.
  begin
    perform public.add_lead_note(coalesce(other_lead, gen_random_uuid()), 'Sneaky');
    r := r || ' | 6 FAIL';
  exception when no_data_found then r := r || ' | 6 ok';
  end;

  -- 7. Delete the note.
  perform public.delete_lead_note((note->>'id')::uuid);
  r := r || case when not exists (select 1 from public.lead_notes n where n.lead_id = lead1) then ' | 7 ok' else ' | 7 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
