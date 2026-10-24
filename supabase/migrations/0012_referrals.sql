-- My Office Bot — referrals from the chat bubble's "Powered by My Office Bot" link (decision D59).
-- The link carries the referring site's public key (?ref=...). The browser remembers it, and when a new
-- business finishes signing up, set_my_referral() records which site sent them. Admins see the count.

alter table public.accounts add column if not exists referred_by_site text;
create index if not exists accounts_referred_by_site_idx on public.accounts (referred_by_site) where referred_by_site is not null;

-- Records the referrer once, only for a brand-new account, only for a real site that isn't its own.
-- Anything else is quietly ignored, so a bad or stale code never gets in the way of signing up.
create or replace function public.set_my_referral(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  v_ref text := lower(trim(coalesce(p_ref, '')));
begin
  if v_ref !~ '^[0-9a-f]{16,64}$' then
    return false;
  end if;
  if not exists (select 1 from public.sites s where s.public_key = v_ref and s.account_id <> acct) then
    return false;
  end if;
  update public.accounts set referred_by_site = v_ref
  where id = acct and referred_by_site is null and created_at > now() - interval '2 days';
  return found;
end;
$$;

revoke all on function public.set_my_referral(text) from public, anon;
grant execute on function public.set_my_referral(text) to authenticated;
