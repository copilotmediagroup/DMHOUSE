-- DMH Sales OS v3.1.5 — Owner Sales Analytics Engine
-- Owner-only, system-calculated revenue, profit, conversion, closing speed,
-- portfolio performance, employee production, and 12-month trends.

create or replace function public.dmh_owner_sales_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_role text;
  v_result jsonb;
begin
  select company_id, role into v_company, v_role
  from public.profiles where id=auth.uid();

  if v_company is null or v_role <> 'owner' then
    raise exception 'Owner access required';
  end if;

  with
  company_sales as (
    select s.*,
      coalesce(s.net_profit, s.sale_price-coalesce(s.acquisition_cost,0)-coalesce(s.transaction_costs,0)) as calculated_profit
    from public.sales s
    where s.company_id=v_company and coalesce(s.revenue_status,'pending') <> 'void'
  ),
  month_sales as (
    select * from company_sales
    where date_trunc('month',closed_at)=date_trunc('month',current_date)
  ),
  previous_month_sales as (
    select * from company_sales
    where closed_at >= date_trunc('month',current_date)-interval '1 month'
      and closed_at < date_trunc('month',current_date)
  ),
  open_pipeline as (
    select * from public.sales_opportunities
    where company_id=v_company and stage not in ('closed_won','closed_lost')
  ),
  decided_pipeline as (
    select * from public.sales_opportunities
    where company_id=v_company and stage in ('closed_won','closed_lost')
  ),
  stage_counts as (
    select stage, count(*)::int as count, coalesce(sum(asking_price),0)::numeric as value
    from public.sales_opportunities where company_id=v_company
    group by stage
  ),
  month_series as (
    select generate_series(
      date_trunc('month',current_date)-interval '11 months',
      date_trunc('month',current_date), interval '1 month'
    ) as month_start
  ),
  monthly as (
    select m.month_start,
      coalesce(sum(s.sale_price),0)::numeric as revenue,
      coalesce(sum(s.calculated_profit),0)::numeric as profit,
      count(s.id)::int as sales
    from month_series m
    left join company_sales s on date_trunc('month',s.closed_at)=m.month_start
    group by m.month_start order by m.month_start
  ),
  employee_rows as (
    select p.id, p.full_name,
      count(s.id)::int as sales,
      coalesce(sum(s.sale_price),0)::numeric as revenue,
      coalesce(sum(s.calculated_profit),0)::numeric as profit,
      coalesce(sum(c.amount) filter(where c.status in ('earned','approved','paid','disputed')),0)::numeric as commission,
      coalesce(sum(c.amount) filter(where c.status='paid'),0)::numeric as commission_paid,
      coalesce(avg(extract(epoch from (s.closed_at-o.created_at))/86400) filter(where o.created_at is not null),0)::numeric as avg_days_to_close
    from public.profiles p
    left join company_sales s on s.winning_employee_id=p.id
    left join public.commissions c on c.sale_id=s.id and c.employee_id=p.id
    left join public.sales_opportunities o on o.portfolio_id=s.portfolio_id and o.company_id=v_company
    where p.company_id=v_company and p.role='employee'
    group by p.id,p.full_name
  ),
  portfolio_rows as (
    select po.id,po.name,po.account_count,
      s.sale_price,
      coalesce(s.acquisition_cost,0)::numeric as acquisition_cost,
      coalesce(s.transaction_costs,0)::numeric as transaction_costs,
      s.calculated_profit as profit,
      case when coalesce(s.acquisition_cost,0)+coalesce(s.transaction_costs,0)=0 then null
        else round(100*s.calculated_profit/(s.acquisition_cost+s.transaction_costs),1) end as roi,
      s.closed_at
    from company_sales s join public.portfolios po on po.id=s.portfolio_id
    order by s.closed_at desc
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'monthRevenue',coalesce((select sum(sale_price) from month_sales),0),
      'monthProfit',coalesce((select sum(calculated_profit) from month_sales),0),
      'monthSales',(select count(*) from month_sales),
      'previousMonthRevenue',coalesce((select sum(sale_price) from previous_month_sales),0),
      'lifetimeRevenue',coalesce((select sum(sale_price) from company_sales),0),
      'lifetimeProfit',coalesce((select sum(calculated_profit) from company_sales),0),
      'pipelineValue',coalesce((select sum(asking_price) from open_pipeline),0),
      'weightedPipeline',coalesce((select sum(asking_price*probability/100.0) from open_pipeline),0),
      'openDeals',(select count(*) from open_pipeline),
      'winRate',case when (select count(*) from decided_pipeline)=0 then 0 else round(100.0*(select count(*) from decided_pipeline where stage='closed_won')/(select count(*) from decided_pipeline),1) end,
      'averageSale',coalesce((select avg(sale_price) from company_sales),0),
      'averageDaysToClose',coalesce((select round(avg(extract(epoch from (closed_at-created_at))/86400)::numeric,1) from public.sales_opportunities where company_id=v_company and stage='closed_won' and closed_at is not null),0),
      'profitMargin',case when coalesce((select sum(sale_price) from company_sales),0)=0 then 0 else round(100*coalesce((select sum(calculated_profit) from company_sales),0)/nullif((select sum(sale_price) from company_sales),0),1) end
    ),
    'monthlyTrend',(select coalesce(jsonb_agg(jsonb_build_object('month',to_char(month_start,'Mon YYYY'),'monthStart',month_start,'revenue',revenue,'profit',profit,'sales',sales) order by month_start),'[]'::jsonb) from monthly),
    'stageFunnel',(select coalesce(jsonb_agg(jsonb_build_object('stage',stage,'count',count,'value',value) order by count desc),'[]'::jsonb) from stage_counts),
    'employees',(select coalesce(jsonb_agg(jsonb_build_object('employeeId',id,'employeeName',full_name,'sales',sales,'revenue',revenue,'profit',profit,'commission',commission,'commissionPaid',commission_paid,'averageDaysToClose',round(avg_days_to_close,1)) order by revenue desc),'[]'::jsonb) from employee_rows),
    'portfolios',(select coalesce(jsonb_agg(jsonb_build_object('portfolioId',id,'portfolioName',name,'accountCount',account_count,'salePrice',sale_price,'acquisitionCost',acquisition_cost,'transactionCosts',transaction_costs,'profit',profit,'roi',roi,'closedAt',closed_at)),'[]'::jsonb) from portfolio_rows)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.dmh_owner_sales_analytics() to authenticated;
