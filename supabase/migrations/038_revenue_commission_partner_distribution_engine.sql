-- DMH Sales OS v2.4.0 — Revenue, Commission & Partner Distribution Engine

alter table public.sales
  add column if not exists gross_revenue numeric(14,2),
  add column if not exists acquisition_cost numeric(14,2) not null default 0,
  add column if not exists transaction_costs numeric(14,2) not null default 0,
  add column if not exists net_profit numeric(14,2),
  add column if not exists revenue_status text not null default 'unreconciled'
    check (revenue_status in ('unreconciled','reconciled','distributed','void')),
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid references public.profiles(id);

update public.sales
set gross_revenue=coalesce(gross_revenue,sale_price),
    net_profit=coalesce(net_profit,sale_price-coalesce(acquisition_cost,0)-coalesce(transaction_costs,0));

alter table public.commissions
  add column if not exists commission_type text not null default 'flat'
    check (commission_type in ('flat','percent_revenue','percent_profit')),
  add column if not exists rate numeric(8,4),
  add column if not exists base_amount numeric(14,2),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists notes text;

create table if not exists public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  default_split_type text not null default 'percent_profit'
    check (default_split_type in ('flat','percent_revenue','percent_profit')),
  default_rate numeric(8,4) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_distributions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  partner_id uuid not null references public.partner_profiles(id),
  distribution_type text not null default 'percent_profit'
    check (distribution_type in ('flat','percent_revenue','percent_profit')),
  rate numeric(8,4),
  base_amount numeric(14,2),
  amount numeric(14,2) not null check (amount>=0),
  status text not null default 'pending'
    check (status in ('estimated','pending','approved','paid','cancelled','disputed')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  paid_at timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sale_id,partner_id)
);

create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  amount numeric(14,2),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists partner_profiles_company_idx on public.partner_profiles(company_id,is_active);
create index if not exists partner_distributions_company_status_idx on public.partner_distributions(company_id,status);
create index if not exists partner_distributions_sale_idx on public.partner_distributions(sale_id);
create index if not exists commissions_company_status_idx on public.commissions(company_id,status);
create index if not exists revenue_events_sale_idx on public.revenue_events(sale_id,created_at desc);

alter table public.partner_profiles enable row level security;
alter table public.partner_distributions enable row level security;
alter table public.revenue_events enable row level security;

drop policy if exists partner_profiles_owner_all on public.partner_profiles;
create policy partner_profiles_owner_all on public.partner_profiles for all
using (company_id=public.current_company_id() and public.current_role()='owner')
with check (company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists partner_distributions_owner_all on public.partner_distributions;
create policy partner_distributions_owner_all on public.partner_distributions for all
using (company_id=public.current_company_id() and public.current_role()='owner')
with check (company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists revenue_events_company_select on public.revenue_events;
create policy revenue_events_company_select on public.revenue_events for select
using (company_id=public.current_company_id());

drop policy if exists revenue_events_owner_write on public.revenue_events;
create policy revenue_events_owner_write on public.revenue_events for all
using (company_id=public.current_company_id() and public.current_role()='owner')
with check (company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_reconcile_sale(
  p_sale_id uuid,
  p_acquisition_cost numeric,
  p_transaction_costs numeric default 0
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_sale public.sales%rowtype; v_profit numeric;
begin
  select company_id into v_company from profiles where id=auth.uid() and role='owner';
  if v_company is null then raise exception 'Owner access required'; end if;
  select * into v_sale from sales where id=p_sale_id and company_id=v_company for update;
  if not found then raise exception 'Sale not found'; end if;
  v_profit:=coalesce(v_sale.sale_price,0)-greatest(coalesce(p_acquisition_cost,0),0)-greatest(coalesce(p_transaction_costs,0),0);
  update sales set gross_revenue=sale_price,acquisition_cost=greatest(coalesce(p_acquisition_cost,0),0),transaction_costs=greatest(coalesce(p_transaction_costs,0),0),net_profit=v_profit,revenue_status='reconciled',reconciled_at=now(),reconciled_by=auth.uid() where id=p_sale_id;
  insert into revenue_events(company_id,sale_id,event_type,title,detail,amount,created_by)
  values(v_company,p_sale_id,'reconciled','Sale reconciled','Revenue, costs, and net profit were finalized.',v_profit,auth.uid());
end $$;
grant execute on function public.dmh_reconcile_sale(uuid,numeric,numeric) to authenticated;

create or replace function public.dmh_set_commission_status(
  p_commission_id uuid,
  p_status text,
  p_payment_reference text default null,
  p_notes text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_comm public.commissions%rowtype;
begin
  select company_id into v_company from profiles where id=auth.uid() and role='owner';
  if v_company is null then raise exception 'Owner access required'; end if;
  if p_status not in ('estimated','pending','approved','paid','cancelled','disputed') then raise exception 'Invalid commission status'; end if;
  select * into v_comm from commissions where id=p_commission_id and company_id=v_company for update;
  if not found then raise exception 'Commission not found'; end if;
  update commissions set status=p_status,
    approved_at=case when p_status='approved' then now() else approved_at end,
    approved_by=case when p_status='approved' then auth.uid() else approved_by end,
    paid_at=case when p_status='paid' then now() else paid_at end,
    payment_reference=coalesce(p_payment_reference,payment_reference),
    notes=coalesce(p_notes,notes)
  where id=p_commission_id;
  insert into revenue_events(company_id,sale_id,event_type,title,detail,amount,created_by)
  values(v_company,v_comm.sale_id,'commission_'||p_status,'Commission '||p_status,coalesce(p_notes,''),v_comm.amount,auth.uid());
end $$;
grant execute on function public.dmh_set_commission_status(uuid,text,text,text) to authenticated;

create or replace function public.dmh_set_partner_distribution_status(
  p_distribution_id uuid,
  p_status text,
  p_payment_reference text default null,
  p_notes text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_dist public.partner_distributions%rowtype;
begin
  select company_id into v_company from profiles where id=auth.uid() and role='owner';
  if v_company is null then raise exception 'Owner access required'; end if;
  if p_status not in ('estimated','pending','approved','paid','cancelled','disputed') then raise exception 'Invalid distribution status'; end if;
  select * into v_dist from partner_distributions where id=p_distribution_id and company_id=v_company for update;
  if not found then raise exception 'Distribution not found'; end if;
  update partner_distributions set status=p_status,
    approved_at=case when p_status='approved' then now() else approved_at end,
    approved_by=case when p_status='approved' then auth.uid() else approved_by end,
    paid_at=case when p_status='paid' then now() else paid_at end,
    payment_reference=coalesce(p_payment_reference,payment_reference),
    notes=coalesce(p_notes,notes),updated_at=now()
  where id=p_distribution_id;
  insert into revenue_events(company_id,sale_id,event_type,title,detail,amount,created_by)
  values(v_company,v_dist.sale_id,'partner_'||p_status,'Partner distribution '||p_status,coalesce(p_notes,''),v_dist.amount,auth.uid());
end $$;
grant execute on function public.dmh_set_partner_distribution_status(uuid,text,text,text) to authenticated;

create or replace function public.dmh_revenue_dashboard()
returns jsonb language sql security definer set search_path=public as $$
with me as (select company_id from profiles where id=auth.uid()),
s as (select * from sales where company_id=(select company_id from me)),
c as (select * from commissions where company_id=(select company_id from me)),
p as (select * from partner_distributions where company_id=(select company_id from me))
select jsonb_build_object(
  'lifetimeRevenue',coalesce((select sum(coalesce(gross_revenue,sale_price)) from s where revenue_status<>'void'),0),
  'monthRevenue',coalesce((select sum(coalesce(gross_revenue,sale_price)) from s where date_trunc('month',closed_at)=date_trunc('month',current_date) and revenue_status<>'void'),0),
  'lifetimeProfit',coalesce((select sum(coalesce(net_profit,sale_price-acquisition_cost-transaction_costs)) from s where revenue_status<>'void'),0),
  'monthProfit',coalesce((select sum(coalesce(net_profit,sale_price-acquisition_cost-transaction_costs)) from s where date_trunc('month',closed_at)=date_trunc('month',current_date) and revenue_status<>'void'),0),
  'pendingCommissions',coalesce((select sum(amount) from c where status in ('estimated','pending','approved')),0),
  'paidCommissions',coalesce((select sum(amount) from c where status='paid'),0),
  'pendingPartnerDistributions',coalesce((select sum(amount) from p where status in ('estimated','pending','approved')),0),
  'paidPartnerDistributions',coalesce((select sum(amount) from p where status='paid'),0),
  'unreconciledSales',(select count(*) from s where revenue_status='unreconciled'),
  'reconciledSales',(select count(*) from s where revenue_status in ('reconciled','distributed'))
)$$;
grant execute on function public.dmh_revenue_dashboard() to authenticated;
