-- DMH Sales OS v1.6.3 — Follow-Up Intelligence Engine
-- Safe additive migration. Run after 028_conversation_control_engine.sql.

create table if not exists public.conversation_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_profile_id uuid,
  event_type text not null check (event_type in ('scheduled','rescheduled','completed','overdue_detected')),
  previous_follow_up_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversation_follow_up_events_company_idx
  on public.conversation_follow_up_events(company_id, created_at desc);
create index if not exists conversation_follow_up_events_conversation_idx
  on public.conversation_follow_up_events(conversation_id, created_at desc);

alter table public.conversation_follow_up_events enable row level security;

drop policy if exists "company members read follow up events" on public.conversation_follow_up_events;
create policy "company members read follow up events"
on public.conversation_follow_up_events for select
to authenticated
using (
  company_id = (
    select p.company_id from public.profiles p where p.id = auth.uid()
  )
);

drop policy if exists "company members create follow up events" on public.conversation_follow_up_events;
create policy "company members create follow up events"
on public.conversation_follow_up_events for insert
to authenticated
with check (
  company_id = (
    select p.company_id from public.profiles p where p.id = auth.uid()
  )
);

create or replace function public.dmh_log_follow_up_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if old.next_follow_up_at is not distinct from new.next_follow_up_at then
    return new;
  end if;

  v_type := case
    when old.next_follow_up_at is null and new.next_follow_up_at is not null then 'scheduled'
    when old.next_follow_up_at is not null and new.next_follow_up_at is null then 'completed'
    else 'rescheduled'
  end;

  insert into public.conversation_follow_up_events(
    company_id, conversation_id, actor_profile_id, event_type,
    previous_follow_up_at, next_follow_up_at
  ) values (
    new.company_id, new.id, auth.uid(), v_type,
    old.next_follow_up_at, new.next_follow_up_at
  );

  return new;
end;
$$;

drop trigger if exists trg_log_follow_up_change on public.conversations;
create trigger trg_log_follow_up_change
after update of next_follow_up_at on public.conversations
for each row execute function public.dmh_log_follow_up_change();

-- Keep waiting conversations actionable when a follow-up is completed.
create or replace function public.dmh_complete_conversation_follow_up(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is null then raise exception 'Profile unavailable'; end if;

  update public.conversations
  set next_follow_up_at = null,
      status = case when status = 'waiting_on_buyer' then 'open' else status end,
      updated_at = now()
  where id = p_conversation_id and company_id = v_company;

  if not found then raise exception 'Conversation not found'; end if;
end;
$$;

grant execute on function public.dmh_complete_conversation_follow_up(uuid) to authenticated;
