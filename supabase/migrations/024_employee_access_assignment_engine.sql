-- DMH Sales OS v1.4.2 · Employee Access & Assignment Engine
-- Company-wide assignment control, workload limits, shared access, strict employee visibility,
-- round-robin distribution, and automatic reassignment when an employee is deactivated.

alter table public.profiles
  add column if not exists permission_level text not null default 'sales_rep',
  add column if not exists max_agencies integer not null default 150;

create table if not exists public.agency_assignment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  from_employee_id uuid references public.profiles(id),
  to_employee_id uuid references public.profiles(id),
  changed_by uuid references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_shared_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid references public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(agency_id,employee_id)
);

create index if not exists agency_assignment_history_company_idx on public.agency_assignment_history(company_id,created_at desc);
create index if not exists agency_shared_assignments_employee_idx on public.agency_shared_assignments(company_id,employee_id,agency_id);

alter table public.agency_assignment_history enable row level security;
alter table public.agency_shared_assignments enable row level security;

drop policy if exists agency_assignment_history_owner_read on public.agency_assignment_history;
create policy agency_assignment_history_owner_read on public.agency_assignment_history for select to authenticated
using(company_id=public.current_company_id() and public.current_role()='owner');

drop policy if exists agency_shared_assignments_company_read on public.agency_shared_assignments;
create policy agency_shared_assignments_company_read on public.agency_shared_assignments for select to authenticated
using(company_id=public.current_company_id() and (public.current_role()='owner' or employee_id=auth.uid()));

-- Replace broad agency visibility with assignment-aware visibility.
drop policy if exists "company agencies readable" on public.agencies;
drop policy if exists "company agencies writable" on public.agencies;
drop policy if exists "assigned or owner updates agencies" on public.agencies;
drop policy if exists "employees create agencies" on public.agencies;
drop policy if exists agencies_assignment_read on public.agencies;
drop policy if exists agencies_assignment_insert on public.agencies;
drop policy if exists agencies_assignment_update on public.agencies;

create policy agencies_assignment_read on public.agencies for select to authenticated
using (
  company_id=public.current_company_id()
  and (
    public.current_role()='owner'
    or assigned_to=auth.uid()
    or exists (
      select 1 from public.agency_shared_assignments s
      where s.agency_id=agencies.id and s.employee_id=auth.uid()
        and (s.expires_at is null or s.expires_at>now())
    )
  )
);
create policy agencies_assignment_insert on public.agencies for insert to authenticated
with check(company_id=public.current_company_id() and discovered_by=auth.uid() and assigned_to=auth.uid());
create policy agencies_assignment_update on public.agencies for update to authenticated
using(company_id=public.current_company_id() and (public.current_role()='owner' or assigned_to=auth.uid()))
with check(company_id=public.current_company_id());

-- Assigned employees only see follow-ups and opportunities in their workload.
drop policy if exists follow_ups_company_all on public.follow_ups;
drop policy if exists "company follow ups" on public.follow_ups;
drop policy if exists follow_ups_assignment_all on public.follow_ups;
create policy follow_ups_assignment_all on public.follow_ups for all to authenticated
using(company_id=public.current_company_id() and (public.current_role()='owner' or employee_id=auth.uid()))
with check(company_id=public.current_company_id() and (public.current_role()='owner' or employee_id=auth.uid()));

drop policy if exists sales_opportunities_company_all on public.sales_opportunities;
drop policy if exists sales_opportunities_assignment_all on public.sales_opportunities;
create policy sales_opportunities_assignment_all on public.sales_opportunities for all to authenticated
using (
  company_id=public.current_company_id()
  and (
    public.current_role()='owner'
    or owner_id=auth.uid()
    or exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid())
    or exists(select 1 from public.agency_shared_assignments s where s.agency_id=sales_opportunities.agency_id and s.employee_id=auth.uid() and (s.expires_at is null or s.expires_at>now()))
  )
)
with check (
  company_id=public.current_company_id()
  and (
    public.current_role()='owner'
    or owner_id=auth.uid()
    or exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid())
  )
);

create or replace function public.dmh_employee_workloads()
returns table(
  employee_id uuid,
  full_name text,
  email text,
  is_active boolean,
  permission_level text,
  max_agencies integer,
  assigned_agencies bigint,
  follow_ups_due_today bigint,
  open_opportunities bigint,
  pipeline_value numeric,
  calls_today bigint,
  emails_today bigint
)
language plpgsql security definer set search_path=public,auth as $$
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  return query
  select p.id,p.full_name,u.email::text,p.is_active,p.permission_level,p.max_agencies,
    (select count(*) from agencies a where a.company_id=p.company_id and a.assigned_to=p.id),
    (select count(*) from follow_ups f where f.company_id=p.company_id and f.employee_id=p.id and f.completed_at is null and f.due_at::date=current_date),
    (select count(*) from sales_opportunities o where o.company_id=p.company_id and o.owner_id=p.id and o.stage not in ('closed_won','closed_lost')),
    coalesce((select sum(o.asking_price) from sales_opportunities o where o.company_id=p.company_id and o.owner_id=p.id and o.stage not in ('closed_won','closed_lost')),0),
    (select count(*) from outreach_activities oa where oa.company_id=p.company_id and oa.employee_id=p.id and oa.activity_type in ('call','voicemail') and oa.occurred_at::date=current_date),
    (select count(*) from outreach_activities oa where oa.company_id=p.company_id and oa.employee_id=p.id and oa.activity_type='email' and oa.occurred_at::date=current_date)
  from profiles p left join auth.users u on u.id=p.id
  where p.company_id=public.current_company_id() and p.role='employee'
  order by p.is_active desc,p.full_name;
end $$;
grant execute on function public.dmh_employee_workloads() to authenticated;

create or replace function public.dmh_set_employee_assignment_settings(p_employee_id uuid,p_permission_level text,p_max_agencies integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 if p_permission_level not in ('sales_rep','senior_rep','manager') then raise exception 'Invalid permission level'; end if;
 if p_max_agencies<1 or p_max_agencies>5000 then raise exception 'Maximum workload must be between 1 and 5000'; end if;
 update profiles set permission_level=p_permission_level,max_agencies=p_max_agencies
 where id=p_employee_id and company_id=public.current_company_id() and role='employee';
 if not found then raise exception 'Employee not found'; end if;
end $$;
grant execute on function public.dmh_set_employee_assignment_settings(uuid,text,integer) to authenticated;

create or replace function public.dmh_assign_agencies(p_agency_ids uuid[],p_employee_id uuid,p_reason text default 'Manual assignment')
returns integer language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_current integer; v_max integer; v_count integer; r record;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 v_company:=public.current_company_id();
 select max_agencies into v_max from profiles where id=p_employee_id and company_id=v_company and role='employee' and is_active;
 if v_max is null then raise exception 'Active employee not found'; end if;
 select count(*) into v_current from agencies where company_id=v_company and assigned_to=p_employee_id;
 select count(*) into v_count from agencies where company_id=v_company and id=any(p_agency_ids) and assigned_to is distinct from p_employee_id;
 if v_current+v_count>v_max then raise exception 'Assignment exceeds employee workload limit'; end if;
 for r in select id,assigned_to from agencies where company_id=v_company and id=any(p_agency_ids) loop
   update agencies set assigned_to=p_employee_id,ownership_started_at=now(),ownership_expires_at=now()+interval '30 days' where id=r.id;
   update sales_opportunities set owner_id=p_employee_id,updated_at=now() where agency_id=r.id and company_id=v_company and stage not in ('closed_won','closed_lost');
   update follow_ups set employee_id=p_employee_id where agency_id=r.id and company_id=v_company and completed_at is null;
   insert into agency_assignment_history(company_id,agency_id,from_employee_id,to_employee_id,changed_by,reason)
   values(v_company,r.id,r.assigned_to,p_employee_id,auth.uid(),coalesce(nullif(btrim(p_reason),''),'Manual assignment'));
 end loop;
 return v_count;
end $$;
grant execute on function public.dmh_assign_agencies(uuid[],uuid,text) to authenticated;

create or replace function public.dmh_unassign_agency(p_agency_id uuid,p_reason text default 'Owner removed assignment')
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_from uuid;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 v_company:=public.current_company_id();
 select assigned_to into v_from from agencies where id=p_agency_id and company_id=v_company;
 update agencies set assigned_to=null,ownership_expires_at=now() where id=p_agency_id and company_id=v_company;
 insert into agency_assignment_history(company_id,agency_id,from_employee_id,to_employee_id,changed_by,reason)
 values(v_company,p_agency_id,v_from,null,auth.uid(),coalesce(nullif(btrim(p_reason),''),'Owner removed assignment'));
end $$;
grant execute on function public.dmh_unassign_agency(uuid,text) to authenticated;

create or replace function public.dmh_round_robin_assign(p_only_unassigned boolean default true,p_state text default null,p_city text default null,p_category text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_employee uuid; v_assigned integer:=0; r record;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 v_company:=public.current_company_id();
 for r in
   select a.id,a.assigned_to from agencies a
   where a.company_id=v_company
     and (not p_only_unassigned or a.assigned_to is null)
     and (p_state is null or btrim(p_state)='' or lower(a.state)=lower(btrim(p_state)))
     and (p_city is null or btrim(p_city)='' or lower(a.city)=lower(btrim(p_city)))
     and (p_category is null or btrim(p_category)='' or lower(coalesce(a.category,''))=lower(btrim(p_category)))
   order by a.created_at
 loop
   select p.id into v_employee
   from profiles p
   where p.company_id=v_company and p.role='employee' and p.is_active
     and (select count(*) from agencies x where x.company_id=v_company and x.assigned_to=p.id)<p.max_agencies
   order by (select count(*) from agencies x where x.company_id=v_company and x.assigned_to=p.id),p.created_at
   limit 1;
   exit when v_employee is null;
   update agencies set assigned_to=v_employee,ownership_started_at=now(),ownership_expires_at=now()+interval '30 days' where id=r.id;
   update sales_opportunities set owner_id=v_employee,updated_at=now() where agency_id=r.id and company_id=v_company and stage not in ('closed_won','closed_lost');
   update follow_ups set employee_id=v_employee where agency_id=r.id and company_id=v_company and completed_at is null;
   insert into agency_assignment_history(company_id,agency_id,from_employee_id,to_employee_id,changed_by,reason)
   values(v_company,r.id,r.assigned_to,v_employee,auth.uid(),'Round-robin assignment');
   v_assigned:=v_assigned+1;
 end loop;
 return v_assigned;
end $$;
grant execute on function public.dmh_round_robin_assign(boolean,text,text,text) to authenticated;

create or replace function public.dmh_share_agency(p_agency_id uuid,p_employee_id uuid,p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 if not exists(select 1 from agencies where id=p_agency_id and company_id=public.current_company_id()) then raise exception 'Agency not found'; end if;
 if not exists(select 1 from profiles where id=p_employee_id and company_id=public.current_company_id() and role='employee' and is_active) then raise exception 'Active employee not found'; end if;
 insert into agency_shared_assignments(company_id,agency_id,employee_id,shared_by,expires_at)
 values(public.current_company_id(),p_agency_id,p_employee_id,auth.uid(),p_expires_at)
 on conflict(agency_id,employee_id) do update set shared_by=excluded.shared_by,expires_at=excluded.expires_at,created_at=now();
end $$;
grant execute on function public.dmh_share_agency(uuid,uuid,timestamptz) to authenticated;

-- Deactivation now redistributes open work to the least-loaded active employee.
create or replace function public.dmh_set_employee_active(p_employee_id uuid,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_target uuid; r record;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 v_company:=public.current_company_id();
 update profiles set is_active=p_is_active where id=p_employee_id and company_id=v_company and role='employee';
 if not found then raise exception 'Employee not found'; end if;
 if not p_is_active then
   for r in select id,assigned_to from agencies where company_id=v_company and assigned_to=p_employee_id loop
     select p.id into v_target from profiles p
     where p.company_id=v_company and p.role='employee' and p.is_active and p.id<>p_employee_id
       and (select count(*) from agencies a where a.company_id=v_company and a.assigned_to=p.id)<p.max_agencies
     order by (select count(*) from agencies a where a.company_id=v_company and a.assigned_to=p.id),p.created_at limit 1;
     update agencies set assigned_to=v_target,ownership_started_at=case when v_target is null then ownership_started_at else now() end,
       ownership_expires_at=case when v_target is null then now() else now()+interval '30 days' end where id=r.id;
     update sales_opportunities set owner_id=v_target,updated_at=now() where agency_id=r.id and company_id=v_company and stage not in ('closed_won','closed_lost');
     if v_target is not null then update follow_ups set employee_id=v_target where agency_id=r.id and company_id=v_company and completed_at is null; end if;
     insert into agency_assignment_history(company_id,agency_id,from_employee_id,to_employee_id,changed_by,reason)
     values(v_company,r.id,p_employee_id,v_target,auth.uid(),'Automatic reassignment after deactivation');
   end loop;
 end if;
 insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data)
 values(v_company,auth.uid(),case when p_is_active then 'employee_activated' else 'employee_deactivated' end,'profile',p_employee_id,jsonb_build_object('is_active',p_is_active));
end $$;
grant execute on function public.dmh_set_employee_active(uuid,boolean) to authenticated;

notify pgrst,'reload schema';

-- Harden stage movement so employees cannot modify another employee's agency by guessing an ID.
create or replace function public.dmh_move_pipeline_stage(p_agency_id uuid,p_stage text)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_from text; v_role user_role;
begin
 select company_id,role into v_company,v_role from profiles where id=auth.uid();
 if p_stage not in ('new','researching','first_contact','conversation_started','decision_maker_found','portfolio_requested','portfolio_sent','negotiating','verbal_agreement','contracts','closed_won','closed_lost') then raise exception 'Invalid pipeline stage'; end if;
 select pipeline_stage into v_from from agencies where id=p_agency_id and company_id=v_company
   and (v_role='owner' or assigned_to=auth.uid() or exists(select 1 from agency_shared_assignments s where s.agency_id=p_agency_id and s.employee_id=auth.uid() and (s.expires_at is null or s.expires_at>now())));
 if v_from is null then raise exception 'Agency is not assigned to this employee'; end if;
 update agencies set pipeline_stage=p_stage,pipeline_stage_changed_at=now(),status=case p_stage
  when 'new' then 'new' when 'researching' then 'researching' when 'first_contact' then 'contacted'
  when 'conversation_started' then 'contacted' when 'decision_maker_found' then 'qualified'
  when 'portfolio_requested' then 'qualified' when 'portfolio_sent' then 'portfolio_sent'
  when 'negotiating' then 'negotiating' when 'verbal_agreement' then 'offer_submitted'
  when 'contracts' then 'offer_submitted' when 'closed_won' then 'closed' else 'not_interested' end
 where id=p_agency_id and company_id=v_company;
 update sales_opportunities set stage=p_stage,updated_at=now(),closed_at=case when p_stage in ('closed_won','closed_lost') then now() else null end where agency_id=p_agency_id and company_id=v_company and stage not in ('closed_won','closed_lost');
 insert into pipeline_stage_history(company_id,agency_id,changed_by,from_stage,to_stage) values(v_company,p_agency_id,auth.uid(),v_from,p_stage);
end $$;
grant execute on function public.dmh_move_pipeline_stage(uuid,text) to authenticated;

notify pgrst,'reload schema';

-- Contacts and activity records inherit the visibility of their agency.
drop policy if exists "company contacts readable" on public.agency_contacts;
drop policy if exists "company contacts writable" on public.agency_contacts;
drop policy if exists agency_contacts_assignment_read on public.agency_contacts;
drop policy if exists agency_contacts_assignment_write on public.agency_contacts;
create policy agency_contacts_assignment_read on public.agency_contacts for select to authenticated
using(company_id=public.current_company_id() and exists(select 1 from public.agencies a where a.id=agency_id));
create policy agency_contacts_assignment_write on public.agency_contacts for all to authenticated
using(company_id=public.current_company_id() and (public.current_role()='owner' or exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid())))
with check(company_id=public.current_company_id() and (public.current_role()='owner' or exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid())));

drop policy if exists "company outreach" on public.outreach_activities;
drop policy if exists outreach_assignment_all on public.outreach_activities;
create policy outreach_assignment_all on public.outreach_activities for all to authenticated
using(company_id=public.current_company_id() and (public.current_role()='owner' or employee_id=auth.uid() or exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid())))
with check(company_id=public.current_company_id() and (public.current_role()='owner' or (employee_id=auth.uid() and exists(select 1 from public.agencies a where a.id=agency_id and a.assigned_to=auth.uid()))));

notify pgrst,'reload schema';
