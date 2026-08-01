alter table public.deal_interventions
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to_name text,
  add column if not exists due_at timestamptz,
  add column if not exists priority text not null default 'normal',
  add column if not exists status text not null default 'open',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists outcome text,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.deal_interventions add constraint deal_interventions_priority_check check (priority in ('low','normal','high','critical'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.deal_interventions add constraint deal_interventions_status_check check (status in ('open','in_progress','waiting_on_buyer','waiting_on_owner','completed','cancelled'));
exception when duplicate_object then null; end $$;

create index if not exists deal_interventions_execution_queue_idx on public.deal_interventions(company_id,status,due_at,priority);
create index if not exists deal_interventions_assignee_idx on public.deal_interventions(assigned_to,status,due_at);

create or replace function public.dmh_fill_deal_intervention_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.created_by is null then new.created_by:=auth.uid(); end if;
  if new.created_by_name is null then select full_name into new.created_by_name from public.profiles where id=new.created_by; end if;
  if new.assigned_to is null then new.assigned_to:=new.created_by; end if;
  if new.assigned_to_name is null then select full_name into new.assigned_to_name from public.profiles where id=new.assigned_to; end if;
  if new.status='completed' and new.completed_at is null then new.completed_at:=now(); end if;
  if new.status='completed' and new.completed_by is null then new.completed_by:=auth.uid(); end if;
  new.updated_at:=now();
  return new;
end $$;

drop trigger if exists trg_fill_deal_intervention_actor on public.deal_interventions;
drop trigger if exists trg_fill_deal_intervention_assignment on public.deal_interventions;
create trigger trg_fill_deal_intervention_assignment before insert or update on public.deal_interventions for each row execute function public.dmh_fill_deal_intervention_assignment();
