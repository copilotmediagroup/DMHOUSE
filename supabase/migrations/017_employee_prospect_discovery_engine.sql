-- DMH Sales OS v1.3.0 — Employee Prospect Discovery Engine
create table if not exists public.prospect_searches (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.profiles(id), query text not null, location text not null,
 requested_limit integer not null default 25 check(requested_limit between 1 and 200), status text not null default 'running' check(status in ('running','completed','failed')),
 result_count integer not null default 0, imported_count integer not null default 0, provider text not null default 'g_maps_extractor',
 provider_request_id text, failure_reason text, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.prospect_search_results (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 search_id uuid not null references public.prospect_searches(id) on delete cascade, employee_id uuid not null references public.profiles(id),
 provider_place_id text, name text not null, category text, address text, city text, state text, phone text, website text, domain text,
 email text, source_url text, rating numeric(3,2), review_count integer, latitude numeric, longitude numeric,
 duplicate_status text not null default 'new' check(duplicate_status in ('new','existing','possible_duplicate','missing_contact')),
 matched_agency_id uuid references public.agencies(id), imported_agency_id uuid references public.agencies(id), raw_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), imported_at timestamptz
);
create index if not exists prospect_searches_employee_idx on public.prospect_searches(company_id,employee_id,created_at desc);
create index if not exists prospect_results_search_idx on public.prospect_search_results(search_id);
create unique index if not exists prospect_results_place_unique on public.prospect_search_results(search_id,provider_place_id) where provider_place_id is not null;
alter table public.prospect_searches enable row level security;
alter table public.prospect_search_results enable row level security;

drop policy if exists "employees own prospect searches" on public.prospect_searches;
create policy "employees own prospect searches" on public.prospect_searches for select using(company_id=public.current_company_id() and employee_id=auth.uid() and public.current_role()='employee');
drop policy if exists "employees own prospect results" on public.prospect_search_results;
create policy "employees own prospect results" on public.prospect_search_results for select using(company_id=public.current_company_id() and employee_id=auth.uid() and public.current_role()='employee');

create or replace function public.dmh_import_prospect_result(p_result_id uuid) returns public.agencies
language plpgsql security definer set search_path=public as $$
declare r public.prospect_search_results; a public.agencies; normalized_domain text; normalized_phone text;
begin
 if public.current_role() <> 'employee' then raise exception 'Employee access required.'; end if;
 select * into r from public.prospect_search_results where id=p_result_id and company_id=public.current_company_id() and employee_id=auth.uid() for update;
 if not found then raise exception 'Prospect result not found.'; end if;
 if r.imported_agency_id is not null then select * into a from public.agencies where id=r.imported_agency_id; return a; end if;
 if r.matched_agency_id is not null then raise exception 'This result already matches an existing agency.'; end if;
 normalized_domain := nullif(lower(regexp_replace(coalesce(r.domain,''),'^www\\.','','i')),'');
 normalized_phone := nullif(regexp_replace(coalesce(r.phone,''),'[^0-9]','','g'),'');
 select * into a from public.agencies where company_id=r.company_id and (
   (normalized_domain is not null and lower(coalesce(domain,''))=normalized_domain) or
   (normalized_phone is not null and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=normalized_phone) or
   normalized_name=lower(regexp_replace(r.name,'[^a-zA-Z0-9]','','g'))
 ) limit 1;
 if found then
   update public.prospect_search_results set duplicate_status='existing',matched_agency_id=a.id where id=r.id;
   raise exception 'Duplicate blocked: this agency already exists.';
 end if;
 insert into public.agencies(company_id,discovered_by,assigned_to,name,website,domain,phone,address,city,state,source_url,general_email,status,ownership_started_at,ownership_expires_at)
 values(r.company_id,auth.uid(),auth.uid(),r.name,r.website,normalized_domain,r.phone,r.address,r.city,r.state,r.source_url,r.email,'new',now(),now()+interval '30 days') returning * into a;
 update public.prospect_search_results set imported_agency_id=a.id, imported_at=now(), duplicate_status='existing' where id=r.id;
 update public.prospect_searches set imported_count=imported_count+1 where id=r.search_id;
 insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) values(r.company_id,auth.uid(),'prospect_imported','agency',a.id,jsonb_build_object('search_result_id',r.id,'source','g_maps_extractor'));
 return a;
end $$;
grant execute on function public.dmh_import_prospect_result(uuid) to authenticated;
