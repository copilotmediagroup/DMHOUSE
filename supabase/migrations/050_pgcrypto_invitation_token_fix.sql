-- DMH Sales OS v2.7.2c
-- Migration 050: pgcrypto schema qualification fix

create extension if not exists pgcrypto with schema extensions;

create or replace function public.dmh_prepare_buyer_invitation(
  p_document_id uuid,
  p_subject text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_doc public.deal_documents_generated%rowtype;
  v_buyer public.buyer_profiles%rowtype;
  v_cycle public.buyer_invitation_cycles%rowtype;
  v_raw text;
  v_hash text;
  v_invite uuid;
begin
  select *
  into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null
     or v_profile.role not in ('owner','employee') then
    raise exception 'Staff access required';
  end if;

  select *
  into v_doc
  from public.deal_documents_generated
  where id = p_document_id
    and company_id = v_profile.company_id;

  if v_doc.id is null then
    raise exception 'Document not found';
  end if;

  if v_doc.seller_signed_at is null then
    raise exception 'Employee signature is required before sending';
  end if;

  select *
  into v_buyer
  from public.buyer_profiles
  where id = v_doc.buyer_id
    and company_id = v_profile.company_id;

  if v_buyer.id is null
     or nullif(trim(v_buyer.email), '') is null then
    raise exception 'Buyer profile with email is required';
  end if;

  update public.buyer_invitation_cycles
  set status = 'expired'
  where buyer_id = v_buyer.id
    and coalesce(
      portfolio_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ) = coalesce(
      v_doc.portfolio_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and status = 'active'
    and expires_at <= now();

  select *
  into v_cycle
  from public.buyer_invitation_cycles
  where buyer_id = v_buyer.id
    and coalesce(
      portfolio_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ) = coalesce(
      v_doc.portfolio_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and status = 'active'
    and expires_at > now()
  order by started_at desc
  limit 1
  for update;

  if v_cycle.id is null then
    insert into public.buyer_invitation_cycles (
      company_id,
      buyer_id,
      portfolio_id,
      document_id,
      started_by
    )
    values (
      v_profile.company_id,
      v_buyer.id,
      v_doc.portfolio_id,
      v_doc.id,
      auth.uid()
    )
    returning *
    into v_cycle;
  end if;

  if v_cycle.invite_count >= 3 then
    raise exception
      'This buyer has reached the limit of 3 invitations during the active 7-day cycle';
  end if;

  update public.buyer_invitations
  set invalidated_at = now(),
      delivery_status = 'invalidated'
  where cycle_id = v_cycle.id
    and redeemed_at is null
    and invalidated_at is null
    and expires_at > now();

  v_raw := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := pg_catalog.encode(extensions.digest(v_raw, 'sha256'), 'hex');

  insert into public.buyer_invitations (
    company_id,
    cycle_id,
    buyer_id,
    document_id,
    email,
    subject,
    message,
    token_hash,
    sent_by,
    expires_at
  )
  values (
    v_profile.company_id,
    v_cycle.id,
    v_buyer.id,
    v_doc.id,
    v_buyer.email,
    coalesce(
      nullif(trim(p_subject), ''),
      'Your Data Market House Buyer Portal Access'
    ),
    p_message,
    v_hash,
    auth.uid(),
    now() + interval '24 hours'
  )
  returning id
  into v_invite;

  update public.buyer_invitation_cycles
  set invite_count = invite_count + 1,
      document_id = v_doc.id
  where id = v_cycle.id;

  update public.deal_documents_generated
  set status = 'sent_to_buyer',
      sent_at = now(),
      updated_at = now()
  where id = v_doc.id;

  return jsonb_build_object(
    'invitationId', v_invite,
    'rawToken', v_raw,
    'email', v_buyer.email,
    'buyerUserId', v_buyer.user_id,
    'buyerName', v_buyer.contact_name,
    'buyerCompany', v_buyer.company_name,
    'documentTitle', v_doc.title,
    'documentType', v_doc.document_type,
    'expiresAt', now() + interval '24 hours',
    'cycleExpiresAt', v_cycle.expires_at,
    'inviteNumber', v_cycle.invite_count + 1
  );
end;
$$;


grant execute on function public.dmh_prepare_buyer_invitation(uuid, text, text) to authenticated;

-- Verification query
select pg_catalog.encode(extensions.gen_random_bytes(32), 'hex') as token_test;
