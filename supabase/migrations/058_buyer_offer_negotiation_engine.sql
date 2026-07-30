-- DMH Sales OS v3.1.2 — Buyer Offer & Negotiation Engine
-- Buyer may accept asking price or submit an offer only after NDA execution.
-- Only Owner may accept/reject/counter a buyer offer and approve final price.
-- Employees receive read-only negotiation visibility through existing room policies.

alter table public.offers
  add column if not exists pricing_path text,
  add column if not exists final_price_approved_at timestamptz,
  add column if not exists final_price_approved_by uuid references public.profiles(id),
  add column if not exists purchase_agreement_ready_at timestamptz;

alter table public.offers drop constraint if exists offers_pricing_path_check;
alter table public.offers add constraint offers_pricing_path_check
  check (pricing_path is null or pricing_path in ('asking_price','negotiated'));

create or replace function public.dmh_buyer_has_executed_nda(p_portfolio_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.deal_documents_generated d
    where d.portfolio_id=p_portfolio_id
      and d.buyer_id=auth.uid()
      and d.document_type='nda'
      and d.status='fully_executed'
  );
$$;
grant execute on function public.dmh_buyer_has_executed_nda(uuid) to authenticated;

create or replace function public.dmh_buyer_accept_asking_price(p_portfolio_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_buyer public.buyer_profiles%rowtype;
  v_portfolio public.portfolios%rowtype;
  v_offer uuid;
  v_room uuid;
begin
  if public.current_role()<>'buyer' then raise exception 'Buyer access required'; end if;
  select * into v_buyer from public.buyer_profiles where id=public.current_buyer_id() and status='approved';
  if not found then raise exception 'Approved buyer access required'; end if;
  if not public.dmh_buyer_has_executed_nda(p_portfolio_id) then raise exception 'Sign the NDA before accepting the asking price'; end if;
  if not exists(select 1 from public.buyer_portfolio_access a where a.buyer_id=v_buyer.id and a.portfolio_id=p_portfolio_id and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())) then raise exception 'Portfolio access denied'; end if;
  select * into v_portfolio from public.portfolios where id=p_portfolio_id and company_id=v_buyer.company_id and status in ('active','negotiating');
  if not found then raise exception 'Portfolio is unavailable'; end if;
  if coalesce(v_portfolio.asking_price,0)<=0 then raise exception 'Asking price is not available'; end if;
  if exists(select 1 from public.buyer_deal_rooms r where r.buyer_id=v_buyer.id and r.portfolio_id=p_portfolio_id and r.status not in ('cancelled','expired')) then raise exception 'An active negotiation already exists'; end if;
  if v_buyer.agency_id is null then
    insert into public.agencies(company_id,name,domain,phone)
    values(v_buyer.company_id,v_buyer.company_name,split_part(v_buyer.email,'@',2),v_buyer.phone)
    returning id into v_buyer.agency_id;
    update public.buyer_profiles set agency_id=v_buyer.agency_id where id=v_buyer.id;
  end if;
  insert into public.offers(company_id,portfolio_id,agency_id,employee_id,buyer_id,status,current_amount,payment_terms,conditions,employee_recommendation,pricing_path,accepted_at,final_price_approved_at,final_price_approved_by,purchase_agreement_ready_at)
  values(v_buyer.company_id,p_portfolio_id,v_buyer.agency_id,auth.uid(),v_buyer.id,'accepted',v_portfolio.asking_price,'Buyer accepted asking price',null,'Accepted directly through Buyer Portal','asking_price',now(),now(),auth.uid(),now())
  returning id into v_offer;
  insert into public.offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by)
  values(v_buyer.company_id,v_offer,1,'buyer','accept',v_portfolio.asking_price,'Asking price','Buyer accepted the listed asking price',auth.uid());
  insert into public.buyer_deal_rooms(company_id,buyer_id,portfolio_id,offer_id,status)
  values(v_buyer.company_id,v_buyer.id,p_portfolio_id,v_offer,'offer_accepted') returning id into v_room;
  update public.portfolios set status='negotiating' where id=p_portfolio_id and status='active';
  perform public.dmh_append_deal_event(v_room,'asking_price_accepted',jsonb_build_object('amount',v_portfolio.asking_price));
  perform public.dmh_append_deal_event(v_room,'purchase_agreement_ready',jsonb_build_object('final_price',v_portfolio.asking_price));
  return v_offer;
end $$;
grant execute on function public.dmh_buyer_accept_asking_price(uuid) to authenticated;

-- Harden direct offers: NDA is mandatory and the price is not final until Owner accepts.
create or replace function public.dmh_buyer_submit_offer(p_portfolio_id uuid,p_amount numeric,p_payment_terms text default null,p_conditions text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_buyer public.buyer_profiles%rowtype; v_offer uuid;
begin
  if public.current_role()<>'buyer' then raise exception 'Buyer access required'; end if;
  select * into v_buyer from public.buyer_profiles where id=public.current_buyer_id() and status='approved';
  if not found then raise exception 'Approved buyer access required'; end if;
  if not public.dmh_buyer_has_executed_nda(p_portfolio_id) then raise exception 'Sign the NDA before submitting an offer'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Offer amount must be greater than zero'; end if;
  if not exists(select 1 from public.buyer_portfolio_access where buyer_id=v_buyer.id and portfolio_id=p_portfolio_id and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Portfolio access denied'; end if;
  if exists(select 1 from public.buyer_deal_rooms r where r.buyer_id=v_buyer.id and r.portfolio_id=p_portfolio_id and r.status not in ('cancelled','expired')) then raise exception 'An active negotiation already exists'; end if;
  if v_buyer.agency_id is null then
    insert into public.agencies(company_id,name,domain,phone) values(v_buyer.company_id,v_buyer.company_name,split_part(v_buyer.email,'@',2),v_buyer.phone) returning id into v_buyer.agency_id;
    update public.buyer_profiles set agency_id=v_buyer.agency_id where id=v_buyer.id;
  end if;
  insert into public.offers(company_id,portfolio_id,agency_id,employee_id,buyer_id,status,current_amount,payment_terms,conditions,employee_recommendation,pricing_path)
  values(v_buyer.company_id,p_portfolio_id,v_buyer.agency_id,auth.uid(),v_buyer.id,'submitted',p_amount,p_payment_terms,p_conditions,'Submitted directly through Buyer Portal','negotiated') returning id into v_offer;
  insert into public.offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by)
  values(v_buyer.company_id,v_offer,1,'buyer','offer',p_amount,p_payment_terms,p_conditions,auth.uid());
  insert into public.buyer_deal_rooms(company_id,buyer_id,portfolio_id,offer_id,status) values(v_buyer.company_id,v_buyer.id,p_portfolio_id,v_offer,'negotiating');
  update public.portfolios set status='negotiating' where id=p_portfolio_id and status='active';
  insert into public.buyer_activity_events(company_id,buyer_id,portfolio_id,event_type,metadata)
  values(v_buyer.company_id,v_buyer.id,p_portfolio_id,'offer_submitted',jsonb_build_object('offer_id',v_offer,'amount',p_amount));
  return v_offer;
end $$;
grant execute on function public.dmh_buyer_submit_offer(uuid,numeric,text,text) to authenticated;

-- Owner controls seller decisions. Buyer may accept/counter an Owner counter or withdraw.
-- Employee can never change price or offer status.
create or replace function public.dmh_deal_offer_action(p_offer_id uuid,p_action text,p_amount numeric default null,p_message text default null,p_reservation_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_offer public.offers%rowtype;
  v_actor text:=public.current_role()::text;
  v_round int;
  v_room public.buyer_deal_rooms%rowtype;
  v_last_actor text;
begin
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  select * into v_room from public.buyer_deal_rooms where offer_id=p_offer_id for update;

  if v_actor='employee' then raise exception 'Employees have view-only negotiation access'; end if;
  if v_actor='owner' then
    if v_offer.company_id<>public.current_company_id() then raise exception 'Access denied'; end if;
    if p_action not in ('counter','accept','reject','request_info') then raise exception 'Invalid Owner action'; end if;
  elsif v_actor='buyer' then
    if v_offer.buyer_id<>public.current_buyer_id() then raise exception 'Access denied'; end if;
    if p_action not in ('counter','accept','withdraw') then raise exception 'Invalid Buyer action'; end if;
    select actor_role into v_last_actor from public.offer_rounds where offer_id=p_offer_id order by round_number desc limit 1;
    if p_action in ('counter','accept') and v_last_actor<>'owner' then raise exception 'Wait for an Owner response'; end if;
  else raise exception 'Access denied'; end if;

  if p_action='counter' and coalesce(p_amount,0)<=0 then raise exception 'Counter amount required'; end if;
  if v_offer.status in ('accepted','rejected','expired') then raise exception 'This negotiation is already closed'; end if;

  select coalesce(max(round_number),0)+1 into v_round from public.offer_rounds where offer_id=p_offer_id;
  insert into public.offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by)
  values(v_offer.company_id,p_offer_id,v_round,v_actor,
    case when p_action='withdraw' then 'reject' else p_action end,
    case when p_action='counter' then p_amount else v_offer.current_amount end,
    v_offer.payment_terms,p_message,auth.uid());

  update public.offers set
    current_amount=case when p_action='counter' then p_amount else current_amount end,
    status=case when p_action='accept' then 'accepted'::public.offer_status when p_action in ('reject','withdraw') then 'rejected'::public.offer_status else status end,
    accepted_at=case when p_action='accept' then now() else accepted_at end,
    withdrawn_at=case when p_action='withdraw' then now() else withdrawn_at end,
    final_price_approved_at=case when p_action='accept' then now() else final_price_approved_at end,
    final_price_approved_by=case when p_action='accept' then auth.uid() else final_price_approved_by end,
    purchase_agreement_ready_at=case when p_action='accept' then now() else purchase_agreement_ready_at end,
    pricing_path=coalesce(pricing_path,'negotiated'),
    reservation_expires_at=coalesce(p_reservation_expires_at,reservation_expires_at),updated_at=now()
  where id=p_offer_id;

  update public.buyer_deal_rooms set
    status=case when p_action='accept' then 'offer_accepted' when p_action in ('reject','withdraw') then 'cancelled' else status end,
    reservation_expires_at=coalesce(p_reservation_expires_at,reservation_expires_at),updated_at=now()
  where offer_id=p_offer_id;

  if v_room.id is not null then
    perform public.dmh_append_deal_event(v_room.id,
      case when p_action='accept' then 'final_price_approved' when p_action='counter' then 'counteroffer_sent' when p_action='reject' then 'offer_rejected' when p_action='withdraw' then 'offer_withdrawn' else 'information_requested' end,
      jsonb_build_object('actor',v_actor,'amount',case when p_action='counter' then p_amount else v_offer.current_amount end,'message',p_message));
    if p_action='accept' then perform public.dmh_append_deal_event(v_room.id,'purchase_agreement_ready',jsonb_build_object('final_price',v_offer.current_amount)); end if;
  end if;
end $$;
grant execute on function public.dmh_deal_offer_action(uuid,text,numeric,text,timestamptz) to authenticated;
