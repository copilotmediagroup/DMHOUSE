-- DMH Sales OS v1.0.1 — Production Audit & Stabilization
-- Removes browser-only distribution records and enforces server-side lifecycle rules.

alter table public.portfolio_distributions
  add column if not exists portfolio_name text,
  add column if not exists agency_name text,
  add column if not exists employee_name text,
  add column if not exists file_name text,
  add column if not exists file_version integer not null default 1;

create or replace function public.dmh_create_distribution(
  p_portfolio_id uuid,p_file_id uuid,p_agency_id uuid,p_contact_id uuid,
  p_recipient_email text,p_recipient_name text,p_recipient_type text,
  p_delivery_method text,p_business_reason text,p_follow_up_at timestamptz
) returns public.portfolio_distributions
language plpgsql security definer set search_path=public as $$
declare v_row public.portfolio_distributions; v_portfolio public.portfolios; v_agency public.agencies; v_file public.portfolio_files; v_profile public.profiles; v_flags jsonb='[]'::jsonb;
begin
  select * into v_profile from public.profiles where id=auth.uid() and company_id=public.current_company_id();
  if not found then raise exception 'Profile not found'; end if;
  select * into v_portfolio from public.portfolios where id=p_portfolio_id and company_id=v_profile.company_id for update;
  if not found then raise exception 'Portfolio not found'; end if;
  if v_portfolio.status not in ('active','negotiating') then raise exception 'Portfolio is not available for distribution'; end if;
  select * into v_file from public.portfolio_files where id=p_file_id and portfolio_id=v_portfolio.id and company_id=v_profile.company_id;
  if not found then raise exception 'Approved portfolio file not found'; end if;
  if v_file.locked_at is not null then raise exception 'Portfolio file is locked'; end if;
  select * into v_agency from public.agencies where id=p_agency_id and company_id=v_profile.company_id;
  if not found then raise exception 'Agency not found'; end if;
  if v_profile.role='employee' and v_agency.assigned_to<>auth.uid() then raise exception 'Agency is assigned to another employee'; end if;
  if p_recipient_type not in ('general_agency','named_contact') then raise exception 'Invalid recipient type'; end if;
  if p_delivery_method not in ('download','email') then raise exception 'Invalid delivery method'; end if;
  if trim(coalesce(p_recipient_email,'')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid recipient email required'; end if;
  if p_follow_up_at<=now() then raise exception 'Follow-up must be in the future'; end if;
  if exists(select 1 from public.portfolio_distributions where portfolio_id=p_portfolio_id and agency_id=p_agency_id and lower(recipient_email)=lower(trim(p_recipient_email)) and status<>'locked') then v_flags='["Repeat recipient"]'::jsonb; end if;
  insert into public.portfolio_distributions(company_id,portfolio_id,file_id,agency_id,contact_id,employee_id,delivery_method,purpose,business_reason,status,follow_up_at,risk_flags,recipient_email,recipient_name,recipient_type,portfolio_name,agency_name,employee_name,file_name,file_version,created_at)
  values(v_profile.company_id,v_portfolio.id,v_file.id,v_agency.id,p_contact_id,auth.uid(),p_delivery_method,trim(p_business_reason),trim(p_business_reason),'prepared',p_follow_up_at,v_flags,lower(trim(p_recipient_email)),nullif(trim(p_recipient_name),''),p_recipient_type,v_portfolio.name,v_agency.name,v_profile.full_name,v_file.file_name,v_file.version,now()) returning * into v_row;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) values(v_profile.company_id,auth.uid(),'distribution_prepared','portfolio_distribution',v_row.id,to_jsonb(v_row));
  return v_row;
end $$;

create or replace function public.dmh_set_distribution_status(p_distribution_id uuid,p_status text)
returns public.portfolio_distributions language plpgsql security definer set search_path=public as $$
declare v_row public.portfolio_distributions; v_role text;
begin
  v_role:=public.current_role();
  if p_status not in ('sent','downloaded','locked') then raise exception 'Invalid distribution status'; end if;
  select * into v_row from public.portfolio_distributions where id=p_distribution_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Distribution not found'; end if;
  if v_role<>'owner' and v_row.employee_id<>auth.uid() then raise exception 'Access denied'; end if;
  if p_status='locked' and v_role<>'owner' then raise exception 'Owner access required'; end if;
  if v_row.status='locked' then raise exception 'Distribution is locked'; end if;
  update public.portfolio_distributions set status=p_status,delivered_at=case when p_status in ('sent','downloaded') then coalesce(delivered_at,now()) else delivered_at end,locked_at=case when p_status='locked' then now() else locked_at end where id=v_row.id returning * into v_row;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) values(v_row.company_id,auth.uid(),'distribution_'||p_status,'portfolio_distribution',v_row.id,to_jsonb(v_row));
  return v_row;
end $$;

grant execute on function public.dmh_create_distribution(uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.dmh_set_distribution_status(uuid,text) to authenticated;

-- One live reservation per portfolio. Existing duplicates are cancelled before the index is created.
with ranked as (select id,row_number() over(partition by portfolio_id order by created_at desc) rn from public.reservations where status='active')
update public.reservations r set status='cancelled',released_at=now(),failure_reason='Superseded during v1.0.1 stabilization',updated_at=now() from ranked x where r.id=x.id and x.rn>1;
create unique index if not exists reservations_one_active_per_portfolio_idx on public.reservations(portfolio_id) where status='active';
create unique index if not exists sales_one_per_reservation_idx on public.sales(reservation_id);
create unique index if not exists commissions_one_per_sale_employee_idx on public.commissions(sale_id,employee_id);
