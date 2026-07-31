-- DMHOUSE Sales OS
-- Owner Portfolio Management Recovery
-- Adds separate masked/unmasked file lifecycles and database deletion protection.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'portfolio_file_type'
  ) then
    create type public.portfolio_file_type as enum ('masked', 'unmasked');
  end if;
end $$;

alter table public.portfolio_files
  add column if not exists file_type public.portfolio_file_type;

update public.portfolio_files
set file_type = 'masked'
where file_type is null;

alter table public.portfolio_files
  alter column file_type set default 'masked',
  alter column file_type set not null;

update public.portfolio_files
set employee_visible = false
where file_type = 'unmasked';

alter table public.portfolio_files
  drop constraint if exists portfolio_files_portfolio_id_version_key;

create unique index if not exists portfolio_files_type_version_unique
  on public.portfolio_files(portfolio_id, file_type, version);

create index if not exists portfolio_files_current_lookup_idx
  on public.portfolio_files(portfolio_id, file_type, version desc)
  where locked_at is null;

drop policy if exists "portfolio files readable"
  on public.portfolio_files;

drop policy if exists "owner manages files"
  on public.portfolio_files;

create policy "owner reads portfolio files"
on public.portfolio_files
for select
using (
  company_id = public.current_company_id()
  and public.current_role() = 'owner'
);

create policy "owner inserts portfolio files"
on public.portfolio_files
for insert
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'owner'
  and (
    file_type = 'masked'
    or employee_visible = false
  )
);

create policy "owner updates portfolio files"
on public.portfolio_files
for update
using (
  company_id = public.current_company_id()
  and public.current_role() = 'owner'
)
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'owner'
  and (
    file_type = 'masked'
    or employee_visible = false
  )
);

create policy "owner deletes portfolio files"
on public.portfolio_files
for delete
using (
  company_id = public.current_company_id()
  and public.current_role() = 'owner'
);

create or replace function public.dmh_portfolio_delete_blockers(
  p_portfolio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_role text := public.current_role();
  v_result jsonb;
begin
  if v_role <> 'owner' then
    raise exception 'Only the owner can inspect portfolio deletion status.';
  end if;

  if not exists (
    select 1
    from public.portfolios
    where id = p_portfolio_id
      and company_id = v_company
  ) then
    raise exception 'Portfolio not found.';
  end if;

  select jsonb_build_object(
    'offers', (
      select count(*)
      from public.offers
      where portfolio_id = p_portfolio_id
    ),
    'reservations', (
      select count(*)
      from public.reservations
      where portfolio_id = p_portfolio_id
    ),
    'sales', (
      select count(*)
      from public.sales
      where portfolio_id = p_portfolio_id
    ),
    'distributions', (
      select count(*)
      from public.portfolio_distributions
      where portfolio_id = p_portfolio_id
    ),
    'assignments', (
      select count(*)
      from public.sales_opportunities
      where portfolio_id = p_portfolio_id
    ),
    'dealRooms', (
      select count(*)
      from public.buyer_deal_rooms
      where portfolio_id = p_portfolio_id
    ),
    'buyerAccess', (
      select count(*)
      from public.buyer_portfolio_access
      where portfolio_id = p_portfolio_id
    )
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.dmh_delete_portfolio(
  p_portfolio_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_role text := public.current_role();
  v_status public.portfolio_status;
  v_blockers jsonb;
  v_total integer;
begin
  if v_role <> 'owner' then
    raise exception 'Only the owner can delete portfolios.';
  end if;

  select status
  into v_status
  from public.portfolios
  where id = p_portfolio_id
    and company_id = v_company
  for update;

  if not found then
    raise exception 'Portfolio not found.';
  end if;

  v_blockers := public.dmh_portfolio_delete_blockers(p_portfolio_id);

  select coalesce(sum(value::integer), 0)
  into v_total
  from jsonb_each_text(v_blockers);

  if v_total > 0 then
    raise exception
      'Portfolio cannot be deleted because it participates in a transaction. Blockers: %',
      v_blockers;
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft portfolios with no transaction history can be deleted.';
  end if;

  delete from public.portfolios
  where id = p_portfolio_id
    and company_id = v_company;
end;
$$;

revoke all on function public.dmh_portfolio_delete_blockers(uuid) from public;
revoke all on function public.dmh_delete_portfolio(uuid) from public;

grant execute on function public.dmh_portfolio_delete_blockers(uuid) to authenticated;
grant execute on function public.dmh_delete_portfolio(uuid) to authenticated;
