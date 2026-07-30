-- DMH Sales OS v0.9.0 — Live Offer & Negotiation Engine

alter table public.offers
  add column if not exists source_distribution_id uuid references public.portfolio_distributions(id) on delete set null,
  add column if not exists submitted_at timestamptz default now(),
  add column if not exists decision_at timestamptz,
  add column if not exists expires_at timestamptz;

create index if not exists offers_portfolio_status_idx on public.offers(portfolio_id,status);
create index if not exists offers_agency_idx on public.offers(agency_id,created_at desc);

create or replace function public.dmh_create_reservation(
  p_offer_id uuid,
  p_payment_deadline timestamptz
) returns public.reservations
language plpgsql
security definer
set search_path=public
as $$
declare
  v_offer public.offers;
  v_reservation public.reservations;
begin
  if public.current_role() <> 'owner' then
    raise exception 'Owner access required';
  end if;

  select * into v_offer
  from public.offers
  where id=p_offer_id and company_id=public.current_company_id()
  for update;

  if not found then raise exception 'Offer not found'; end if;
  if v_offer.status not in ('submitted','owner_countered','buyer_countered','accepted') then
    raise exception 'Offer cannot be reserved from its current state';
  end if;

  update public.reservations set status='cancelled'
  where portfolio_id=v_offer.portfolio_id and status='active';

  insert into public.reservations(company_id,offer_id,portfolio_id,buyer_agency_id,amount,payment_deadline,status)
  values(v_offer.company_id,v_offer.id,v_offer.portfolio_id,v_offer.agency_id,v_offer.current_amount,p_payment_deadline,'active')
  on conflict(offer_id) do update set amount=excluded.amount,payment_deadline=excluded.payment_deadline,status='active'
  returning * into v_reservation;

  update public.offers set status='reserved',decision_at=now(),updated_at=now() where id=v_offer.id;
  update public.portfolios set status='reserved' where id=v_offer.portfolio_id;
  update public.portfolio_files set locked_at=coalesce(locked_at,now()) where portfolio_id=v_offer.portfolio_id;

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(v_offer.company_id,auth.uid(),'offer_reserved','offer',v_offer.id,to_jsonb(v_reservation));

  return v_reservation;
end;
$$;

grant execute on function public.dmh_create_reservation(uuid,timestamptz) to authenticated;

-- Employees may update only offers they originated; owner retains full update access.
drop policy if exists "employees update own offers" on public.offers;
create policy "employees update own offers" on public.offers for update
using(company_id=public.current_company_id() and employee_id=auth.uid() and status in ('submitted','buyer_countered'))
with check(company_id=public.current_company_id() and employee_id=auth.uid());
