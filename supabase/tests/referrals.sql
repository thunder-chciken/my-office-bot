-- Check for 0012_referrals.sql. Paste into the Supabase SQL editor and run; everything rolls back.
-- Expect: "RESULTS: 1 ok | 2 ok | 3 ok | 4 ok | 5 ok".

do $$
declare
  owner_id uuid;
  acct uuid;
  other_acct uuid;
  own_key text;
  other_key text;
  r text := '';
begin
  select m.user_id, m.account_id into owner_id, acct from public.memberships m where m.role = 'owner' order by m.created_at limit 1;
  select s.public_key into own_key from public.sites s where s.account_id = acct limit 1;

  -- A second business to be the referrer.
  insert into public.accounts (name) values ('Referrer Test Co') returning id into other_acct;
  insert into public.sites (account_id, domain) values (other_acct, 'referrer.example') returning public_key into other_key;

  -- Pretend this account was just created and has no referrer yet.
  update public.accounts set created_at = now(), referred_by_site = null where id = acct;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Junk is ignored.
  r := r || case when public.set_my_referral('not a key') = false then '1 ok' else '1 FAIL' end;
  -- 2. Your own site can't refer you.
  r := r || case when public.set_my_referral(own_key) = false then ' | 2 ok' else ' | 2 FAIL' end;
  -- 3. Another business's site is recorded (case doesn't matter).
  r := r || case when public.set_my_referral(upper(other_key)) = true then ' | 3 ok' else ' | 3 FAIL' end;
  -- 4. Only the first referrer counts.
  r := r || case when public.set_my_referral(other_key) = false then ' | 4 ok' else ' | 4 FAIL' end;

  perform set_config('role', 'postgres', true);
  r := r || case when (select a.referred_by_site = other_key from public.accounts a where a.id = acct) then ' | 5 ok' else ' | 5 FAIL' end;

  raise exception 'RESULTS: %', r;
end $$;
