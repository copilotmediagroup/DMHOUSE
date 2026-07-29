-- DMH Sales OS v1.3.6 — Agency Action Center
-- Aligns the persisted agency lifecycle with the live employee action workflow.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.agencies'::regclass
      and conname = 'agencies_status_check'
  ) then
    alter table public.agencies drop constraint agencies_status_check;
  end if;
end $$;

-- Translate older workflow states safely before applying the new constraint.
update public.agencies set status = case status
  when 'contacting' then 'contacted'
  when 'follow_up_due' then 'contacted'
  when 'decision_maker_reached' then 'qualified'
  when 'interested' then 'qualified'
  when 'sample_requested' then 'portfolio_sent'
  when 'offer_expected' then 'negotiating'
  when 'dormant' then 'researching'
  else status
end
where status not in ('new','researching','contacted','qualified','portfolio_sent','negotiating','offer_submitted','closed','not_interested','do_not_contact');


alter table public.agencies
  add constraint agencies_status_check
  check (status in (
    'new','researching','contacted','qualified','portfolio_sent',
    'negotiating','offer_submitted','closed','not_interested','do_not_contact'
  ));

create index if not exists agencies_action_queue_idx
  on public.agencies(company_id, assigned_to, status, ownership_expires_at);

create index if not exists outreach_follow_up_queue_idx
  on public.outreach_activities(company_id, employee_id, follow_up_at)
  where follow_up_at is not null and completed_at is null;

notify pgrst, 'reload schema';
