-- DMH Sales OS v1.5.0 — Integrated Outreach Engine
-- Provider-ready email delivery, message tracking, webhook events, template controls, and call sync foundation.

alter table public.email_templates
  add column if not exists active boolean not null default true,
  add column if not exists allowed_roles text[] not null default array['employee','owner']::text[],
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'email_templates'
      and column_name = 'is_active'
  ) then
    execute 'update public.email_templates set active = coalesce(is_active, true) where active is distinct from coalesce(is_active, true)';
  end if;
end $$;

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid references public.agency_contacts(id) on delete set null,
  employee_id uuid not null references public.profiles(id),
  portfolio_id uuid references public.portfolios(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  channel text not null check (channel in ('email','phone')),
  recipient text not null,
  normalized_recipient text not null,
  subject text,
  body text,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','opened','clicked','replied','soft_bounced','hard_bounced','failed','canceled')),
  provider text,
  provider_message_id text,
  provider_event_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_messages_company_created_idx on public.outreach_messages(company_id,created_at desc);
create index if not exists outreach_messages_agency_idx on public.outreach_messages(agency_id,created_at desc);
create unique index if not exists outreach_messages_provider_message_uq on public.outreach_messages(company_id,provider_message_id) where provider_message_id is not null;

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_id uuid references public.outreach_messages(id) on delete cascade,
  provider text,
  provider_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists outreach_events_provider_uq on public.outreach_events(company_id,provider_event_id) where provider_event_id is not null;

create table if not exists public.call_provider_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  contact_id uuid references public.agency_contacts(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  provider_call_id text not null,
  direction text,
  from_number text,
  to_number text,
  status text,
  duration_seconds integer,
  started_at timestamptz,
  ended_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id,provider,provider_call_id)
);

alter table public.outreach_messages enable row level security;
alter table public.outreach_events enable row level security;
alter table public.call_provider_events enable row level security;

drop policy if exists "company reads outreach messages" on public.outreach_messages;
create policy "company reads outreach messages" on public.outreach_messages for select
using (company_id = public.current_company_id());
drop policy if exists "company inserts own outreach messages" on public.outreach_messages;
create policy "company inserts own outreach messages" on public.outreach_messages for insert
with check (company_id = public.current_company_id() and employee_id = auth.uid());
drop policy if exists "owner manages outreach messages" on public.outreach_messages;
create policy "owner manages outreach messages" on public.outreach_messages for update
using (company_id = public.current_company_id() and (employee_id=auth.uid() or public.current_role()='owner'));
drop policy if exists "company reads outreach events" on public.outreach_events;
create policy "company reads outreach events" on public.outreach_events for select using (company_id=public.current_company_id());
drop policy if exists "company reads call events" on public.call_provider_events;
create policy "company reads call events" on public.call_provider_events for select using (company_id=public.current_company_id());

create or replace function public.dmh_queue_outreach_email(
  p_agency_id uuid,
  p_contact_id uuid,
  p_portfolio_id uuid,
  p_template_id uuid,
  p_recipient text,
  p_subject text,
  p_body text,
  p_follow_up_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_id uuid; v_norm text; v_check record; v_activity uuid;
begin
  select company_id into v_company from profiles where id=auth.uid() and is_active=true;
  if v_company is null then raise exception 'Active company membership required.'; end if;
  v_norm:=dmh_normalize_email(p_recipient);
  if v_norm='' then raise exception 'A valid recipient email is required.'; end if;
  select * into v_check from dmh_contact_eligibility('email',p_recipient,p_agency_id);
  if not v_check.allowed then raise exception 'CONTACT_PROTECTED|%|%|%',coalesce(v_check.reason,''),coalesce(v_check.contacted_by_name,''),coalesce(v_check.suppressed_until::text,''); end if;
  insert into outreach_messages(company_id,agency_id,contact_id,employee_id,portfolio_id,template_id,channel,recipient,normalized_recipient,subject,body,status)
  values(v_company,p_agency_id,p_contact_id,auth.uid(),p_portfolio_id,p_template_id,'email',p_recipient,v_norm,p_subject,p_body,'queued') returning id into v_id;
  insert into outreach_activities(company_id,agency_id,contact_id,employee_id,activity_type,disposition,notes,subject,follow_up_at,email_template_id)
  values(v_company,p_agency_id,p_contact_id,auth.uid(),'email','Email queued','Queued for provider delivery',p_subject,p_follow_up_at,p_template_id) returning id into v_activity;
  if p_follow_up_at is not null then
    insert into follow_ups(company_id,agency_id,employee_id,due_at,reason,source_activity_id)
    values(v_company,p_agency_id,auth.uid(),p_follow_up_at,'Follow up on sent email',v_activity);
  end if;
  return v_id;
end $$;
grant execute on function public.dmh_queue_outreach_email(uuid,uuid,uuid,uuid,text,text,text,timestamptz) to authenticated;

create or replace function public.dmh_apply_outreach_event(
  p_provider text,p_provider_message_id text,p_provider_event_id text,p_event_type text,p_payload jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_msg outreach_messages; v_status text; v_now timestamptz:=now();
begin
  select * into v_msg from outreach_messages where provider_message_id=p_provider_message_id limit 1;
  if v_msg.id is null then return; end if;
  if p_provider_event_id is not null and exists(select 1 from outreach_events where company_id=v_msg.company_id and provider_event_id=p_provider_event_id) then return; end if;
  v_status:=case lower(p_event_type)
    when 'email.sent' then 'sent' when 'sent' then 'sent'
    when 'email.delivered' then 'delivered' when 'delivered' then 'delivered'
    when 'email.opened' then 'opened' when 'opened' then 'opened'
    when 'email.clicked' then 'clicked' when 'clicked' then 'clicked'
    when 'email.replied' then 'replied' when 'replied' then 'replied'
    when 'email.bounced' then case when lower(coalesce(p_payload->>'bounce_type','hard'))='soft' then 'soft_bounced' else 'hard_bounced' end
    when 'bounced' then case when lower(coalesce(p_payload->>'bounce_type','hard'))='soft' then 'soft_bounced' else 'hard_bounced' end
    else 'failed' end;
  insert into outreach_events(company_id,message_id,provider,provider_event_id,event_type,payload,occurred_at)
  values(v_msg.company_id,v_msg.id,p_provider,p_provider_event_id,p_event_type,coalesce(p_payload,'{}'::jsonb),v_now);
  update outreach_messages set status=v_status,updated_at=v_now,
    sent_at=case when v_status='sent' then coalesce(sent_at,v_now) else sent_at end,
    delivered_at=case when v_status='delivered' then coalesce(delivered_at,v_now) else delivered_at end,
    opened_at=case when v_status='opened' then coalesce(opened_at,v_now) else opened_at end,
    clicked_at=case when v_status='clicked' then coalesce(clicked_at,v_now) else clicked_at end,
    replied_at=case when v_status='replied' then coalesce(replied_at,v_now) else replied_at end,
    bounced_at=case when v_status in ('soft_bounced','hard_bounced') then coalesce(bounced_at,v_now) else bounced_at end
  where id=v_msg.id;
  if v_status in ('sent','soft_bounced','hard_bounced') then
    insert into contact_suppression_ledger(company_id,agency_id,contact_id,channel,normalized_value,contacted_by,outcome,suppressed_until,source,provider_event_id)
    values(v_msg.company_id,v_msg.agency_id,v_msg.contact_id,'email',v_msg.normalized_recipient,v_msg.employee_id,
      case when v_status='hard_bounced' then 'Hard bounce' when v_status='soft_bounced' then 'Soft bounce' else 'Email sent' end,
      now()+interval '30 days','provider',p_provider_event_id)
    on conflict do nothing;
  end if;
  if v_status in ('soft_bounced','hard_bounced') then
    if v_msg.contact_id is not null then
      update agency_contacts set email_bounce_count=email_bounce_count+1,email_last_bounced_at=v_now,
        email_bounce_type=case when v_status='hard_bounced' then 'hard' else 'soft' end,
        email_status=case when v_status='hard_bounced' or email_bounce_count+1>=3 then 'bounced' else email_status end,
        updated_at=v_now,updated_by=v_msg.employee_id where id=v_msg.contact_id;
    else
      update agencies set email_bounce_count=email_bounce_count+1,email_last_bounced_at=v_now,
        email_bounce_type=case when v_status='hard_bounced' then 'hard' else 'soft' end,
        general_email_status=case when v_status='hard_bounced' or email_bounce_count+1>=3 then 'bounced' else general_email_status end
      where id=v_msg.agency_id;
    end if;
  end if;
end $$;

create or replace view public.outreach_command_stats as
select company_id,
 count(*) filter(where channel='email' and created_at::date=current_date) as emails_today,
 count(*) filter(where status in ('sent','delivered','opened','clicked','replied')) as sent_total,
 count(*) filter(where status='delivered') as delivered_total,
 count(*) filter(where status='opened') as opened_total,
 count(*) filter(where status='clicked') as clicked_total,
 count(*) filter(where status='replied') as replied_total,
 count(*) filter(where status='hard_bounced') as hard_bounces,
 count(*) filter(where status='soft_bounced') as soft_bounces,
 count(*) filter(where status='failed') as failed_total
from outreach_messages group by company_id;
grant select on public.outreach_command_stats to authenticated;
