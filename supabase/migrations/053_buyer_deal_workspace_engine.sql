-- DMHOUSE Sales OS v2.7.0 — Buyer Deal Workspace Engine

create or replace function public.dmh_buyer_workspace()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_buyer public.buyer_profiles%rowtype;
  v_active jsonb;
  v_history jsonb;
  v_activity jsonb;
  v_downloads jsonb;
  v_stats jsonb;
begin
  select * into v_buyer from public.buyer_profiles where id=public.current_buyer_id();
  if v_buyer.id is null then raise exception 'Buyer profile required'; end if;

  select coalesce(jsonb_agg(x order by x.updated_at desc),'[]'::jsonb) into v_active
  from (
    select r.id as room_id,r.portfolio_id,r.status,r.reservation_expires_at,r.agreement_approved_at,
      r.payment_confirmed_at,r.final_file_released_at,r.closed_at,r.created_at,r.updated_at,
      p.name as portfolio_name,p.category,p.account_count,p.face_value,p.asking_price,
      o.current_amount,o.status as offer_status,
      exists(select 1 from public.deal_documents_generated d where d.portfolio_id=r.portfolio_id and d.buyer_id=v_buyer.user_id and d.document_type='nda' and d.status='fully_executed') as nda_executed,
      exists(select 1 from public.deal_documents_generated d where d.portfolio_id=r.portfolio_id and d.buyer_id=v_buyer.user_id and d.document_type='purchase_agreement' and d.status='fully_executed') as purchase_agreement_executed
    from public.buyer_deal_rooms r
    join public.portfolios p on p.id=r.portfolio_id
    join public.offers o on o.id=r.offer_id
    where r.buyer_id=v_buyer.id and r.status not in ('closed','cancelled','expired')
  ) x;

  select coalesce(jsonb_agg(x order by x.closed_at desc),'[]'::jsonb) into v_history
  from (
    select r.id as room_id,r.portfolio_id,r.status,r.closed_at,r.created_at,r.updated_at,
      p.name as portfolio_name,p.category,p.account_count,p.face_value,p.asking_price,
      o.current_amount
    from public.buyer_deal_rooms r
    join public.portfolios p on p.id=r.portfolio_id
    join public.offers o on o.id=r.offer_id
    where r.buyer_id=v_buyer.id and r.status='closed'
  ) x;

  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_activity
  from (
    select a.id,a.portfolio_id,a.event_type,a.metadata,a.created_at,p.name as portfolio_name
    from public.buyer_activity_events a
    left join public.portfolios p on p.id=a.portfolio_id
    where a.buyer_id=v_buyer.id
    order by a.created_at desc limit 30
  ) x;

  select coalesce(jsonb_agg(x order by x.downloaded_at desc),'[]'::jsonb) into v_downloads
  from (
    select d.id,d.portfolio_id,d.file_type,d.downloaded_at,p.name as portfolio_name,f.file_name,f.version
    from public.portfolio_file_downloads d
    join public.portfolios p on p.id=d.portfolio_id
    join public.portfolio_files f on f.id=d.file_id
    where d.buyer_id=v_buyer.id
    order by d.downloaded_at desc limit 50
  ) x;

  select jsonb_build_object(
    'totalPurchases',count(*) filter(where r.status='closed'),
    'lifetimeSpend',coalesce(sum(o.current_amount) filter(where r.status='closed'),0),
    'averageCloseDays',coalesce(round((avg(extract(epoch from (r.closed_at-r.created_at))/86400) filter(where r.status='closed'))::numeric,1),0),
    'activeDeals',count(*) filter(where r.status not in ('closed','cancelled','expired')),
    'preferredCategory',coalesce((select p2.category from public.buyer_deal_rooms r2 join public.portfolios p2 on p2.id=r2.portfolio_id where r2.buyer_id=v_buyer.id and r2.status='closed' group by p2.category order by count(*) desc limit 1),'Developing'),
    'tier',case when count(*) filter(where r.status='closed')>=10 then 'Platinum' when count(*) filter(where r.status='closed')>=5 then 'Gold' when count(*) filter(where r.status='closed')>=2 then 'Silver' else 'New' end
  ) into v_stats
  from public.buyer_deal_rooms r join public.offers o on o.id=r.offer_id where r.buyer_id=v_buyer.id;

  return jsonb_build_object('buyer',to_jsonb(v_buyer),'activeDeals',v_active,'purchaseHistory',v_history,'activity',v_activity,'downloads',v_downloads,'relationship',v_stats);
end $$;
grant execute on function public.dmh_buyer_workspace() to authenticated;
