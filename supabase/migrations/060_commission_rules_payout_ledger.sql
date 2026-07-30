-- DMH Sales OS v3.1.4 — Commission Rules & Payout Ledger
-- Transparent commission rules, immutable earned amounts, payout records, audit history, and employee disputes.

-- Expand the existing status constraint safely.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.commissions'::regclass and conname='commissions_status_check'
  ) then
    alter table public.commissions drop constraint commissions_status_check;
  end if;
end $$;
alter table public.commissions
  add constraint commissions_status_check
  check (status in ('estimated','pending','earned','approved','paid','cancelled','disputed'));

create table if not exists public.employee_commission_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  rule_type text not null check(rule_type in ('flat','percent_sale','per_account')),
  rule_value numeric(14,4) not null check(rule_value>=0),
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,employee_id)
);

alter table public.commissions
  add column if not exists rule_type text,
  add column if not exists rule_value numeric(14,4),
  add column if not exists rule_source text not null default 'legacy',
  add column if not exists calculated_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists dispute_reason text,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_resolved_at timestamptz,
  add column if not exists dispute_resolution text;

create table if not exists public.commission_change_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  commission_id uuid references public.commissions(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  action text not null,
  old_amount numeric(14,2),
  new_amount numeric(14,2),
  old_status text,
  new_status text,
  detail text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists employee_commission_rules_company_idx on public.employee_commission_rules(company_id,employee_id);
create index if not exists commission_change_log_commission_idx on public.commission_change_log(commission_id,created_at desc);
create index if not exists commission_change_log_employee_idx on public.commission_change_log(company_id,employee_id,created_at desc);

alter table public.employee_commission_rules enable row level security;
alter table public.commission_change_log enable row level security;

drop policy if exists commission_rules_owner_all on public.employee_commission_rules;
create policy commission_rules_owner_all on public.employee_commission_rules for all to authenticated
using(company_id=public.current_company_id() and public.current_role()='owner')
with check(company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists commission_rules_employee_read_own on public.employee_commission_rules;
create policy commission_rules_employee_read_own on public.employee_commission_rules for select to authenticated
using(company_id=public.current_company_id() and employee_id=auth.uid());

drop policy if exists commission_log_owner_read on public.commission_change_log;
create policy commission_log_owner_read on public.commission_change_log for select to authenticated
using(company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists commission_log_employee_read_own on public.commission_change_log;
create policy commission_log_employee_read_own on public.commission_change_log for select to authenticated
using(company_id=public.current_company_id() and employee_id=auth.uid());

create or replace function public.dmh_calculate_commission(
  p_rule_type text,p_rule_value numeric,p_sale_price numeric,p_account_count integer
) returns numeric language sql immutable as $$
 select round(case p_rule_type
   when 'percent_sale' then greatest(coalesce(p_sale_price,0),0)*(greatest(coalesce(p_rule_value,0),0)/100.0)
   when 'per_account' then greatest(coalesce(p_account_count,0),0)*greatest(coalesce(p_rule_value,0),0)
   else greatest(coalesce(p_rule_value,0),0)
 end,2)
$$;

create or replace function public.dmh_owner_set_employee_commission_rule(
  p_employee_id uuid,p_rule_type text,p_rule_value numeric
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id();
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 if p_rule_type not in ('flat','percent_sale','per_account') then raise exception 'Invalid commission rule'; end if;
 if coalesce(p_rule_value,-1)<0 then raise exception 'Rule value cannot be negative'; end if;
 if not exists(select 1 from public.profiles where id=p_employee_id and company_id=v_company and role='employee') then raise exception 'Employee not found'; end if;
 insert into public.employee_commission_rules(company_id,employee_id,rule_type,rule_value,created_by,updated_by)
 values(v_company,p_employee_id,p_rule_type,p_rule_value,auth.uid(),auth.uid())
 on conflict(company_id,employee_id) do update set rule_type=excluded.rule_type,rule_value=excluded.rule_value,is_active=true,effective_at=now(),updated_by=auth.uid(),updated_at=now();
 insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
 values(v_company,auth.uid(),'commission_rule_updated','profile',p_employee_id,jsonb_build_object('rule_type',p_rule_type,'rule_value',p_rule_value));
end $$;
grant execute on function public.dmh_owner_set_employee_commission_rule(uuid,text,numeric) to authenticated;

create or replace function public.dmh_apply_commission_rule_to_sale(p_sale_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_sale public.sales%rowtype; v_rule public.employee_commission_rules%rowtype; v_accounts integer; v_amount numeric; v_id uuid;
begin
 select * into v_sale from public.sales where id=p_sale_id for update;
 if not found or v_sale.winning_employee_id is null then return null; end if;
 select account_count into v_accounts from public.portfolios where id=v_sale.portfolio_id;
 select * into v_rule from public.employee_commission_rules where company_id=v_sale.company_id and employee_id=v_sale.winning_employee_id and is_active=true;
 if not found then return (select id from public.commissions where sale_id=v_sale.id and employee_id=v_sale.winning_employee_id limit 1); end if;
 v_amount:=public.dmh_calculate_commission(v_rule.rule_type,v_rule.rule_value,v_sale.sale_price,v_accounts);
 select id into v_id from public.commissions where sale_id=v_sale.id and employee_id=v_sale.winning_employee_id for update;
 if v_id is null then
   insert into public.commissions(company_id,sale_id,employee_id,amount,status,rule_type,rule_value,rule_source,calculated_at,locked_at,calculation_type,rate)
   values(v_sale.company_id,v_sale.id,v_sale.winning_employee_id,v_amount,case when v_sale.paid_at is not null then 'earned' else 'pending' end,v_rule.rule_type,v_rule.rule_value,'employee_default',now(),case when v_sale.paid_at is not null then now() end,case when v_rule.rule_type='percent_sale' then 'percentage' else 'flat' end,case when v_rule.rule_type='percent_sale' then v_rule.rule_value end)
   returning id into v_id;
 else
   update public.commissions set amount=v_amount,rule_type=v_rule.rule_type,rule_value=v_rule.rule_value,rule_source='employee_default',calculated_at=now(),
     status=case when v_sale.paid_at is not null and status not in ('paid','disputed') then 'earned' else status end,
     locked_at=case when v_sale.paid_at is not null then coalesce(locked_at,now()) else locked_at end,updated_at=now()
   where id=v_id and locked_at is null;
 end if;
 return v_id;
end $$;

create or replace function public.dmh_sync_sale_commission_rule()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.dmh_apply_commission_rule_to_sale(new.id);
 return new;
end $$;
drop trigger if exists trg_dmh_sync_sale_commission_rule on public.sales;
create trigger trg_dmh_sync_sale_commission_rule after insert or update of sale_price,paid_at,winning_employee_id on public.sales
for each row execute function public.dmh_sync_sale_commission_rule();

create or replace function public.dmh_prevent_locked_commission_reduction()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.locked_at is not null and new.amount<>old.amount then raise exception 'Earned commission amount is locked'; end if;
 if old.status='paid' and (new.amount<>old.amount or new.employee_id<>old.employee_id or new.sale_id<>old.sale_id) then raise exception 'Paid commission record is immutable'; end if;
 return new;
end $$;
drop trigger if exists trg_dmh_prevent_locked_commission_reduction on public.commissions;
create trigger trg_dmh_prevent_locked_commission_reduction before update on public.commissions
for each row execute function public.dmh_prevent_locked_commission_reduction();

create or replace function public.dmh_owner_mark_commission_paid_v2(
 p_commission_id uuid,p_payment_method text,p_payment_reference text default null,p_notes text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_old public.commissions%rowtype; v_sale public.sales%rowtype;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 select * into v_old from public.commissions where id=p_commission_id and company_id=public.current_company_id() for update;
 if not found then raise exception 'Commission not found'; end if;
 select * into v_sale from public.sales where id=v_old.sale_id;
 if v_sale.paid_at is null then raise exception 'Buyer payment has not been verified'; end if;
 if v_old.status='disputed' then raise exception 'Resolve the employee dispute before payment'; end if;
 update public.commissions set status='paid',paid_at=now(),locked_at=coalesce(locked_at,now()),payment_method=nullif(trim(p_payment_method),''),payment_reference=nullif(trim(p_payment_reference),''),notes=concat_ws(' · ',nullif(notes,''),nullif(trim(p_notes),'')),updated_at=now() where id=p_commission_id;
 insert into public.commission_change_log(company_id,commission_id,employee_id,action,old_amount,new_amount,old_status,new_status,detail,actor_id)
 values(v_old.company_id,v_old.id,v_old.employee_id,'paid',v_old.amount,v_old.amount,v_old.status,'paid',concat_ws(' · ',p_payment_method,p_payment_reference,p_notes),auth.uid());
end $$;
grant execute on function public.dmh_owner_mark_commission_paid_v2(uuid,text,text,text) to authenticated;

create or replace function public.dmh_employee_dispute_commission(p_commission_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.commissions%rowtype;
begin
 if public.current_role()<>'employee' then raise exception 'Employee access required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Please explain the dispute'; end if;
 select * into v_old from public.commissions where id=p_commission_id and company_id=public.current_company_id() and employee_id=auth.uid() for update;
 if not found then raise exception 'Commission not found'; end if;
 if v_old.status='paid' then raise exception 'Paid commission cannot be disputed in this workflow'; end if;
 update public.commissions set status='disputed',dispute_reason=trim(p_reason),disputed_at=now(),updated_at=now() where id=p_commission_id;
 insert into public.commission_change_log(company_id,commission_id,employee_id,action,old_amount,new_amount,old_status,new_status,detail,actor_id)
 values(v_old.company_id,v_old.id,v_old.employee_id,'disputed',v_old.amount,v_old.amount,v_old.status,'disputed',trim(p_reason),auth.uid());
end $$;
grant execute on function public.dmh_employee_dispute_commission(uuid,text) to authenticated;

create or replace function public.dmh_owner_resolve_commission_dispute(p_commission_id uuid,p_resolution text,p_restore_status text default 'earned')
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.commissions%rowtype;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 if p_restore_status not in ('pending','earned','approved','cancelled') then raise exception 'Invalid restored status'; end if;
 select * into v_old from public.commissions where id=p_commission_id and company_id=public.current_company_id() and status='disputed' for update;
 if not found then raise exception 'Open dispute not found'; end if;
 update public.commissions set status=p_restore_status,dispute_resolved_at=now(),dispute_resolution=trim(p_resolution),updated_at=now() where id=p_commission_id;
 insert into public.commission_change_log(company_id,commission_id,employee_id,action,old_amount,new_amount,old_status,new_status,detail,actor_id)
 values(v_old.company_id,v_old.id,v_old.employee_id,'dispute_resolved',v_old.amount,v_old.amount,'disputed',p_restore_status,trim(p_resolution),auth.uid());
end $$;
grant execute on function public.dmh_owner_resolve_commission_dispute(uuid,text,text) to authenticated;

create or replace function public.dmh_owner_commission_rules()
returns table(employee_id uuid,employee_name text,rule_type text,rule_value numeric,is_active boolean,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
 select p.id,p.full_name,r.rule_type,r.rule_value,coalesce(r.is_active,false),r.updated_at
 from public.profiles p left join public.employee_commission_rules r on r.company_id=p.company_id and r.employee_id=p.id
 where p.company_id=public.current_company_id() and p.role='employee' and p.is_active=true and public.current_role()='owner'
 order by p.full_name
$$;
grant execute on function public.dmh_owner_commission_rules() to authenticated;

create or replace function public.dmh_owner_commission_ledger()
returns table(commission_id uuid,employee_id uuid,employee_name text,portfolio_name text,sale_price numeric,account_count integer,amount numeric,status text,rule_type text,rule_value numeric,locked_at timestamptz,paid_at timestamptz,payment_method text,payment_reference text,dispute_reason text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select c.id,c.employee_id,pf.full_name,po.name,s.sale_price,po.account_count,c.amount,c.status,c.rule_type,c.rule_value,c.locked_at,c.paid_at,c.payment_method,c.payment_reference,c.dispute_reason,c.created_at
 from public.commissions c join public.sales s on s.id=c.sale_id join public.portfolios po on po.id=s.portfolio_id join public.profiles pf on pf.id=c.employee_id
 where c.company_id=public.current_company_id() and public.current_role()='owner'
 order by case c.status when 'disputed' then 0 when 'earned' then 1 when 'approved' then 2 when 'pending' then 3 when 'paid' then 4 else 5 end,c.created_at desc
$$;
grant execute on function public.dmh_owner_commission_ledger() to authenticated;

create or replace function public.dmh_employee_commission_ledger()
returns table(commission_id uuid,portfolio_name text,sale_price numeric,account_count integer,amount numeric,status text,rule_type text,rule_value numeric,locked_at timestamptz,paid_at timestamptz,payment_method text,payment_reference text,dispute_reason text,dispute_resolution text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select c.id,po.name,s.sale_price,po.account_count,c.amount,c.status,c.rule_type,c.rule_value,c.locked_at,c.paid_at,c.payment_method,c.payment_reference,c.dispute_reason,c.dispute_resolution,c.created_at
 from public.commissions c join public.sales s on s.id=c.sale_id join public.portfolios po on po.id=s.portfolio_id
 where c.company_id=public.current_company_id() and c.employee_id=auth.uid() and public.current_role()='employee'
 order by c.created_at desc
$$;
grant execute on function public.dmh_employee_commission_ledger() to authenticated;
