-- DMH Sales OS v3.0.5 — Buyer Progress Status Engine
-- Adds a single staff/buyer-safe transaction timeline snapshot.

create or replace function public.dmh_buyer_transaction_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with actor as (
  select public.current_company_id() as company_id,
         public.current_role()::text as role,
         public.current_buyer_id() as buyer_id
),
visible_cycles as (
  select c.*
  from public.buyer_invitation_cycles c
  cross join actor a
  where (
    a.role in ('owner','employee') and c.company_id = a.company_id
  ) or (
    a.role = 'buyer' and c.buyer_id = a.buyer_id
  )
),
progress as (
  select
    c.id,
    c.company_id,
    c.buyer_id,
    c.portfolio_id,
    c.document_id,
    c.status as cycle_status,
    c.started_at,
    c.expires_at as cycle_expires_at,
    c.invite_count,
    bp.company_name as buyer_company,
    bp.contact_name as buyer_name,
    bp.email as buyer_email,
    p.name as portfolio_name,
    latest_invite.id as invitation_id,
    latest_invite.sent_at as invitation_sent_at,
    latest_invite.expires_at as invitation_expires_at,
    latest_invite.opened_at,
    latest_invite.redeemed_at,
    latest_invite.delivery_status,
    latest_invite.failure_reason,
    nda.buyer_signed_at as nda_signed_at,
    nda.status as nda_status,
    pa.id as purchase_agreement_id,
    pa.sent_at as purchase_agreement_sent_at,
    pa.buyer_signed_at as purchase_agreement_signed_at,
    pa.status as purchase_agreement_status,
    room.id as room_id,
    room.status as room_status,
    room.payment_confirmed_at,
    room.final_file_released_at,
    room.closed_at,
    greatest(
      c.started_at,
      coalesce(latest_invite.sent_at, '-infinity'::timestamptz),
      coalesce(latest_invite.opened_at, '-infinity'::timestamptz),
      coalesce(latest_invite.redeemed_at, '-infinity'::timestamptz),
      coalesce(nda.buyer_signed_at, '-infinity'::timestamptz),
      coalesce(pa.buyer_signed_at, '-infinity'::timestamptz),
      coalesce(room.payment_confirmed_at, '-infinity'::timestamptz),
      coalesce(room.final_file_released_at, '-infinity'::timestamptz),
      coalesce(room.closed_at, '-infinity'::timestamptz)
    ) as last_activity_at
  from visible_cycles c
  join public.buyer_profiles bp on bp.id = c.buyer_id
  left join public.portfolios p on p.id = c.portfolio_id
  left join lateral (
    select i.*
    from public.buyer_invitations i
    where i.cycle_id = c.id
    order by i.sent_at desc
    limit 1
  ) latest_invite on true
  left join public.deal_documents_generated nda on nda.id = c.document_id
  left join lateral (
    select d.*
    from public.deal_documents_generated d
    where d.buyer_id = c.buyer_id
      and d.portfolio_id is not distinct from c.portfolio_id
      and d.document_type = 'purchase_agreement'
    order by d.created_at desc
    limit 1
  ) pa on true
  left join lateral (
    select r.*
    from public.buyer_deal_rooms r
    where r.buyer_id = c.buyer_id
      and r.portfolio_id is not distinct from c.portfolio_id
    order by r.updated_at desc
    limit 1
  ) room on true
)
select coalesce(jsonb_agg(
  jsonb_build_object(
    'id', x.id,
    'buyerId', x.buyer_id,
    'portfolioId', x.portfolio_id,
    'documentId', x.document_id,
    'purchaseAgreementId', x.purchase_agreement_id,
    'roomId', x.room_id,
    'buyerCompany', x.buyer_company,
    'buyerName', x.buyer_name,
    'buyerEmail', x.buyer_email,
    'portfolioName', coalesce(x.portfolio_name, 'Transaction'),
    'inviteCount', x.invite_count,
    'cycleStatus', x.cycle_status,
    'cycleExpiresAt', x.cycle_expires_at,
    'deliveryStatus', x.delivery_status,
    'failureReason', x.failure_reason,
    'roomStatus', x.room_status,
    'lastActivityAt', x.last_activity_at,
    'currentStage', case
      when x.closed_at is not null then 'completed'
      when x.final_file_released_at is not null then 'file_released'
      when x.payment_confirmed_at is not null then 'paid'
      when x.purchase_agreement_signed_at is not null then 'payment_pending'
      when x.nda_signed_at is not null then 'purchase_agreement_pending'
      when coalesce(x.opened_at, x.redeemed_at) is not null then 'nda_pending'
      when x.invitation_expires_at <= now() and x.redeemed_at is null then 'invitation_expired'
      when x.delivery_status in ('failed','bounced') then 'delivery_failed'
      else 'invitation_sent'
    end,
    'steps', jsonb_build_array(
      jsonb_build_object('key','invitation_sent','label','Invitation sent','complete',x.invitation_sent_at is not null,'at',x.invitation_sent_at),
      jsonb_build_object('key','buyer_opened','label','Buyer opened invitation','complete',coalesce(x.opened_at,x.redeemed_at) is not null,'at',coalesce(x.opened_at,x.redeemed_at)),
      jsonb_build_object('key','nda_signed','label','NDA signed','complete',x.nda_signed_at is not null,'at',x.nda_signed_at),
      jsonb_build_object('key','details_unlocked','label','Protected details unlocked','complete',x.nda_signed_at is not null,'at',x.nda_signed_at),
      jsonb_build_object('key','purchase_agreement_signed','label','Purchase Agreement signed','complete',x.purchase_agreement_signed_at is not null,'at',x.purchase_agreement_signed_at),
      jsonb_build_object('key','payment_confirmed','label','Payment confirmed','complete',x.payment_confirmed_at is not null,'at',x.payment_confirmed_at),
      jsonb_build_object('key','file_released','label','Final file released','complete',x.final_file_released_at is not null,'at',x.final_file_released_at),
      jsonb_build_object('key','completed','label','Transaction completed','complete',x.closed_at is not null,'at',x.closed_at)
    )
  ) order by x.last_activity_at desc
), '[]'::jsonb)
from progress x;
$$;

grant execute on function public.dmh_buyer_transaction_progress() to authenticated;
