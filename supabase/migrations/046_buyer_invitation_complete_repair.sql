-- DMH Sales OS v2.7.0a — Buyer Invitation Migration Repair
-- Safe to run after a failed attempt at migration 046.

create extension if not exists pgcrypto;

create table if not exists public.buyer_invitation_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  document_id uuid references public.deal_documents_generated(id) on delete cascade,
  started_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invite_count integer not null default 0,
  status text not null default 'active'
    check (status in ('active','completed','expired','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.buyer_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cycle_id uuid not null references public.buyer_invitation_cycles(id) on delete cascade,
  buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
  document_id uuid references public.deal_documents_generated(id) on delete cascade,
  email text not null,
  subject text not null,
  message text,
  token_hash text not null unique,
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  opened_at timestamptz,
  redeemed_at timestamptz,
  delivery_status text not null default 'queued'
    check (delivery_status in (
      'queued','sent','delivered','bounced','failed',
      'opened','redeemed','expired','invalidated'
    )),
  provider_message_id text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists buyer_invitation_cycles_lookup_idx
  on public.buyer_invitation_cycles
  (buyer_id, portfolio_id, status, started_at desc);

create index if not exists buyer_invitations_cycle_idx
  on public.buyer_invitations (cycle_id, sent_at desc);

create index if not exists buyer_invitations_expiry_idx
  on public.buyer_invitations (expires_at, delivery_status);

alter table public.buyer_invitation_cycles enable row level security;
alter table public.buyer_invitations enable row level security;

drop policy if exists buyer_invitation_cycles_staff
  on public.buyer_invitation_cycles;

create policy buyer_invitation_cycles_staff
  on public.buyer_invitation_cycles
  for all
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_role() in ('owner','employee')
  )
  with check (
    company_id = public.current_company_id()
    and public.current_role() in ('owner','employee')
  );

drop policy if exists buyer_invitation_cycles_buyer_read
  on public.buyer_invitation_cycles;

create policy buyer_invitation_cycles_buyer_read
  on public.buyer_invitation_cycles
  for select
  to authenticated
  using (buyer_id = public.current_buyer_id());

drop policy if exists buyer_invitations_staff
  on public.buyer_invitations;

create policy buyer_invitations_staff
  on public.buyer_invitations
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_role() in ('owner','employee')
  );

drop policy if exists buyer_invitations_buyer_read
  on public.buyer_invitations;

create policy buyer_invitations_buyer_read
  on public.buyer_invitations
  for select
  to authenticated
  using (buyer_id = public.current_buyer_id());

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

  v_raw := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

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

create or replace function public.dmh_mark_buyer_invitation_delivery(
  p_invitation_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and public.current_role() not in ('owner','employee') then
    raise exception 'Access denied';
  end if;

  update public.buyer_invitations
  set delivery_status = p_status,
      provider_message_id =
        coalesce(p_provider_message_id, provider_message_id),
      failure_reason = p_failure_reason
  where id = p_invitation_id;
end;
$$;

create or replace function public.dmh_buyer_invitation_history(
  p_document_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'sentAt', h.sent_at,
        'expiresAt', h.expires_at,
        'status', h.invitation_status,
        'subject', h.subject,
        'inviteNumber', h.invite_number
      )
      order by h.sent_at desc
    ),
    '[]'::jsonb
  )
  from (
    select
      i.id,
      i.sent_at,
      i.expires_at,
      i.subject,
      case
        when i.redeemed_at is not null then 'redeemed'
        when i.invalidated_at is not null then 'invalidated'
        when i.expires_at <= now() then 'expired'
        else i.delivery_status
      end as invitation_status,
      row_number() over (
        partition by i.cycle_id
        order by i.sent_at
      ) as invite_number
    from public.buyer_invitations i
    join public.buyer_invitation_cycles c
      on c.id = i.cycle_id
    where i.document_id = p_document_id
      and (
        (
          c.company_id = public.current_company_id()
          and public.current_role() in ('owner','employee')
        )
        or c.buyer_id = public.current_buyer_id()
      )
  ) h;
$$;

grant execute
on function public.dmh_prepare_buyer_invitation(uuid, text, text)
to authenticated;

grant execute
on function public.dmh_mark_buyer_invitation_delivery(
  uuid,
  text,
  text,
  text
)
to authenticated, service_role;

grant execute
on function public.dmh_buyer_invitation_history(uuid)
to authenticated;
