-- My Office Bot — create a business account on first sign-in (decision D49).
-- Called by a signed-in user from /onboarding. One account per person for now; calling it again
-- just returns the account they already own, so a double-tap can't create two.

create or replace function public.create_my_account(
  p_business_name text,
  p_owner_name text,
  p_phone text default null,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  acct uuid;
  owner_email text;
  site_domain text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if coalesce(trim(p_business_name), '') = '' or coalesce(trim(p_owner_name), '') = '' then
    raise exception 'Business name and your name are required' using errcode = '22023';
  end if;

  -- Serialize per user so two taps at once can't both pass the check below.
  perform pg_advisory_xact_lock(hashtext(uid::text));

  select m.account_id into acct from public.memberships m where m.user_id = uid limit 1;
  if acct is not null then
    return acct;
  end if;

  select u.email into owner_email from auth.users u where u.id = uid;
  site_domain := lower(regexp_replace(coalesce(trim(p_website), ''), '^(https?://)?(www\.)?|/.*$', '', 'g'));

  insert into public.accounts (name) values (left(trim(p_business_name), 120)) returning id into acct;
  insert into public.memberships (account_id, user_id, role) values (acct, uid, 'owner');
  insert into public.contacts (account_id, name, role_label, phone, email, alert_email)
    values (acct, left(trim(p_owner_name), 120), 'Owner', nullif(left(trim(coalesce(p_phone, '')), 40), ''), owner_email, true);
  insert into public.sites (account_id, domain) values (acct, site_domain);
  return acct;
end;
$$;

revoke all on function public.create_my_account(text, text, text, text) from public, anon;
grant execute on function public.create_my_account(text, text, text, text) to authenticated;
