-- DMH Sales OS v0.8.0 — Live Outreach & Follow-Up Engine
-- Idempotent and aligned to the verified 001 + 008 live schema.

alter table public.outreach_activities add column if not exists subject text;
alter table public.outreach_activities add column if not exists template_id uuid;
alter table public.outreach_activities add column if not exists delivery_status text;
alter table public.follow_ups add column if not exists source_activity_id uuid references public.outreach_activities(id) on delete set null;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "company templates readable" on public.email_templates;
drop policy if exists "owners manage templates" on public.email_templates;
create policy "company templates readable" on public.email_templates
for select using (company_id = public.current_company_id());
create policy "owners manage templates" on public.email_templates
for all using (company_id = public.current_company_id() and public.current_role() = 'owner')
with check (company_id = public.current_company_id() and public.current_role() = 'owner');

create index if not exists outreach_company_employee_date_idx
  on public.outreach_activities(company_id, employee_id, occurred_at desc);
create index if not exists outreach_open_follow_up_idx
  on public.outreach_activities(company_id, follow_up_at)
  where follow_up_at is not null and completed_at is null;
create unique index if not exists follow_ups_source_activity_unique_idx
  on public.follow_ups(source_activity_id)
  where source_activity_id is not null;
create index if not exists follow_ups_employee_due_idx
  on public.follow_ups(company_id, employee_id, due_at)
  where completed_at is null;

-- Seed approved company templates only when the company has none.
insert into public.email_templates(company_id, name, subject, body, active)
select c.id,
       'Initial portfolio introduction',
       'Charged-off portfolio opportunity',
       E'Hello,\n\nData Market House currently has a charged-off portfolio available for review. I can send a masked sample and summary if this fits your acquisition criteria.\n\nBest,\n{{employee_name}}',
       true
from public.companies c
where not exists (select 1 from public.email_templates t where t.company_id = c.id);

insert into public.email_templates(company_id, name, subject, body, active)
select c.id,
       'Sample follow-up',
       'Following up on the masked portfolio sample',
       E'Hello,\n\nI am following up on the masked sample sent for {{portfolio_name}}. Please let me know whether you would like to discuss pricing or documentation.\n\nBest,\n{{employee_name}}',
       true
from public.companies c
where not exists (
  select 1 from public.email_templates t
  where t.company_id = c.id and t.name = 'Sample follow-up'
);

-- Backfill canonical follow-up rows from live outreach activity without duplicating records.
insert into public.follow_ups(company_id, agency_id, employee_id, due_at, reason, completed_at, source_activity_id)
select oa.company_id, oa.agency_id, oa.employee_id, oa.follow_up_at,
       coalesce(nullif(oa.notes, ''), nullif(oa.disposition, ''), 'Follow up'),
       oa.completed_at, oa.id
from public.outreach_activities oa
where oa.follow_up_at is not null
  and not exists (select 1 from public.follow_ups f where f.source_activity_id = oa.id);
