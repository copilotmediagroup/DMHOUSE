-- DMH Sales OS v2.4.2 — Portfolio Performance & Employee Leaderboard Engine

create table if not exists public.performance_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  employee_rank_visible boolean not null default true,
  public_leaderboard_visible boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.performance_settings enable row level security;
drop policy if exists performance_settings_company_select on public.performance_settings;
create policy performance_settings_company_select on public.performance_settings for select
using (company_id=public.current_company_id());
drop policy if exists performance_settings_owner_write on public.performance_settings;
create policy performance_settings_owner_write on public.performance_settings for all
using (company_id=public.current_company_id() and public.current_role()='owner')
with check (company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_set_performance_settings(
  p_employee_rank_visible boolean,
  p_public_leaderboard_visible boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from profiles where id=auth.uid() and role='owner';
  if v_company is null then raise exception 'Owner access required'; end if;
  insert into performance_settings(company_id,employee_rank_visible,public_leaderboard_visible,updated_by,updated_at)
  values(v_company,p_employee_rank_visible,p_public_leaderboard_visible,auth.uid(),now())
  on conflict(company_id) do update set employee_rank_visible=excluded.employee_rank_visible,
    public_leaderboard_visible=excluded.public_leaderboard_visible,updated_by=auth.uid(),updated_at=now();
end $$;
grant execute on function public.dmh_set_performance_settings(boolean,boolean) to authenticated;

create or replace function public.dmh_owner_employee_leaderboard()
returns jsonb language sql security definer set search_path=public as $$
with me as (
  select company_id from profiles where id=auth.uid() and role='owner'
), employees as (
  select p.id,p.full_name,p.is_active from profiles p where p.company_id=(select company_id from me) and p.role='employee'
), sales_m as (
  select winning_employee_id employee_id,
    count(*) filter(where date_trunc('month',closed_at)=date_trunc('month',current_date)) sales_month,
    coalesce(sum(sale_price) filter(where date_trunc('month',closed_at)=date_trunc('month',current_date)),0) revenue_month,
    count(*) sales_lifetime,
    coalesce(sum(sale_price),0) revenue_lifetime,
    coalesce(avg(sale_price),0) avg_sale_price
  from sales where company_id=(select company_id from me) and winning_employee_id is not null group by winning_employee_id
), comm as (
  select employee_id,
    coalesce(sum(amount) filter(where date_trunc('month',created_at)=date_trunc('month',current_date)),0) commission_month,
    coalesce(sum(amount),0) commission_lifetime,
    coalesce(sum(amount) filter(where status in ('estimated','pending','approved')),0) commission_pending
  from commissions where company_id=(select company_id from me) group by employee_id
), acts as (
  select employee_id,count(*) outreach_count,
    count(*) filter(where activity_type='email') emails,
    count(*) filter(where activity_type='call') calls
  from outreach_activities where company_id=(select company_id from me) group by employee_id
), opp as (
  select owner_id employee_id,
    count(*) offers_created,
    count(*) filter(where stage='closed_won') won,
    count(*) filter(where stage not in ('closed_won','closed_lost')) open_deals,
    coalesce(sum(asking_price) filter(where stage not in ('closed_won','closed_lost')),0) pipeline_value
  from sales_opportunities where company_id=(select company_id from me) group by owner_id
), base as (
 select e.id,e.full_name,e.is_active,
  coalesce(s.sales_month,0) sales_month,coalesce(s.revenue_month,0) revenue_month,
  coalesce(s.sales_lifetime,0) sales_lifetime,coalesce(s.revenue_lifetime,0) revenue_lifetime,
  coalesce(s.avg_sale_price,0) avg_sale_price,
  coalesce(c.commission_month,0) commission_month,coalesce(c.commission_lifetime,0) commission_lifetime,
  coalesce(c.commission_pending,0) commission_pending,
  coalesce(a.outreach_count,0) outreach_count,coalesce(a.emails,0) emails,coalesce(a.calls,0) calls,
  coalesce(o.offers_created,0) offers_created,coalesce(o.won,0) won,coalesce(o.open_deals,0) open_deals,
  coalesce(o.pipeline_value,0) pipeline_value,
  case when coalesce(o.offers_created,0)>0 then round((coalesce(o.won,0)::numeric/o.offers_created)*100,1) else 0 end closing_rate
 from employees e left join sales_m s on s.employee_id=e.id left join comm c on c.employee_id=e.id
 left join acts a on a.employee_id=e.id left join opp o on o.employee_id=e.id
), ranked as (
 select *,dense_rank() over(order by revenue_month desc,sales_month desc,outreach_count desc) rank from base
)
select jsonb_build_object(
 'settings',coalesce((select to_jsonb(ps) from performance_settings ps where ps.company_id=(select company_id from me)),jsonb_build_object('employee_rank_visible',true,'public_leaderboard_visible',false)),
 'employees',coalesce((select jsonb_agg(to_jsonb(r) order by rank,full_name) from ranked r),'[]'::jsonb),
 'summary',jsonb_build_object(
   'monthRevenue',coalesce((select sum(revenue_month) from base),0),
   'monthCommissions',coalesce((select sum(commission_month) from base),0),
   'filesSold',coalesce((select sum(sales_month) from base),0),
   'pipelineValue',coalesce((select sum(pipeline_value) from base),0),
   'activeEmployees',(select count(*) from base where is_active)
 ))$$;
grant execute on function public.dmh_owner_employee_leaderboard() to authenticated;

create or replace function public.dmh_employee_performance_dashboard()
returns jsonb language sql security definer set search_path=public as $$
with me as (select id,company_id,full_name from profiles where id=auth.uid() and role='employee'),
all_ranked as (
 select p.id,dense_rank() over(order by coalesce(sum(s.sale_price) filter(where date_trunc('month',s.closed_at)=date_trunc('month',current_date)),0) desc) rank
 from profiles p left join sales s on s.winning_employee_id=p.id and s.company_id=p.company_id
 where p.company_id=(select company_id from me) and p.role='employee' group by p.id
), mine_sales as (
 select count(*) filter(where date_trunc('month',closed_at)=date_trunc('month',current_date)) files_month,
 coalesce(sum(sale_price) filter(where date_trunc('month',closed_at)=date_trunc('month',current_date)),0) revenue_month,
 coalesce(avg(sale_price),0) avg_sale_price
 from sales where company_id=(select company_id from me) and winning_employee_id=(select id from me)
), mine_comm as (
 select coalesce(sum(amount) filter(where date_trunc('month',created_at)=date_trunc('month',current_date)),0) earned_month,
 coalesce(sum(amount) filter(where status in ('estimated','pending','approved')),0) pipeline_commission,
 coalesce(sum(amount) filter(where status='paid'),0) paid_lifetime
 from commissions where company_id=(select company_id from me) and employee_id=(select id from me)
), mine_opp as (
 select count(*) offers_created,count(*) filter(where stage='closed_won') won,
 count(*) filter(where stage not in ('closed_won','closed_lost')) open_deals,
 coalesce(sum(asking_price) filter(where stage not in ('closed_won','closed_lost')),0) pipeline_value
 from sales_opportunities where company_id=(select company_id from me) and owner_id=(select id from me)
), mine_acts as (
 select count(*) outreach_count,count(*) filter(where activity_type='email') emails,count(*) filter(where activity_type='call') calls
 from outreach_activities where company_id=(select company_id from me) and employee_id=(select id from me)
), settings as (
 select coalesce(employee_rank_visible,true) rank_visible,coalesce(public_leaderboard_visible,false) public_visible
 from performance_settings where company_id=(select company_id from me)
)
select jsonb_build_object(
 'employeeName',(select full_name from me),
 'rank',case when coalesce((select rank_visible from settings),true) then (select rank from all_ranked where id=(select id from me)) else null end,
 'publicLeaderboardVisible',coalesce((select public_visible from settings),false),
 'commissionEarnedMonth',(select earned_month from mine_comm),
 'potentialCommission',(select pipeline_commission from mine_comm),
 'commissionPaidLifetime',(select paid_lifetime from mine_comm),
 'filesSoldMonth',(select files_month from mine_sales),
 'revenueMonth',(select revenue_month from mine_sales),
 'averageSalePrice',(select avg_sale_price from mine_sales),
 'pipelineValue',(select pipeline_value from mine_opp),
 'openDeals',(select open_deals from mine_opp),
 'offersCreated',(select offers_created from mine_opp),
 'closingRate',case when (select offers_created from mine_opp)>0 then round(((select won from mine_opp)::numeric/(select offers_created from mine_opp))*100,1) else 0 end,
 'outreachCount',(select outreach_count from mine_acts),'emails',(select emails from mine_acts),'calls',(select calls from mine_acts)
)$$;
grant execute on function public.dmh_employee_performance_dashboard() to authenticated;
