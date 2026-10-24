-- Check for 0007_customers.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok | 6 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  site uuid;
  cid uuid;
  lead1 uuid;
  lead2 uuid;
  other uuid;
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select s.id into site from public.sites s where s.account_id = acct limit 1;

  -- 1. Two leads from the same phone (formatted differently) land on one customer.
  insert into public.leads (account_id, site_id, external_event_id, name, phone, email)
    values (acct, site, 'test-c1', 'Pat Doe', '(512) 555-0177', null) returning id into lead1;
  insert into public.leads (account_id, site_id, external_event_id, name, phone, email)
    values (acct, site, 'test-c2', 'Pat', '+1 512 555 0177', 'pat@example.com') returning id into lead2;
  perform public.link_lead_customer(lead1);
  perform public.link_lead_customer(lead2);
  r := r || case when (select count(distinct customer_id) from public.leads where id in (lead1, lead2)) = 1
                  and (select c.email = 'pat@example.com' and c.name = 'Pat Doe' from public.customers c
                       join public.leads l on l.customer_id = c.id where l.id = lead1)
                 then '1 ok' else '1 FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2. Add a customer by hand.
  cid := public.save_customer(null, 'Hand Added', '512-555-0100', 'HAND@Example.com', '1 Main St', 'Gate code 1234');
  r := r || case when (select c.source = 'manual' and c.email = 'hand@example.com' and c.phone_key = '5125550100' from public.customers c where c.id = cid)
                 then ' | 2 ok' else ' | 2 FAIL' end;

  -- 3. Edit them.
  perform public.save_customer(cid, 'Hand Edited', '512-555-0100', null, null, null);
  r := r || case when (select c.name = 'Hand Edited' and c.email is null from public.customers c where c.id = cid) then ' | 3 ok' else ' | 3 FAIL' end;

  -- 4. The owner can read their customers through Row Level Security.
  r := r || case when (select count(*) from public.customers where id = cid) = 1 then ' | 4 ok' else ' | 4 FAIL' end;

  -- 5. Another business's customer can't be deleted.
  select c.id into other from public.customers c where c.account_id <> acct limit 1;
  begin
    perform public.delete_customer(other);
    r := r || case when other is null then ' | 5 skip' else ' | 5 FAIL' end;
  exception when no_data_found then r := r || ' | 5 ok';
  end;

  -- 6. Deleting a customer keeps their leads.
  perform set_config('role', 'postgres', true);
  select customer_id into cid from public.leads where id = lead1;
  perform set_config('role', 'authenticated', true);
  perform public.delete_customer(cid);
  perform set_config('role', 'postgres', true);
  r := r || case when (select count(*) from public.leads where id in (lead1, lead2) and customer_id is null) = 2 then ' | 6 ok' else ' | 6 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
