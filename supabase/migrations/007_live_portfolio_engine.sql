-- DMH Sales OS v0.6.0 · Live Portfolio Engine
-- Idempotent against the currently deployed 001 schema.

alter table public.portfolios add column if not exists category text;
alter table public.portfolios add column if not exists description text;
alter table public.portfolios add column if not exists selling_points jsonb not null default '[]'::jsonb;
alter table public.portfolio_files add column if not exists size_bytes bigint not null default 0;
alter table public.portfolio_files add column if not exists mime_type text not null default 'text/csv';

create or replace function public.bootstrap_dmh_owner(p_full_name text default 'Owner')
returns public.profiles
language plpgsql
security definer
set search_path=public
as $$
declare v_profile public.profiles; v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.profiles where id=auth.uid();
  if found then return v_profile; end if;
  insert into public.companies(name) values('Data Market House') returning id into v_company_id;
  insert into public.profiles(id,company_id,role,full_name,is_active)
  values(auth.uid(),v_company_id,'owner',coalesce(nullif(trim(p_full_name),''),'Owner'),true)
  returning * into v_profile;
  return v_profile;
end;$$;
grant execute on function public.bootstrap_dmh_owner(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-files','portfolio-files',false,52428800,array['text/csv','application/vnd.ms-excel','application/csv'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "company portfolio files read" on storage.objects;
drop policy if exists "owners upload portfolio files" on storage.objects;
drop policy if exists "owners update portfolio files" on storage.objects;
drop policy if exists "owners delete portfolio files" on storage.objects;
create policy "company portfolio files read" on storage.objects for select to authenticated
using(bucket_id='portfolio-files' and (storage.foldername(name))[1]=public.current_company_id()::text);
create policy "owners upload portfolio files" on storage.objects for insert to authenticated
with check(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);
create policy "owners update portfolio files" on storage.objects for update to authenticated
using(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text)
with check(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);
create policy "owners delete portfolio files" on storage.objects for delete to authenticated
using(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);
