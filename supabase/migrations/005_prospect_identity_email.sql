-- DMH Sales OS v0.4.1 — Prospect Identity Email Correction
-- Adds agency-level email identity and database-backed duplicate matching.

alter table public.agencies
  add column if not exists general_email text,
  add column if not exists normalized_email text generated always as (lower(trim(general_email))) stored;

create index if not exists agencies_general_email_idx
  on public.agencies(company_id, normalized_email)
  where normalized_email is not null and normalized_email <> '';

create index if not exists agency_contacts_email_idx
  on public.agency_contacts(company_id, lower(trim(email)))
  where email is not null and trim(email) <> '';

create or replace function public.find_agency_duplicates(
  p_name text default null,
  p_website text default null,
  p_phone text default null,
  p_email text default null
)
returns table (
  agency_id uuid,
  agency_name text,
  match_score integer,
  match_reasons text[]
)
language sql
security definer
set search_path=public
as $$
with inputs as (
  select
    lower(regexp_replace(coalesce(p_name,''),'[^a-zA-Z0-9]','','g')) as normalized_name,
    lower(regexp_replace(regexp_replace(coalesce(p_website,''),'^https?://(www\.)?','','i'),'/.*$','','g')) as domain,
    regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as phone,
    lower(trim(coalesce(p_email,''))) as email
), scored as (
  select
    a.id,
    a.name,
    (case when i.normalized_name<>'' and a.normalized_name=i.normalized_name then 60 else 0 end) +
    (case when i.domain<>'' and lower(coalesce(a.domain,''))=i.domain then 80 else 0 end) +
    (case when i.phone<>'' and regexp_replace(coalesce(a.phone,''),'[^0-9]','','g')=i.phone then 80 else 0 end) +
    (case when i.email<>'' and a.normalized_email=i.email then 100 else 0 end) +
    (case when i.email<>'' and exists(
      select 1 from public.agency_contacts c
      where c.agency_id=a.id and lower(trim(coalesce(c.email,'')))=i.email
    ) then 100 else 0 end) as score,
    array_remove(array[
      case when i.normalized_name<>'' and a.normalized_name=i.normalized_name then 'Exact company name' end,
      case when i.domain<>'' and lower(coalesce(a.domain,''))=i.domain then 'Matching website' end,
      case when i.phone<>'' and regexp_replace(coalesce(a.phone,''),'[^0-9]','','g')=i.phone then 'Matching phone' end,
      case when i.email<>'' and a.normalized_email=i.email then 'Matching agency email' end,
      case when i.email<>'' and exists(
        select 1 from public.agency_contacts c
        where c.agency_id=a.id and lower(trim(coalesce(c.email,'')))=i.email
      ) then 'Email already belongs to a contact' end
    ], null) as reasons
  from public.agencies a cross join inputs i
  where a.company_id=public.current_company_id()
)
select id, name, score, reasons
from scored
where score>=30
order by score desc, name;
$$;

grant execute on function public.find_agency_duplicates(text,text,text,text) to authenticated;
