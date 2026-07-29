-- DMH Sales OS v0.7.0 — Live Agency & Prospecting Engine
-- Idempotent upgrade of the existing foundation; no dependency on agency_assignments.

alter table public.agencies add column if not exists general_email text;
alter table public.agencies add column if not exists status text not null default 'new';
alter table public.agencies add column if not exists ownership_started_at timestamptz;

alter table public.outreach_activities add column if not exists follow_up_at timestamptz;
alter table public.outreach_activities add column if not exists completed_at timestamptz;

create index if not exists agencies_general_email_idx on public.agencies(company_id, lower(general_email));
create index if not exists agencies_assigned_to_idx on public.agencies(company_id, assigned_to);
create index if not exists agencies_ownership_expiry_idx on public.agencies(company_id, ownership_expires_at);
create index if not exists outreach_follow_up_live_idx on public.outreach_activities(company_id, follow_up_at) where follow_up_at is not null and completed_at is null;

-- Existing company-scoped RLS from the foundation remains authoritative.
-- These policies are recreated only when absent.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agencies' and policyname='company agencies readable') then
    execute 'create policy "company agencies readable" on public.agencies for select using(company_id=public.current_company_id())';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agencies' and policyname='company agencies writable') then
    execute 'create policy "company agencies writable" on public.agencies for all using(company_id=public.current_company_id()) with check(company_id=public.current_company_id())';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agency_contacts' and policyname='company contacts readable') then
    execute 'create policy "company contacts readable" on public.agency_contacts for select using(company_id=public.current_company_id())';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agency_contacts' and policyname='company contacts writable') then
    execute 'create policy "company contacts writable" on public.agency_contacts for all using(company_id=public.current_company_id()) with check(company_id=public.current_company_id())';
  end if;
end $$;
