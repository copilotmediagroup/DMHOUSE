-- DMH Sales OS v1.8.1 — Portfolio Outreach Campaign Engine
-- Run after 032_portfolio_matching_engine.sql

create table if not exists public.portfolio_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  name text not null,
  template_id uuid references public.email_templates(id) on delete set null,
  subject text not null default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','ready','active','paused','completed','cancelled')),
  max_recipients integer not null default 50 check (max_recipients between 1 and 500),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  launched_by uuid references public.profiles(id) on delete set null,
  launched_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.portfolio_outreach_campaigns(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid references public.agency_contacts(id) on delete set null,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  match_score numeric(5,2) not null default 0,
  recipient_email text,
  recipient_name text,
  personalized_subject text,
  personalized_body text,
  status text not null default 'selected' check (status in ('selected','assigned','queued','sent','delivered','opened','replied','interested','declined','negotiating','purchased','failed','suppressed')),
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  sent_at timestamptz,
  replied_at timestamptz,
  last_status_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, agency_id)
);

create table if not exists public.portfolio_campaign_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.portfolio_outreach_campaigns(id) on delete cascade,
  recipient_id uuid references public.portfolio_campaign_recipients(id) on delete cascade,
  event_type text not null,
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_company_status on public.portfolio_outreach_campaigns(company_id,status,created_at desc);
create index if not exists idx_campaign_recipients_campaign_status on public.portfolio_campaign_recipients(campaign_id,status);
create index if not exists idx_campaign_recipients_employee on public.portfolio_campaign_recipients(assigned_employee_id,status);
create index if not exists idx_campaign_recipients_agency_portfolio on public.portfolio_campaign_recipients(agency_id,portfolio_id);

alter table public.portfolio_outreach_campaigns enable row level security;
alter table public.portfolio_campaign_recipients enable row level security;
alter table public.portfolio_campaign_events enable row level security;

drop policy if exists campaign_company_access on public.portfolio_outreach_campaigns;
create policy campaign_company_access on public.portfolio_outreach_campaigns for all using (
  company_id = (select company_id from public.profiles where id = auth.uid())
) with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

drop policy if exists campaign_recipient_company_access on public.portfolio_campaign_recipients;
create policy campaign_recipient_company_access on public.portfolio_campaign_recipients for all using (
  company_id = (select company_id from public.profiles where id = auth.uid())
  and (
    (select role from public.profiles where id = auth.uid()) = 'owner'
    or assigned_employee_id = auth.uid()
  )
) with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
  and (
    (select role from public.profiles where id = auth.uid()) = 'owner'
    or assigned_employee_id = auth.uid()
  )
);

drop policy if exists campaign_event_company_access on public.portfolio_campaign_events;
create policy campaign_event_company_access on public.portfolio_campaign_events for all using (
  company_id = (select company_id from public.profiles where id = auth.uid())
) with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create or replace function public.dmh_campaign_duplicate_check(
  p_portfolio_id uuid,
  p_agency_id uuid,
  p_exclude_campaign_id uuid default null
) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.portfolio_campaign_recipients r
    join public.portfolio_outreach_campaigns c on c.id=r.campaign_id
    where r.company_id=(select company_id from public.profiles where id=auth.uid())
      and r.portfolio_id=p_portfolio_id
      and r.agency_id=p_agency_id
      and (p_exclude_campaign_id is null or r.campaign_id<>p_exclude_campaign_id)
      and c.status not in ('cancelled')
      and r.status not in ('declined','failed','suppressed')
  );
$$;

grant execute on function public.dmh_campaign_duplicate_check(uuid,uuid,uuid) to authenticated;

create or replace function public.dmh_campaign_dashboard()
returns table(
  campaign_id uuid,
  campaign_name text,
  portfolio_id uuid,
  campaign_status text,
  selected_count bigint,
  sent_count bigint,
  delivered_count bigint,
  reply_count bigint,
  interested_count bigint,
  negotiating_count bigint,
  purchased_count bigint
)
language sql stable security definer set search_path=public as $$
  select c.id,c.name,c.portfolio_id,c.status,
    count(r.id) filter (where r.status in ('selected','assigned','queued')),
    count(r.id) filter (where r.status in ('sent','delivered','opened','replied','interested','negotiating','purchased')),
    count(r.id) filter (where r.status in ('delivered','opened','replied','interested','negotiating','purchased')),
    count(r.id) filter (where r.status in ('replied','interested','negotiating','purchased')),
    count(r.id) filter (where r.status in ('interested','negotiating','purchased')),
    count(r.id) filter (where r.status in ('negotiating','purchased')),
    count(r.id) filter (where r.status='purchased')
  from public.portfolio_outreach_campaigns c
  left join public.portfolio_campaign_recipients r on r.campaign_id=c.id
  where c.company_id=(select company_id from public.profiles where id=auth.uid())
  group by c.id,c.name,c.portfolio_id,c.status,c.created_at
  order by c.created_at desc;
$$;

grant execute on function public.dmh_campaign_dashboard() to authenticated;
