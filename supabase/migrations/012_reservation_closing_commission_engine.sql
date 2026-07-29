-- DMH Sales OS v1.0.0 — Reservation, Closing & Commission Engine

alter table public.reservations
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists deposit_required numeric(14,2) not null default 0,
  add column if not exists deposit_received numeric(14,2) not null default 0,
  add column if not exists deposit_received_at timestamptz,
  add column if not exists balance_received numeric(14,2) not null default 0,
  add column if not exists balance_received_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists proof_storage_path text,
  add column if not exists notes text,
  add column if not exists released_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.sales
  add column if not exists acquisition_cost numeric(14,2) not null default 0,
  add column if not exists commission_total numeric(14,2) not null default 0,
  add column if not exists net_revenue numeric(14,2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists proof_storage_path text,
  add column if not exists notes text;

alter table public.commissions
  add column if not exists calculation_type text not null default 'flat' check(calculation_type in ('flat','percentage')),
  add column if not exists rate numeric(10,4),
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists reservations_company_status_idx on public.reservations(company_id,status,payment_deadline);
create index if not exists sales_company_closed_idx on public.sales(company_id,closed_at desc);
create index if not exists commissions_company_status_idx on public.commissions(company_id,status,created_at desc);

insert into storage.buckets (id,name,public)
values ('closing-proofs','closing-proofs',false)
on conflict (id) do nothing;

drop policy if exists "company closing proofs read" on storage.objects;
create policy "company closing proofs read" on storage.objects for select to authenticated
using(bucket_id='closing-proofs' and (storage.foldername(name))[1]=public.current_company_id()::text);

drop policy if exists "owner closing proofs write" on storage.objects;
create policy "owner closing proofs write" on storage.objects for insert to authenticated
with check(bucket_id='closing-proofs' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);

drop policy if exists "owner closing proofs update" on storage.objects;
create policy "owner closing proofs update" on storage.objects for update to authenticated
using(bucket_id='closing-proofs' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text)
with check(bucket_id='closing-proofs' and public.current_role()='owner' and (storage.foldername(name))[1]=public.current_company_id()::text);

create or replace function public.dmh_release_reservation(
  p_reservation_id uuid,
  p_reason text default null
) returns public.reservations
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reservation public.reservations;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;

  select * into v_reservation from public.reservations
  where id=p_reservation_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_reservation.status <> 'active' then raise exception 'Only active reservations can be released'; end if;

  update public.reservations
    set status='cancelled',released_at=now(),failure_reason=nullif(trim(p_reason),''),updated_at=now()
  where id=v_reservation.id returning * into v_reservation;

  update public.offers set status='accepted',updated_at=now() where id=v_reservation.offer_id and status='reserved';
  update public.portfolios set status='active' where id=v_reservation.portfolio_id and status in ('reserved','payment_pending');
  update public.portfolio_files set locked_at=null where portfolio_id=v_reservation.portfolio_id;

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_reservation.company_id,auth.uid(),'reservation_released','reservation',v_reservation.id,to_jsonb(v_reservation));
  return v_reservation;
end;
$$;

create or replace function public.dmh_record_deposit(
  p_reservation_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_at timestamptz default now(),
  p_proof_storage_path text default null,
  p_notes text default null
) returns public.reservations
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reservation public.reservations;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_amount <= 0 then raise exception 'Deposit amount must be greater than zero'; end if;

  select * into v_reservation from public.reservations
  where id=p_reservation_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_reservation.status <> 'active' then raise exception 'Reservation is not active'; end if;
  if v_reservation.deposit_received + p_amount > v_reservation.amount then raise exception 'Payment exceeds sale amount'; end if;

  update public.reservations set
    deposit_received=deposit_received+p_amount,
    deposit_received_at=p_received_at,
    payment_method=nullif(trim(p_payment_method),''),
    proof_storage_path=coalesce(nullif(trim(p_proof_storage_path),''),proof_storage_path),
    notes=coalesce(nullif(trim(p_notes),''),notes),
    updated_at=now()
  where id=v_reservation.id returning * into v_reservation;

  update public.portfolios set status='payment_pending' where id=v_reservation.portfolio_id and status='reserved';

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_reservation.company_id,auth.uid(),'deposit_recorded','reservation',v_reservation.id,to_jsonb(v_reservation));
  return v_reservation;
end;
$$;

create or replace function public.dmh_close_sale(
  p_reservation_id uuid,
  p_balance_amount numeric,
  p_payment_method text,
  p_paid_at timestamptz,
  p_winning_employee_id uuid,
  p_commission_type text,
  p_commission_value numeric,
  p_proof_storage_path text default null,
  p_notes text default null
) returns public.sales
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reservation public.reservations;
  v_portfolio public.portfolios;
  v_sale public.sales;
  v_total_received numeric(14,2);
  v_commission numeric(14,2);
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_balance_amount < 0 then raise exception 'Balance amount cannot be negative'; end if;
  if p_commission_type not in ('flat','percentage') then raise exception 'Invalid commission type'; end if;
  if p_commission_value < 0 then raise exception 'Commission value cannot be negative'; end if;

  select * into v_reservation from public.reservations
  where id=p_reservation_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_reservation.status <> 'active' then raise exception 'Reservation is not active'; end if;

  select * into v_portfolio from public.portfolios where id=v_reservation.portfolio_id for update;
  v_total_received := v_reservation.deposit_received + p_balance_amount;
  if v_total_received <> v_reservation.amount then
    raise exception 'Total received (%) must equal the reserved sale amount (%)',v_total_received,v_reservation.amount;
  end if;

  if p_winning_employee_id is null then
    v_commission := 0;
  elsif p_commission_type='percentage' then
    v_commission := round(v_reservation.amount*(p_commission_value/100.0),2);
  else
    v_commission := round(p_commission_value,2);
  end if;
  if v_commission > v_reservation.amount then raise exception 'Commission cannot exceed sale price'; end if;

  insert into public.sales(company_id,portfolio_id,reservation_id,buyer_agency_id,winning_employee_id,sale_price,paid_at,closed_at,acquisition_cost,commission_total,net_revenue,payment_method,proof_storage_path,notes)
  values(v_reservation.company_id,v_reservation.portfolio_id,v_reservation.id,v_reservation.buyer_agency_id,p_winning_employee_id,v_reservation.amount,p_paid_at,now(),coalesce(v_portfolio.acquisition_cost,0),v_commission,v_reservation.amount-coalesce(v_portfolio.acquisition_cost,0)-v_commission,nullif(trim(p_payment_method),''),nullif(trim(p_proof_storage_path),''),nullif(trim(p_notes),''))
  returning * into v_sale;

  update public.reservations set status='paid',balance_received=p_balance_amount,balance_received_at=p_paid_at,payment_method=nullif(trim(p_payment_method),''),proof_storage_path=coalesce(nullif(trim(p_proof_storage_path),''),proof_storage_path),updated_at=now() where id=v_reservation.id;
  update public.offers set status='closed',updated_at=now() where id=v_reservation.offer_id;
  update public.portfolios set status='sold',sold_at=now() where id=v_reservation.portfolio_id;

  if p_winning_employee_id is not null and v_commission > 0 then
    insert into public.commissions(company_id,sale_id,employee_id,amount,status,calculation_type,rate)
    values(v_reservation.company_id,v_sale.id,p_winning_employee_id,v_commission,'pending',p_commission_type,case when p_commission_type='percentage' then p_commission_value else null end);
  end if;

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_reservation.company_id,auth.uid(),'sale_closed','sale',v_sale.id,to_jsonb(v_sale));
  return v_sale;
end;
$$;

create or replace function public.dmh_set_commission_status(
  p_commission_id uuid,
  p_status text
) returns public.commissions
language plpgsql
security definer
set search_path=public
as $$
declare v_commission public.commissions;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_status not in ('pending','approved','paid','cancelled','disputed') then raise exception 'Invalid commission status'; end if;
  update public.commissions set status=p_status,
    approved_at=case when p_status='approved' then coalesce(approved_at,now()) else approved_at end,
    paid_at=case when p_status='paid' then coalesce(paid_at,now()) else paid_at end,
    updated_at=now()
  where id=p_commission_id and company_id=public.current_company_id()
  returning * into v_commission;
  if not found then raise exception 'Commission not found'; end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_commission.company_id,auth.uid(),'commission_'||p_status,'commission',v_commission.id,to_jsonb(v_commission));
  return v_commission;
end;
$$;

grant execute on function public.dmh_release_reservation(uuid,text) to authenticated;
grant execute on function public.dmh_record_deposit(uuid,numeric,text,timestamptz,text,text) to authenticated;
grant execute on function public.dmh_close_sale(uuid,numeric,text,timestamptz,uuid,text,numeric,text,text) to authenticated;
grant execute on function public.dmh_set_commission_status(uuid,text) to authenticated;

-- Extended reservation creation used by v1.0.0. The v0.9 two-argument function remains for backward compatibility.
create or replace function public.dmh_create_reservation(
  p_offer_id uuid,
  p_payment_deadline timestamptz,
  p_deposit_required numeric default 0,
  p_reservation_expires_at timestamptz default null
) returns public.reservations
language plpgsql
security definer
set search_path=public
as $$
declare
  v_offer public.offers;
  v_reservation public.reservations;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_deposit_required < 0 then raise exception 'Deposit cannot be negative'; end if;

  select * into v_offer from public.offers
  where id=p_offer_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.status not in ('submitted','owner_countered','buyer_countered','accepted','reserved') then raise exception 'Offer cannot be reserved from its current state'; end if;
  if p_deposit_required > v_offer.current_amount then raise exception 'Deposit cannot exceed offer amount'; end if;

  update public.reservations set status='cancelled',released_at=now(),failure_reason='Replaced by another buyer',updated_at=now()
  where portfolio_id=v_offer.portfolio_id and status='active' and offer_id<>v_offer.id;

  insert into public.reservations(company_id,offer_id,portfolio_id,buyer_agency_id,amount,payment_deadline,reservation_expires_at,deposit_required,status,updated_at)
  values(v_offer.company_id,v_offer.id,v_offer.portfolio_id,v_offer.agency_id,v_offer.current_amount,p_payment_deadline,coalesce(p_reservation_expires_at,p_payment_deadline),p_deposit_required,'active',now())
  on conflict(offer_id) do update set amount=excluded.amount,payment_deadline=excluded.payment_deadline,reservation_expires_at=excluded.reservation_expires_at,deposit_required=excluded.deposit_required,status='active',released_at=null,failure_reason=null,updated_at=now()
  returning * into v_reservation;

  update public.offers set status='reserved',decision_at=now(),updated_at=now() where id=v_offer.id;
  update public.portfolios set status='reserved' where id=v_offer.portfolio_id;
  update public.portfolio_files set locked_at=coalesce(locked_at,now()) where portfolio_id=v_offer.portfolio_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_offer.company_id,auth.uid(),'offer_reserved','offer',v_offer.id,to_jsonb(v_reservation));
  return v_reservation;
end;
$$;
grant execute on function public.dmh_create_reservation(uuid,timestamptz,numeric,timestamptz) to authenticated;
