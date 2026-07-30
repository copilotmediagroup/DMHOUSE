-- DMH Sales OS v3.0.8 — Transaction Follow-Up Email Engine
-- Plans deduplicated buyer reminders and records every send attempt.

create table if not exists public.transaction_follow_up_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  buyer_id uuid references public.buyer_profiles(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  room_id uuid references public.buyer_deal_rooms(id) on delete cascade,
  document_id uuid references public.deal_documents_generated(id) on delete cascade,
  payment_request_id uuid references public.deal_payment_requests(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('nda_unsigned','agreement_unsigned','payment_due','payment_overdue','files_available')),
  recipient text not null,
  subject text not null,
  body text not null,
  action_url text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  dedupe_key text not null,
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,dedupe_key)
);

create index if not exists transaction_follow_up_due_idx
  on public.transaction_follow_up_queue(company_id,status,scheduled_for);

alter table public.transaction_follow_up_queue enable row level security;

drop policy if exists "staff reads transaction follow ups" on public.transaction_follow_up_queue;
create policy "staff reads transaction follow ups" on public.transaction_follow_up_queue for select to authenticated
using (company_id=public.current_company_id() and public.current_role() in ('owner','employee'));

create or replace function public.dmh_plan_transaction_followups()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company uuid:=public.current_company_id();
  v_role text:=public.current_role()::text;
  v_site_url text:='https://datamarkethouse.netlify.app';
  v_planned integer:=0;
  r record;
begin
  if v_role not in ('owner','employee') then raise exception 'Staff access required'; end if;

  -- Unsigned NDAs and purchase agreements.
  for r in
    select d.id document_id,d.room_id,d.buyer_id,d.portfolio_id,d.document_type,d.title,d.sent_at,
           bp.email,bp.contact_name,p.name portfolio_name
    from public.deal_documents_generated d
    join public.buyer_profiles bp on bp.id=d.buyer_id
    left join public.portfolios p on p.id=d.portfolio_id
    where d.company_id=v_company
      and d.status='sent_to_buyer'
      and d.sent_at is not null
      and d.sent_at<=now()-interval '24 hours'
  loop
    insert into public.transaction_follow_up_queue(
      company_id,buyer_id,portfolio_id,room_id,document_id,reminder_type,recipient,subject,body,action_url,dedupe_key
    ) values(
      v_company,r.buyer_id,r.portfolio_id,r.room_id,r.document_id,
      case when r.document_type='nda' then 'nda_unsigned' else 'agreement_unsigned' end,
      r.email,
      case when r.document_type='nda' then 'Reminder: NDA ready for signature' else 'Reminder: Purchase Agreement ready for signature' end,
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nYour '||
      case when r.document_type='nda' then 'NDA' else 'Purchase Agreement' end||
      ' for '||coalesce(r.portfolio_name,'your portfolio transaction')||' is still waiting for your signature. Please sign in to your secure Buyer Portal to continue.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text||'/documents',
      'document-reminder-'||r.document_id::text
    ) on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  -- Payment reminders.
  for r in
    select pr.id payment_id,pr.room_id,pr.buyer_id,pr.portfolio_id,pr.amount,pr.due_at,pr.status,
           bp.email,bp.contact_name,p.name portfolio_name
    from public.deal_payment_requests pr
    join public.buyer_profiles bp on bp.id=pr.buyer_id
    left join public.portfolios p on p.id=pr.portfolio_id
    where pr.company_id=v_company
      and pr.status in ('issued','overdue')
      and pr.due_at is not null
      and pr.due_at<=now()+interval '3 days'
  loop
    insert into public.transaction_follow_up_queue(
      company_id,buyer_id,portfolio_id,room_id,payment_request_id,reminder_type,recipient,subject,body,action_url,dedupe_key
    ) values(
      v_company,r.buyer_id,r.portfolio_id,r.room_id,r.payment_id,
      case when r.due_at<now() or r.status='overdue' then 'payment_overdue' else 'payment_due' end,
      r.email,
      case when r.due_at<now() or r.status='overdue' then 'Payment overdue for your DMH transaction' else 'Payment reminder for your DMH transaction' end,
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nPayment of '||to_char(r.amount,'FM$999,999,999,990.00')||
      ' for '||coalesce(r.portfolio_name,'your portfolio transaction')||' is '||
      case when r.due_at<now() or r.status='overdue' then 'overdue.' else 'due on '||to_char(r.due_at,'Mon DD, YYYY')||'.' end||
      ' Please sign in to your Buyer Portal for transaction details.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text,
      'payment-reminder-'||r.payment_id::text||'-'||case when r.due_at<now() or r.status='overdue' then 'overdue' else 'due' end
    ) on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  -- Final files released but not yet downloaded.
  for r in
    select br.id room_id,br.buyer_id,br.portfolio_id,bp.email,bp.contact_name,p.name portfolio_name
    from public.buyer_deal_rooms br
    join public.buyer_profiles bp on bp.id=br.buyer_id
    left join public.portfolios p on p.id=br.portfolio_id
    where br.company_id=v_company
      and br.final_file_released_at is not null
      and not exists(select 1 from public.buyer_deal_file_downloads dl where dl.room_id=br.id)
      and br.final_file_released_at<=now()-interval '12 hours'
  loop
    insert into public.transaction_follow_up_queue(
      company_id,buyer_id,portfolio_id,room_id,reminder_type,recipient,subject,body,action_url,dedupe_key
    ) values(
      v_company,r.buyer_id,r.portfolio_id,r.room_id,'files_available',r.email,
      'Your portfolio files are ready for download',
      'Hello '||coalesce(nullif(r.contact_name,''),'Buyer')||',\n\nYour final files for '||coalesce(r.portfolio_name,'your transaction')||
      ' are now available in your secure Buyer Portal.\n\nData Market House',
      v_site_url||'/buyer/portfolio/'||r.portfolio_id::text,
      'files-ready-'||r.room_id::text
    ) on conflict(company_id,dedupe_key) do nothing;
    if found then v_planned:=v_planned+1; end if;
  end loop;

  return jsonb_build_object('planned',v_planned,'queued',(
    select count(*) from public.transaction_follow_up_queue where company_id=v_company and status='queued' and scheduled_for<=now()
  ));
end $$;
grant execute on function public.dmh_plan_transaction_followups() to authenticated;

create or replace function public.dmh_transaction_followup_snapshot()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'queued',count(*) filter(where status='queued'),
    'sent',count(*) filter(where status='sent'),
    'failed',count(*) filter(where status='failed'),
    'due_now',count(*) filter(where status='queued' and scheduled_for<=now()),
    'recent',coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc) filter(where q.id is not null),'[]'::jsonb)
  )
  from (select * from public.transaction_follow_up_queue where company_id=public.current_company_id() order by created_at desc limit 50) q
  where public.current_role() in ('owner','employee')
$$;
grant execute on function public.dmh_transaction_followup_snapshot() to authenticated;
