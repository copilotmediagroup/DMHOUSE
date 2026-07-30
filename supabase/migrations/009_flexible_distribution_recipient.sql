-- DMH Sales OS v0.7.2 — Flexible Distribution Recipient Rule
-- A named contact is optional. A valid agency email can be the recipient.

alter table public.portfolio_distributions
  add column if not exists recipient_email text,
  add column if not exists recipient_name text,
  add column if not exists recipient_type text;

-- Existing named-contact distributions remain valid.
update public.portfolio_distributions d
set recipient_email = coalesce(d.recipient_email, c.email),
    recipient_name = coalesce(d.recipient_name, nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')),
    recipient_type = coalesce(d.recipient_type, case when d.contact_id is null then 'general_agency' else 'named_contact' end)
from public.agency_contacts c
where d.contact_id = c.id
  and (d.recipient_email is null or d.recipient_type is null);

-- General-agency historical rows may obtain the agency email where available.
update public.portfolio_distributions d
set recipient_email = coalesce(d.recipient_email, a.general_email),
    recipient_type = coalesce(d.recipient_type, 'general_agency')
from public.agencies a
where d.agency_id = a.id
  and d.contact_id is null
  and (d.recipient_email is null or d.recipient_type is null);

-- contact_id is intentionally nullable; preserve that rule explicitly.
alter table public.portfolio_distributions alter column contact_id drop not null;

-- New records must identify the actual email recipient. Historical rows are not blocked.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portfolio_distributions_recipient_type_check'
      and conrelid = 'public.portfolio_distributions'::regclass
  ) then
    alter table public.portfolio_distributions
      add constraint portfolio_distributions_recipient_type_check
      check (recipient_type is null or recipient_type in ('general_agency','named_contact'));
  end if;
end $$;

create index if not exists portfolio_distributions_recipient_email_idx
  on public.portfolio_distributions(portfolio_id, agency_id, lower(recipient_email));
