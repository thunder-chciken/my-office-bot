-- Newer Supabase projects don't auto-grant new public tables to the API roles.
-- The server (secret key → service_role) reads and writes everything; RLS still guards signed-in users.

grant select, insert, update, delete on public.accounts, public.memberships, public.contacts, public.sites,
  public.leads, public.lead_events, public.notification_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;
