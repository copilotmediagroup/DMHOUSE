-- DMH Sales OS v3.0.9 — Automated Follow-Up Scheduler
-- Adds per-company scheduling controls and a service-safe planning function.

create table if not exists public.transaction_automation_scheduler (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  run_hour_utc smallint not null default 13 check (run_hour_utc between 0 and 23),
  last_run_at timestamptz,
  last_status text,
  last_result jsonb,
  next_run_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.transaction_automation_scheduler enable row level security;

drop policy if exists "owners read scheduler" on public.transaction_automation_scheduler;
create policy "owners read scheduler" on public.transaction_automation_scheduler
for select to authenticated
using (company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_get_transaction_scheduler()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_company uuid:=public.current_company_id();
  v_role text:=public.current_role()::text;
  v_row public.transaction_automation_scheduler%rowtype;
begin
  if v_role <> 'owner' then raise exception 'Owner access required'; end if;
  select * into v_row from public.transaction_automation_scheduler where company_id=v_company;
  if not found then
    return jsonb_build_object('enabled',false,'run_hour_utc',13,'last_run_at',null,'last_status',null,'last_result',null,'next_run_at',null);
  end if;
  return to_jsonb(v_row)-'company_id'-'updated_by';
end $$;

create or replace function public.dmh_set_transaction_scheduler(p_enabled boolean,p_run_hour_utc integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company uuid:=public.current_company_id();
  v_role text:=public.current_role()::text;
  v_next timestamptz;
begin
  if v_role <> 'owner' then raise exception 'Owner access required'; end if;
  if p_run_hour_utc not between 0 and 23 then raise exception 'Run hour must be between 0 and 23 UTC'; end if;
  v_next:=date_trunc('day',now())+make_interval(hours=>p_run_hour_utc);
  if v_next<=now() then v_next:=v_next+interval '1 day'; end if;
  insert into public.transaction_automation_scheduler(company_id,enabled,run_hour_utc,next_run_at,updated_by,updated_at)
  values(v_company,p_enabled,p_run_hour_utc,case when p_enabled then v_next else null end,auth.uid(),now())
  on conflict(company_id) do update set
    enabled=excluded.enabled,
    run_hour_utc=excluded.run_hour_utc,
    next_run_at=excluded.next_run_at,
    updated_by=auth.uid(),
    updated_at=now();
  return public.dmh_get_transaction_scheduler();
end $$;

-- Called only by the scheduled Edge Function with the service-role key.
create or replace function public.dmh_plan_company_transaction_followups(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_site_url text:='https://datamarkethouse.netlify.app';
  v_planned integer:=0;
  r record;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;

  for r in
    select d.id document_id,d.room_id,d.buyer_id,d.portfolio_id,d.document_type,d.sent_at,
           bp.email,bp.contact_name,p.name portfolio_name,
           coalesce(s.nda_reminder_hours,24) nda_hours,
           coalesce(s.agreement_reminder_hours,24) agreement_hours
    from public.deal_documents_generated d
    join public.buyer_profiles bp on bp.id=d.buyer_id
    left join public.portfolios p on p.id=d.portfolio_id
    left join public.transaction_automation_settings s on s.company_id=d.company_id
    where d.company_id=p_company_id and d.status='sent_to_buyer' and d.sent_at is not null
      and d.sent_at<=now()-make_interval(hours=>case when d.document_type='nda' then coalesce(s.nda_reminder_hours,24) else coalesce(s.agreement_reminder_hours,24) end)
  loop
    insert into public.transaction_follow_up_queue(company_id,buyer_id,portfolio_id,room_id,document_id,reminder_type,recipient,subject,body,action_url,dedupe_key)
    values(p_company_id,r.buyer_id,r.portfolio_id,r.room_id,r.document_id,
      case when r.document_type='nda' then 'nda_unsigned' else 'agreement_unsigned' end,
      r.email,
      case when r.document_type='nda' then 'Reminder: NDA ready for signature' else 'Reminder: Purchase Agreement ready for signature' end,
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nYour '||case when r.document_type='nda' then 'NDA' else 'Purchase Agreement' end||
      ' for '||coalesce(r.portfolio_name,'your portfolio transaction')||' is still waiting for your signature. Please sign in to your secure Buyer Portal to continue.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text||'/documents',
      'document-reminder-'||r.document_id::text)
    on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  for r in
    select pr.id payment_id,pr.room_id,pr.buyer_id,pr.portfolio_id,pr.amount,pr.due_at,pr.status,
           bp.email,bp.contact_name,p.name portfolio_name,coalesce(s.payment_warning_days,3) warning_days
    from public.deal_payment_requests pr
    join public.buyer_profiles bp on bp.id=pr.buyer_id
    left join public.portfolios p on p.id=pr.portfolio_id
    left join public.transaction_automation_settings s on s.company_id=pr.company_id
    where pr.company_id=p_company_id and pr.status in ('issued','overdue') and pr.due_at is not null
      and pr.due_at<=now()+make_interval(days=>coalesce(s.payment_warning_days,3))
  loop
    insert into public.transaction_follow_up_queue(company_id,buyer_id,portfolio_id,room_id,payment_request_id,reminder_type,recipient,subject,body,action_url,dedupe_key)
    values(p_company_id,r.buyer_id,r.portfolio_id,r.room_id,r.payment_id,
      case when r.due_at<now() or r.status='overdue' then 'payment_overdue' else 'payment_due' end,
      r.email,
      case when r.due_at<now() or r.status='overdue' then 'Payment overdue for your DMH transaction' else 'Payment reminder for your DMH transaction' end,
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nPayment of '||to_char(r.amount,'FM$999,999,999,990.00')||' for '||coalesce(r.portfolio_name,'your portfolio transaction')||' is '||
      case when r.due_at<now() or r.status='overdue' then 'overdue.' else 'due on '||to_char(r.due_at,'Mon DD, YYYY')||'.' end||
      ' Please sign in to your Buyer Portal for transaction details.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text,
      'payment-reminder-'||r.payment_id::text||'-'||case when r.due_at<now() or r.status='overdue' then 'overdue' else 'due' end)
    on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  for r in
    select br.id room_id,br.buyer_id,br.portfolio_id,bp.email,bp.contact_name,p.name portfolio_name
    from public.buyer_deal_rooms br
    join public.buyer_profiles bp on bp.id=br.buyer_id
    left join public.portfolios p on p.id=br.portfolio_id
    where br.company_id=p_company_id and br.final_file_released_at is not null
      and not exists(select 1 from public.buyer_deal_file_downloads dl where dl.room_id=br.id)
      and br.final_file_released_at<=now()-interval '12 hours'
  loop
    insert into public.transaction_follow_up_queue(company_id,buyer_id,portfolio_id,room_id,reminder_type,recipient,subject,body,action_url,dedupe_key)
    values(p_company_id,r.buyer_id,r.portfolio_id,r.room_id,'files_available',r.email,
      'Your portfolio files are ready for download',
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nYour final files for '||coalesce(r.portfolio_name,'your transaction')||' are now available in your secure Buyer Portal.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text,
      'files-ready-'||r.room_id::text)
    on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  return jsonb_build_object('planned',v_planned,'queued',(
    select count(*) from public.transaction_follow_up_queue where company_id=p_company_id and status='queued' and scheduled_for<=now()
  ));
end $$;

create or replace function public.dmh_scheduler_due_companies()
returns table(company_id uuid) language sql security definer set search_path=public as $$
  select s.company_id from public.transaction_automation_scheduler s
  where auth.role()='service_role' and s.enabled=true and coalesce(s.next_run_at,now())<=now()
$$;

create or replace function public.dmh_scheduler_record_run(p_company_id uuid,p_status text,p_result jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_hour integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  select run_hour_utc into v_hour from public.transaction_automation_scheduler where company_id=p_company_id;
  update public.transaction_automation_scheduler set
    last_run_at=now(),last_status=p_status,last_result=p_result,
    next_run_at=date_trunc('day',now()+interval '1 day')+make_interval(hours=>coalesce(v_hour,13)),updated_at=now()
  where company_id=p_company_id;
end $$;

grant execute on function public.dmh_get_transaction_scheduler() to authenticated;
grant execute on function public.dmh_set_transaction_scheduler(boolean,integer) to authenticated;
grant execute on function public.dmh_plan_company_transaction_followups(uuid) to service_role;
grant execute on function public.dmh_scheduler_due_companies() to service_role;
grant execute on function public.dmh_scheduler_record_run(uuid,text,jsonb) to service_role;
