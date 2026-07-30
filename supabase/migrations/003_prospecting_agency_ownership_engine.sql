-- DMH Sales OS v0.3.0 — Prospecting & Agency Ownership Engine
-- Extends the agency/contact/outreach tables created by migration 001.
create extension if not exists pg_trgm;

alter table public.agencies
  add column if not exists status text not null default 'new',
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.agencies add constraint agencies_status_check
    check (status in ('new','contacted','qualified','interested','not_interested','do_not_contact'));
exception when duplicate_object then null; end $$;

create index if not exists agencies_name_trgm_idx on public.agencies using gin (normalized_name gin_trgm_ops);

create table if not exists public.agency_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid references public.profiles(id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  ended_at timestamptz,
  ended_reason text,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_agency_assignment
  on public.agency_assignments(agency_id) where ended_at is null;

create table if not exists public.agency_ownership_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  from_employee_id uuid references public.profiles(id),
  to_employee_id uuid references public.profiles(id),
  action text not null check (action in ('claimed','renewed','reassigned','released','expired')),
  reason text,
  acted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.outreach_activities add column if not exists follow_up_at timestamptz;

create or replace function public.claim_agency(p_agency_id uuid)
returns public.agency_assignments
language plpgsql security definer set search_path=public as $$
declare v_company uuid := public.current_company_id(); v_row public.agency_assignments;
begin
  if exists(select 1 from public.agency_assignments where agency_id=p_agency_id and ended_at is null and expires_at>now()) then
    raise exception 'Agency already has active working ownership';
  end if;
  update public.agency_assignments set ended_at=now(), ended_reason='expired' where agency_id=p_agency_id and ended_at is null;
  insert into public.agency_assignments(company_id,agency_id,employee_id,assigned_by)
  values(v_company,p_agency_id,auth.uid(),auth.uid()) returning * into v_row;
  update public.agencies set assigned_to=auth.uid(), ownership_expires_at=v_row.expires_at, updated_at=now() where id=p_agency_id and company_id=v_company;
  insert into public.agency_ownership_history(company_id,agency_id,to_employee_id,action,acted_by)
  values(v_company,p_agency_id,auth.uid(),'claimed',auth.uid());
  return v_row;
end $$;

create or replace function public.renew_agency_ownership(p_agency_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.agency_assignments set expires_at=now()+interval '30 days'
   where agency_id=p_agency_id and employee_id=auth.uid() and ended_at is null;
  update public.agencies set ownership_expires_at=now()+interval '30 days', updated_at=now()
   where id=p_agency_id and assigned_to=auth.uid();
  insert into public.agency_ownership_history(company_id,agency_id,to_employee_id,action,acted_by)
  values(public.current_company_id(),p_agency_id,auth.uid(),'renewed',auth.uid());
end $$;

alter table public.agency_assignments enable row level security;
alter table public.agency_ownership_history enable row level security;

create policy "company assignments readable" on public.agency_assignments
for select using(company_id=public.current_company_id());
create policy "owner manages assignments" on public.agency_assignments
for all using(company_id=public.current_company_id() and public.current_role()='owner')
with check(company_id=public.current_company_id() and public.current_role()='owner');
create policy "company ownership history readable" on public.agency_ownership_history
for select using(company_id=public.current_company_id());
create policy "owner writes ownership history" on public.agency_ownership_history
for insert with check(company_id=public.current_company_id() and public.current_role()='owner');

grant execute on function public.claim_agency(uuid) to authenticated;
grant execute on function public.renew_agency_ownership(uuid) to authenticated;
