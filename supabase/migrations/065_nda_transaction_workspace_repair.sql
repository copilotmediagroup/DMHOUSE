-- DMHOUSE Sales OS v5.5.1 — NDA Transaction Workspace Repair
-- Creates a real buyer transaction when staff sends an NDA, links the generated
-- document to that transaction, and lets the buyer workspace show pre-offer deals.

begin;

alter table public.buyer_deal_rooms
  alter column offer_id drop not null;

alter table public.buyer_deal_rooms
  drop constraint if exists buyer_deal_rooms_status_check;

alter table public.buyer_deal_rooms
  add constraint buyer_deal_rooms_status_check
  check (status in (
    'nda_pending','negotiating','offer_accepted','agreement_pending',
    'payment_pending','release_ready','closed','cancelled','expired'
  ));

create or replace function public.dmh_prepare_buyer_invitation(
  p_document_id uuid,
  p_subject text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_doc public.deal_documents_generated%rowtype;
  v_buyer public.buyer_profiles%rowtype;
  v_cycle public.buyer_invitation_cycles%rowtype;
  v_room public.buyer_deal_rooms%rowtype;
  v_raw text;
  v_hash text;
  v_invite uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('owner','employee') then
    raise exception 'Staff access required';
  end if;

  select * into v_doc
  from public.deal_documents_generated
  where id = p_document_id and company_id = v_profile.company_id;

  if v_doc.id is null then raise exception 'Document not found'; end if;
  if v_doc.seller_signed_at is null then
    raise exception 'Employee signature is required before sending';
  end if;
  if v_doc.portfolio_id is null then
    raise exception 'Select a portfolio before sending this document';
  end if;

  select * into v_buyer
  from public.buyer_profiles
  where company_id = v_profile.company_id
    and (id = v_doc.buyer_id or user_id = v_doc.buyer_id)
  limit 1;

  if v_buyer.id is null or nullif(trim(v_buyer.email), '') is null then
    raise exception 'Buyer profile with email is required';
  end if;

  insert into public.buyer_deal_rooms(
    company_id,buyer_id,portfolio_id,offer_id,status,updated_at
  ) values (
    v_profile.company_id,v_buyer.id,v_doc.portfolio_id,null,
    case when v_doc.document_type='nda' then 'nda_pending' else 'agreement_pending' end,
    now()
  )
  on conflict (buyer_id,portfolio_id) do update set
    status = case
      when excluded.status='agreement_pending' then 'agreement_pending'
      when public.buyer_deal_rooms.status in ('closed','cancelled','expired') then excluded.status
      else public.buyer_deal_rooms.status
    end,
    updated_at=now()
  returning * into v_room;

  update public.deal_documents_generated
  set room_id=v_room.id, portfolio_id=v_room.portfolio_id, updated_at=now()
  where id=v_doc.id;

  update public.buyer_invitation_cycles set status='expired'
  where buyer_id=v_buyer.id and portfolio_id=v_doc.portfolio_id
    and status='active' and expires_at<=now();

  select * into v_cycle
  from public.buyer_invitation_cycles
  where buyer_id=v_buyer.id and portfolio_id=v_doc.portfolio_id
    and status='active' and expires_at>now()
  order by started_at desc limit 1 for update;

  if v_cycle.id is null then
    insert into public.buyer_invitation_cycles(
      company_id,buyer_id,portfolio_id,document_id,started_by
    ) values (
      v_profile.company_id,v_buyer.id,v_doc.portfolio_id,v_doc.id,auth.uid()
    ) returning * into v_cycle;
  end if;

  if v_cycle.invite_count>=3 then
    raise exception 'This buyer has reached the limit of 3 invitations during the active 7-day cycle';
  end if;

  update public.buyer_invitations
  set invalidated_at=now(),delivery_status='invalidated'
  where cycle_id=v_cycle.id and redeemed_at is null
    and invalidated_at is null and expires_at>now();

  v_raw:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_raw,'sha256'),'hex');

  insert into public.buyer_invitations(
    company_id,cycle_id,buyer_id,document_id,email,subject,message,
    token_hash,sent_by,expires_at
  ) values (
    v_profile.company_id,v_cycle.id,v_buyer.id,v_doc.id,v_buyer.email,
    coalesce(nullif(trim(p_subject),''),'Your Data Market House Buyer Portal Access'),
    p_message,v_hash,auth.uid(),now()+interval '24 hours'
  ) returning id into v_invite;

  update public.buyer_invitation_cycles
  set invite_count=invite_count+1,document_id=v_doc.id
  where id=v_cycle.id;

  update public.deal_documents_generated
  set status='sent_to_buyer',sent_at=now(),updated_at=now()
  where id=v_doc.id;

  insert into public.buyer_activity_events(
    company_id,buyer_id,portfolio_id,event_type,metadata
  ) values (
    v_profile.company_id,v_buyer.id,v_doc.portfolio_id,
    case when v_doc.document_type='nda' then 'nda_sent' else 'purchase_agreement_sent' end,
    jsonb_build_object('document_id',v_doc.id,'room_id',v_room.id,'sent_by',auth.uid())
  );

  return jsonb_build_object(
    'invitationId',v_invite,
    'rawToken',v_raw,
    'email',v_buyer.email,
    'buyerId',v_buyer.id,
    'buyerUserId',v_buyer.user_id,
    'buyerName',v_buyer.contact_name,
    'buyerCompany',v_buyer.company_name,
    'roomId',v_room.id,
    'portfolioId',v_doc.portfolio_id,
    'documentId',v_doc.id,
    'documentTitle',v_doc.title,
    'documentType',v_doc.document_type,
    'expiresAt',now()+interval '24 hours',
    'cycleExpiresAt',v_cycle.expires_at,
    'inviteNumber',v_cycle.invite_count+1
  );
end;
$$;

grant execute on function public.dmh_prepare_buyer_invitation(uuid,text,text) to authenticated;

create or replace function public.dmh_buyer_workspace()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_buyer public.buyer_profiles%rowtype;
  v_active jsonb; v_history jsonb; v_activity jsonb; v_downloads jsonb; v_stats jsonb;
begin
  select * into v_buyer from public.buyer_profiles where id=public.current_buyer_id();
  if v_buyer.id is null then raise exception 'Buyer profile required'; end if;

  select coalesce(jsonb_agg(x order by x.updated_at desc),'[]'::jsonb) into v_active
  from (
    select r.id room_id,r.portfolio_id,r.status,r.reservation_expires_at,r.agreement_approved_at,
      r.payment_confirmed_at,r.final_file_released_at,r.closed_at,r.created_at,r.updated_at,
      p.name portfolio_name,p.category,p.account_count,p.face_value,p.asking_price,
      o.current_amount,o.status offer_status,
      exists(select 1 from public.deal_documents_generated d where d.portfolio_id=r.portfolio_id and d.buyer_id=v_buyer.user_id and d.document_type='nda' and d.status='fully_executed') nda_executed,
      exists(select 1 from public.deal_documents_generated d where d.portfolio_id=r.portfolio_id and d.buyer_id=v_buyer.user_id and d.document_type='purchase_agreement' and d.status='fully_executed') purchase_agreement_executed
    from public.buyer_deal_rooms r
    join public.portfolios p on p.id=r.portfolio_id
    left join public.offers o on o.id=r.offer_id
    where r.buyer_id=v_buyer.id and r.status not in ('closed','cancelled','expired')
  ) x;

  select coalesce(jsonb_agg(x order by x.closed_at desc),'[]'::jsonb) into v_history
  from (
    select r.id room_id,r.portfolio_id,r.status,r.closed_at,r.created_at,r.updated_at,
      p.name portfolio_name,p.category,p.account_count,p.face_value,p.asking_price,o.current_amount
    from public.buyer_deal_rooms r
    join public.portfolios p on p.id=r.portfolio_id
    left join public.offers o on o.id=r.offer_id
    where r.buyer_id=v_buyer.id and r.status='closed'
  ) x;

  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_activity
  from (
    select a.id,a.portfolio_id,a.event_type,a.metadata,a.created_at,p.name portfolio_name
    from public.buyer_activity_events a left join public.portfolios p on p.id=a.portfolio_id
    where a.buyer_id=v_buyer.id order by a.created_at desc limit 30
  ) x;

  select coalesce(jsonb_agg(x order by x.downloaded_at desc),'[]'::jsonb) into v_downloads
  from (
    select d.id,d.portfolio_id,d.file_type,d.downloaded_at,p.name portfolio_name,f.file_name,f.version
    from public.portfolio_file_downloads d join public.portfolios p on p.id=d.portfolio_id
    join public.portfolio_files f on f.id=d.file_id where d.buyer_id=v_buyer.id
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
  from public.buyer_deal_rooms r left join public.offers o on o.id=r.offer_id where r.buyer_id=v_buyer.id;

  return jsonb_build_object('buyer',to_jsonb(v_buyer),'activeDeals',v_active,'purchaseHistory',v_history,'activity',v_activity,'downloads',v_downloads,'relationship',v_stats);
end $$;

grant execute on function public.dmh_buyer_workspace() to authenticated;

commit;
