-- DMH Sales OS v2.3.0 — Executive Command Center
-- Run after 035_as_is_portfolio_review_disclosure_engine.sql

create or replace function public.dmh_executive_command_center()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_company uuid := public.dmh_current_company_id();
  v_role text;
  v_result jsonb;
begin
  select role::text into v_role from public.profiles where id=auth.uid();
  if v_company is null or v_role <> 'owner' then
    raise exception 'Owner access required.';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'today', jsonb_build_object(
      'newPortfolios', (select count(*) from public.portfolios where company_id=v_company and created_at>=date_trunc('day',now())),
      'activeCampaigns', (select count(*) from public.portfolio_outreach_campaigns where company_id=v_company and status='active'),
      'newBuyerReplies', (select count(*) from public.campaign_reply_events where company_id=v_company and created_at>=date_trunc('day',now())),
      'interestedBuyers', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status='interested'),
      'negotiations', (select count(*) from public.offers where company_id=v_company and status in ('submitted','owner_countered','buyer_countered')),
      'offersPending', (select count(*) from public.offers where company_id=v_company and status='submitted'),
      'closings', (select count(*) from public.reservations where company_id=v_company and status='active'),
      'employeesActive', (select count(*) from public.profiles where company_id=v_company and role='employee' and is_active=true)
    ),
    'financials', jsonb_build_object(
      'revenueMonth', coalesce((select sum(sale_price) from public.sales where company_id=v_company and closed_at>=date_trunc('month',now())),0),
      'revenueYear', coalesce((select sum(sale_price) from public.sales where company_id=v_company and closed_at>=date_trunc('year',now())),0),
      'projectedRevenue', coalesce((select sum(asking_price * probability / 100.0) from public.sales_opportunities where company_id=v_company and stage not in ('closed_won','closed_lost')),0),
      'projectedProfit', coalesce((select sum(greatest(0,(o.asking_price * o.probability / 100.0)-coalesce(p.acquisition_cost,0))) from public.sales_opportunities o left join public.portfolios p on p.id=o.portfolio_id where o.company_id=v_company and o.stage not in ('closed_won','closed_lost')),0),
      'grossProfitMonth', coalesce((select sum(s.sale_price-coalesce(p.acquisition_cost,0)) from public.sales s join public.portfolios p on p.id=s.portfolio_id where s.company_id=v_company and s.closed_at>=date_trunc('month',now())),0),
      'pendingCommissions', coalesce((select sum(amount) from public.commissions where company_id=v_company and status in ('estimated','pending','approved')),0)
    ),
    'marketing', jsonb_build_object(
      'sent', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status in ('sent','delivered','opened','replied','interested','declined','negotiating','purchased')),
      'opened', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status in ('opened','replied','interested','declined','negotiating','purchased')),
      'replied', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status in ('replied','interested','declined','negotiating','purchased')),
      'negotiating', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status in ('negotiating','purchased')),
      'purchased', (select count(*) from public.portfolio_campaign_recipients where company_id=v_company and status='purchased')
    ),
    'inventory', jsonb_build_object(
      'draft', (select count(*) from public.portfolios where company_id=v_company and status='draft'),
      'ready', (select count(*) from public.portfolios where company_id=v_company and status='ready'),
      'active', (select count(*) from public.portfolios where company_id=v_company and status='active'),
      'negotiating', (select count(*) from public.portfolios where company_id=v_company and status='negotiating'),
      'reserved', (select count(*) from public.portfolios where company_id=v_company and status in ('reserved','payment_pending')),
      'sold', (select count(*) from public.portfolios where company_id=v_company and status='sold')
    ),
    'pipeline', jsonb_build_array(
      jsonb_build_object('label','Inventory','value',(select count(*) from public.portfolios where company_id=v_company and status in ('draft','ready')),'path','/portfolios'),
      jsonb_build_object('label','Ready for Marketing','value',(select count(*) from public.portfolios p where p.company_id=v_company and p.status in ('ready','active') and exists(select 1 from public.portfolio_as_is_reviews r where r.portfolio_id=p.id and r.review_status in ('review_complete','owner_approved_with_disclosure'))),'path','/as-is-review'),
      jsonb_build_object('label','Campaigns Running','value',(select count(*) from public.portfolio_outreach_campaigns where company_id=v_company and status='active'),'path','/campaigns'),
      jsonb_build_object('label','Buyer Replies','value',(select count(*) from public.campaign_reply_events where company_id=v_company and action_status<>'completed'),'path','/replies'),
      jsonb_build_object('label','Negotiations','value',(select count(*) from public.offers where company_id=v_company and status in ('submitted','owner_countered','buyer_countered')),'path','/negotiations'),
      jsonb_build_object('label','Accepted Offers','value',(select count(*) from public.offers where company_id=v_company and status in ('accepted','reserved')),'path','/deals'),
      jsonb_build_object('label','Funding','value',(select count(*) from public.reservations where company_id=v_company and status='active'),'path','/closings'),
      jsonb_build_object('label','Completed Revenue','value',(select count(*) from public.sales where company_id=v_company),'path','/closings')
    ),
    'alerts', coalesce((
      select jsonb_agg(x order by (x->>'severity') desc, (x->>'createdAt') asc)
      from (
        select jsonb_build_object('id','review-'||p.id,'severity','high','title','AS-IS disclosure required','detail',p.name||' cannot safely enter new marketing without a completed disclosure.','path','/as-is-review','createdAt',p.created_at) x
        from public.portfolios p left join public.portfolio_as_is_reviews r on r.portfolio_id=p.id
        where p.company_id=v_company and p.status in ('ready','active') and coalesce(r.review_status,'not_reviewed') not in ('review_complete','owner_approved_with_disclosure')
        union all
        select jsonb_build_object('id','reply-'||e.id,'severity',case when e.requires_owner then 'high' else 'medium' end,'title',case when e.requires_owner then 'Buyer reply needs owner review' else 'Buyer reply awaiting action' end,'detail',coalesce(e.summary,'New campaign reply requires attention.'),'path','/replies','createdAt',e.created_at)
        from public.campaign_reply_events e where e.company_id=v_company and e.action_status<>'completed'
        union all
        select jsonb_build_object('id','offer-'||o.id,'severity','high','title','Offer awaiting decision','detail',a.name||' submitted '||to_char(o.current_amount,'FM$999,999,990'),'path','/negotiations','createdAt',o.created_at)
        from public.offers o join public.agencies a on a.id=o.agency_id where o.company_id=v_company and o.status='submitted'
        union all
        select jsonb_build_object('id','followup-'||f.id,'severity','medium','title','Overdue buyer follow-up','detail',a.name||' follow-up is past due.','path','/follow-ups','createdAt',f.due_at)
        from public.follow_ups f join public.agencies a on a.id=f.agency_id where f.company_id=v_company and f.completed_at is null and f.due_at<now()
        union all
        select jsonb_build_object('id','funding-'||r.id,'severity','high','title','Funding deadline overdue','detail',a.name||' has an overdue reservation payment.','path','/closings','createdAt',r.payment_deadline)
        from public.reservations r join public.agencies a on a.id=r.buyer_agency_id where r.company_id=v_company and r.status='active' and r.payment_deadline<now()
      ) q
    ),'[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.full_name,
        'outreach',(select count(*) from public.outreach_activities oa where oa.employee_id=p.id and oa.occurred_at>=date_trunc('month',now())),
        'replies',(select count(*) from public.campaign_reply_events cr where cr.assigned_employee_id=p.id and cr.created_at>=date_trunc('month',now())),
        'offers',(select count(*) from public.offers o where o.employee_id=p.id and o.created_at>=date_trunc('month',now())),
        'sales',(select count(*) from public.sales s where s.winning_employee_id=p.id and s.closed_at>=date_trunc('month',now())),
        'revenue',coalesce((select sum(s.sale_price) from public.sales s where s.winning_employee_id=p.id and s.closed_at>=date_trunc('month',now())),0)
      ) order by p.full_name)
      from public.profiles p where p.company_id=v_company and p.role='employee' and p.is_active=true
    ),'[]'::jsonb),
    'recentActivity', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'entityType',a.entity_type,'actor',coalesce(p.full_name,'System'),'createdAt',a.created_at) order by a.created_at desc) from (select * from public.audit_logs where company_id=v_company order by created_at desc limit 12) a left join public.profiles p on p.id=a.actor_id),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.dmh_executive_command_center() to authenticated;
