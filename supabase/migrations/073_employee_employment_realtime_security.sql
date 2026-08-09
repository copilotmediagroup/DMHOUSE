-- ============================================================
-- DMHOUSE Sales OS
-- Migration 073
-- Employment Realtime Security
--
-- Production behavior recovered from live database:
--
-- • Every employee receives canonical employment state.
-- • Existing employment state is never reset by profile updates.
-- • Terminated employees cannot be directly reactivated.
-- • Proper Owner Rehire changes employment state FIRST.
-- • Employment state is Realtime-enabled.
-- • REPLICA IDENTITY FULL supports reliable update payloads.
-- ============================================================


-- ============================================================
-- 1. AUTOMATIC EMPLOYMENT-STATE FOUNDATION
-- ============================================================

create or replace function
public.dmh_ensure_employee_employment_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_created uuid;
begin

  /*
    Only Sales OS employees participate
    in the employment lifecycle engine.
  */
  if new.role::text <> 'employee' then
    return new;
  end if;


  /*
    Create state only when it does not exist.

    CRITICAL:
    Never overwrite status on conflict.

    A profile UPDATE must never accidentally
    convert suspended/terminated employment
    back to active.
  */
  insert into public.employee_employment_state(
    employee_id,
    company_id,
    status,
    created_at,
    updated_at
  )
  values(
    new.id,
    new.company_id,
    'active',
    now(),
    now()
  )

  on conflict(employee_id)
  do update
  set
    company_id =
      excluded.company_id,

    updated_at =
      public.employee_employment_state.updated_at

  returning employee_id
  into v_created;


  /*
    Record creation only when this is the
    first employment lifecycle record.

    ON CONFLICT UPDATE also returns a row,
    so verify that an employment-created
    event does not already exist.
  */
  if not exists(
    select 1
    from public.employee_employment_events e
    where e.employee_id =
        new.id

      and e.event_type =
        'employee.employment_created'
  )
  then

    insert into public.employee_employment_events(
      employee_id,
      company_id,
      actor_id,
      event_type,
      reason,
      metadata,
      created_at
    )
    values(
      new.id,
      new.company_id,
      auth.uid(),

      'employee.employment_created',

      'Employee employment lifecycle created.',

      jsonb_build_object(
        'initialStatus',
        'active',

        'profileActive',
        new.is_active
      ),

      now()
    );

  end if;


  return new;

end;
$function$;


-- ============================================================
-- 2. REGISTER PROFILE → EMPLOYMENT SYNCHRONIZATION
-- ============================================================

drop trigger if exists
ensure_employee_employment_state
on public.profiles;


create trigger
ensure_employee_employment_state
after insert or update
on public.profiles
for each row
execute function
public.dmh_ensure_employee_employment_state();


-- ============================================================
-- 3. HARD TERMINATION REACTIVATION PROTECTION
-- ============================================================

create or replace function
public.dmh_protect_terminated_employee_activation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
begin

  /*
    We care only about a transition from
    inactive → active for an employee.
  */
  if new.role::text <> 'employee' then
    return new;
  end if;


  if
    coalesce(old.is_active, false) = false
    and
    coalesce(new.is_active, false) = true
  then

    select s.status
    into v_status

    from public.employee_employment_state s

    where s.employee_id =
      new.id;


    /*
      A terminated employee cannot be restored
      by directly changing profiles.is_active.

      dmh_owner_rehire_employee() works because
      Migration 072 changes employment state
      from terminated → active BEFORE setting
      profiles.is_active = true.
    */
    if v_status = 'terminated' then

      raise exception
        'Terminated employee cannot be directly reactivated. Use the Owner Rehire workflow.';

    end if;

  end if;


  return new;

end;
$function$;


drop trigger if exists
protect_terminated_employee_activation
on public.profiles;


create trigger
protect_terminated_employee_activation
before update
on public.profiles
for each row
execute function
public.dmh_protect_terminated_employee_activation();


-- ============================================================
-- 4. SAFE BACKFILL
--
-- Ensures an installation restored from migrations has
-- employment-state rows for existing employees.
--
-- Existing suspended/terminated states are NEVER overwritten.
-- ============================================================

insert into public.employee_employment_state(
  employee_id,
  company_id,
  status,
  created_at,
  updated_at
)

select
  p.id,
  p.company_id,
  'active',
  now(),
  now()

from public.profiles p

where p.role::text =
  'employee'

on conflict(employee_id)
do nothing;


-- ============================================================
-- 5. SAFE EMPLOYMENT-CREATED HISTORY BACKFILL
-- ============================================================

insert into public.employee_employment_events(
  employee_id,
  company_id,
  actor_id,
  event_type,
  reason,
  metadata,
  created_at
)

select
  s.employee_id,

  s.company_id,

  null,

  'employee.employment_created',

  'Employment lifecycle recovered during migration.',

  jsonb_build_object(
    'initialStatus',
    s.status,

    'source',
    'migration_073'
  ),

  coalesce(
    s.created_at,
    now()
  )

from public.employee_employment_state s

where not exists(

  select 1

  from public.employee_employment_events e

  where e.employee_id =
      s.employee_id

    and e.event_type =
      'employee.employment_created'
);


-- ============================================================
-- 6. REALTIME UPDATE PAYLOAD HARDENING
-- ============================================================

alter table
public.employee_employment_state
replica identity full;


-- ============================================================
-- 7. SUPABASE REALTIME PUBLICATION
--
-- Idempotent:
-- Adds the table only when it is not already published.
-- ============================================================

do $$
begin

  if exists(
    select 1
    from pg_publication
    where pubname =
      'supabase_realtime'
  )
  and not exists(

    select 1

    from pg_publication_tables

    where pubname =
        'supabase_realtime'

      and schemaname =
        'public'

      and tablename =
        'employee_employment_state'
  )
  then

    execute
      'alter publication supabase_realtime add table public.employee_employment_state';

  end if;

end;
$$;


-- ============================================================
-- 8. FUNCTION SECURITY
-- ============================================================

revoke all on function
public.dmh_ensure_employee_employment_state()
from public;


revoke all on function
public.dmh_protect_terminated_employee_activation()
from public;


-- Trigger execution does not require browser EXECUTE access.
-- These functions remain internal database security primitives.


-- ============================================================
-- END MIGRATION 073
-- ============================================================
