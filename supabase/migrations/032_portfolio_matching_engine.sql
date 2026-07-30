-- DMH Sales OS v1.8.0 — Portfolio Matching Engine

create table if not exists public.buyer_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  product_types text[] not null default '{}',
  states text[] not null default '{}',
  min_account_age_months integer,
  max_account_age_months integer,
  min_average_balance numeric(14,2),
  max_average_balance numeric(14,2),
  min_account_count integer,
  max_account_count integer,
  min_price numeric(14,2),
  max_price numeric(14,2),
  preferred_creditors text[] not null default '{}',
  paper_qualities text[] not null default '{}',
  buying_frequency text,
  last_purchase_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, agency_id)
);

create table if not exists public.portfolio_match_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  product_type text,
  states text[] not null default '{}',
  account_age_months integer,
  average_balance numeric(14,2),
  paper_quality text,
  sale_restrictions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, portfolio_id)
);

create table if not exists public.portfolio_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  score integer not null default 0 check (score between 0 and 100),
  strength text not null default 'weak' check (strength in ('strong','moderate','weak')),
  reasons text[] not null default '{}',
  status text not null default 'recommended' check (status in ('recommended','selected','assigned','contacted','opened','replied','declined','negotiating','purchased','dismissed')),
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, portfolio_id, agency_id)
);

create index if not exists buyer_preferences_company_idx on public.buyer_preferences(company_id);
create index if not exists portfolio_match_profiles_company_idx on public.portfolio_match_profiles(company_id);
create index if not exists portfolio_matches_portfolio_score_idx on public.portfolio_matches(portfolio_id, score desc);
create index if not exists portfolio_matches_agency_score_idx on public.portfolio_matches(agency_id, score desc);

alter table public.buyer_preferences enable row level security;
alter table public.portfolio_match_profiles enable row level security;
alter table public.portfolio_matches enable row level security;

create or replace function public.dmh_current_company_id()
returns uuid language sql stable security definer set search_path=public as $$
  select company_id from public.profiles where id = auth.uid() limit 1
$$;

drop policy if exists "company buyer preferences" on public.buyer_preferences;
create policy "company buyer preferences" on public.buyer_preferences for all to authenticated
using (company_id = public.dmh_current_company_id())
with check (company_id = public.dmh_current_company_id());

drop policy if exists "company portfolio match profiles" on public.portfolio_match_profiles;
create policy "company portfolio match profiles" on public.portfolio_match_profiles for all to authenticated
using (company_id = public.dmh_current_company_id())
with check (company_id = public.dmh_current_company_id());

drop policy if exists "company portfolio matches" on public.portfolio_matches;
create policy "company portfolio matches" on public.portfolio_matches for all to authenticated
using (company_id = public.dmh_current_company_id())
with check (company_id = public.dmh_current_company_id());

grant select, insert, update, delete on public.buyer_preferences to authenticated;
grant select, insert, update, delete on public.portfolio_match_profiles to authenticated;
grant select, insert, update, delete on public.portfolio_matches to authenticated;

create or replace function public.dmh_touch_matching_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_buyer_preferences_updated on public.buyer_preferences;
create trigger trg_buyer_preferences_updated before update on public.buyer_preferences
for each row execute function public.dmh_touch_matching_updated_at();

drop trigger if exists trg_portfolio_match_profiles_updated on public.portfolio_match_profiles;
create trigger trg_portfolio_match_profiles_updated before update on public.portfolio_match_profiles
for each row execute function public.dmh_touch_matching_updated_at();

drop trigger if exists trg_portfolio_matches_updated on public.portfolio_matches;
create trigger trg_portfolio_matches_updated before update on public.portfolio_matches
for each row execute function public.dmh_touch_matching_updated_at();
