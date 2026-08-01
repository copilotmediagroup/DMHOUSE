alter table public.deal_interventions
  add column if not exists automation_key text,
  add column if not exists trigger_type text,
  add column if not exists automated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists recovered_at timestamptz,
  add column if not exists protected_revenue numeric(14,2) not null default 0;

create unique index if not exists deal_interventions_automation_key_uidx
  on public.deal_interventions(company_id,automation_key)
  where automation_key is not null;
create index if not exists deal_interventions_recovery_metrics_idx
  on public.deal_interventions(company_id,automated,status,recovered_at,created_at);

create or replace function public.dmh_escalate_overdue_interventions()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_count integer:=0;
begin
  select company_id into v_company from public.profiles where id=auth.uid();
  if v_company is null then raise exception 'Profile not found'; end if;
  update public.deal_interventions
     set priority='critical', status='waiting_on_owner', escalated_at=coalesce(escalated_at,now()), updated_at=now()
   where company_id=v_company and due_at<now() and status in ('open','in_progress','waiting_on_buyer') and escalated_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('escalated',v_count);
end $$;
grant execute on function public.dmh_escalate_overdue_interventions() to authenticated;
