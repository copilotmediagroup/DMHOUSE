-- DMH Sales OS v1.3.3 — Dynamic Location Resolution
-- Caches normalized employee-entered locations so G Maps Extractor receives a dynamic ll value.

create table if not exists public.prospect_location_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_location text not null unique,
  entered_location text not null,
  formatted_location text,
  latitude numeric not null,
  longitude numeric not null,
  provider text not null default 'openstreetmap_nominatim',
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists prospect_location_cache_last_used_idx
  on public.prospect_location_cache(last_used_at desc);

alter table public.prospect_location_cache enable row level security;

-- Location cache is server-managed only. Employees access it through the Edge Function.
revoke all on public.prospect_location_cache from anon, authenticated;

comment on table public.prospect_location_cache is
  'Server-managed cache that converts employee-entered locations into coordinates for the G Maps Extractor ll parameter.';
