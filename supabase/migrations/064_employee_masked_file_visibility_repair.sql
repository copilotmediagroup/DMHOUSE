-- DMHOUSE v5.1.1 — Employee Masked File Visibility Repair
-- Restores company-scoped employee access to approved masked portfolio metadata
-- after migration 051 narrowed portfolio_files reads to owners only.

begin;

drop policy if exists "owner reads portfolio files" on public.portfolio_files;
drop policy if exists "employee reads approved masked files" on public.portfolio_files;
drop policy if exists "company portfolio files readable" on public.portfolio_files;

create policy "company portfolio files readable"
on public.portfolio_files
for select
to authenticated
using (
  company_id = public.current_company_id()
  and locked_at is null
  and (
    public.current_role() = 'owner'
    or (
      public.current_role() = 'employee'
      and file_type = 'masked'
      and employee_visible = true
    )
  )
);

-- Keep storage private but allow authenticated company users to read objects in
-- their own company folder. Metadata RLS above determines which files appear.
drop policy if exists "company portfolio files read" on storage.objects;
create policy "company portfolio files read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolio-files'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

commit;
