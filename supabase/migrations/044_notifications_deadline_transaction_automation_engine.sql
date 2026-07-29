-- DMH Sales OS v2.6.1
-- Notifications, Deadline Alerts & Transaction Automation Engine

alter table public.notifications add column if not exists severity text not null default 'info';
alter table public.notifications add column if not exists due_at timestamptz;
alter table public.notifications add column if not exists entity_type text;
alter table public.notifications add column if not exists entity_id uuid;
alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications add column if not exists resolved_at timestamptz;
create unique index if not exists idx_notifications_dedupe on public.notifications(user_id,dedupe_key) where dedupe_key is not null and resolved_at is null;
create index if not exists idx_notifications_user_open on public.notifications(user_id,read_at,created_at desc);

create table if not exists public.transaction_automation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  nda_reminder_hours integer not null default 24,
  agreement_reminder_hours integer not null default 24,
  reservation_warning_hours integer not null default 48,
  payment_warning_days integer not null default 3,
  owner_escalation_enabled boolean not null default true,
  buyer_alerts_enabled boolean not null default true,
  employee_alerts_enabled boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_automation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  user_id uuid,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_transaction_automation_events_company on public.transaction_automation_events(company_id,created_at desc);

alter table public.transaction_automation_settings enable row level security;
alter table public.transaction_automation_events enable row level security;

drop policy if exists transaction_settings_owner on public.transaction_automation_settings;
create policy transaction_settings_owner on public.transaction_automation_settings for all to authenticated
using (company_id=public.current_company_id() and public.current_role()='owner')
with check (company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists transaction_events_owner on public.transaction_automation_events;
create policy transaction_events_owner on public.transaction_automation_events for select to authenticated
using (company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_emit_transaction_notification(
  p_company_id uuid,p_user_id uuid,p_type text,p_title text,p_body text,p_action_path text,
  p_severity text,p_due_at timestamptz,p_entity_type text,p_entity_id uuid,p_dedupe_key text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into notifications(company_id,user_id,type,title,body,action_path,severity,due_at,entity_type,entity_id,dedupe_key)
  values(p_company_id,p_user_id,p_type,p_title,p_body,p_action_path,coalesce(p_severity,'info'),p_due_at,p_entity_type,p_entity_id,p_dedupe_key)
  on conflict (user_id,dedupe_key) where dedupe_key is not null and resolved_at is null
  do update set title=excluded.title,body=excluded.body,action_path=excluded.action_path,severity=excluded.severity,due_at=excluded.due_at,created_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.dmh_run_transaction_automation() returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_profile profiles%rowtype; v_settings transaction_automation_settings%rowtype; v_owner uuid;
  v_created integer:=0; r record;
begin
  select * into v_profile from profiles where id=auth.uid();
  if v_profile.role not in ('owner','employee') then raise exception 'Staff access required'; end if;
  insert into transaction_automation_settings(company_id,updated_by) values(v_profile.company_id,auth.uid()) on conflict(company_id) do nothing;
  select * into v_settings from transaction_automation_settings where company_id=v_profile.company_id;
  select id into v_owner from profiles where company_id=v_profile.company_id and role='owner' and is_active=true order by created_at limit 1;

  -- Documents awaiting buyer signature.
  for r in select d.*,coalesce(d.created_by,v_owner) staff_id from deal_documents_generated d
    where d.company_id=v_profile.company_id and d.status='sent_to_buyer' and d.sent_at <= now()-(v_settings.nda_reminder_hours||' hours')::interval
  loop
    if v_settings.employee_alerts_enabled then perform dmh_emit_transaction_notification(r.company_id,r.staff_id,'document_signature',case when r.document_type='nda' then 'NDA awaiting buyer signature' else 'Purchase agreement awaiting buyer signature' end,r.title||' has not been signed by the buyer.','/employee/documents','warning',r.sent_at+(v_settings.nda_reminder_hours||' hours')::interval,'document',r.id,'doc-waiting-staff-'||r.id);v_created:=v_created+1; end if;
    if v_settings.buyer_alerts_enabled and r.buyer_id is not null then perform dmh_emit_transaction_notification(r.company_id,(select user_id from buyer_profiles where id=r.buyer_id),'signature_required','Document ready for your signature','Review and sign '||r.title||'.','/buyer/portfolio/'||coalesce(r.portfolio_id::text,'' )||'/documents','warning',now(), 'document',r.id,'doc-waiting-buyer-'||r.id);v_created:=v_created+1; end if;
  end loop;

  -- Fully executed documents ready for next stage.
  for r in select d.*,coalesce(d.created_by,v_owner) staff_id from deal_documents_generated d where d.company_id=v_profile.company_id and d.status='fully_executed'
  loop
    perform dmh_emit_transaction_notification(r.company_id,r.staff_id,'document_executed',case when r.document_type='nda' then 'NDA fully executed' else 'Purchase agreement fully executed' end,r.title||' is signed by both parties.','/employee/documents','success',null,'document',r.id,'doc-executed-'||r.id);v_created:=v_created+1;
    if v_owner is not null then perform dmh_emit_transaction_notification(r.company_id,v_owner,'document_executed','Executed document ready for review',r.title||' completed the signature stage.','/buyers/portfolio/'||coalesce(r.portfolio_id::text,''),'success',null,'document',r.id,'owner-doc-executed-'||r.id);v_created:=v_created+1; end if;
  end loop;

  -- Reservation deadlines.
  for r in select rs.*,p.name portfolio_name from reservations rs join portfolios p on p.id=rs.portfolio_id
    where rs.company_id=v_profile.company_id and rs.status='active' and rs.expires_at is not null and rs.expires_at <= now()+(v_settings.reservation_warning_hours||' hours')::interval
  loop
    if v_owner is not null then perform dmh_emit_transaction_notification(r.company_id,v_owner,'reservation_deadline','Reservation nearing expiration',r.portfolio_name||' expires '||to_char(r.expires_at,'Mon DD at HH12:MI AM')||'.','/closings',case when r.expires_at<=now() then 'critical' else 'warning' end,r.expires_at,'reservation',r.id,'reservation-'||r.id);v_created:=v_created+1; end if;
    if r.expires_at<=now() then update reservations set status='expired' where id=r.id and status='active'; insert into transaction_automation_events(company_id,event_type,entity_type,entity_id,title) values(r.company_id,'reservation_expired','reservation',r.id,'Reservation expired automatically'); end if;
  end loop;

  -- Payment deadlines.
  update deal_payment_requests set status='overdue' where company_id=v_profile.company_id and status='issued' and due_at<now();
  for r in select pr.*,p.name portfolio_name from deal_payment_requests pr left join portfolios p on p.id=pr.portfolio_id
    where pr.company_id=v_profile.company_id and pr.status in ('issued','overdue') and pr.due_at is not null and pr.due_at<=now()+(v_settings.payment_warning_days||' days')::interval
  loop
    if v_owner is not null then perform dmh_emit_transaction_notification(r.company_id,v_owner,'payment_deadline',case when r.status='overdue' then 'Payment overdue' else 'Payment due soon' end,coalesce(r.portfolio_name,'Deal')||' payment of '||to_char(r.amount,'FM$999,999,999,990.00')||' is '||case when r.status='overdue' then 'overdue.' else 'approaching.' end,'/closings',case when r.status='overdue' then 'critical' else 'warning' end,r.due_at,'payment_request',r.id,'payment-owner-'||r.id);v_created:=v_created+1; end if;
    if v_settings.buyer_alerts_enabled and r.buyer_id is not null then perform dmh_emit_transaction_notification(r.company_id,(select user_id from buyer_profiles where id=r.buyer_id),'payment_deadline',case when r.status='overdue' then 'Payment overdue' else 'Payment due soon' end,'Payment of '||to_char(r.amount,'FM$999,999,999,990.00')||' is due '||to_char(r.due_at,'Mon DD, YYYY')||'.','/buyer/portfolio/'||coalesce(r.portfolio_id::text,''),case when r.status='overdue' then 'critical' else 'warning' end,r.due_at,'payment_request',r.id,'payment-buyer-'||r.id);v_created:=v_created+1; end if;
  end loop;

  insert into transaction_automation_events(company_id,event_type,entity_type,title,details,user_id) values(v_profile.company_id,'automation_run','system','Transaction automation completed',jsonb_build_object('notifications_processed',v_created),auth.uid());
  return jsonb_build_object('notifications_processed',v_created,'ran_at',now());
end $$;

create or replace function public.dmh_transaction_command_center() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_role text;
begin
 select company_id,role::text into v_company,v_role from profiles where id=auth.uid();
 if v_role<>'owner' then raise exception 'Owner access required'; end if;
 return jsonb_build_object(
  'nda_waiting',(select count(*) from deal_documents_generated where company_id=v_company and document_type='nda' and status='sent_to_buyer'),
  'agreements_waiting',(select count(*) from deal_documents_generated where company_id=v_company and document_type='purchase_agreement' and status in ('draft','seller_signed','sent_to_buyer')),
  'payments_due',(select count(*) from deal_payment_requests where company_id=v_company and status='issued' and due_at<=now()+interval '3 days'),
  'payments_overdue',(select count(*) from deal_payment_requests where company_id=v_company and status='overdue'),
  'reservations_expiring',(select count(*) from reservations where company_id=v_company and status='active' and expires_at<=now()+interval '48 hours'),
  'final_release_ready',(select count(*) from buyer_deal_rooms where company_id=v_company and status='release_ready'),
  'unread_alerts',(select count(*) from notifications where company_id=v_company and user_id=auth.uid() and read_at is null),
  'settings',(select to_jsonb(s) from transaction_automation_settings s where s.company_id=v_company)
 );
end $$;

create or replace function public.dmh_set_transaction_automation_settings(p_nda_hours integer,p_agreement_hours integer,p_reservation_hours integer,p_payment_days integer,p_owner_escalation boolean,p_buyer_alerts boolean,p_employee_alerts boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v profiles%rowtype; begin select * into v from profiles where id=auth.uid(); if v.role<>'owner' then raise exception 'Owner access required'; end if;
insert into transaction_automation_settings(company_id,nda_reminder_hours,agreement_reminder_hours,reservation_warning_hours,payment_warning_days,owner_escalation_enabled,buyer_alerts_enabled,employee_alerts_enabled,updated_by,updated_at)
values(v.company_id,p_nda_hours,p_agreement_hours,p_reservation_hours,p_payment_days,p_owner_escalation,p_buyer_alerts,p_employee_alerts,auth.uid(),now())
on conflict(company_id) do update set nda_reminder_hours=excluded.nda_reminder_hours,agreement_reminder_hours=excluded.agreement_reminder_hours,reservation_warning_hours=excluded.reservation_warning_hours,payment_warning_days=excluded.payment_warning_days,owner_escalation_enabled=excluded.owner_escalation_enabled,buyer_alerts_enabled=excluded.buyer_alerts_enabled,employee_alerts_enabled=excluded.employee_alerts_enabled,updated_by=auth.uid(),updated_at=now(); end $$;

grant execute on function public.dmh_run_transaction_automation() to authenticated;
grant execute on function public.dmh_transaction_command_center() to authenticated;
grant execute on function public.dmh_set_transaction_automation_settings(integer,integer,integer,integer,boolean,boolean,boolean) to authenticated;
