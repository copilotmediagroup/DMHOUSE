-- DMH Sales OS v1.4.1 · Company Membership Engine
-- Repairs existing employee/company separation and prevents new employee accounts
-- from creating isolated workspaces.

create extension if not exists pgcrypto;

alter table public.companies
  add column if not exists join_code text;

update public.companies
set join_code = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
where join_code is null or btrim(join_code) = '';

create unique index if not exists companies_join_code_uidx
  on public.companies (upper(join_code));

-- Repair the known single-company DMH deployment: employees living in a company
-- with no active portfolio are attached to the company that owns the active portfolio.
do $$
declare
  v_company_id uuid;
begin
  select p.company_id
    into v_company_id
  from public.portfolios p
  where p.status in ('active','negotiating','reserved','payment_pending')
  order by p.activated_at desc nulls last, p.created_at asc
  limit 1;

  if v_company_id is not null then
    update public.profiles pr
       set company_id = v_company_id
     where pr.role = 'employee'
       and pr.company_id <> v_company_id
       and not exists (
         select 1
         from public.portfolios own_p
         where own_p.company_id = pr.company_id
           and own_p.status in ('active','negotiating','reserved','payment_pending')
       );
  end if;
end $$;

-- New employee accounts join a company through an owner-issued code stored in
-- Supabase Auth metadata. Owner accounts continue through bootstrap_dmh_owner.
create or replace function public.handle_dmh_employee_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_join_code text;
  v_company_id uuid;
  v_full_name text;
begin
  if coalesce(new.raw_user_meta_data->>'account_type','') <> 'employee' then
    return new;
  end if;

  v_join_code := upper(btrim(coalesce(new.raw_user_meta_data->>'join_code','')));
  v_full_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1), 'Employee');

  select c.id into v_company_id
  from public.companies c
  where upper(c.join_code) = v_join_code
  limit 1;

  if v_company_id is null then
    raise exception 'Invalid company join code';
  end if;

  insert into public.profiles(id, company_id, role, full_name, is_active)
  values(new.id, v_company_id, 'employee', v_full_name, true)
  on conflict (id) do update
    set company_id = excluded.company_id,
        role = 'employee',
        full_name = excluded.full_name,
        is_active = true;

  return new;
end;
$$;

drop trigger if exists on_dmh_employee_signup on auth.users;
create trigger on_dmh_employee_signup
after insert on auth.users
for each row execute function public.handle_dmh_employee_signup();

-- Company records are visible only to their members.
alter table public.companies enable row level security;
drop policy if exists "company members read own company" on public.companies;
create policy "company members read own company" on public.companies
for select to authenticated
using (id = public.current_company_id());

-- Owners can manage employee activation inside their own company.
drop policy if exists "owners update company profiles" on public.profiles;
create policy "owners update company profiles" on public.profiles
for update to authenticated
using (company_id = public.current_company_id() and public.current_role() = 'owner')
with check (company_id = public.current_company_id());

create or replace function public.dmh_company_members()
returns table(
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_role() <> 'owner' then
    raise exception 'Owner access required';
  end if;

  return query
  select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.company_id = public.current_company_id()
  order by case when p.role='owner' then 0 else 1 end, p.created_at;
end;
$$;
grant execute on function public.dmh_company_members() to authenticated;

create or replace function public.dmh_set_employee_active(p_employee_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;

  update public.profiles
     set is_active = p_is_active
   where id = p_employee_id
     and company_id = public.current_company_id()
     and role = 'employee';

  if not found then raise exception 'Employee not found'; end if;

  insert into public.audit_logs(company_id, actor_id, action, entity_type, entity_id, after_data)
  values(public.current_company_id(), auth.uid(), case when p_is_active then 'employee_activated' else 'employee_deactivated' end,
         'profile', p_employee_id, jsonb_build_object('is_active',p_is_active));
end;
$$;
grant execute on function public.dmh_set_employee_active(uuid,boolean) to authenticated;

create or replace function public.dmh_rotate_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if public.current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
    exit when not exists(select 1 from public.companies where upper(join_code)=v_code);
  end loop;
  update public.companies set join_code=v_code where id=public.current_company_id();
  return v_code;
end;
$$;
grant execute on function public.dmh_rotate_join_code() to authenticated;

-- Refresh API schema discovery.
notify pgrst, 'reload schema';
