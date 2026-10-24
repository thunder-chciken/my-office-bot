-- My Office Bot — initial schema (SPEC §4, §12). Run once in the Supabase SQL editor.
-- Tenant consistency is enforced with composite foreign keys that include account_id.
-- Server code uses the secret key (bypasses RLS); signed-in users only ever read their own account's rows.

create schema if not exists private;

-- ---------------------------------------------------------------- accounts & people

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  billing_status text not null default 'trialing'
    check (billing_status in ('trialing','active','past_due','suspended','canceled')),
  sms_status text not null default 'not_configured'
    check (sms_status in ('not_configured','pending_verification','active','rejected','suspended')),
  voice_status text not null default 'not_configured'
    check (voice_status in ('not_configured','active','suspended')),
  quiet_hours jsonb not null default '{"start":"21:00","end":"07:00","urgent_calls":false}',
  created_at timestamptz not null default now()
);

create table public.memberships (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','agency')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create table public.contacts (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  role_label text,
  phone text,
  email text,
  alert_sms boolean not null default false,
  alert_email boolean not null default true,
  alert_call boolean not null default false,
  is_backup boolean not null default false,
  ladder_order int not null default 1,
  consent_status text not null default 'confirmed' check (consent_status in ('pending','confirmed','revoked')),
  consent_evidence jsonb,
  phone_opted_out boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id)
);

-- ---------------------------------------------------------------- sites (where leads come from)

create table public.sites (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  domain text not null,
  -- Public form key: safe to put in a website's HTML. Abuse is limited by risk scoring + rate caps.
  public_key text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  last_lead_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id)
);

-- ---------------------------------------------------------------- leads & history

create table public.leads (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  site_id uuid not null,
  channel text not null default 'form' check (channel in ('form','widget','email','webhook','plugin')),
  external_event_id text not null,
  name text,
  phone text,
  email text,
  service text,
  message text,
  address text,
  extra jsonb not null default '{}',
  page_url text,
  risk_score int not null default 0,
  risk_status text not null default 'ok' check (risk_status in ('ok','quarantined','needs_review','released','spam')),
  released_at timestamptz,
  urgency text not null default 'normal' check (urgency in ('normal','urgent')),
  state text not null default 'received' check (state in ('received','notified','acknowledged','contacted','closed','spam')),
  received_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_contact_id uuid,
  contacted_at timestamptz,
  contact_evidence text check (contact_evidence in ('self_reported','system_verified')),
  ladder_started_at timestamptz,
  ladder_ended_at timestamptz,
  ladder_end_reason text,
  related_lead_id uuid,
  created_at timestamptz not null default now(),
  primary key (id),
  unique (account_id, id),
  unique (site_id, external_event_id),
  foreign key (account_id, site_id) references public.sites (account_id, id) on delete cascade
);

create index leads_account_received_idx on public.leads (account_id, received_at desc);
create index leads_site_received_idx on public.leads (site_id, received_at desc);

create table public.lead_events (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  lead_id uuid not null,
  type text not null,
  actor text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (account_id, lead_id) references public.leads (account_id, id) on delete cascade
);

create index lead_events_lead_idx on public.lead_events (lead_id, created_at);

-- ---------------------------------------------------------------- alert ledger (SPEC §9)

create table public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  lead_id uuid not null,
  contact_id uuid not null,
  channel text not null check (channel in ('sms','email','voice')),
  step int not null default 0,
  due_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','claimed','dispatching','sent','delivered','failed','canceled','uncertain','skipped')),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  fence int not null default 0,
  attempt_count int not null default 0,
  idempotency_key text not null unique,
  to_address text,
  provider_sid text unique,
  provider_status text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, lead_id) references public.leads (account_id, id) on delete cascade,
  foreign key (account_id, contact_id) references public.contacts (account_id, id) on delete cascade
);

create index notification_attempts_due_idx on public.notification_attempts (status, due_at);

-- ---------------------------------------------------------------- security

-- Membership check used by every policy. Lives in a non-exposed schema with an empty search_path.
create or replace function private.is_member(acct uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = acct and m.user_id = auth.uid()
  );
$$;

revoke all on function private.is_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.accounts enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.sites enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.notification_attempts enable row level security;

-- Signed-in users can read; nobody but server code writes (yet). Writes for the app come in a later migration.
revoke all on public.accounts, public.memberships, public.contacts, public.sites,
  public.leads, public.lead_events, public.notification_attempts from anon, authenticated;
grant select on public.accounts, public.memberships, public.contacts, public.sites,
  public.leads, public.lead_events, public.notification_attempts to authenticated;

create policy accounts_read on public.accounts for select to authenticated using (private.is_member(id));
create policy memberships_read on public.memberships for select to authenticated using (user_id = auth.uid());
create policy contacts_read on public.contacts for select to authenticated using (private.is_member(account_id));
create policy sites_read on public.sites for select to authenticated using (private.is_member(account_id));
create policy leads_read on public.leads for select to authenticated using (private.is_member(account_id));
create policy lead_events_read on public.lead_events for select to authenticated using (private.is_member(account_id));
create policy attempts_read on public.notification_attempts for select to authenticated using (private.is_member(account_id));
