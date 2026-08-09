-- ============================================================
-- DMHOUSE Sales OS
-- Migration 068
-- Employee Academy Identity Foundation
--
-- PURPOSE
-- Extend the existing auth.users -> profiles -> company model.
-- Does NOT create a second employee identity system.
--
-- Existing employees are grandfathered and remain operational.
-- New Academy candidates will be handled by migration 069.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. ADD PRE-CERTIFICATION ROLE
-- ------------------------------------------------------------

alter type public.user_role
  add value if not exists 'academy';

-- ------------------------------------------------------------
-- 2. EXTEND EXISTING PROFILES
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists academy_required boolean not null default false,
  add column if not exists academy_certified boolean not null default false,
  add column if not exists academy_certified_at timestamptz,
  add column if not exists academy_final_score numeric(5,2),
  add column if not exists academy_version integer not null default 1;

comment on column public.profiles.academy_required
is 'True when this identity must complete DMHOUSE Academy before employee portal access.';

comment on column public.profiles.academy_certified
is 'Server-controlled certification state. Client applications must never set this directly.';

comment on column public.profiles.academy_certified_at
is 'Timestamp when the employee completed the required Academy curriculum.';

comment on column public.profiles.academy_final_score
is 'Final certification assessment score.';

comment on column public.profiles.academy_version
is 'Academy curriculum version under which the employee was certified.';

-- Grandfather CURRENT employees.
-- They existed before Academy became mandatory.
update public.profiles
set
  academy_required = false,
  academy_certified = true,
  academy_certified_at = coalesce(academy_certified_at, created_at),
  academy_version = 1
where role = 'employee'
  and academy_certified = false;

-- ------------------------------------------------------------
-- 3. EMPLOYEE INVITATIONS
-- ------------------------------------------------------------

create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  email text not null,
  normalized_email text not null,

  intended_full_name text,

  token_hash bytea not null unique,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'accepted',
        'revoked',
        'expired'
      )
    ),

  created_by uuid
    references public.profiles(id)
    on delete set null,

  accepted_by uuid
    references public.profiles(id)
    on delete set null,

  expires_at timestamptz not null,

  accepted_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    normalized_email = lower(btrim(email))
  ),

  check (
    expires_at > created_at
  )
);

create index if not exists employee_invites_company_idx
  on public.employee_invites(
    company_id,
    created_at desc
  );

create index if not exists employee_invites_email_idx
  on public.employee_invites(
    company_id,
    normalized_email
  );

create index if not exists employee_invites_status_idx
  on public.employee_invites(
    company_id,
    status,
    expires_at
  );

create unique index if not exists employee_invites_one_live_email_idx
  on public.employee_invites(
    company_id,
    normalized_email
  )
  where status = 'pending';

-- ------------------------------------------------------------
-- 4. ACADEMY ENROLLMENT
-- One authoritative row per candidate / employee.
-- ------------------------------------------------------------

create table if not exists public.academy_enrollments (
  employee_id uuid primary key
    references public.profiles(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  invite_id uuid unique
    references public.employee_invites(id)
    on delete set null,

  academy_version integer not null default 1,

  status text not null default 'enrolled'
    check (
      status in (
        'enrolled',
        'in_progress',
        'certified',
        'recertification_required'
      )
    ),

  current_mission integer not null default 1
    check (
      current_mission between 1 and 6
    ),

  started_at timestamptz,
  completed_at timestamptz,

  final_score numeric(5,2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_enrollments_company_idx
  on public.academy_enrollments(
    company_id,
    status,
    created_at desc
  );

-- ------------------------------------------------------------
-- 5. MISSION CATALOG
-- Global QuickStart curriculum definition.
-- ------------------------------------------------------------

create table if not exists public.academy_mission_catalog (
  academy_version integer not null,
  mission_number integer not null
    check (mission_number between 1 and 6),

  title text not null,

  passing_score numeric(5,2) not null
    check (
      passing_score >= 0
      and passing_score <= 100
    ),

  required boolean not null default true,
  is_active boolean not null default true,

  primary key (
    academy_version,
    mission_number
  )
);

insert into public.academy_mission_catalog(
  academy_version,
  mission_number,
  title,
  passing_score,
  required
)
values
  (1,1,'Welcome to Data Market House',85,true),
  (1,2,'Speak the Language',90,true),
  (1,3,'Read Your First Portfolio',90,true),
  (1,4,'Your First Buyer',90,true),
  (1,5,'Run the Process',90,true),
  (1,6,'Ready for Your First Buyer',90,true)
on conflict (
  academy_version,
  mission_number
)
do update set
  title = excluded.title,
  passing_score = excluded.passing_score,
  required = excluded.required;

-- ------------------------------------------------------------
-- 6. SERVER-SIDE ANSWER KEY
--
-- Employees NEVER receive direct SELECT permission.
-- This prevents the browser from declaring its own score.
-- ------------------------------------------------------------

create table if not exists public.academy_assessment_keys (
  academy_version integer not null,
  mission_number integer not null,
  item_key text not null,
  correct_choice integer not null
    check (correct_choice >= 0),
  weight numeric(8,4) not null default 1
    check (weight > 0),

  primary key (
    academy_version,
    mission_number,
    item_key
  ),

  foreign key (
    academy_version,
    mission_number
  )
  references public.academy_mission_catalog(
    academy_version,
    mission_number
  )
  on delete cascade
);

-- ------------------------------------------------------------
-- 7. MISSION PROGRESS
-- ------------------------------------------------------------

create table if not exists public.academy_mission_progress (
  employee_id uuid not null
    references public.profiles(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  academy_version integer not null,

  mission_number integer not null
    check (
      mission_number between 1 and 6
    ),

  status text not null default 'available'
    check (
      status in (
        'locked',
        'available',
        'in_progress',
        'complete'
      )
    ),

  best_score numeric(5,2)
    check (
      best_score is null
      or (
        best_score >= 0
        and best_score <= 100
      )
    ),

  attempt_count integer not null default 0
    check (attempt_count >= 0),

  started_at timestamptz,
  completed_at timestamptz,

  updated_at timestamptz not null default now(),

  primary key (
    employee_id,
    academy_version,
    mission_number
  ),

  foreign key (
    academy_version,
    mission_number
  )
  references public.academy_mission_catalog(
    academy_version,
    mission_number
  )
);

create index if not exists academy_progress_company_idx
  on public.academy_mission_progress(
    company_id,
    employee_id,
    mission_number
  );

-- ------------------------------------------------------------
-- 8. ATTEMPT HISTORY
-- ------------------------------------------------------------

create table if not exists public.academy_attempts (
  id uuid primary key default gen_random_uuid(),

  employee_id uuid not null
    references public.profiles(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  academy_version integer not null,

  mission_number integer not null
    check (
      mission_number between 1 and 6
    ),

  attempt_number integer not null
    check (attempt_number > 0),

  score numeric(5,2) not null
    check (
      score >= 0
      and score <= 100
    ),

  passed boolean not null,

  answers jsonb not null default '{}'::jsonb,

  started_at timestamptz,
  completed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  unique (
    employee_id,
    academy_version,
    mission_number,
    attempt_number
  ),

  foreign key (
    academy_version,
    mission_number
  )
  references public.academy_mission_catalog(
    academy_version,
    mission_number
  )
);

create index if not exists academy_attempts_employee_idx
  on public.academy_attempts(
    employee_id,
    mission_number,
    created_at desc
  );

create index if not exists academy_attempts_company_idx
  on public.academy_attempts(
    company_id,
    created_at desc
  );

-- ------------------------------------------------------------
-- 9. ACADEMY AUDIT EVENTS
-- ------------------------------------------------------------

create table if not exists public.academy_events (
  id bigint generated always as identity primary key,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  employee_id uuid
    references public.profiles(id)
    on delete set null,

  invite_id uuid
    references public.employee_invites(id)
    on delete set null,

  actor_id uuid
    references public.profiles(id)
    on delete set null,

  event_type text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists academy_events_company_idx
  on public.academy_events(
    company_id,
    created_at desc
  );

create index if not exists academy_events_employee_idx
  on public.academy_events(
    employee_id,
    created_at desc
  );

-- ------------------------------------------------------------
-- 10. UPDATED_AT HELPER
-- ------------------------------------------------------------

create or replace function public.dmh_academy_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_invites_touch_updated_at
  on public.employee_invites;

create trigger employee_invites_touch_updated_at
before update on public.employee_invites
for each row
execute function public.dmh_academy_touch_updated_at();

drop trigger if exists academy_enrollments_touch_updated_at
  on public.academy_enrollments;

create trigger academy_enrollments_touch_updated_at
before update on public.academy_enrollments
for each row
execute function public.dmh_academy_touch_updated_at();

-- ------------------------------------------------------------
-- 11. PROTECT CERTIFICATION COLUMNS
--
-- Even an authenticated owner/employee using the REST API
-- cannot simply set academy_certified=true.
-- ------------------------------------------------------------

create or replace function public.dmh_protect_academy_profile_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_internal text;
begin
  v_internal :=
    current_setting(
      'dmh.academy_internal',
      true
    );

  if coalesce(v_internal,'') <> '1'
     and auth.role() <> 'service_role'
  then

    if old.academy_required
         is distinct from
       new.academy_required
       or
       old.academy_certified
         is distinct from
       new.academy_certified
       or
       old.academy_certified_at
         is distinct from
       new.academy_certified_at
       or
       old.academy_final_score
         is distinct from
       new.academy_final_score
       or
       old.academy_version
         is distinct from
       new.academy_version
    then
      raise exception
        'Academy certification fields are server controlled.';
    end if;

    if (
      old.role::text = 'academy'
      or new.role::text = 'academy'
    )
    and old.role is distinct from new.role
    then
      raise exception
        'Academy role transitions are server controlled.';
    end if;

  end if;

  return new;
end;
$$;

drop trigger if exists protect_academy_profile_state
  on public.profiles;

create trigger protect_academy_profile_state
before update on public.profiles
for each row
execute function public.dmh_protect_academy_profile_state();

-- ------------------------------------------------------------
-- 12. EMPLOYEE PORTAL ACCESS HELPER
--
-- Existing employees are certified by the backfill above.
-- New candidates will have role=academy until completion.
-- ------------------------------------------------------------

create or replace function public.current_employee_portal_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'employee'
      and p.is_active = true
      and (
        p.academy_required = false
        or p.academy_certified = true
      )
  );
$$;

revoke all
on function public.current_employee_portal_access()
from public;

grant execute
on function public.current_employee_portal_access()
to authenticated;

-- ------------------------------------------------------------
-- 13. OWNER CREATES INVITE
-- Returns RAW token ONCE.
-- Database stores only SHA-256 digest.
-- ------------------------------------------------------------

create or replace function public.dmh_owner_create_employee_invite(
  p_email text,
  p_full_name text default null,
  p_expires_hours integer default 168
)
returns table(
  invite_id uuid,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.profiles%rowtype;
  v_email text;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin

  select *
    into v_owner
  from public.profiles
  where id = auth.uid()
    and role::text = 'owner'
    and is_active = true;

  if not found then
    raise exception 'Owner access required.';
  end if;

  v_email := lower(
    btrim(
      coalesce(p_email,'')
    )
  );

  if v_email = ''
     or position('@' in v_email) < 2
  then
    raise exception
      'A valid employee email is required.';
  end if;

  if p_expires_hours < 1
     or p_expires_hours > 720
  then
    raise exception
      'Invite expiration must be between 1 and 720 hours.';
  end if;

  -- Mark stale invitations expired.
  update public.employee_invites
  set status = 'expired'
  where company_id = v_owner.company_id
    and status = 'pending'
    and expires_at <= now();

  -- Revoke previous pending invite for same email.
  update public.employee_invites
  set
    status = 'revoked',
    revoked_at = now()
  where company_id = v_owner.company_id
    and normalized_email = v_email
    and status = 'pending';

  -- Do not invite an existing account already attached
  -- to this company.
  if exists(
    select 1
    from public.profiles p
    join auth.users u
      on u.id = p.id
    where p.company_id = v_owner.company_id
      and lower(u.email) = v_email
  ) then
    raise exception
      'An account already exists for this email.';
  end if;

  v_token :=
    encode(
      gen_random_bytes(32),
      'hex'
    );

  v_expires :=
    now()
    + make_interval(
        hours => p_expires_hours
      );

  insert into public.employee_invites(
    company_id,
    email,
    normalized_email,
    intended_full_name,
    token_hash,
    status,
    created_by,
    expires_at
  )
  values(
    v_owner.company_id,
    v_email,
    v_email,
    nullif(
      btrim(
        coalesce(
          p_full_name,
          ''
        )
      ),
      ''
    ),
    digest(
      v_token,
      'sha256'
    ),
    'pending',
    auth.uid(),
    v_expires
  )
  returning id
  into v_id;

  insert into public.academy_events(
    company_id,
    invite_id,
    actor_id,
    event_type,
    metadata
  )
  values(
    v_owner.company_id,
    v_id,
    auth.uid(),
    'employee_invite_created',
    jsonb_build_object(
      'email',
      v_email,
      'expires_at',
      v_expires
    )
  );

  return query
  select
    v_id,
    v_token,
    v_expires;
end;
$$;

revoke all
on function public.dmh_owner_create_employee_invite(
  text,
  text,
  integer
)
from public;

grant execute
on function public.dmh_owner_create_employee_invite(
  text,
  text,
  integer
)
to authenticated;

-- ------------------------------------------------------------
-- 14. OWNER REVOKES INVITE
-- ------------------------------------------------------------

create or replace function public.dmh_owner_revoke_employee_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.profiles%rowtype;
  v_invite public.employee_invites%rowtype;
begin

  select *
    into v_owner
  from public.profiles
  where id = auth.uid()
    and role::text = 'owner'
    and is_active = true;

  if not found then
    raise exception 'Owner access required.';
  end if;

  select *
    into v_invite
  from public.employee_invites
  where id = p_invite_id
    and company_id = v_owner.company_id
  for update;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception
      'Only pending invitations may be revoked.';
  end if;

  update public.employee_invites
  set
    status = 'revoked',
    revoked_at = now()
  where id = p_invite_id;

  insert into public.academy_events(
    company_id,
    invite_id,
    actor_id,
    event_type
  )
  values(
    v_owner.company_id,
    p_invite_id,
    auth.uid(),
    'employee_invite_revoked'
  );
end;
$$;

revoke all
on function public.dmh_owner_revoke_employee_invite(uuid)
from public;

grant execute
on function public.dmh_owner_revoke_employee_invite(uuid)
to authenticated;

-- ------------------------------------------------------------
-- 15. PUBLIC INVITE VALIDATION
--
-- Token itself is the authorization to inspect THIS invitation.
-- Does not expose token hashes.
-- ------------------------------------------------------------

create or replace function public.dmh_validate_employee_invite(
  p_token text
)
returns table(
  invite_id uuid,
  email text,
  intended_full_name text,
  company_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash bytea;
begin

  if nullif(
    btrim(
      coalesce(
        p_token,
        ''
      )
    ),
    ''
  ) is null
  then
    raise exception
      'Invitation token is required.';
  end if;

  v_hash :=
    digest(
      btrim(p_token),
      'sha256'
    );

  update public.employee_invites
  set status = 'expired'
  where token_hash = v_hash
    and status = 'pending'
    and expires_at <= now();

  return query
  select
    i.id,
    i.email,
    i.intended_full_name,
    i.company_id,
    i.expires_at
  from public.employee_invites i
  where i.token_hash = v_hash
    and i.status = 'pending'
    and i.expires_at > now();
end;
$$;

revoke all
on function public.dmh_validate_employee_invite(text)
from public;

grant execute
on function public.dmh_validate_employee_invite(text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 16. RLS
-- ------------------------------------------------------------

alter table public.employee_invites
  enable row level security;

alter table public.academy_enrollments
  enable row level security;

alter table public.academy_mission_catalog
  enable row level security;

alter table public.academy_assessment_keys
  enable row level security;

alter table public.academy_mission_progress
  enable row level security;

alter table public.academy_attempts
  enable row level security;

alter table public.academy_events
  enable row level security;

drop policy if exists
  "owner reads employee academy invites"
on public.employee_invites;

create policy
  "owner reads employee academy invites"
on public.employee_invites
for select
to authenticated
using(
  company_id = public.current_company_id()
  and public.current_role()::text = 'owner'
);

drop policy if exists
  "owner reads academy enrollments"
on public.academy_enrollments;

create policy
  "owner reads academy enrollments"
on public.academy_enrollments
for select
to authenticated
using(
  company_id = public.current_company_id()
  and public.current_role()::text = 'owner'
);

drop policy if exists
  "employee reads own academy enrollment"
on public.academy_enrollments;

create policy
  "employee reads own academy enrollment"
on public.academy_enrollments
for select
to authenticated
using(
  employee_id = auth.uid()
);

drop policy if exists
  "authenticated reads academy mission catalog"
on public.academy_mission_catalog;

create policy
  "authenticated reads academy mission catalog"
on public.academy_mission_catalog
for select
to authenticated
using(true);

-- NO employee policy exists for academy_assessment_keys.

drop policy if exists
  "owner reads academy progress"
on public.academy_mission_progress;

create policy
  "owner reads academy progress"
on public.academy_mission_progress
for select
to authenticated
using(
  company_id = public.current_company_id()
  and public.current_role()::text = 'owner'
);

drop policy if exists
  "employee reads own academy progress"
on public.academy_mission_progress;

create policy
  "employee reads own academy progress"
on public.academy_mission_progress
for select
to authenticated
using(
  employee_id = auth.uid()
);

drop policy if exists
  "owner reads academy attempts"
on public.academy_attempts;

create policy
  "owner reads academy attempts"
on public.academy_attempts
for select
to authenticated
using(
  company_id = public.current_company_id()
  and public.current_role()::text = 'owner'
);

drop policy if exists
  "employee reads own academy attempts"
on public.academy_attempts;

create policy
  "employee reads own academy attempts"
on public.academy_attempts
for select
to authenticated
using(
  employee_id = auth.uid()
);

drop policy if exists
  "owner reads academy events"
on public.academy_events;

create policy
  "owner reads academy events"
on public.academy_events
for select
to authenticated
using(
  company_id = public.current_company_id()
  and public.current_role()::text = 'owner'
);

drop policy if exists
  "employee reads own academy events"
on public.academy_events;

create policy
  "employee reads own academy events"
on public.academy_events
for select
to authenticated
using(
  employee_id = auth.uid()
);

-- ------------------------------------------------------------
-- 17. TABLE PRIVILEGES
--
-- Authenticated clients can READ permitted rows.
-- They cannot directly write Academy state.
-- Writes happen through controlled RPC functions.
-- ------------------------------------------------------------

revoke all
on table public.employee_invites
from anon, authenticated;

grant select
on table public.employee_invites
to authenticated;

revoke all
on table public.academy_enrollments
from anon, authenticated;

grant select
on table public.academy_enrollments
to authenticated;

revoke all
on table public.academy_mission_catalog
from anon, authenticated;

grant select
on table public.academy_mission_catalog
to authenticated;

revoke all
on table public.academy_assessment_keys
from anon, authenticated;

revoke all
on table public.academy_mission_progress
from anon, authenticated;

grant select
on table public.academy_mission_progress
to authenticated;

revoke all
on table public.academy_attempts
from anon, authenticated;

grant select
on table public.academy_attempts
to authenticated;

revoke all
on table public.academy_events
from anon, authenticated;

grant select
on table public.academy_events
to authenticated;

-- ============================================================
-- END MIGRATION 068
-- ============================================================
