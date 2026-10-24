-- My Office Bot — WordPress plugin connection (decision D57).
-- Each site gets a private plugin secret. The plugin signs every delivery with it (HMAC + timestamp),
-- so plugin leads can't be forged even though the site's public form key is visible in page HTML.

alter table public.sites
  add column if not exists plugin_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column if not exists plugin_last_seen_at timestamptz,
  add column if not exists plugin_version text,
  add column if not exists plugin_site_url text;

-- The owner can make a new secret if the old connection code leaks; the old one stops working at once.
create or replace function public.rotate_plugin_secret()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  fresh text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.sites set plugin_secret = fresh where account_id = acct;
  return fresh;
end;
$$;

revoke all on function public.rotate_plugin_secret() from public, anon;
grant execute on function public.rotate_plugin_secret() to authenticated;
