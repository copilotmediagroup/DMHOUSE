-- DMHOUSE v4.0.1 — Google Workspace Connection Foundation
-- Owner-only company mailbox connection metadata. OAuth tokens are encrypted
-- by Edge Functions before storage and are never exposed through RLS.

create extension if not exists pgcrypto;

create table if not exists public.company_email_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'google_workspace' check (provider in ('google_workspace')),
  desired_email text not null default 'sales@debtpaper.com',
  mailbox_email text,
  status text not null default 'disconnected' check (status in ('disconnected','connecting','connected','error')),
  scopes text[] not null default '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  google_history_id text,
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider)
);

create table if not exists public.company_email_oauth_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'google_workspace',
  state_hash text not null unique,
  return_url text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists company_email_connections_company_idx
  on public.company_email_connections(company_id);
create index if not exists company_email_oauth_states_expiry_idx
  on public.company_email_oauth_states(expires_at);

alter table public.company_email_connections enable row level security;
alter table public.company_email_oauth_states enable row level security;

-- Owners may read connection metadata, but encrypted token columns remain
-- protected by column grants below and are intended for service-role functions.
drop policy if exists "owner reads company email connection" on public.company_email_connections;
create policy "owner reads company email connection"
on public.company_email_connections for select
using (company_id = public.current_company_id() and public.current_role() = 'owner');

revoke all on public.company_email_connections from anon;
revoke all on public.company_email_oauth_states from anon, authenticated;
grant select (
  id, company_id, provider, desired_email, mailbox_email, status, scopes,
  access_token_expires_at, google_history_id, last_verified_at, last_sync_at,
  last_error, connected_by, connected_at, created_at, updated_at
) on public.company_email_connections to authenticated;

insert into public.company_email_connections (company_id, desired_email)
select id, 'sales@debtpaper.com'
from public.companies
on conflict (company_id, provider) do nothing;

create or replace function public.touch_company_email_connection()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_email_connections_touch on public.company_email_connections;
create trigger company_email_connections_touch
before update on public.company_email_connections
for each row execute function public.touch_company_email_connection();

comment on table public.company_email_connections is
'Owner-controlled company email provider connection. OAuth tokens are encrypted by Edge Functions and never returned to clients.';
