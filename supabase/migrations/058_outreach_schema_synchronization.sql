-- DMHOUSE Sales OS v3.6.1 — Outreach Schema Synchronization
-- Repairs production schema drift between outreach_activities.email_template_id
-- and the later outreach_activities.template_id compatibility column.

begin;

alter table public.outreach_activities
  add column if not exists email_template_id uuid;

alter table public.outreach_activities
  add column if not exists template_id uuid;

-- Keep both historical column names synchronized so older and newer modules remain compatible.
update public.outreach_activities
set email_template_id = coalesce(email_template_id, template_id)
where email_template_id is null and template_id is not null;

update public.outreach_activities
set template_id = coalesce(template_id, email_template_id)
where template_id is null and email_template_id is not null;

-- Add the canonical foreign key only when email_templates is present and the constraint is absent.
do $$
begin
  if to_regclass('public.email_templates') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'outreach_activities_email_template_id_fkey'
         and conrelid = 'public.outreach_activities'::regclass
     ) then
    alter table public.outreach_activities
      add constraint outreach_activities_email_template_id_fkey
      foreign key (email_template_id)
      references public.email_templates(id)
      on delete set null;
  end if;
end $$;

create index if not exists outreach_activities_email_template_idx
  on public.outreach_activities(company_id, email_template_id)
  where email_template_id is not null;

create or replace function public.dmh_queue_outreach_email(
  p_agency_id uuid,
  p_contact_id uuid,
  p_portfolio_id uuid,
  p_template_id uuid,
  p_recipient text,
  p_subject text,
  p_body text,
  p_follow_up_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_id uuid;
  v_norm text;
  v_check record;
  v_activity uuid;
begin
  select company_id
    into v_company
  from public.profiles
  where id = auth.uid()
    and is_active = true;

  if v_company is null then
    raise exception 'Active company membership required.';
  end if;

  v_norm := public.dmh_normalize_email(p_recipient);
  if v_norm = '' then
    raise exception 'A valid recipient email is required.';
  end if;

  select *
    into v_check
  from public.dmh_contact_eligibility('email', p_recipient, p_agency_id);

  if not v_check.allowed then
    raise exception 'CONTACT_PROTECTED|%|%|%',
      coalesce(v_check.reason, ''),
      coalesce(v_check.contacted_by_name, ''),
      coalesce(v_check.suppressed_until::text, '');
  end if;

  insert into public.outreach_messages(
    company_id, agency_id, contact_id, employee_id, portfolio_id,
    template_id, channel, recipient, normalized_recipient,
    subject, body, status
  ) values (
    v_company, p_agency_id, p_contact_id, auth.uid(), p_portfolio_id,
    p_template_id, 'email', p_recipient, v_norm,
    p_subject, p_body, 'queued'
  )
  returning id into v_id;

  insert into public.outreach_activities(
    company_id, agency_id, contact_id, employee_id,
    activity_type, disposition, notes, subject,
    follow_up_at, email_template_id, template_id
  ) values (
    v_company, p_agency_id, p_contact_id, auth.uid(),
    'email', 'Email queued', 'Queued for provider delivery', p_subject,
    p_follow_up_at, p_template_id, p_template_id
  )
  returning id into v_activity;

  if p_follow_up_at is not null then
    insert into public.follow_ups(
      company_id, agency_id, employee_id, due_at, reason, source_activity_id
    ) values (
      v_company, p_agency_id, auth.uid(), p_follow_up_at,
      'Follow up on sent email', v_activity
    );
  end if;

  return v_id;
end;
$$;

grant execute on function public.dmh_queue_outreach_email(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz
) to authenticated;

commit;
