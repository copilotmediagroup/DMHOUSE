-- DMH Sales OS v0.4.0 — Outreach & Follow-Up Engine

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_activities add column if not exists follow_up_at timestamptz;
alter table public.outreach_activities add column if not exists completed_at timestamptz;
alter table public.outreach_activities add column if not exists email_template_id uuid references public.email_templates(id) on delete set null;
alter table public.outreach_activities add column if not exists outcome_quality smallint check (outcome_quality between 1 and 5);

create index if not exists outreach_company_occurred_idx on public.outreach_activities(company_id, occurred_at desc);
create index if not exists outreach_followup_due_idx on public.outreach_activities(company_id, follow_up_at) where follow_up_at is not null and completed_at is null;
create index if not exists email_templates_company_active_idx on public.email_templates(company_id, is_active);

create or replace function public.complete_follow_up(p_activity_id uuid)
returns public.outreach_activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outreach_activities;
begin
  update public.outreach_activities
     set completed_at = now(),
         disposition = 'follow_up_completed'
   where id = p_activity_id
     and company_id = public.current_company_id()
  returning * into v_row;
  if v_row.id is null then raise exception 'Follow-up not found or not permitted'; end if;
  insert into public.audit_logs(company_id, actor_id, action, entity_type, entity_id, after_data)
  values(v_row.company_id, auth.uid(), 'follow_up_completed', 'outreach_activity', v_row.id, jsonb_build_object('agency_id',v_row.agency_id));
  return v_row;
end;
$$;

create or replace function public.snooze_follow_up(p_activity_id uuid, p_follow_up_at timestamptz)
returns public.outreach_activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outreach_activities;
begin
  if p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;
  update public.outreach_activities
     set follow_up_at = p_follow_up_at,
         completed_at = null
   where id = p_activity_id
     and company_id = public.current_company_id()
  returning * into v_row;
  if v_row.id is null then raise exception 'Follow-up not found or not permitted'; end if;
  insert into public.audit_logs(company_id, actor_id, action, entity_type, entity_id, after_data)
  values(v_row.company_id, auth.uid(), 'follow_up_snoozed', 'outreach_activity', v_row.id, jsonb_build_object('follow_up_at',p_follow_up_at));
  return v_row;
end;
$$;

alter table public.email_templates enable row level security;

drop policy if exists "company can read templates" on public.email_templates;
create policy "company can read templates" on public.email_templates
for select using (company_id = public.current_company_id());

drop policy if exists "owner manages templates" on public.email_templates;
create policy "owner manages templates" on public.email_templates
for all using (company_id = public.current_company_id() and public.current_role() = 'owner')
with check (company_id = public.current_company_id() and public.current_role() = 'owner');

grant execute on function public.complete_follow_up(uuid) to authenticated;
grant execute on function public.snooze_follow_up(uuid,timestamptz) to authenticated;
