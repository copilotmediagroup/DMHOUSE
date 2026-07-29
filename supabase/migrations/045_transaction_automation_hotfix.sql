-- DMH Sales OS v2.6.1a
-- Transaction Automation Hotfix
-- Corrects reservation deadline column references and hardens legacy distribution ordering.

-- Some early installations created portfolio_distributions before created_at was added.
alter table public.portfolio_distributions
  add column if not exists created_at timestamptz not null default now();

create index if not exists portfolio_distributions_company_created_idx
  on public.portfolio_distributions(company_id, created_at desc);
create index if not exists portfolio_distributions_employee_created_idx
  on public.portfolio_distributions(employee_id, created_at desc);

-- Replace the automation runner using the canonical reservations.reservation_expires_at field.
create or replace function public.dmh_run_transaction_automation() returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile profiles%rowtype;
  v_settings transaction_automation_settings%rowtype;
  v_owner uuid;
  v_created integer:=0;
  r record;
begin
  select * into v_profile from profiles where id=auth.uid();
  if v_profile.role not in ('owner','employee') then raise exception 'Staff access required'; end if;

  insert into transaction_automation_settings(company_id,updated_by)
  values(v_profile.company_id,auth.uid())
  on conflict(company_id) do nothing;

  select * into v_settings from transaction_automation_settings where company_id=v_profile.company_id;
  select id into v_owner from profiles
    where company_id=v_profile.company_id and role='owner' and is_active=true
    order by created_at limit 1;

  for r in
    select d.*,coalesce(d.created_by,v_owner) staff_id
    from deal_documents_generated d
    where d.company_id=v_profile.company_id
      and d.status='sent_to_buyer'
      and d.sent_at <= now()-(case when d.document_type='purchase_agreement' then v_settings.agreement_reminder_hours else v_settings.nda_reminder_hours end||' hours')::interval
  loop
    if v_settings.employee_alerts_enabled and r.staff_id is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,r.staff_id,'document_signature',
        case when r.document_type='nda' then 'NDA awaiting buyer signature' else 'Purchase agreement awaiting buyer signature' end,
        r.title||' has not been signed by the buyer.','/employee/documents','warning',
        r.sent_at+(case when r.document_type='purchase_agreement' then v_settings.agreement_reminder_hours else v_settings.nda_reminder_hours end||' hours')::interval,
        'document',r.id,'doc-waiting-staff-'||r.id
      );
      v_created:=v_created+1;
    end if;

    if v_settings.buyer_alerts_enabled and r.buyer_id is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,(select user_id from buyer_profiles where id=r.buyer_id),
        'signature_required','Document ready for your signature','Review and sign '||r.title||'.',
        '/buyer/portfolio/'||coalesce(r.portfolio_id::text,'')||'/documents','warning',now(),
        'document',r.id,'doc-waiting-buyer-'||r.id
      );
      v_created:=v_created+1;
    end if;
  end loop;

  for r in
    select d.*,coalesce(d.created_by,v_owner) staff_id
    from deal_documents_generated d
    where d.company_id=v_profile.company_id and d.status='fully_executed'
  loop
    if r.staff_id is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,r.staff_id,'document_executed',
        case when r.document_type='nda' then 'NDA fully executed' else 'Purchase agreement fully executed' end,
        r.title||' is signed by both parties.','/employee/documents','success',null,
        'document',r.id,'doc-executed-'||r.id
      );
      v_created:=v_created+1;
    end if;
    if v_owner is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,v_owner,'document_executed','Executed document ready for review',
        r.title||' completed the signature stage.',
        '/buyers/portfolio/'||coalesce(r.portfolio_id::text,''),'success',null,
        'document',r.id,'owner-doc-executed-'||r.id
      );
      v_created:=v_created+1;
    end if;
  end loop;

  for r in
    select rs.*,p.name portfolio_name
    from reservations rs
    join portfolios p on p.id=rs.portfolio_id
    where rs.company_id=v_profile.company_id
      and rs.status='active'
      and rs.reservation_expires_at is not null
      and rs.reservation_expires_at <= now()+(v_settings.reservation_warning_hours||' hours')::interval
  loop
    if v_owner is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,v_owner,'reservation_deadline','Reservation nearing expiration',
        r.portfolio_name||' expires '||to_char(r.reservation_expires_at,'Mon DD at HH12:MI AM')||'.',
        '/closings',case when r.reservation_expires_at<=now() then 'critical' else 'warning' end,
        r.reservation_expires_at,'reservation',r.id,'reservation-'||r.id
      );
      v_created:=v_created+1;
    end if;
    if r.reservation_expires_at<=now() then
      update reservations set status='expired',updated_at=now() where id=r.id and status='active';
      insert into transaction_automation_events(company_id,event_type,entity_type,entity_id,title)
      values(r.company_id,'reservation_expired','reservation',r.id,'Reservation expired automatically');
    end if;
  end loop;

  update deal_payment_requests
    set status='overdue',updated_at=now()
    where company_id=v_profile.company_id and status='issued' and due_at<now();

  for r in
    select pr.*,p.name portfolio_name
    from deal_payment_requests pr
    left join portfolios p on p.id=pr.portfolio_id
    where pr.company_id=v_profile.company_id
      and pr.status in ('issued','overdue')
      and pr.due_at is not null
      and pr.due_at<=now()+(v_settings.payment_warning_days||' days')::interval
  loop
    if v_owner is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,v_owner,'payment_deadline',
        case when r.status='overdue' then 'Payment overdue' else 'Payment due soon' end,
        coalesce(r.portfolio_name,'Deal')||' payment of '||to_char(r.amount,'FM$999,999,999,990.00')||' is '||case when r.status='overdue' then 'overdue.' else 'approaching.' end,
        '/closings',case when r.status='overdue' then 'critical' else 'warning' end,
        r.due_at,'payment_request',r.id,'payment-owner-'||r.id
      );
      v_created:=v_created+1;
    end if;
    if v_settings.buyer_alerts_enabled and r.buyer_id is not null then
      perform dmh_emit_transaction_notification(
        r.company_id,(select user_id from buyer_profiles where id=r.buyer_id),
        'payment_deadline',case when r.status='overdue' then 'Payment overdue' else 'Payment due soon' end,
        'Payment of '||to_char(r.amount,'FM$999,999,999,990.00')||' is due '||to_char(r.due_at,'Mon DD, YYYY')||'.',
        '/buyer/portfolio/'||coalesce(r.portfolio_id::text,''),case when r.status='overdue' then 'critical' else 'warning' end,
        r.due_at,'payment_request',r.id,'payment-buyer-'||r.id
      );
      v_created:=v_created+1;
    end if;
  end loop;

  insert into transaction_automation_events(company_id,event_type,entity_type,title,details,user_id)
  values(v_profile.company_id,'automation_run','system','Transaction automation completed',jsonb_build_object('notifications_processed',v_created),auth.uid());

  return jsonb_build_object('notifications_processed',v_created,'ran_at',now());
end
$$;

-- Command center now uses reservations.reservation_expires_at and returns a safe default settings object.
create or replace function public.dmh_transaction_command_center() returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_role text;
  v_settings jsonb;
begin
  select company_id,role::text into v_company,v_role from profiles where id=auth.uid();
  if v_role<>'owner' then raise exception 'Owner access required'; end if;

  insert into transaction_automation_settings(company_id,updated_by)
  values(v_company,auth.uid())
  on conflict(company_id) do nothing;

  select to_jsonb(s) into v_settings
  from transaction_automation_settings s
  where s.company_id=v_company;

  return jsonb_build_object(
    'nda_waiting',coalesce((select count(*) from deal_documents_generated where company_id=v_company and document_type='nda' and status='sent_to_buyer'),0),
    'agreements_waiting',coalesce((select count(*) from deal_documents_generated where company_id=v_company and document_type='purchase_agreement' and status in ('draft','seller_signed','sent_to_buyer')),0),
    'payments_due',coalesce((select count(*) from deal_payment_requests where company_id=v_company and status='issued' and due_at<=now()+interval '3 days'),0),
    'payments_overdue',coalesce((select count(*) from deal_payment_requests where company_id=v_company and status='overdue'),0),
    'reservations_expiring',coalesce((select count(*) from reservations where company_id=v_company and status='active' and reservation_expires_at is not null and reservation_expires_at<=now()+interval '48 hours'),0),
    'final_release_ready',coalesce((select count(*) from buyer_deal_rooms where company_id=v_company and status='release_ready'),0),
    'unread_alerts',coalesce((select count(*) from notifications where company_id=v_company and user_id=auth.uid() and read_at is null and resolved_at is null),0),
    'settings',coalesce(v_settings,'{}'::jsonb)
  );
end
$$;

grant execute on function public.dmh_run_transaction_automation() to authenticated;
grant execute on function public.dmh_transaction_command_center() to authenticated;
