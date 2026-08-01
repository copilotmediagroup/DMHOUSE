create table if not exists public.deal_interventions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.sales_opportunities(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  action text not null,
  notes text,
  risk_score integer not null check (risk_score between 0 and 100),
  risk_level text not null check (risk_level in ('healthy','watch','at_risk','critical')),
  created_at timestamptz not null default now()
);
create index if not exists deal_interventions_opportunity_idx on public.deal_interventions(opportunity_id,created_at desc);
alter table public.deal_interventions enable row level security;
drop policy if exists "company members manage deal interventions" on public.deal_interventions;
create policy "company members manage deal interventions" on public.deal_interventions for all using (company_id=public.dmh_current_company_id()) with check (company_id=public.dmh_current_company_id());
create or replace function public.dmh_fill_deal_intervention_actor() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.created_by is null then new.created_by:=auth.uid(); end if; if new.created_by_name is null then select full_name into new.created_by_name from public.profiles where id=new.created_by; end if; return new; end $$;
drop trigger if exists trg_fill_deal_intervention_actor on public.deal_interventions;
create trigger trg_fill_deal_intervention_actor before insert on public.deal_interventions for each row execute function public.dmh_fill_deal_intervention_actor();
