create extension if not exists pgcrypto;

create type public.user_role as enum ('owner','employee');
create type public.portfolio_status as enum ('draft','ready','active','negotiating','reserved','payment_pending','sold','archived');
create type public.offer_status as enum ('submitted','owner_countered','buyer_countered','accepted','rejected','expired','reserved','closed');

create table public.companies (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 created_at timestamptz not null default now()
);

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 role public.user_role not null default 'employee',
 full_name text not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);

create table public.agencies (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 discovered_by uuid references public.profiles(id),
 assigned_to uuid references public.profiles(id),
 name text not null,
 normalized_name text generated always as (lower(regexp_replace(name,'[^a-zA-Z0-9]','','g'))) stored,
 website text,
 domain text,
 phone text,
 address text,
 city text,
 state text,
 source_url text,
 ownership_expires_at timestamptz,
 buyer_score integer not null default 0 check (buyer_score between 0 and 100),
 created_at timestamptz not null default now(),
 unique(company_id, normalized_name)
);
create index agencies_domain_idx on public.agencies(company_id,domain);
create index agencies_phone_idx on public.agencies(company_id,phone);

create table public.agency_contacts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 first_name text not null,
 last_name text,
 title text,
 email text,
 phone text,
 linkedin_url text,
 is_decision_maker boolean not null default false,
 created_at timestamptz not null default now()
);

create table public.portfolios (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null,
 original_creditor text,
 account_count integer not null check(account_count>=0),
 face_value numeric(14,2) not null default 0,
 asking_price numeric(14,2) not null default 0,
 private_minimum numeric(14,2) not null default 0,
 acquisition_cost numeric(14,2) not null default 0,
 status public.portfolio_status not null default 'draft',
 activated_at timestamptz,
 sold_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 check(private_minimum<=asking_price)
);
create unique index one_active_portfolio_per_company on public.portfolios(company_id) where status in ('active','negotiating','reserved','payment_pending');

create table public.portfolio_files (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 storage_path text not null,
 file_name text not null,
 version integer not null default 1,
 employee_visible boolean not null default true,
 locked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(portfolio_id,version)
);

create table public.outreach_activities (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 contact_id uuid references public.agency_contacts(id) on delete set null,
 employee_id uuid not null references public.profiles(id),
 portfolio_id uuid references public.portfolios(id),
 activity_type text not null check(activity_type in ('email','call','voicemail','note','sample','follow_up')),
 disposition text,
 notes text,
 occurred_at timestamptz not null default now()
);

create table public.portfolio_distributions (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id),
 file_id uuid not null references public.portfolio_files(id),
 agency_id uuid not null references public.agencies(id),
 contact_id uuid references public.agency_contacts(id),
 employee_id uuid not null references public.profiles(id),
 delivery_method text not null check(delivery_method in ('download','email')),
 purpose text not null,
 distributed_at timestamptz not null default now()
);

create table public.offers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id),
 agency_id uuid not null references public.agencies(id),
 contact_id uuid references public.agency_contacts(id),
 employee_id uuid not null references public.profiles(id),
 status public.offer_status not null default 'submitted',
 current_amount numeric(14,2) not null,
 payment_terms text,
 conditions text,
 employee_recommendation text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.offer_rounds (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 offer_id uuid not null references public.offers(id) on delete cascade,
 round_number integer not null,
 actor_role text not null check(actor_role in ('buyer','employee','owner')),
 action text not null check(action in ('offer','counter','accept','reject','request_info')),
 amount numeric(14,2),
 terms text,
 message text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(offer_id,round_number)
);

create table public.reservations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 offer_id uuid not null unique references public.offers(id),
 portfolio_id uuid not null references public.portfolios(id),
 buyer_agency_id uuid not null references public.agencies(id),
 amount numeric(14,2) not null,
 payment_deadline timestamptz not null,
 status text not null default 'active' check(status in ('active','paid','expired','cancelled')),
 created_at timestamptz not null default now()
);

create table public.sales (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 portfolio_id uuid not null unique references public.portfolios(id),
 reservation_id uuid references public.reservations(id),
 buyer_agency_id uuid not null references public.agencies(id),
 winning_employee_id uuid references public.profiles(id),
 sale_price numeric(14,2) not null,
 paid_at timestamptz,
 closed_at timestamptz not null default now()
);

create table public.commissions (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 sale_id uuid not null references public.sales(id) on delete cascade,
 employee_id uuid not null references public.profiles(id),
 amount numeric(14,2) not null,
 status text not null default 'pending' check(status in ('estimated','pending','approved','paid','cancelled','disputed')),
 created_at timestamptz not null default now()
);

create table public.follow_ups (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 employee_id uuid not null references public.profiles(id),
 due_at timestamptz not null,
 reason text not null,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null,
 title text not null,
 body text,
 action_path text,
 read_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.audit_logs (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 actor_id uuid references public.profiles(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.agencies enable row level security;
alter table public.agency_contacts enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_files enable row level security;
alter table public.outreach_activities enable row level security;
alter table public.portfolio_distributions enable row level security;
alter table public.offers enable row level security;
alter table public.offer_rounds enable row level security;
alter table public.reservations enable row level security;
alter table public.sales enable row level security;
alter table public.commissions enable row level security;
alter table public.follow_ups enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_company_id() returns uuid language sql stable security definer set search_path=public as $$ select company_id from public.profiles where id=auth.uid() $$;
create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;

create policy "company profiles readable" on public.profiles for select using(company_id=public.current_company_id());
create policy "company agencies readable" on public.agencies for select using(company_id=public.current_company_id());
create policy "employees create agencies" on public.agencies for insert with check(company_id=public.current_company_id() and discovered_by=auth.uid());
create policy "assigned or owner updates agencies" on public.agencies for update using(company_id=public.current_company_id() and (assigned_to=auth.uid() or public.current_role()='owner'));
create policy "company contacts readable" on public.agency_contacts for select using(company_id=public.current_company_id());
create policy "company contacts writable" on public.agency_contacts for all using(company_id=public.current_company_id()) with check(company_id=public.current_company_id());
create policy "portfolio employee view" on public.portfolios for select using(company_id=public.current_company_id());
create policy "owner manages portfolios" on public.portfolios for all using(company_id=public.current_company_id() and public.current_role()='owner') with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "portfolio files readable" on public.portfolio_files for select using(company_id=public.current_company_id() and locked_at is null and (employee_visible or public.current_role()='owner'));
create policy "owner manages files" on public.portfolio_files for all using(company_id=public.current_company_id() and public.current_role()='owner') with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "company outreach" on public.outreach_activities for all using(company_id=public.current_company_id()) with check(company_id=public.current_company_id() and employee_id=auth.uid());
create policy "company distributions" on public.portfolio_distributions for select using(company_id=public.current_company_id());
create policy "employees create distributions" on public.portfolio_distributions for insert with check(company_id=public.current_company_id() and employee_id=auth.uid());
create policy "company offers readable" on public.offers for select using(company_id=public.current_company_id());
create policy "employees submit offers" on public.offers for insert with check(company_id=public.current_company_id() and employee_id=auth.uid());
create policy "owner updates offers" on public.offers for update using(company_id=public.current_company_id() and public.current_role()='owner');
create policy "company offer rounds readable" on public.offer_rounds for select using(company_id=public.current_company_id());
create policy "offer rounds insert" on public.offer_rounds for insert with check(company_id=public.current_company_id() and created_by=auth.uid());
create policy "owner reservations" on public.reservations for all using(company_id=public.current_company_id() and public.current_role()='owner') with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "company reservations readable" on public.reservations for select using(company_id=public.current_company_id());
create policy "owner sales" on public.sales for all using(company_id=public.current_company_id() and public.current_role()='owner') with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "company sales readable" on public.sales for select using(company_id=public.current_company_id());
create policy "commission self or owner" on public.commissions for select using(company_id=public.current_company_id() and (employee_id=auth.uid() or public.current_role()='owner'));
create policy "owner commissions" on public.commissions for all using(company_id=public.current_company_id() and public.current_role()='owner') with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "followups own or owner" on public.follow_ups for all using(company_id=public.current_company_id() and (employee_id=auth.uid() or public.current_role()='owner')) with check(company_id=public.current_company_id());
create policy "notifications own" on public.notifications for select using(user_id=auth.uid());
create policy "notifications update own" on public.notifications for update using(user_id=auth.uid());
create policy "audit owner only" on public.audit_logs for select using(company_id=public.current_company_id() and public.current_role()='owner');
