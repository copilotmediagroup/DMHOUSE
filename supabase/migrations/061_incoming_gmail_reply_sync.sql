-- DMHOUSE v4.0.3 — Incoming Gmail Reply Sync
-- Preserves Gmail as transport while DMHOUSE remains the system of record.

begin;

create table if not exists public.unassigned_inbound_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'gmail',
  provider_message_id text not null,
  provider_thread_id text,
  rfc_message_id text,
  from_email text,
  to_email text,
  subject text,
  body text not null default '',
  received_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id, provider_message_id)
);

create index if not exists unassigned_inbound_company_idx
  on public.unassigned_inbound_emails(company_id, resolved_at, received_at desc);

alter table public.unassigned_inbound_emails enable row level security;

drop policy if exists "owners read unassigned inbound" on public.unassigned_inbound_emails;
create policy "owners read unassigned inbound"
on public.unassigned_inbound_emails for select
using (company_id = public.current_company_id() and public.current_role() = 'owner');

revoke all on public.unassigned_inbound_emails from anon;
grant select on public.unassigned_inbound_emails to authenticated;

alter table public.conversation_messages
  add column if not exists gmail_label_ids text[] not null default '{}',
  add column if not exists received_at timestamptz;

create index if not exists conversation_messages_inbound_unread_idx
  on public.conversation_messages(company_id, conversation_id, created_at desc)
  where direction = 'inbound' and is_read = false;

-- Permit employees to mark inbound messages in their assigned conversations read.
drop policy if exists "conversation message mark read" on public.conversation_messages;
create policy "conversation message mark read"
on public.conversation_messages for update
using (
  company_id = public.current_company_id()
  and direction = 'inbound'
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (
        public.current_role() = 'owner'
        or c.assigned_employee_id = auth.uid()
      )
  )
)
with check (
  company_id = public.current_company_id()
  and direction = 'inbound'
);

comment on table public.unassigned_inbound_emails is
'Inbound Gmail messages that could not be safely matched to a DMHOUSE agency or conversation. Owner review is required.';

commit;
