-- DMH Sales OS v2.6.0
-- Automated NDA & Purchase Agreement Builder, Typed E-Signatures,
-- Document Access Gates, Developer Sandbox and Payment Foundation

create extension if not exists pgcrypto;

create table if not exists public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  document_type text not null check (document_type in ('nda','purchase_agreement')),
  name text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_documents_generated (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  room_id uuid,
  buyer_id uuid,
  portfolio_id uuid,
  template_id uuid references public.agreement_templates(id),
  document_type text not null check (document_type in ('nda','purchase_agreement')),
  version_number integer not null default 1,
  status text not null default 'draft' check (status in ('draft','seller_signed','sent_to_buyer','fully_executed','void')),
  title text not null,
  field_values jsonb not null default '{}'::jsonb,
  rendered_html text not null,
  seller_name text,
  seller_title text,
  seller_signature_style text,
  seller_signed_at timestamptz,
  buyer_name text,
  buyer_title text,
  buyer_signature_style text,
  buyer_signed_at timestamptz,
  sent_at timestamptz,
  locked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_signature_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  document_id uuid not null references public.deal_documents_generated(id) on delete cascade,
  signer_id uuid,
  signer_role text not null,
  typed_name text not null,
  signer_title text,
  signature_style text not null,
  intent_confirmed boolean not null default false,
  ip_address text,
  user_agent text,
  signed_at timestamptz not null default now()
);

create table if not exists public.deal_payment_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  room_id uuid,
  buyer_id uuid,
  portfolio_id uuid,
  amount numeric(14,2) not null,
  payment_type text not null default 'full' check (payment_type in ('deposit','full','balance')),
  status text not null default 'draft' check (status in ('draft','issued','paid','overdue','void')),
  due_at timestamptz,
  instructions text,
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_generated_documents_room on public.deal_documents_generated(room_id, created_at desc);
create index if not exists idx_generated_documents_buyer on public.deal_documents_generated(buyer_id, status);
create index if not exists idx_signature_audit_document on public.document_signature_audit(document_id, signed_at);

alter table public.agreement_templates enable row level security;
alter table public.deal_documents_generated enable row level security;
alter table public.document_signature_audit enable row level security;
alter table public.deal_payment_requests enable row level security;

drop policy if exists agreement_templates_company_access on public.agreement_templates;
create policy agreement_templates_company_access on public.agreement_templates for all to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()))
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists generated_documents_staff_access on public.deal_documents_generated;
create policy generated_documents_staff_access on public.deal_documents_generated for all to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()) and (select role from public.profiles where id=auth.uid()) in ('owner','employee'))
with check (company_id = (select company_id from public.profiles where id = auth.uid()) and (select role from public.profiles where id=auth.uid()) in ('owner','employee'));

drop policy if exists generated_documents_buyer_read on public.deal_documents_generated;
create policy generated_documents_buyer_read on public.deal_documents_generated for select to authenticated
using (buyer_id = auth.uid() and status in ('sent_to_buyer','fully_executed'));

drop policy if exists signature_audit_company_read on public.document_signature_audit;
create policy signature_audit_company_read on public.document_signature_audit for select to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()) or signer_id = auth.uid());

drop policy if exists payment_requests_company_access on public.deal_payment_requests;
create policy payment_requests_company_access on public.deal_payment_requests for all to authenticated
using (company_id = (select company_id from public.profiles where id = auth.uid()) or buyer_id = auth.uid())
with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create or replace function public.dmh_save_generated_document(
  p_document_id uuid,
  p_room_id uuid,
  p_buyer_id uuid,
  p_portfolio_id uuid,
  p_document_type text,
  p_title text,
  p_field_values jsonb,
  p_rendered_html text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_profile profiles%rowtype; v_id uuid; v_version integer;
begin
  select * into v_profile from profiles where id=auth.uid();
  if v_profile.role not in ('owner','employee') then raise exception 'Staff access required'; end if;
  if p_document_id is null then
    select coalesce(max(version_number),0)+1 into v_version from deal_documents_generated
      where company_id=v_profile.company_id and portfolio_id=p_portfolio_id and document_type=p_document_type;
    insert into deal_documents_generated(company_id,room_id,buyer_id,portfolio_id,document_type,version_number,title,field_values,rendered_html,created_by)
    values(v_profile.company_id,p_room_id,p_buyer_id,p_portfolio_id,p_document_type,v_version,p_title,p_field_values,p_rendered_html,auth.uid()) returning id into v_id;
  else
    update deal_documents_generated set title=p_title,field_values=p_field_values,rendered_html=p_rendered_html,updated_at=now()
      where id=p_document_id and company_id=v_profile.company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'Document is locked or unavailable'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.dmh_apply_typed_signature(
  p_document_id uuid,
  p_typed_name text,
  p_title text,
  p_signature_style text,
  p_intent_confirmed boolean,
  p_user_agent text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_profile profiles%rowtype; v_doc deal_documents_generated%rowtype;
begin
  if not p_intent_confirmed then raise exception 'Electronic signature intent must be confirmed'; end if;
  select * into v_profile from profiles where id=auth.uid();
  select * into v_doc from deal_documents_generated where id=p_document_id for update;
  if v_doc.id is null then raise exception 'Document unavailable'; end if;
  if v_profile.role in ('owner','employee') and v_doc.company_id=v_profile.company_id and v_doc.status='draft' then
    update deal_documents_generated set seller_name=p_typed_name,seller_title=p_title,seller_signature_style=p_signature_style,seller_signed_at=now(),status='seller_signed',locked_at=now(),updated_at=now() where id=p_document_id;
    insert into document_signature_audit(company_id,document_id,signer_id,signer_role,typed_name,signer_title,signature_style,intent_confirmed,user_agent)
    values(v_doc.company_id,p_document_id,auth.uid(),v_profile.role,p_typed_name,p_title,p_signature_style,true,p_user_agent);
  elsif v_profile.role='buyer' and v_doc.buyer_id=auth.uid() and v_doc.status='sent_to_buyer' then
    update deal_documents_generated set buyer_name=p_typed_name,buyer_title=p_title,buyer_signature_style=p_signature_style,buyer_signed_at=now(),status='fully_executed',updated_at=now() where id=p_document_id;
    insert into document_signature_audit(company_id,document_id,signer_id,signer_role,typed_name,signer_title,signature_style,intent_confirmed,user_agent)
    values(v_doc.company_id,p_document_id,auth.uid(),'buyer',p_typed_name,p_title,p_signature_style,true,p_user_agent);
  else raise exception 'Document cannot be signed in its current state'; end if;
end $$;

create or replace function public.dmh_send_document_to_buyer(p_document_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_profile profiles%rowtype; v_doc deal_documents_generated%rowtype;
begin
  select * into v_profile from profiles where id=auth.uid();
  select * into v_doc from deal_documents_generated where id=p_document_id;
  if v_profile.role not in ('owner','employee') or v_doc.company_id<>v_profile.company_id then raise exception 'Staff access required'; end if;
  if v_doc.status<>'seller_signed' then raise exception 'Seller signature is required first'; end if;
  update deal_documents_generated set status='sent_to_buyer',sent_at=now(),updated_at=now() where id=p_document_id;
end $$;

create or replace function public.dmh_document_access_gate(p_portfolio_id uuid) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'nda_executed', exists(select 1 from deal_documents_generated where portfolio_id=p_portfolio_id and buyer_id=auth.uid() and document_type='nda' and status='fully_executed'),
    'purchase_agreement_executed', exists(select 1 from deal_documents_generated where portfolio_id=p_portfolio_id and buyer_id=auth.uid() and document_type='purchase_agreement' and status='fully_executed')
  );
$$;

grant execute on function public.dmh_save_generated_document(uuid,uuid,uuid,uuid,text,text,jsonb,text) to authenticated;
grant execute on function public.dmh_apply_typed_signature(uuid,text,text,text,boolean,text) to authenticated;
grant execute on function public.dmh_send_document_to_buyer(uuid) to authenticated;
grant execute on function public.dmh_document_access_gate(uuid) to authenticated;
