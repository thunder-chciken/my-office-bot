-- My Office Bot — phone notifications (web push, decision D63). Each phone or browser that turns on
-- notifications in the app is saved here, for the business it belongs to. New leads pop up on all of them.
-- Push isn't texting: the person turns it on in their own browser, and it costs nothing per message.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Where the browser's push service accepts messages for this device (Apple, Google, Mozilla, Microsoft).
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

create index push_subscriptions_account_idx on public.push_subscriptions (account_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
grant select on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- Only the browsers' own push services: the server sends to this address, so it must never be an arbitrary URL.
create or replace function private.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p_endpoint) <= 1000, false)
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
$$;

-- Save this device for the signed-in person's business (or move it there, if it was saved before).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(false);
begin
  if not private.is_push_endpoint(p_endpoint) then
    raise exception 'That isn''t a phone notification address we recognize' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{40,200}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'Missing notification keys' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (account_id, user_id, endpoint, p256dh, auth, device)
    values (acct, auth.uid(), p_endpoint, p_p256dh, p_auth, left(nullif(trim(coalesce(p_device, '')), ''), 120))
  on conflict (endpoint) do update set
    account_id = excluded.account_id,
    user_id    = excluded.user_id,
    p256dh     = excluded.p256dh,
    auth       = excluded.auth,
    device     = excluded.device,
    created_at = now();
end;
$$;

-- Turn notifications off for this device.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke all on function private.is_push_endpoint(text), public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;
