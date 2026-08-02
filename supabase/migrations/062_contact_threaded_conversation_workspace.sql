-- DMHOUSE v4.0.4 — Contact Threaded Conversation Workspace
-- Adds contact identity to message records while preserving the existing
-- company-owned agency conversation and Gmail thread history.

begin;

alter table public.conversation_messages
  add column if not exists contact_id uuid references public.agency_contacts(id) on delete set null;

create index if not exists conversation_messages_contact_thread_idx
  on public.conversation_messages(company_id, agency_id, contact_id, provider_thread_id, created_at desc);

-- Recover contact identity from the outreach message that created an outbound message.
update public.conversation_messages cm
set contact_id = om.contact_id
from public.outreach_messages om
where cm.outreach_message_id = om.id
  and cm.contact_id is null
  and om.contact_id is not null;

create or replace function public.dmh_capture_outreach_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
  v_mailbox text;
begin
  select coalesce(
    (
      select cec.mailbox_email
      from public.company_email_connections cec
      where cec.company_id = new.company_id
        and cec.provider = 'google_workspace'
        and cec.status = 'connected'
      limit 1
    ),
    'sales@debtpaper.com'
  ) into v_mailbox;

  insert into public.conversations(
    company_id, agency_id, assigned_employee_id, subject,
    last_message_at, last_outbound_at
  ) values (
    new.company_id, new.agency_id, new.employee_id, new.subject,
    new.created_at, new.created_at
  )
  on conflict(company_id, agency_id) do update
  set assigned_employee_id = coalesce(public.conversations.assigned_employee_id, excluded.assigned_employee_id),
      last_message_at = excluded.last_message_at,
      last_outbound_at = excluded.last_outbound_at,
      subject = excluded.subject,
      updated_at = now()
  returning id into v_conversation;

  insert into public.conversation_messages(
    company_id, conversation_id, agency_id, contact_id, sender_profile_id,
    outreach_message_id, direction, from_email, to_email, subject, body,
    provider, provider_message_id, provider_thread_id, rfc_message_id,
    is_read, created_at
  ) values (
    new.company_id, v_conversation, new.agency_id, new.contact_id, new.employee_id,
    new.id, 'outbound', v_mailbox, new.recipient, new.subject, new.body,
    new.provider, new.provider_message_id, new.provider_thread_id, new.rfc_message_id,
    true, new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;

commit;
