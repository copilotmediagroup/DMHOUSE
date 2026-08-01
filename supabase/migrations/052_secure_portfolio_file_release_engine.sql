-- DMHOUSE Sales OS v2.6.0 — Secure Portfolio File Release Engine

create table if not exists public.portfolio_file_downloads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  file_id uuid not null references public.portfolio_files(id) on delete cascade,
  buyer_id uuid references public.buyer_profiles(id) on delete set null,
  file_type public.portfolio_file_type not null,
  downloaded_by uuid not null references auth.users(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create index if not exists portfolio_file_downloads_lookup_idx on public.portfolio_file_downloads(portfolio_id,file_type,downloaded_at desc);
alter table public.portfolio_file_downloads enable row level security;
drop policy if exists "owner reads portfolio file downloads" on public.portfolio_file_downloads;
create policy "owner reads portfolio file downloads" on public.portfolio_file_downloads for select using(company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_portfolio_file_access(p_portfolio_id uuid,p_file_type public.portfolio_file_type)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_role text:=public.current_role();
  v_company uuid:=public.current_company_id();
  v_buyer uuid:=public.current_buyer_id();
  v_file public.portfolio_files%rowtype;
  v_room public.buyer_deal_rooms%rowtype;
  v_allowed boolean:=false;
begin
  select * into v_file from public.portfolio_files
  where portfolio_id=p_portfolio_id and file_type=p_file_type and locked_at is null
  order by version desc limit 1;
  if not found then raise exception '% file is not uploaded', initcap(p_file_type::text); end if;

  if v_role='owner' and v_file.company_id=v_company then
    v_allowed:=true;
  elsif v_role='buyer' then
    if not exists(select 1 from public.buyer_portfolio_access a where a.buyer_id=v_buyer and a.portfolio_id=p_portfolio_id and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())) then
      raise exception 'Portfolio access is not active';
    end if;
    if p_file_type='masked' then
      v_allowed:=exists(select 1 from public.deal_documents_generated d where d.portfolio_id=p_portfolio_id and d.buyer_id=auth.uid() and d.document_type='nda' and d.status='fully_executed');
      if not v_allowed then raise exception 'Fully executed NDA required before masked download'; end if;
    else
      select * into v_room from public.buyer_deal_rooms r where r.portfolio_id=p_portfolio_id and r.buyer_id=v_buyer order by r.updated_at desc limit 1;
      if not found then raise exception 'Active buyer deal room required'; end if;
      if not exists(select 1 from public.deal_documents_generated d where d.portfolio_id=p_portfolio_id and d.buyer_id=auth.uid() and d.document_type='purchase_agreement' and d.status='fully_executed') then raise exception 'Fully executed purchase agreement required'; end if;
      if v_room.payment_confirmed_at is null then raise exception 'Owner has not confirmed cleared funds'; end if;
      if v_room.final_file_released_at is null then raise exception 'Owner has not released the final file'; end if;
      v_allowed:=true;
    end if;
  end if;
  if not v_allowed then raise exception 'File access denied'; end if;
  insert into public.portfolio_file_downloads(company_id,portfolio_id,file_id,buyer_id,file_type,downloaded_by)
  values(v_file.company_id,p_portfolio_id,v_file.id,case when v_role='buyer' then v_buyer else null end,p_file_type,auth.uid());
  return jsonb_build_object('fileId',v_file.id,'fileName',v_file.file_name,'storagePath',v_file.storage_path,'fileType',v_file.file_type);
end $$;
grant execute on function public.dmh_portfolio_file_access(uuid,public.portfolio_file_type) to authenticated;

create or replace function public.dmh_deal_gate(p_room_id uuid,p_gate text)
returns void language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
 if not found then raise exception 'Room not found'; end if;
 if p_gate='agreement' then
   if not exists(select 1 from public.deal_documents_generated d where d.portfolio_id=r.portfolio_id and d.buyer_id=(select user_id from public.buyer_profiles where id=r.buyer_id) and d.document_type='purchase_agreement' and d.status='fully_executed') then raise exception 'Purchase agreement must be fully executed by both parties'; end if;
   update public.buyer_deal_rooms set agreement_approved_at=now(),agreement_approved_by=auth.uid(),status='payment_pending',updated_at=now() where id=p_room_id;
 elsif p_gate='payment' then
   if r.agreement_approved_at is null then raise exception 'Approve the fully executed agreement first'; end if;
   update public.buyer_deal_rooms set payment_confirmed_at=now(),payment_confirmed_by=auth.uid(),status='release_ready',updated_at=now() where id=p_room_id;
 elsif p_gate='release' then
   if r.payment_confirmed_at is null then raise exception 'Confirm cleared funds first'; end if;
   if not exists(select 1 from public.portfolio_files f where f.portfolio_id=r.portfolio_id and f.file_type='unmasked' and f.locked_at is null) then raise exception 'Upload an unmasked portfolio file before release'; end if;
   update public.buyer_deal_rooms set final_file_released_at=now(),final_file_released_by=auth.uid(),updated_at=now() where id=p_room_id;
 else raise exception 'Invalid gate'; end if;
end $$;
grant execute on function public.dmh_deal_gate(uuid,text) to authenticated;

-- Storage access is still private. Buyers can request a signed URL only when the same lifecycle gates are satisfied.
drop policy if exists "secure buyer portfolio file read" on storage.objects;
create policy "secure buyer portfolio file read" on storage.objects for select to authenticated using(
 bucket_id='portfolio-files' and exists(
   select 1 from public.portfolio_files f
   where f.storage_path=name and f.locked_at is null and (
     (public.current_role()='owner' and f.company_id=public.current_company_id()) or
     (public.current_role()='buyer' and exists(select 1 from public.buyer_portfolio_access a where a.buyer_id=public.current_buyer_id() and a.portfolio_id=f.portfolio_id and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())) and (
       (f.file_type='masked' and exists(select 1 from public.deal_documents_generated d where d.portfolio_id=f.portfolio_id and d.buyer_id=auth.uid() and d.document_type='nda' and d.status='fully_executed')) or
       (f.file_type='unmasked' and exists(select 1 from public.buyer_deal_rooms r where r.portfolio_id=f.portfolio_id and r.buyer_id=public.current_buyer_id() and r.payment_confirmed_at is not null and r.final_file_released_at is not null) and exists(select 1 from public.deal_documents_generated d where d.portfolio_id=f.portfolio_id and d.buyer_id=auth.uid() and d.document_type='purchase_agreement' and d.status='fully_executed'))
     ))
   )
 )
);
