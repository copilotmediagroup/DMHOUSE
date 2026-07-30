-- DMH Sales OS v2.7.1 — Transaction Workflow Stabilization Engine
-- Makes typed signatures and Finish & Send safe to retry after partial delivery failures.

create or replace function public.dmh_apply_typed_signature(
  p_document_id uuid,
  p_typed_name text,
  p_title text,
  p_signature_style text,
  p_intent_confirmed boolean,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_doc public.deal_documents_generated%rowtype;
begin
  if not p_intent_confirmed then
    raise exception 'Electronic signature intent must be confirmed';
  end if;

  if nullif(trim(p_typed_name), '') is null then
    raise exception 'Legal name is required';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  select * into v_doc
  from public.deal_documents_generated
  where id = p_document_id
  for update;

  if v_doc.id is null then
    raise exception 'Document unavailable';
  end if;

  -- Seller signature: first attempt transitions draft -> seller_signed.
  if v_profile.role in ('owner','employee')
     and v_doc.company_id = v_profile.company_id then

    if v_doc.status = 'draft' then
      update public.deal_documents_generated
      set seller_name = trim(p_typed_name),
          seller_title = nullif(trim(p_title), ''),
          seller_signature_style = p_signature_style,
          seller_signed_at = now(),
          status = 'seller_signed',
          locked_at = now(),
          updated_at = now()
      where id = p_document_id;

      insert into public.document_signature_audit(
        company_id, document_id, signer_id, signer_role,
        typed_name, signer_title, signature_style,
        intent_confirmed, user_agent
      ) values (
        v_doc.company_id, p_document_id, auth.uid(), v_profile.role,
        trim(p_typed_name), nullif(trim(p_title), ''), p_signature_style,
        true, p_user_agent
      );
      return;
    end if;

    -- Safe retry: the seller already signed and a prior email attempt failed,
    -- or the document was already sent. Do not create a duplicate signature.
    if v_doc.status in ('seller_signed','sent_to_buyer','fully_executed')
       and v_doc.seller_signed_at is not null then
      return;
    end if;

    raise exception 'Document cannot be signed in its current state: %', v_doc.status;
  end if;

  -- Buyer signature: first attempt transitions sent_to_buyer -> fully_executed.
  if v_profile.role = 'buyer'
     and (
       v_doc.buyer_id = auth.uid()
       or exists (
         select 1
         from public.buyer_profiles bp
         where bp.id = v_doc.buyer_id
           and bp.user_id = auth.uid()
       )
     ) then

    if v_doc.status = 'sent_to_buyer' then
      update public.deal_documents_generated
      set buyer_name = trim(p_typed_name),
          buyer_title = nullif(trim(p_title), ''),
          buyer_signature_style = p_signature_style,
          buyer_signed_at = now(),
          status = 'fully_executed',
          locked_at = coalesce(locked_at, now()),
          updated_at = now()
      where id = p_document_id;

      insert into public.document_signature_audit(
        company_id, document_id, signer_id, signer_role,
        typed_name, signer_title, signature_style,
        intent_confirmed, user_agent
      ) values (
        v_doc.company_id, p_document_id, auth.uid(), 'buyer',
        trim(p_typed_name), nullif(trim(p_title), ''), p_signature_style,
        true, p_user_agent
      );
      return;
    end if;

    -- Safe retry after the buyer has already completed the signature.
    if v_doc.status = 'fully_executed'
       and v_doc.buyer_signed_at is not null then
      return;
    end if;

    raise exception 'Document cannot be signed in its current state: %', v_doc.status;
  end if;

  raise exception 'You are not authorized to sign this document';
end;
$$;

create or replace function public.dmh_document_workflow_state(
  p_document_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_doc public.deal_documents_generated%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_doc from public.deal_documents_generated where id = p_document_id;

  if v_doc.id is null then raise exception 'Document unavailable'; end if;

  if not (
    (v_profile.role in ('owner','employee') and v_doc.company_id = v_profile.company_id)
    or (v_profile.role = 'buyer' and (
      v_doc.buyer_id = auth.uid()
      or exists(select 1 from public.buyer_profiles bp where bp.id=v_doc.buyer_id and bp.user_id=auth.uid())
    ))
  ) then raise exception 'Access denied'; end if;

  return jsonb_build_object(
    'id', v_doc.id,
    'status', v_doc.status,
    'sellerSigned', v_doc.seller_signed_at is not null,
    'buyerSigned', v_doc.buyer_signed_at is not null,
    'canSellerSign', v_doc.status = 'draft',
    'canSend', v_doc.seller_signed_at is not null and v_doc.status in ('seller_signed','sent_to_buyer'),
    'canBuyerSign', v_doc.status = 'sent_to_buyer',
    'isComplete', v_doc.status = 'fully_executed'
  );
end;
$$;

grant execute on function public.dmh_apply_typed_signature(uuid,text,text,text,boolean,text) to authenticated;
grant execute on function public.dmh_document_workflow_state(uuid) to authenticated;
