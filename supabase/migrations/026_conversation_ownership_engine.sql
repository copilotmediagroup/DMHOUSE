-- DMH Sales OS v1.6.0 — Conversation Ownership Engine
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  owner_joined boolean not null default false,
  owner_taken_over boolean not null default false,
  status text not null default 'open' check (status in ('open','ready_for_owner','owner_review','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  subject text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,agency_id)
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  direction text not null check (direction in ('outbound','inbound','internal')),
  from_email text,
  to_email text,
  subject text,
  body text not null,
  provider text,
  provider_message_id text,
  in_reply_to text,
  is_read boolean not null default false,
  attachment_count integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_thread_idx on public.conversation_messages(conversation_id,created_at);
create unique index if not exists conversation_messages_provider_uq on public.conversation_messages(company_id,provider_message_id) where provider_message_id is not null;

create table if not exists public.conversation_assignment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_employee_id uuid references public.profiles(id) on delete set null,
  to_employee_id uuid references public.profiles(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.owner_email_tests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued',
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_assignment_history enable row level security;
alter table public.owner_email_tests enable row level security;

drop policy if exists "conversation visibility" on public.conversations;
create policy "conversation visibility" on public.conversations for select using (
 company_id=public.current_company_id() and (public.current_role()='owner' or assigned_employee_id=auth.uid())
);
drop policy if exists "conversation update" on public.conversations;
create policy "conversation update" on public.conversations for update using (
 company_id=public.current_company_id() and (public.current_role()='owner' or assigned_employee_id=auth.uid())
);
drop policy if exists "conversation message visibility" on public.conversation_messages;
create policy "conversation message visibility" on public.conversation_messages for select using (
 company_id=public.current_company_id() and exists(select 1 from public.conversations c where c.id=conversation_id and (public.current_role()='owner' or c.assigned_employee_id=auth.uid()))
);
drop policy if exists "conversation message insert" on public.conversation_messages;
create policy "conversation message insert" on public.conversation_messages for insert with check (
 company_id=public.current_company_id() and sender_profile_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and (public.current_role()='owner' or c.assigned_employee_id=auth.uid()))
);
drop policy if exists "assignment history visibility" on public.conversation_assignment_history;
create policy "assignment history visibility" on public.conversation_assignment_history for select using (company_id=public.current_company_id() and public.current_role()='owner');
drop policy if exists "owner test visibility" on public.owner_email_tests;
create policy "owner test visibility" on public.owner_email_tests for select using (company_id=public.current_company_id() and public.current_role()='owner');

create or replace function public.dmh_get_or_create_conversation(p_agency_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_assigned uuid; v_id uuid;
begin
 select company_id into v_company from profiles where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active company membership required.'; end if;
 select assigned_to into v_assigned from agencies where id=p_agency_id and company_id=v_company;
 insert into conversations(company_id,agency_id,assigned_employee_id)
 values(v_company,p_agency_id,v_assigned)
 on conflict(company_id,agency_id) do update set assigned_employee_id=coalesce(conversations.assigned_employee_id,excluded.assigned_employee_id),updated_at=now()
 returning id into v_id;
 return v_id;
end $$;
grant execute on function public.dmh_get_or_create_conversation(uuid) to authenticated;

create or replace function public.dmh_set_conversation_state(p_conversation_id uuid,p_status text default null,p_assigned_employee_id uuid default null,p_owner_joined boolean default null,p_take_ownership boolean default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_role text; v_company uuid; v_old uuid;
begin
 select role,company_id into v_role,v_company from profiles where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active membership required.'; end if;
 select assigned_employee_id into v_old from conversations where id=p_conversation_id and company_id=v_company;
 if not found then raise exception 'Conversation not found.'; end if;
 if v_role<>'owner' and (p_assigned_employee_id is not null or p_owner_joined is not null or p_take_ownership is not null) then raise exception 'Owner access required.'; end if;
 update conversations set
  status=coalesce(p_status,status),
  assigned_employee_id=case when p_take_ownership=true then null else coalesce(p_assigned_employee_id,assigned_employee_id) end,
  owner_joined=coalesce(p_owner_joined,owner_joined),
  owner_taken_over=coalesce(p_take_ownership,owner_taken_over),updated_at=now()
 where id=p_conversation_id;
 if p_assigned_employee_id is distinct from v_old or p_take_ownership=true then
  insert into conversation_assignment_history(company_id,conversation_id,from_employee_id,to_employee_id,changed_by,reason)
  values(v_company,p_conversation_id,v_old,case when p_take_ownership=true then null else p_assigned_employee_id end,auth.uid(),case when p_take_ownership=true then 'Owner takeover' else 'Conversation reassigned' end);
 end if;
end $$;
grant execute on function public.dmh_set_conversation_state(uuid,text,uuid,boolean,boolean) to authenticated;

-- Backfill one conversation and outbound timeline item per existing outreach message.
insert into public.conversations(company_id,agency_id,assigned_employee_id,subject,last_message_at)
select distinct on (company_id,agency_id) company_id,agency_id,employee_id,subject,created_at
from public.outreach_messages
where agency_id is not null
order by company_id,agency_id,created_at desc
on conflict(company_id,agency_id) do nothing;

insert into public.conversation_messages(company_id,conversation_id,agency_id,sender_profile_id,outreach_message_id,direction,from_email,to_email,subject,body,provider,provider_message_id,is_read,created_at)
select m.company_id,c.id,m.agency_id,m.employee_id,m.id,'outbound','info@debtpaper.com',m.recipient,m.subject,m.body,m.provider,m.provider_message_id,true,m.created_at
from public.outreach_messages m join public.conversations c on c.company_id=m.company_id and c.agency_id=m.agency_id
where not exists(select 1 from public.conversation_messages cm where cm.outreach_message_id=m.id);

create or replace function public.dmh_capture_outreach_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_conversation uuid;
begin
 insert into conversations(company_id,agency_id,assigned_employee_id,subject,last_message_at)
 values(new.company_id,new.agency_id,new.employee_id,new.subject,new.created_at)
 on conflict(company_id,agency_id) do update set last_message_at=excluded.last_message_at,subject=excluded.subject,updated_at=now()
 returning id into v_conversation;
 insert into conversation_messages(company_id,conversation_id,agency_id,sender_profile_id,outreach_message_id,direction,from_email,to_email,subject,body,is_read,created_at)
 values(new.company_id,v_conversation,new.agency_id,new.employee_id,new.id,'outbound','info@debtpaper.com',new.recipient,new.subject,new.body,true,new.created_at)
 on conflict do nothing;
 return new;
end $$;
drop trigger if exists trg_capture_outreach_message on public.outreach_messages;
create trigger trg_capture_outreach_message after insert on public.outreach_messages for each row execute function public.dmh_capture_outreach_message();
drop policy if exists "conversation message mark read" on public.conversation_messages;
create policy "conversation message mark read" on public.conversation_messages for update using (
 company_id=public.current_company_id() and exists(select 1 from public.conversations c where c.id=conversation_id and (public.current_role()='owner' or c.assigned_employee_id=auth.uid()))
);
