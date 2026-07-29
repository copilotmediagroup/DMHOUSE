-- DMH Sales OS v0.2.0 · Portfolio Activation Engine
-- Run after 001_dmh_sales_os.sql.

alter table public.portfolios add column if not exists category text;
alter table public.portfolios add column if not exists description text;
alter table public.portfolios add column if not exists selling_points jsonb not null default '[]'::jsonb;

-- Status transitions are enforced centrally, not by arbitrary client updates.
create or replace function public.transition_portfolio(p_portfolio_id uuid, p_next public.portfolio_status)
returns public.portfolios
language plpgsql
security definer
set search_path=public
as $$
declare
  current_record public.portfolios;
  active_count integer;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  select * into current_record from public.portfolios where id=p_portfolio_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Portfolio not found'; end if;

  if not (
    (current_record.status='draft' and p_next in ('ready','archived')) or
    (current_record.status='ready' and p_next in ('draft','active','archived')) or
    (current_record.status='active' and p_next in ('negotiating','archived')) or
    (current_record.status='negotiating' and p_next in ('active','reserved')) or
    (current_record.status='reserved' and p_next in ('active','payment_pending')) or
    (current_record.status='payment_pending' and p_next in ('active','sold')) or
    (current_record.status='sold' and p_next='archived')
  ) then raise exception 'Illegal portfolio transition: % to %',current_record.status,p_next; end if;

  if p_next='ready' and not exists(select 1 from public.portfolio_files f where f.portfolio_id=p_portfolio_id and f.locked_at is null) then
    raise exception 'A masked file is required before Ready';
  end if;

  if p_next='active' then
    select count(*) into active_count from public.portfolios
      where company_id=current_record.company_id and id<>current_record.id
      and status in ('active','negotiating','reserved','payment_pending');
    if active_count>0 then raise exception 'Another campaign is already active'; end if;
  end if;

  update public.portfolios set status=p_next,
    activated_at=case when p_next='active' then now() else activated_at end,
    sold_at=case when p_next='sold' then now() else sold_at end
  where id=p_portfolio_id returning * into current_record;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,metadata)
  values(current_record.company_id,auth.uid(),'portfolio.'||p_next,'portfolio',current_record.id,jsonb_build_object('status',p_next));
  return current_record;
end;$$;
grant execute on function public.transition_portfolio(uuid,public.portfolio_status) to authenticated;

-- Employee-safe projection deliberately excludes private_minimum and acquisition_cost.
create or replace view public.employee_active_portfolios
with (security_invoker=true)
as select id,company_id,name,original_creditor,category,account_count,face_value,asking_price,status,description,selling_points,activated_at
from public.portfolios
where status in ('active','negotiating','reserved','payment_pending');
grant select on public.employee_active_portfolios to authenticated;

-- Private storage bucket for masked portfolio files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-files','portfolio-files',false,52428800,array['text/csv','application/vnd.ms-excel'])
on conflict(id) do update set public=false;

create policy "company portfolio files read" on storage.objects for select to authenticated
using(bucket_id='portfolio-files' and (storage.foldername(name))[1]=public.current_company_id()::text);
create policy "owners upload portfolio files" on storage.objects for insert to authenticated
with check(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);
create policy "owners update portfolio files" on storage.objects for update to authenticated
using(bucket_id='portfolio-files' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);
