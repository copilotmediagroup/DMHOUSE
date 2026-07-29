-- DMH Sales OS v2.3.1
-- Owner Approval & Exception Control Engine

create table if not exists public.owner_approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  request_type text not null check (request_type in (
    'below_floor_offer','discount_exception','marketing_override','as_is_override',
    'deal_reassignment','commission_exception','buyer_suppression_removal',
    'funding_extension','closing_document_exception','high_value_campaign',
    'reservation_extension','other'
  )),
  status text not null default 'pending' check (status in ('pending','approved','rejected','returned','expired','cancelled','executed')),
  title text not null,
  reason text not null,
  recommendation text not null default '',
  entity_type text not null default 'general',
  entity_id uuid,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  agency_id uuid,
  deal_id uuid,
  requested_by uuid not null,
  reviewed_by uuid,
  assigned_employee_id uuid,
  original_value numeric(16,2),
  requested_value numeric(16,2),
  approved_value numeric(16,2),
  financial_impact numeric(16,2),
  supporting_notes text not null default '',
  owner_notes text not null default '',
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_approval_requests_company_status_idx on public.owner_approval_requests(company_id,status,created_at desc);
create index if not exists owner_approval_requests_requested_by_idx on public.owner_approval_requests(requested_by,status,created_at desc);
create index if not exists owner_approval_requests_portfolio_idx on public.owner_approval_requests(portfolio_id,created_at desc);

create table if not exists public.owner_approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  approval_request_id uuid not null references public.owner_approval_requests(id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  from_status text,
  to_status text,
  note text not null default '',
  original_value numeric(16,2),
  resulting_value numeric(16,2),
  created_at timestamptz not null default now()
);
create index if not exists owner_approval_events_request_idx on public.owner_approval_events(approval_request_id,created_at desc);

alter table public.owner_approval_requests enable row level security;
alter table public.owner_approval_events enable row level security;

drop policy if exists owner_approval_requests_company_read on public.owner_approval_requests;
create policy owner_approval_requests_company_read on public.owner_approval_requests
for select using (company_id in (select company_id from public.profiles where id=auth.uid()));

drop policy if exists owner_approval_requests_company_insert on public.owner_approval_requests;
create policy owner_approval_requests_company_insert on public.owner_approval_requests
for insert with check (
  requested_by=auth.uid() and company_id in (select company_id from public.profiles where id=auth.uid() and is_active=true)
);

drop policy if exists owner_approval_requests_owner_update on public.owner_approval_requests;
create policy owner_approval_requests_owner_update on public.owner_approval_requests
for update using (company_id in (select company_id from public.profiles where id=auth.uid() and role='owner' and is_active=true));

drop policy if exists owner_approval_events_company_read on public.owner_approval_events;
create policy owner_approval_events_company_read on public.owner_approval_events
for select using (company_id in (select company_id from public.profiles where id=auth.uid()));

drop policy if exists owner_approval_events_company_insert on public.owner_approval_events;
create policy owner_approval_events_company_insert on public.owner_approval_events
for insert with check (actor_id=auth.uid() and company_id in (select company_id from public.profiles where id=auth.uid() and is_active=true));

create or replace function public.dmh_touch_owner_approval_request()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_touch_owner_approval_request on public.owner_approval_requests;
create trigger trg_touch_owner_approval_request before update on public.owner_approval_requests
for each row execute function public.dmh_touch_owner_approval_request();

create or replace function public.dmh_decide_owner_approval(
  p_request_id uuid,
  p_decision text,
  p_owner_notes text default '',
  p_approved_value numeric default null
) returns public.owner_approval_requests
language plpgsql security definer set search_path=public as $$
declare
  v_request public.owner_approval_requests;
  v_role text;
begin
  select role into v_role from public.profiles where id=auth.uid() and is_active=true;
  if v_role is distinct from 'owner' then raise exception 'Owner access required.'; end if;
  if p_decision not in ('approved','rejected','returned','cancelled','executed') then raise exception 'Invalid approval decision.'; end if;
  select * into v_request from public.owner_approval_requests where id=p_request_id for update;
  if not found then raise exception 'Approval request not found.'; end if;
  if v_request.company_id not in (select company_id from public.profiles where id=auth.uid()) then raise exception 'Access denied.'; end if;
  if v_request.status not in ('pending','approved','returned') then raise exception 'This request can no longer be changed.'; end if;

  update public.owner_approval_requests set
    status=p_decision,
    reviewed_by=auth.uid(),
    owner_notes=coalesce(p_owner_notes,''),
    approved_value=coalesce(p_approved_value,approved_value,requested_value),
    decided_at=case when p_decision in ('approved','rejected','returned','cancelled') then now() else decided_at end,
    executed_at=case when p_decision='executed' then now() else executed_at end
  where id=p_request_id returning * into v_request;

  insert into public.owner_approval_events(company_id,approval_request_id,actor_id,action,from_status,to_status,note,original_value,resulting_value)
  values(v_request.company_id,v_request.id,auth.uid(),'owner_decision',null,p_decision,coalesce(p_owner_notes,''),v_request.original_value,v_request.approved_value);
  return v_request;
end $$;

grant execute on function public.dmh_decide_owner_approval(uuid,text,text,numeric) to authenticated;

create or replace function public.dmh_expire_owner_approvals()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.owner_approval_requests set status='expired'
  where status='pending' and expires_at is not null and expires_at<now();
  get diagnostics v_count=row_count;
  return v_count;
end $$;
grant execute on function public.dmh_expire_owner_approvals() to authenticated;
