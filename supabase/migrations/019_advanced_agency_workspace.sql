-- DMH Sales OS v1.3.5 — Advanced Agency Workspace
-- Preserves useful G Maps Extractor fields on the agency record and backfills existing imports.

alter table public.agencies add column if not exists category text;
alter table public.agencies add column if not exists rating numeric(3,2);
alter table public.agencies add column if not exists review_count integer;
alter table public.agencies add column if not exists latitude numeric;
alter table public.agencies add column if not exists longitude numeric;
alter table public.agencies add column if not exists provider_place_id text;

update public.agencies a
set
  category = coalesce(a.category, r.category),
  rating = coalesce(a.rating, r.rating),
  review_count = coalesce(a.review_count, r.review_count),
  latitude = coalesce(a.latitude, r.latitude),
  longitude = coalesce(a.longitude, r.longitude),
  provider_place_id = coalesce(a.provider_place_id, r.provider_place_id),
  address = coalesce(nullif(a.address,''), r.address),
  city = coalesce(nullif(a.city,''), r.city),
  state = coalesce(nullif(a.state,''), r.state),
  website = coalesce(nullif(a.website,''), r.website),
  phone = coalesce(nullif(a.phone,''), r.phone),
  general_email = coalesce(nullif(a.general_email,''), r.email),
  source_url = coalesce(nullif(a.source_url,''), r.source_url)
from public.prospect_search_results r
where r.imported_agency_id = a.id;

create index if not exists agencies_provider_place_idx
on public.agencies(company_id, provider_place_id)
where provider_place_id is not null;

notify pgrst, 'reload schema';

-- Keep the enhanced agency fields and general contact on every future prospect import.
create or replace function public.dmh_import_prospect_result(p_result_id uuid)
returns public.agencies
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.prospect_search_results;
  a public.agencies;
  normalized_domain text;
  normalized_phone text;
begin
  if public.current_role() <> 'employee' then
    raise exception 'Employee access required.';
  end if;

  select * into r
  from public.prospect_search_results
  where id = p_result_id
    and company_id = public.current_company_id()
    and employee_id = auth.uid()
  for update;

  if not found then raise exception 'Prospect result not found.'; end if;

  if r.imported_agency_id is not null then
    select * into a from public.agencies where id = r.imported_agency_id;
    return a;
  end if;

  if r.matched_agency_id is not null then
    raise exception 'This result already matches an existing agency.';
  end if;

  normalized_domain := nullif(lower(regexp_replace(coalesce(r.domain,''),'^www\.','','i')),'');
  normalized_phone := nullif(regexp_replace(coalesce(r.phone,''),'[^0-9]','','g'),'');

  select * into a
  from public.agencies
  where company_id = r.company_id
    and (
      (normalized_domain is not null and lower(regexp_replace(coalesce(domain,''),'^www\.','','i')) = normalized_domain)
      or (normalized_phone is not null and regexp_replace(coalesce(phone,''),'[^0-9]','','g') = normalized_phone)
      or normalized_name = lower(regexp_replace(r.name,'[^a-zA-Z0-9]','','g'))
    )
  limit 1;

  if found then
    update public.prospect_search_results
    set duplicate_status='existing', matched_agency_id=a.id
    where id=r.id;
    raise exception 'Duplicate blocked: this agency already exists.';
  end if;

  insert into public.agencies(
    company_id, discovered_by, assigned_to, name, website, domain, phone,
    address, city, state, source_url, general_email, status,
    ownership_started_at, ownership_expires_at, category, rating,
    review_count, latitude, longitude, provider_place_id
  ) values (
    r.company_id, auth.uid(), auth.uid(), r.name, nullif(trim(r.website),''),
    normalized_domain, nullif(trim(r.phone),''), nullif(trim(r.address),''),
    nullif(trim(r.city),''), nullif(trim(r.state),''), nullif(trim(r.source_url),''),
    nullif(lower(trim(r.email)),''), 'new', now(), now()+interval '30 days',
    nullif(trim(r.category),''), r.rating, r.review_count, r.latitude, r.longitude,
    nullif(trim(r.provider_place_id),'')
  ) returning * into a;

  if nullif(trim(r.email),'') is not null or nullif(trim(r.phone),'') is not null then
    insert into public.agency_contacts(
      company_id, agency_id, first_name, last_name, title, email, phone, is_decision_maker
    ) values (
      r.company_id, a.id, 'General', null, 'General Contact',
      nullif(lower(trim(r.email)),''), nullif(trim(r.phone),''), false
    );
  end if;

  update public.prospect_search_results
  set imported_agency_id=a.id, imported_at=now(), duplicate_status='existing'
  where id=r.id;

  update public.prospect_searches
  set imported_count=imported_count+1
  where id=r.search_id;

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
  values(r.company_id,auth.uid(),'prospect_imported','agency',a.id,
    jsonb_build_object('search_result_id',r.id,'source','g_maps_extractor','contact_created',
      (nullif(trim(r.email),'') is not null or nullif(trim(r.phone),'') is not null)));

  return a;
end;
$$;

grant execute on function public.dmh_import_prospect_result(uuid) to authenticated;
notify pgrst, 'reload schema';
