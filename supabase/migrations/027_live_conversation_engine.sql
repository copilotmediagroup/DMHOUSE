-- DMH Sales OS v1.6.1 — Live Conversation Engine

alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations add constraint conversations_status_check check (status in ('open','waiting_on_buyer','negotiating','ready_for_owner','owner_review','closed'));

alter table public.conversations add column if not exists next_follow_up_at timestamptz;
alter table public.conversations add column if not exists follow_up_priority text not null default 'normal' check (follow_up_priority in ('low','normal','high','urgent'));
alter table public.conversations add column if not exists last_inbound_at timestamptz;
alter table public.conversations add column if not exists last_outbound_at timestamptz;
alter table public.conversations add column if not exists owner_alerted_at timestamptz;

create index if not exists conversations_follow_up_idx on public.conversations(company_id,next_follow_up_at) where next_follow_up_at is not null;
create index if not exists conversations_status_idx on public.conversations(company_id,status,last_message_at desc);

create table if not exists public.conversation_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete cascade,
  file_name text not null,
  content_type text,
  storage_path text,
  external_url text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.conversation_attachments enable row level security;
drop policy if exists "conversation attachment visibility" on public.conversation_attachments;
create policy "conversation attachment visibility" on public.conversation_attachments for select using (
 company_id=public.current_company_id() and exists(
   select 1 from public.conversations c where c.id=conversation_id and
   (public.current_role()='owner' or c.assigned_employee_id=auth.uid())
 )
);

create or replace function public.dmh_set_conversation_workflow(
 p_conversation_id uuid,
 p_status text default null,
 p_priority text default null,
 p_next_follow_up_at timestamptz default null,
 p_clear_follow_up boolean default false
)
returns void language plpgsql security definer set search_path=public as $$
declare v_role text; v_company uuid;
begin
 select role,company_id into v_role,v_company from profiles where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active membership required.'; end if;
 if not exists(select 1 from conversations c where c.id=p_conversation_id and c.company_id=v_company and (v_role='owner' or c.assigned_employee_id=auth.uid())) then
  raise exception 'Conversation unavailable.';
 end if;
 if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'Invalid priority.'; end if;
 update conversations set
   status=coalesce(p_status,status),
   follow_up_priority=coalesce(p_priority,follow_up_priority),
   next_follow_up_at=case when p_clear_follow_up then null when p_next_follow_up_at is not null then p_next_follow_up_at else next_follow_up_at end,
   owner_alerted_at=case when p_status in ('ready_for_owner','negotiating') then coalesce(owner_alerted_at,now()) else owner_alerted_at end,
   updated_at=now()
 where id=p_conversation_id;
end $$;
grant execute on function public.dmh_set_conversation_workflow(uuid,text,text,timestamptz,boolean) to authenticated;

create or replace function public.dmh_add_internal_conversation_note(p_conversation_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_role text; v_company uuid; v_agency uuid; v_id uuid;
begin
 select role,company_id into v_role,v_company from profiles where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active membership required.'; end if;
 select agency_id into v_agency from conversations c where c.id=p_conversation_id and c.company_id=v_company and (v_role='owner' or c.assigned_employee_id=auth.uid());
 if v_agency is null then raise exception 'Conversation unavailable.'; end if;
 if nullif(trim(p_body),'') is null then raise exception 'Note cannot be empty.'; end if;
 insert into conversation_messages(company_id,conversation_id,agency_id,sender_profile_id,direction,body,is_read)
 values(v_company,p_conversation_id,v_agency,auth.uid(),'internal',trim(p_body),true)
 returning id into v_id;
 update conversations set last_message_at=now(),updated_at=now() where id=p_conversation_id;
 return v_id;
end $$;
grant execute on function public.dmh_add_internal_conversation_note(uuid,text) to authenticated;

create or replace function public.dmh_capture_outreach_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_conversation uuid;
begin
 insert into conversations(company_id,agency_id,assigned_employee_id,subject,last_message_at,last_outbound_at)
 values(new.company_id,new.agency_id,new.employee_id,new.subject,new.created_at,new.created_at)
 on conflict(company_id,agency_id) do update set last_message_at=excluded.last_message_at,last_outbound_at=excluded.last_outbound_at,subject=excluded.subject,updated_at=now()
 returning id into v_conversation;
 insert into conversation_messages(company_id,conversation_id,agency_id,sender_profile_id,outreach_message_id,direction,from_email,to_email,subject,body,is_read,created_at)
 values(new.company_id,v_conversation,new.agency_id,new.employee_id,new.id,'outbound','info@debtpaper.com',new.recipient,new.subject,new.body,true,new.created_at)
 on conflict do nothing;
 return new;
end $$;

update public.conversations c set
 last_inbound_at=(select max(cm.created_at) from public.conversation_messages cm where cm.conversation_id=c.id and cm.direction='inbound'),
 last_outbound_at=(select max(cm.created_at) from public.conversation_messages cm where cm.conversation_id=c.id and cm.direction='outbound');
