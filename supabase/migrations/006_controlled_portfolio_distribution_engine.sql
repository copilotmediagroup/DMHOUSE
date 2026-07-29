-- DMH Sales OS v0.5.1 — Controlled Portfolio Distribution Engine (legacy-safe repair)
-- This migration safely upgrades the distribution table created in migration 001.

create table if not exists public.portfolio_file_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  storage_path text not null,
  display_name text not null,
  version_number integer not null default 1 check (version_number > 0),
  is_current boolean not null default true,
  locked_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(portfolio_id, version_number)
);

-- Upgrade the legacy portfolio_distributions table instead of attempting to recreate it.
alter table public.portfolio_distributions
  add column if not exists file_version_id uuid references public.portfolio_file_versions(id) on delete restrict,
  add column if not exists business_reason text,
  add column if not exists status text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists risk_flags jsonb,
  add column if not exists created_at timestamptz;

-- Preserve data from the original v0.1 schema.
update public.portfolio_distributions
set business_reason = coalesce(business_reason, purpose, 'Portfolio sample requested')
where business_reason is null;

update public.portfolio_distributions
set status = coalesce(
  status,
  case when delivery_method = 'email' then 'sent' else 'downloaded' end
)
where status is null;

update public.portfolio_distributions
set created_at = coalesce(created_at, distributed_at, now())
where created_at is null;

update public.portfolio_distributions
set delivered_at = coalesce(delivered_at, distributed_at, created_at)
where delivered_at is null;

update public.portfolio_distributions
set follow_up_at = coalesce(follow_up_at, created_at + interval '2 days')
where follow_up_at is null;

update public.portfolio_distributions
set risk_flags = coalesce(risk_flags, '[]'::jsonb)
where risk_flags is null;

alter table public.portfolio_distributions
  alter column business_reason set not null,
  alter column status set default 'prepared',
  alter column status set not null,
  alter column follow_up_at set not null,
  alter column risk_flags set default '[]'::jsonb,
  alter column risk_flags set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

-- The old file_id remains supported for historical rows, but new versioned records may use file_version_id.
alter table public.portfolio_distributions alter column file_id drop not null;

-- Add status validation only once.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portfolio_distributions_status_check'
      and conrelid = 'public.portfolio_distributions'::regclass
  ) then
    alter table public.portfolio_distributions
      add constraint portfolio_distributions_status_check
      check (status in ('prepared','sent','downloaded','locked'));
  end if;
end $$;

create index if not exists portfolio_distributions_company_created_idx
  on public.portfolio_distributions(company_id, created_at desc);
create index if not exists portfolio_distributions_recipient_idx
  on public.portfolio_distributions(portfolio_id, agency_id, contact_id);
create index if not exists portfolio_distributions_employee_idx
  on public.portfolio_distributions(employee_id, created_at desc);

alter table public.portfolio_file_versions enable row level security;
alter table public.portfolio_distributions enable row level security;

-- Make the migration safe to rerun and replace broad legacy policies.
drop policy if exists "company distributions" on public.portfolio_distributions;
drop policy if exists "employees create distributions" on public.portfolio_distributions;
drop policy if exists "company users read current file versions" on public.portfolio_file_versions;
drop policy if exists "owners manage file versions" on public.portfolio_file_versions;
drop policy if exists "owners read all distributions" on public.portfolio_distributions;
drop policy if exists "employees read own distributions" on public.portfolio_distributions;
drop policy if exists "employees create attributed distributions" on public.portfolio_distributions;
drop policy if exists "employees update own prepared distributions" on public.portfolio_distributions;
drop policy if exists "owners control distributions" on public.portfolio_distributions;

create policy "company users read current file versions" on public.portfolio_file_versions
for select using (company_id = public.current_company_id());

create policy "owners manage file versions" on public.portfolio_file_versions
for all using (company_id = public.current_company_id() and public.current_role() = 'owner')
with check (company_id = public.current_company_id() and public.current_role() = 'owner');

create policy "owners read all distributions" on public.portfolio_distributions
for select using (company_id = public.current_company_id() and public.current_role() = 'owner');

create policy "employees read own distributions" on public.portfolio_distributions
for select using (company_id = public.current_company_id() and employee_id = auth.uid());

create policy "employees create attributed distributions" on public.portfolio_distributions
for insert with check (
  company_id = public.current_company_id()
  and employee_id = auth.uid()
  and exists (
    select 1 from public.agency_assignments aa
    where aa.agency_id = portfolio_distributions.agency_id
      and aa.employee_id = auth.uid()
      and aa.ended_at is null
  )
  and exists (
    select 1 from public.portfolios p
    where p.id = portfolio_distributions.portfolio_id
      and p.company_id = public.current_company_id()
      and p.status in ('active','negotiating')
  )
);

create policy "employees update own prepared distributions" on public.portfolio_distributions
for update using (
  company_id = public.current_company_id()
  and employee_id = auth.uid()
  and status = 'prepared'
)
with check (company_id = public.current_company_id() and employee_id = auth.uid());

create policy "owners control distributions" on public.portfolio_distributions
for update using (company_id = public.current_company_id() and public.current_role() = 'owner')
with check (company_id = public.current_company_id() and public.current_role() = 'owner');
