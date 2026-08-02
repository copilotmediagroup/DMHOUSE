-- DMHOUSE v5.1.0 — Employee Sales Execution Workspace
-- Employees may inspect approved masked files, send transaction documents,
-- and complete only the closings generated from their own offers.

begin;

-- Employees can upload payment proof into the private company closing bucket.
-- Every upload remains company-scoped and is referenced by an audited closing action.
drop policy if exists "employee closing proofs insert" on storage.objects;
create policy "employee closing proofs insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'closing-proofs'
  and public.current_role() = 'employee'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create or replace function public.dmh_employee_record_deposit(
  p_reservation_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_at timestamptz default now(),
  p_proof_storage_path text default null,
  p_notes text default null
) returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_offer public.offers;
begin
  if public.current_role() <> 'employee' then
    raise exception 'Employee access required';
  end if;
  if p_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and company_id = public.current_company_id()
  for update;

  if not found then raise exception 'Reservation not found'; end if;
  if v_reservation.status <> 'active' then raise exception 'Reservation is not active'; end if;

  select * into v_offer
  from public.offers
  where id = v_reservation.offer_id
    and company_id = v_reservation.company_id;

  if not found or v_offer.employee_id <> auth.uid() then
    raise exception 'This closing is not assigned to you';
  end if;
  if v_reservation.deposit_received + p_amount > v_reservation.amount then
    raise exception 'Payment exceeds sale amount';
  end if;

  update public.reservations set
    deposit_received = deposit_received + p_amount,
    deposit_received_at = p_received_at,
    payment_method = nullif(trim(p_payment_method), ''),
    proof_storage_path = coalesce(nullif(trim(p_proof_storage_path), ''), proof_storage_path),
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    updated_at = now()
  where id = v_reservation.id
  returning * into v_reservation;

  update public.portfolios
  set status = 'payment_pending'
  where id = v_reservation.portfolio_id and status = 'reserved';

  insert into public.audit_logs(company_id, actor_id, action, entity_type, entity_id, after_data)
  values(v_reservation.company_id, auth.uid(), 'employee_deposit_recorded', 'reservation', v_reservation.id, to_jsonb(v_reservation));

  return v_reservation;
end;
$$;

grant execute on function public.dmh_employee_record_deposit(uuid,numeric,text,timestamptz,text,text) to authenticated;

create or replace function public.dmh_employee_close_sale(
  p_reservation_id uuid,
  p_balance_amount numeric,
  p_payment_method text,
  p_paid_at timestamptz,
  p_proof_storage_path text default null,
  p_notes text default null
) returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_offer public.offers;
  v_portfolio public.portfolios;
  v_sale public.sales;
  v_total_received numeric(14,2);
  v_commission numeric(14,2);
  v_commission_type text;
  v_commission_value numeric;
begin
  if public.current_role() <> 'employee' then
    raise exception 'Employee access required';
  end if;
  if p_balance_amount < 0 then
    raise exception 'Balance amount cannot be negative';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and company_id = public.current_company_id()
  for update;

  if not found then raise exception 'Reservation not found'; end if;
  if v_reservation.status <> 'active' then raise exception 'Reservation is not active'; end if;

  select * into v_offer
  from public.offers
  where id = v_reservation.offer_id
    and company_id = v_reservation.company_id;

  if not found or v_offer.employee_id <> auth.uid() then
    raise exception 'This closing is not assigned to you';
  end if;

  select * into v_portfolio
  from public.portfolios
  where id = v_reservation.portfolio_id
  for update;

  v_total_received := v_reservation.deposit_received + p_balance_amount;
  if v_total_received <> v_reservation.amount then
    raise exception 'Total received (%) must equal the reserved sale amount (%)', v_total_received, v_reservation.amount;
  end if;

  v_commission_type := coalesce(v_portfolio.employee_commission_type, 'flat');
  v_commission_value := coalesce(v_portfolio.employee_commission_value, 0);
  if v_commission_type = 'percentage' then
    v_commission := round(v_reservation.amount * (v_commission_value / 100.0), 2);
  else
    v_commission := round(v_commission_value, 2);
  end if;

  if v_commission > v_reservation.amount then
    raise exception 'Commission cannot exceed sale price';
  end if;

  insert into public.sales(
    company_id, portfolio_id, reservation_id, buyer_agency_id,
    winning_employee_id, sale_price, paid_at, closed_at,
    acquisition_cost, commission_total, net_revenue,
    payment_method, proof_storage_path, notes
  ) values (
    v_reservation.company_id, v_reservation.portfolio_id, v_reservation.id,
    v_reservation.buyer_agency_id, auth.uid(), v_reservation.amount,
    p_paid_at, now(), coalesce(v_portfolio.acquisition_cost, 0),
    v_commission,
    v_reservation.amount - coalesce(v_portfolio.acquisition_cost, 0) - v_commission,
    nullif(trim(p_payment_method), ''),
    nullif(trim(p_proof_storage_path), ''),
    nullif(trim(p_notes), '')
  ) returning * into v_sale;

  update public.reservations set
    status = 'paid',
    balance_received = p_balance_amount,
    balance_received_at = p_paid_at,
    payment_method = nullif(trim(p_payment_method), ''),
    proof_storage_path = coalesce(nullif(trim(p_proof_storage_path), ''), proof_storage_path),
    updated_at = now()
  where id = v_reservation.id;

  update public.offers set status = 'closed', updated_at = now() where id = v_reservation.offer_id;
  update public.portfolios set status = 'sold', sold_at = now() where id = v_reservation.portfolio_id;

  if v_commission > 0 then
    insert into public.commissions(company_id, sale_id, employee_id, amount, status, calculation_type, rate)
    values(
      v_reservation.company_id, v_sale.id, auth.uid(), v_commission,
      'pending', v_commission_type,
      case when v_commission_type = 'percentage' then v_commission_value else null end
    );
  end if;

  insert into public.audit_logs(company_id, actor_id, action, entity_type, entity_id, after_data)
  values(v_reservation.company_id, auth.uid(), 'employee_sale_closed', 'sale', v_sale.id, to_jsonb(v_sale));

  return v_sale;
end;
$$;

grant execute on function public.dmh_employee_close_sale(uuid,numeric,text,timestamptz,text,text) to authenticated;

commit;
