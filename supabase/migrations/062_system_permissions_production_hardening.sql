-- DMH Sales OS v3.1.6 — System Permissions Audit & Production Hardening
-- Purpose: lock sensitive deal actions to the correct role, preserve buyer NDA/payment gates,
-- keep all delivery buckets private, and expose an Owner-only security audit report.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Storage buckets must remain private
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false
where id in ('portfolio-files', 'buyer-delivery-vault');

-- ---------------------------------------------------------------------------
-- 2) Rebuild the two most sensitive storage policy groups
-- ---------------------------------------------------------------------------

drop policy if exists "vault owner uploads" on storage.objects;
drop policy if exists "vault owner reads" on storage.objects;
drop policy if exists "vault owner updates" on storage.objects;
drop policy if exists "vault owner deletes" on storage.objects;
drop policy if exists "vault released buyer reads" on storage.objects;

create policy "vault owner uploads" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy "vault owner reads" on storage.objects
for select to authenticated
using (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy "vault owner updates" on storage.objects
for update to authenticated
using (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
)
with check (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy "vault owner deletes" on storage.objects
for delete to authenticated
using (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy "vault released buyer reads" on storage.objects
for select to authenticated
using (
  bucket_id = 'buyer-delivery-vault'
  and public.current_role() = 'buyer'
  and exists (
    select 1
    from public.buyer_deal_documents d
    join public.buyer_deal_rooms r on r.id = d.room_id
    where d.storage_path = storage.objects.name
      and d.document_type = 'final_portfolio'
      and d.visible_to_buyer = true
      and d.status = 'released'
      and r.buyer_id = public.current_buyer_id()
      and r.payment_confirmed_at is not null
      and r.final_file_released_at is not null
      and r.status in ('files_released', 'closed')
  )
);

-- Masked file policy: employees never receive storage SELECT access.
drop policy if exists "company portfolio files read" on storage.objects;
drop policy if exists "masked owner reads" on storage.objects;
drop policy if exists "masked nda buyer reads" on storage.objects;

create policy "masked owner reads" on storage.objects
for select to authenticated
using (
  bucket_id = 'portfolio-files'
  and public.current_role() = 'owner'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy "masked nda buyer reads" on storage.objects
for select to authenticated
using (
  bucket_id = 'portfolio-files'
  and public.current_role() = 'buyer'
  and exists (
    select 1
    from public.portfolio_files pf
    where pf.storage_path = storage.objects.name
      and pf.locked_at is null
      and exists (
        select 1
        from public.deal_documents_generated nda
        where nda.portfolio_id = pf.portfolio_id
          and nda.buyer_id = auth.uid()
          and nda.document_type = 'nda'
          and nda.status = 'fully_executed'
      )
      and (
        exists (
          select 1
          from public.buyer_deal_rooms r
          where r.portfolio_id = pf.portfolio_id
            and r.buyer_id = public.current_buyer_id()
            and r.status not in ('cancelled', 'expired')
        )
        or exists (
          select 1
          from public.buyer_portfolio_access a
          where a.portfolio_id = pf.portfolio_id
            and a.buyer_id = public.current_buyer_id()
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > now())
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- 3) Sensitive table policies
-- ---------------------------------------------------------------------------

-- Employees may never see final/unmasked document rows.
drop policy if exists "deal participants read documents" on public.buyer_deal_documents;
create policy "deal participants read documents" on public.buyer_deal_documents
for select to authenticated
using (
  exists (
    select 1
    from public.buyer_deal_rooms r
    where r.id = room_id
      and (
        (public.current_role() = 'owner' and r.company_id = public.current_company_id())
        or (
          public.current_role() = 'employee'
          and r.company_id = public.current_company_id()
          and document_type <> 'final_portfolio'
        )
        or (
          public.current_role() = 'buyer'
          and r.buyer_id = public.current_buyer_id()
          and visible_to_buyer = true
        )
      )
  )
);

-- Only Owners can read final-file download history for the company; buyers may read their own.
drop policy if exists "staff read file download history" on public.buyer_deal_file_downloads;
drop policy if exists "owner reads file download history" on public.buyer_deal_file_downloads;
drop policy if exists "buyer reads own file download history" on public.buyer_deal_file_downloads;

create policy "owner reads file download history" on public.buyer_deal_file_downloads
for select to authenticated
using (
  public.current_role() = 'owner'
  and company_id = public.current_company_id()
);

create policy "buyer reads own file download history" on public.buyer_deal_file_downloads
for select to authenticated
using (
  public.current_role() = 'buyer'
  and buyer_id = public.current_buyer_id()
);

-- Masked access logs are Owner-only. Employees can create logs only through the controlled RPC.
drop policy if exists "owner reads masked access log" on public.masked_portfolio_access_log;
create policy "owner reads masked access log" on public.masked_portfolio_access_log
for select to authenticated
using (
  public.current_role() = 'owner'
  and company_id = public.current_company_id()
);

-- ---------------------------------------------------------------------------
-- 4) Revoke direct execution of sensitive RPCs from anonymous users
-- ---------------------------------------------------------------------------
revoke all on function public.dmh_configure_delivery(uuid,text,integer) from anon;
revoke all on function public.dmh_register_vault_file(uuid,text,text) from anon;
revoke all on function public.dmh_verify_buyer_payment(uuid,text,text,numeric,text) from anon;
revoke all on function public.dmh_release_buyer_files(uuid) from anon;
revoke all on function public.dmh_log_deal_download(uuid,text) from anon;
revoke all on function public.dmh_employee_masked_preview_authorize(uuid) from anon;
revoke all on function public.dmh_masked_file_access_snapshot(uuid) from anon;
revoke all on function public.dmh_log_masked_access(uuid,text,text) from anon;
revoke all on function public.dmh_owner_mark_commission_paid_v2(uuid,text,text,text) from anon;
revoke all on function public.dmh_employee_dispute_commission(uuid,text) from anon;
revoke all on function public.dmh_owner_resolve_commission_dispute(uuid,text,text) from anon;

-- ---------------------------------------------------------------------------
-- 5) Owner-only live security audit report
-- ---------------------------------------------------------------------------
create or replace function public.dmh_owner_security_audit()
returns table(
  check_key text,
  category text,
  status text,
  detail text
)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if public.current_role() <> 'owner' then
    raise exception 'Owner access required';
  end if;

  return query
  select
    'portfolio_files_private',
    'Storage',
    case when coalesce((select not public from storage.buckets where id='portfolio-files'), false)
      then 'pass' else 'fail' end,
    'Masked portfolio bucket must be private';

  return query
  select
    'delivery_vault_private',
    'Storage',
    case when coalesce((select not public from storage.buckets where id='buyer-delivery-vault'), false)
      then 'pass' else 'fail' end,
    'Unmasked delivery bucket must be private';

  return query
  select
    'employee_no_masked_storage_select',
    'Storage',
    case when not exists (
      select 1 from pg_policies
      where schemaname='storage' and tablename='objects'
        and cmd='SELECT'
        and coalesce(qual,'') ilike '%portfolio-files%'
        and coalesce(qual,'') ilike '%employee%'
    ) then 'pass' else 'fail' end,
    'Employees must use preview RPC and must not receive storage SELECT access';

  return query
  select
    'employee_no_final_document_rows',
    'Database RLS',
    case when exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='buyer_deal_documents'
        and policyname='deal participants read documents'
        and coalesce(qual,'') ilike '%document_type%final_portfolio%'
    ) then 'pass' else 'review' end,
    'Employee document policy must exclude final_portfolio';

  return query
  select
    'buyer_masked_requires_nda',
    'Database RLS',
    case when exists (
      select 1 from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='masked nda buyer reads'
        and coalesce(qual,'') ilike '%fully_executed%'
    ) then 'pass' else 'fail' end,
    'Buyer masked access must require fully executed NDA';

  return query
  select
    'buyer_unmasked_requires_payment',
    'Database RLS',
    case when exists (
      select 1 from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='vault released buyer reads'
        and coalesce(qual,'') ilike '%payment_confirmed_at%'
        and coalesce(qual,'') ilike '%final_file_released_at%'
    ) then 'pass' else 'fail' end,
    'Buyer final-file access must require verified payment and release';

  return query
  select
    'owner_only_payment_rpc',
    'RPC Authorization',
    case when pg_get_functiondef('public.dmh_verify_buyer_payment(uuid,text,text,numeric,text)'::regprocedure)
      ilike '%current_role()%<>%owner%'
      then 'pass' else 'review' end,
    'Payment verification RPC must reject every role except Owner';

  return query
  select
    'owner_only_release_rpc',
    'RPC Authorization',
    case when pg_get_functiondef('public.dmh_release_buyer_files(uuid)'::regprocedure)
      ilike '%current_role()%<>%owner%'
      then 'pass' else 'review' end,
    'Final-file release RPC must reject every role except Owner';
end;
$$;

revoke all on function public.dmh_owner_security_audit() from public, anon;
grant execute on function public.dmh_owner_security_audit() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Useful indexes for authorization checks
-- ---------------------------------------------------------------------------
create index if not exists idx_deal_documents_storage_release
  on public.buyer_deal_documents(storage_path, document_type, status, visible_to_buyer);
create index if not exists idx_deal_rooms_buyer_portfolio_status
  on public.buyer_deal_rooms(buyer_id, portfolio_id, status);
create index if not exists idx_generated_docs_nda_lookup
  on public.deal_documents_generated(portfolio_id, buyer_id, document_type, status);
create index if not exists idx_portfolio_access_active
  on public.buyer_portfolio_access(portfolio_id, buyer_id, revoked_at, expires_at);

notify pgrst, 'reload schema';
