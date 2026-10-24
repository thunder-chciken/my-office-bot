-- My Office Bot — platform admin (decision D52).
-- Who is an admin lives in the database, not in the (public) code. Grant it in the SQL editor:
--   insert into private.platform_admins (user_id) select id from auth.users where email = '…';

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from anon, authenticated;

-- Every admin action is recorded. Only the server (service role) can read or write it.
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  actor_email text,
  action text not null,
  target text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant select, insert on public.admin_audit to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Lets the app ask "is the signed-in person an admin?" without exposing the list.
create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins a where a.user_id = auth.uid())
$$;

revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
