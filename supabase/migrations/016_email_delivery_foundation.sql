-- DMH Sales OS v1.2.0 — Email Delivery Foundation
-- Adds honest provider-backed delivery state, idempotency, test mode and failure tracking.

alter table public.portfolio_distributions
  add column if not exists delivery_mode text not null default 'manual',
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists send_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists test_mode boolean not null default true,
  add column if not exists idempotency_key text,
  add column if not exists subject text;

alter table public.portfolio_distributions drop constraint if exists portfolio_distributions_status_check;
alter table public.portfolio_distributions
  add constraint portfolio_distributions_status_check
  check (status in ('prepared','queued','sent','delivered','failed','bounced','downloaded','locked'));

alter table public.portfolio_distributions drop constraint if exists portfolio_distributions_delivery_mode_check;
alter table public.portfolio_distributions
  add constraint portfolio_distributions_delivery_mode_check
  check (delivery_mode in ('manual','provider'));

create unique index if not exists portfolio_distributions_idempotency_idx
  on public.portfolio_distributions(idempotency_key)
  where idempotency_key is not null;

create index if not exists portfolio_distributions_delivery_failure_idx
  on public.portfolio_distributions(company_id, status, last_attempt_at desc)
  where status in ('failed','bounced');

create or replace function public.dmh_prepare_email_delivery(
  p_distribution_id uuid,
  p_subject text,
  p_test_mode boolean default true
) returns public.portfolio_distributions
language plpgsql security definer set search_path=public as $$
declare
  v_row public.portfolio_distributions;
begin
  select * into v_row from public.portfolio_distributions
  where id=p_distribution_id and company_id=public.current_company_id()
  for update;
  if not found then raise exception 'Distribution not found.'; end if;
  if v_row.employee_id <> auth.uid() and public.current_role() <> 'owner' then raise exception 'Not authorized.'; end if;
  if v_row.delivery_method <> 'email' then raise exception 'This distribution is not an email delivery.'; end if;
  if v_row.status not in ('prepared','failed') then raise exception 'This distribution cannot be sent from its current state.'; end if;
  update public.portfolio_distributions set
    delivery_mode='provider', subject=trim(p_subject), test_mode=p_test_mode,
    status='queued', provider='resend', failure_reason=null, failed_at=null,
    idempotency_key=coalesce(idempotency_key, id::text || ':' || extract(epoch from created_at)::bigint::text),
    last_attempt_at=now(), send_attempts=send_attempts+1
  where id=p_distribution_id returning * into v_row;
  return v_row;
end $$;

grant execute on function public.dmh_prepare_email_delivery(uuid,text,boolean) to authenticated;
