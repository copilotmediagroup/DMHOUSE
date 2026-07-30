-- DMH Sales OS v3.1.1 — NDA-Protected Masked Portfolio Release
-- Buyer masked file unlock after fully executed NDA.
-- Employees receive preview-only access through a controlled Edge Function.
-- Employees never receive storage SELECT access, a signed URL, or a download path.

-- Keep the masked-file bucket private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-files','portfolio-files',false,52428800,array['text/csv','application/vnd.ms-excel','application/csv','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Replace the legacy same-company read policy. That policy allowed employees to
-- create signed URLs. v3.1.1 deliberately removes that capability.
drop policy if exists "company portfolio files read" on storage.objects;
drop policy if exists "masked owner reads" on storage.objects;
drop policy if exists "masked nda buyer reads" on storage.objects;

create policy "masked owner reads" on storage.objects for select to authenticated using (
  bucket_id='portfolio-files'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
);

-- A buyer can read the masked file only when the NDA for that exact portfolio
-- is fully executed and the buyer has an active deal-room/access relationship.
create policy "masked nda buyer reads" on storage.objects for select to authenticated using (
  bucket_id='portfolio-files'
  and public.current_role()='buyer'
  and exists (
    select 1
    from public.portfolio_files pf
    where pf.storage_path=storage.objects.name
      and pf.locked_at is null
      and exists (
        select 1 from public.deal_documents_generated nda
        where nda.portfolio_id=pf.portfolio_id
          and nda.buyer_id=auth.uid()
          and nda.document_type='nda'
          and nda.status='fully_executed'
      )
      and (
        exists (
          select 1 from public.buyer_deal_rooms r
          where r.portfolio_id=pf.portfolio_id
            and r.buyer_id=public.current_buyer_id()
            and r.status not in ('cancelled','expired')
        )
        or exists (
          select 1 from public.buyer_portfolio_access a
          where a.portfolio_id=pf.portfolio_id
            and a.buyer_id=public.current_buyer_id()
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at>now())
        )
      )
  )
);

-- Employee metadata is intentionally minimal. It authorizes the preview proxy,
-- but storage_path is returned only to the server-side Edge Function.
create or replace function public.dmh_employee_masked_preview_authorize(p_portfolio_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype; v_file public.portfolio_files%rowtype; v_name text;
begin
  select * into v_profile from public.profiles where id=auth.uid();
  if v_profile.role<>'employee' then raise exception 'Employee access required'; end if;

  select pf.* into v_file
  from public.portfolio_files pf
  join public.portfolios p on p.id=pf.portfolio_id
  where pf.portfolio_id=p_portfolio_id
    and pf.company_id=v_profile.company_id
    and pf.employee_visible=true
    and pf.locked_at is null
    and p.status in ('ready','active','negotiating','reserved','payment_pending')
  order by pf.version desc limit 1;

  if v_file.id is null then raise exception 'Approved masked preview is unavailable'; end if;
  select name into v_name from public.portfolios where id=v_file.portfolio_id;
  return jsonb_build_object(
    'file_id',v_file.id,
    'portfolio_id',v_file.portfolio_id,
    'portfolio_name',v_name,
    'file_name',v_file.file_name,
    'storage_path',v_file.storage_path,
    'version',v_file.version
  );
end $$;
grant execute on function public.dmh_employee_masked_preview_authorize(uuid) to authenticated;

-- Buyer-facing access state. The storage path is returned only after NDA execution.
create or replace function public.dmh_masked_file_access_snapshot(p_portfolio_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text:=public.current_role()::text; v_buyer uuid:=public.current_buyer_id(); v_file public.portfolio_files%rowtype; v_nda boolean:=false; v_allowed boolean:=false;
begin
  if v_role<>'buyer' then raise exception 'Buyer access required'; end if;

  select exists(
    select 1 from public.deal_documents_generated d
    where d.portfolio_id=p_portfolio_id
      and d.buyer_id=auth.uid()
      and d.document_type='nda'
      and d.status='fully_executed'
  ) into v_nda;

  select exists(
    select 1 from public.buyer_deal_rooms r
    where r.portfolio_id=p_portfolio_id and r.buyer_id=v_buyer and r.status not in ('cancelled','expired')
  ) or exists(
    select 1 from public.buyer_portfolio_access a
    where a.portfolio_id=p_portfolio_id and a.buyer_id=v_buyer and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
  ) into v_allowed;

  select * into v_file from public.portfolio_files
  where portfolio_id=p_portfolio_id and locked_at is null
  order by version desc limit 1;

  return jsonb_build_object(
    'nda_executed',v_nda,
    'relationship_active',v_allowed,
    'file_available',v_file.id is not null,
    'unlocked',v_nda and v_allowed and v_file.id is not null,
    'file_id',case when v_nda and v_allowed then v_file.id else null end,
    'file_name',case when v_nda and v_allowed then v_file.file_name else null end,
    'storage_path',case when v_nda and v_allowed then v_file.storage_path else null end
  );
end $$;
grant execute on function public.dmh_masked_file_access_snapshot(uuid) to authenticated;

create table if not exists public.masked_portfolio_access_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  file_id uuid references public.portfolio_files(id) on delete set null,
  actor_id uuid not null,
  actor_role text not null check(actor_role in ('buyer','employee')),
  action text not null check(action in ('buyer_download','employee_preview')),
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.masked_portfolio_access_log enable row level security;
drop policy if exists "owner reads masked access log" on public.masked_portfolio_access_log;
create policy "owner reads masked access log" on public.masked_portfolio_access_log for select using (
  company_id=public.current_company_id() and public.current_role()='owner'
);

create or replace function public.dmh_log_masked_access(p_portfolio_id uuid,p_action text,p_user_agent text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_role text:=public.current_role()::text; v_company uuid; v_file uuid; v_ok boolean:=false;
begin
  if p_action='buyer_download' and v_role='buyer' then
    select pf.company_id,pf.id into v_company,v_file from public.portfolio_files pf
    where pf.portfolio_id=p_portfolio_id and pf.locked_at is null order by pf.version desc limit 1;
    select coalesce((public.dmh_masked_file_access_snapshot(p_portfolio_id)->>'unlocked')::boolean,false) into v_ok;
  elsif p_action='employee_preview' and v_role='employee' then
    select pf.company_id,pf.id into v_company,v_file from public.portfolio_files pf
    where pf.portfolio_id=p_portfolio_id and pf.company_id=public.current_company_id() and pf.employee_visible=true and pf.locked_at is null order by pf.version desc limit 1;
    v_ok:=v_file is not null;
  else raise exception 'Invalid masked access event'; end if;
  if not v_ok then raise exception 'Masked portfolio access is not authorized'; end if;
  insert into public.masked_portfolio_access_log(company_id,portfolio_id,file_id,actor_id,actor_role,action,user_agent)
  values(v_company,p_portfolio_id,v_file,auth.uid(),v_role,p_action,nullif(p_user_agent,''));
end $$;
grant execute on function public.dmh_log_masked_access(uuid,text,text) to authenticated;
