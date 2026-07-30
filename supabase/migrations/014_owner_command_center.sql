-- DMH Sales OS v1.1.0 — Owner Command Center
-- One owner-only RPC returns live KPIs, action queues, pipeline, performance and activity.

create or replace function public.dmh_owner_command_center()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid := public.current_company_id();
  v_now timestamptz := now();
  v_result jsonb;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;

  select jsonb_build_object(
    'generatedAt', v_now,
    'portfolioCounts', jsonb_build_object(
      'active', (select count(*) from portfolios where company_id=v_company and status='active'),
      'negotiating', (select count(*) from portfolios where company_id=v_company and status='negotiating'),
      'reserved', (select count(*) from portfolios where company_id=v_company and status in ('reserved','payment_pending')),
      'sold', (select count(*) from portfolios where company_id=v_company and status='sold')
    ),
    'financials', jsonb_build_object(
      'grossRevenue', coalesce((select sum(sale_price) from sales where company_id=v_company),0),
      'pendingBalances', coalesce((select sum(greatest(amount-deposit_received-balance_received,0)) from reservations where company_id=v_company and status='active'),0),
      'pendingCommissions', coalesce((select sum(amount) from commissions where company_id=v_company and status in ('pending','approved')),0),
      'netCompanyRevenue', coalesce((select sum(net_revenue) from sales where company_id=v_company),0)
    ),
    'pipeline', (select coalesce(jsonb_agg(x order by x.sort_order),'[]'::jsonb) from (
      select 1 sort_order,'Prospected' label,count(*)::int value,'/agencies' path from agencies where company_id=v_company
      union all select 2,'Distributed',count(*)::int,'/distributions' from portfolio_distributions where company_id=v_company
      union all select 3,'Contacted',count(distinct agency_id)::int,'/outreach' from outreach_activities where company_id=v_company
      union all select 4,'Negotiating',count(*)::int,'/negotiations' from offers where company_id=v_company and status in ('submitted','owner_countered','buyer_countered','accepted')
      union all select 5,'Reserved',count(*)::int,'/closings' from reservations where company_id=v_company and status='active'
      union all select 6,'Sold',count(*)::int,'/closings' from sales where company_id=v_company
    ) x),
    'queues', jsonb_build_object(
      'expiringReservations', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',p.name,'subtitle',a.name,'amount',r.amount,'dueAt',r.reservation_expires_at,'path','/closings') order by r.reservation_expires_at),'[]'::jsonb) from reservations r join portfolios p on p.id=r.portfolio_id join agencies a on a.id=r.buyer_agency_id where r.company_id=v_company and r.status='active' and r.reservation_expires_at between v_now and v_now+interval '48 hours'),
      'overdueDeposits', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',p.name,'subtitle',a.name,'amount',r.deposit_required-r.deposit_received,'dueAt',r.payment_deadline,'path','/closings') order by r.payment_deadline),'[]'::jsonb) from reservations r join portfolios p on p.id=r.portfolio_id join agencies a on a.id=r.buyer_agency_id where r.company_id=v_company and r.status='active' and r.deposit_required>r.deposit_received and r.payment_deadline<v_now),
      'overdueBalances', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',p.name,'subtitle',a.name,'amount',greatest(r.amount-r.deposit_received-r.balance_received,0),'dueAt',r.payment_deadline,'path','/closings') order by r.payment_deadline),'[]'::jsonb) from reservations r join portfolios p on p.id=r.portfolio_id join agencies a on a.id=r.buyer_agency_id where r.company_id=v_company and r.status='active' and r.deposit_received>0 and r.amount>r.deposit_received+r.balance_received and r.payment_deadline<v_now),
      'expiringOffers', (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',p.name,'subtitle',a.name,'amount',o.current_amount,'dueAt',o.expires_at,'path','/negotiations') order by o.expires_at),'[]'::jsonb) from offers o join portfolios p on p.id=o.portfolio_id join agencies a on a.id=o.agency_id where o.company_id=v_company and o.status in ('submitted','owner_countered','buyer_countered','accepted') and o.expires_at between v_now and v_now+interval '48 hours'),
      'overdueFollowUps', (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',a.name,'subtitle',f.reason,'dueAt',f.due_at,'path','/outreach') order by f.due_at),'[]'::jsonb) from follow_ups f join agencies a on a.id=f.agency_id where f.company_id=v_company and f.completed_at is null and f.due_at<v_now),
      'neglectedAgencies', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.name,'subtitle',coalesce(pr.full_name,'Unassigned'),'dueAt',last_touch,'path','/agencies/'||a.id) order by last_touch nulls first),'[]'::jsonb) from (select ag.*,max(oa.occurred_at) last_touch from agencies ag left join outreach_activities oa on oa.agency_id=ag.id where ag.company_id=v_company group by ag.id) a left join profiles pr on pr.id=a.assigned_to where coalesce(a.last_touch,a.created_at)<v_now-interval '30 days'),
      'pendingCommissions', (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',pr.full_name,'subtitle',p.name,'amount',c.amount,'dueAt',c.created_at,'path','/closings') order by c.created_at),'[]'::jsonb) from commissions c join sales s on s.id=c.sale_id join portfolios p on p.id=s.portfolio_id join profiles pr on pr.id=c.employee_id where c.company_id=v_company and c.status in ('pending','approved'))
    ),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'name',pr.full_name,'outreach',coalesce(o.c,0),'offers',coalesce(ofr.c,0),'followUps',coalesce(fu.c,0),'sales',coalesce(sa.c,0),'revenue',coalesce(sa.revenue,0),'commission',coalesce(cm.amount,0)) order by coalesce(sa.revenue,0) desc,pr.full_name),'[]'::jsonb) from profiles pr left join lateral (select count(*) c from outreach_activities x where x.employee_id=pr.id) o on true left join lateral (select count(*) c from offers x where x.employee_id=pr.id) ofr on true left join lateral (select count(*) c from follow_ups x where x.employee_id=pr.id and x.completed_at is not null) fu on true left join lateral (select count(*) c,coalesce(sum(sale_price),0) revenue from sales x where x.winning_employee_id=pr.id) sa on true left join lateral (select coalesce(sum(amount),0) amount from commissions x where x.employee_id=pr.id) cm on true where pr.company_id=v_company and pr.role='employee' and pr.is_active),
    'recentActivity', (select coalesce(jsonb_agg(jsonb_build_object('id',al.id,'action',al.action,'entityType',al.entity_type,'entityId',al.entity_id,'actor',coalesce(pr.full_name,'System'),'createdAt',al.created_at) order by al.created_at desc),'[]'::jsonb) from (select * from audit_logs where company_id=v_company order by created_at desc limit 25) al left join profiles pr on pr.id=al.actor_id)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function public.dmh_owner_command_center() to authenticated;
