-- DMH Sales OS v1.8.2 — Campaign Reply Intelligence Engine
-- Run after 033_portfolio_outreach_campaign_engine.sql

alter table public.portfolio_campaign_recipients
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists reply_category text,
  add column if not exists reply_summary text,
  add column if not exists reply_requires_owner boolean not null default false,
  add column if not exists reply_action_status text not null default 'none',
  add column if not exists reply_actioned_at timestamptz,
  add column if not exists reply_actioned_by uuid references public.profiles(id) on delete set null,
  add column if not exists decline_reason text,
  add column if not exists latest_inbound_message_id uuid references public.conversation_messages(id) on delete set null;

alter table public.portfolio_campaign_recipients drop constraint if exists portfolio_campaign_recipients_reply_category_check;
alter table public.portfolio_campaign_recipients add constraint portfolio_campaign_recipients_reply_category_check
check (reply_category is null or reply_category in ('general_reply','price_request','interested','offer','declined','documents','unmatched'));

alter table public.portfolio_campaign_recipients drop constraint if exists portfolio_campaign_recipients_reply_action_status_check;
alter table public.portfolio_campaign_recipients add constraint portfolio_campaign_recipients_reply_action_status_check
check (reply_action_status in ('none','new','employee_action','owner_review','completed'));

create table if not exists public.campaign_reply_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid references public.portfolio_outreach_campaigns(id) on delete cascade,
  recipient_id uuid references public.portfolio_campaign_recipients(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.conversation_messages(id) on delete set null,
  agency_id uuid references public.agencies(id) on delete set null,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  category text not null default 'general_reply',
  summary text,
  requires_owner boolean not null default false,
  action_status text not null default 'new',
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  actioned_by uuid references public.profiles(id) on delete set null,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_reply_events_company_status on public.campaign_reply_events(company_id,action_status,created_at desc);
create index if not exists idx_campaign_reply_events_employee on public.campaign_reply_events(assigned_employee_id,action_status,created_at desc);
create index if not exists idx_campaign_reply_events_campaign on public.campaign_reply_events(campaign_id,created_at desc);
create index if not exists idx_campaign_recipients_reply_queue on public.portfolio_campaign_recipients(company_id,reply_action_status,replied_at desc);

alter table public.campaign_reply_events enable row level security;
drop policy if exists campaign_reply_event_access on public.campaign_reply_events;
create policy campaign_reply_event_access on public.campaign_reply_events for all using (
  company_id=(select company_id from public.profiles where id=auth.uid())
  and ((select role from public.profiles where id=auth.uid())='owner' or assigned_employee_id=auth.uid())
) with check (
  company_id=(select company_id from public.profiles where id=auth.uid())
  and ((select role from public.profiles where id=auth.uid())='owner' or assigned_employee_id=auth.uid())
);

create or replace function public.dmh_classify_campaign_reply(p_subject text,p_body text)
returns text language plpgsql immutable as $$
declare t text:=lower(coalesce(p_subject,'')||' '||coalesce(p_body,''));
begin
  if t ~ '(not interested|pass on|remove me|do not contact|no thank)' then return 'declined'; end if;
  if t ~ '(offer|bid|pay |pay\$|\$[0-9]|counter)' then return 'offer'; end if;
  if t ~ '(price|pricing|asking|cost|how much)' then return 'price_request'; end if;
  if t ~ '(interested|send details|send over|review|take a look)' then return 'interested'; end if;
  if t ~ '(nda|purchase agreement|contract|wire|documents|data file)' then return 'documents'; end if;
  return 'general_reply';
end;$$;

grant execute on function public.dmh_classify_campaign_reply(text,text) to authenticated,service_role;

create or replace function public.dmh_action_campaign_reply(
  p_reply_event_id uuid,
  p_action text,
  p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare e public.campaign_reply_events; new_status text; new_recipient_status text;
begin
  select * into e from public.campaign_reply_events where id=p_reply_event_id and company_id=(select company_id from public.profiles where id=auth.uid());
  if e.id is null then raise exception 'Reply event not found.'; end if;
  if (select role from public.profiles where id=auth.uid())<>'owner' and e.assigned_employee_id<>auth.uid() then raise exception 'Not authorized.'; end if;
  new_status:=case when p_action='escalate_owner' then 'owner_review' else 'completed' end;
  new_recipient_status:=case p_action when 'mark_interested' then 'interested' when 'record_offer' then 'negotiating' when 'mark_declined' then 'declined' else null end;
  update public.campaign_reply_events set action_status=new_status,actioned_by=auth.uid(),actioned_at=now(),summary=coalesce(nullif(p_note,''),summary) where id=e.id;
  if e.recipient_id is not null then
    update public.portfolio_campaign_recipients set
      status=coalesce(new_recipient_status,status),
      reply_action_status=new_status,
      reply_actioned_by=auth.uid(),reply_actioned_at=now(),
      decline_reason=case when p_action='mark_declined' then nullif(p_note,'') else decline_reason end,
      notes=case when nullif(p_note,'') is not null then concat_ws(E'\n',notes,p_note) else notes end,
      updated_at=now()
    where id=e.recipient_id;
  end if;
  if e.conversation_id is not null and p_action in ('mark_interested','record_offer','escalate_owner') then
    update public.conversations set follow_up_priority='high',status=case when p_action='record_offer' then 'negotiating' else status end,updated_at=now() where id=e.conversation_id;
  end if;
end;$$;

grant execute on function public.dmh_action_campaign_reply(uuid,text,text) to authenticated;

create or replace function public.dmh_campaign_reply_dashboard()
returns table(
  new_replies bigint, interested bigint, price_requests bigint, offers bigint,
  employee_action bigint, owner_review bigint, unmatched bigint
) language sql stable security definer set search_path=public as $$
 select
  count(*) filter(where action_status='new'),
  count(*) filter(where category='interested' and action_status<>'completed'),
  count(*) filter(where category='price_request' and action_status<>'completed'),
  count(*) filter(where category='offer' and action_status<>'completed'),
  count(*) filter(where action_status='employee_action'),
  count(*) filter(where action_status='owner_review'),
  count(*) filter(where recipient_id is null and action_status<>'completed')
 from public.campaign_reply_events
 where company_id=(select company_id from public.profiles where id=auth.uid());
$$;

grant execute on function public.dmh_campaign_reply_dashboard() to authenticated;
