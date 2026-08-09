-- ============================================================
-- DMHOUSE Sales OS
-- Migration 069
-- Academy Signup + Server Certification Engine
--
-- REQUIREMENT:
-- Migration 068 must be committed/applied FIRST because
-- this migration uses user_role value 'academy'.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SEED SERVER-SIDE ANSWER KEYS
--
-- Choice indexes are zero-based to match React selections.
-- ------------------------------------------------------------

insert into public.academy_assessment_keys(
  academy_version,
  mission_number,
  item_key,
  correct_choice
)
values
  -- Mission 1
  (1,1,'q01',1),
  (1,1,'q02',1),
  (1,1,'q03',2),
  (1,1,'q04',1),
  (1,1,'q05',2),
  (1,1,'q06',0),
  (1,1,'q07',1),

  -- Mission 2
  (1,2,'q01',1),
  (1,2,'q02',1),
  (1,2,'q03',0),
  (1,2,'q04',2),
  (1,2,'q05',0),
  (1,2,'q06',1),
  (1,2,'q07',2),
  (1,2,'q08',0),
  (1,2,'q09',2),
  (1,2,'q10',1),
  (1,2,'q11',1),
  (1,2,'q12',2),

  -- Mission 3
  (1,3,'q01',1),
  (1,3,'q02',1),
  (1,3,'q03',1),
  (1,3,'q04',2),
  (1,3,'q05',2),
  (1,3,'q06',1),
  (1,3,'q07',1),
  (1,3,'q08',2),
  (1,3,'q09',1),
  (1,3,'q10',2),
  (1,3,'q11',1),
  (1,3,'q12',2),

  -- Mission 4
  (1,4,'q01',1),
  (1,4,'q02',1),
  (1,4,'q03',1),
  (1,4,'q04',0),
  (1,4,'q05',1),
  (1,4,'q06',1),
  (1,4,'q07',1),
  (1,4,'q08',1),
  (1,4,'q09',1),
  (1,4,'q10',1),

  -- Mission 5
  (1,5,'q01',1),
  (1,5,'q02',1),
  (1,5,'q03',0),
  (1,5,'q04',0),
  (1,5,'q05',1),
  (1,5,'q06',0),
  (1,5,'q07',0),
  (1,5,'q08',1),
  (1,5,'q09',1),
  (1,5,'q10',0),

  -- Mission 6
  (1,6,'q01',1),
  (1,6,'q02',1),
  (1,6,'q03',1),
  (1,6,'q04',0),
  (1,6,'q05',2),
  (1,6,'q06',1),
  (1,6,'q07',0),
  (1,6,'q08',2),
  (1,6,'q09',2),
  (1,6,'q10',2),
  (1,6,'q11',2),
  (1,6,'q12',2),
  (1,6,'q13',1),
  (1,6,'q14',1),
  (1,6,'q15',1),
  (1,6,'q16',0),
  (1,6,'q17',1),
  (1,6,'q18',2),
  (1,6,'q19',0),
  (1,6,'q20',2)

on conflict(
  academy_version,
  mission_number,
  item_key
)
do update set
  correct_choice = excluded.correct_choice;

-- ------------------------------------------------------------
-- 2. ACADEMY SIGNUP TRIGGER
--
-- Existing handle_dmh_employee_signup() remains untouched.
-- It ignores account_type != employee.
--
-- Academy signup uses:
-- account_type = academy
-- academy_invite_token = RAW INVITE TOKEN
--
-- Same auth.users identity later becomes employee.
-- ------------------------------------------------------------

create or replace function public.handle_dmh_academy_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_token text;
  v_hash bytea;
  v_invite public.employee_invites%rowtype;
  v_name text;
begin

  v_account_type :=
    coalesce(
      new.raw_user_meta_data->>'account_type',
      ''
    );

  if v_account_type <> 'academy' then
    return new;
  end if;

  v_token :=
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data->>'academy_invite_token',
          ''
        )
      ),
      ''
    );

  if v_token is null then
    raise exception
      'A valid Academy invitation is required.';
  end if;

  v_hash :=
    digest(
      v_token,
      'sha256'
    );

  select *
    into v_invite
  from public.employee_invites
  where token_hash = v_hash
  for update;

  if not found then
    raise exception
      'Academy invitation is invalid.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception
      'Academy invitation is no longer available.';
  end if;

  if v_invite.expires_at <= now() then
    update public.employee_invites
    set status = 'expired'
    where id = v_invite.id;

    raise exception
      'Academy invitation has expired.';
  end if;

  if lower(
    coalesce(
      new.email,
      ''
    )
  ) <> v_invite.normalized_email
  then
    raise exception
      'Signup email must match the invited email address.';
  end if;

  if exists(
    select 1
    from public.profiles p
    where p.id = new.id
  ) then
    raise exception
      'A DMHOUSE profile already exists for this account.';
  end if;

  v_name :=
    coalesce(
      nullif(
        btrim(
          new.raw_user_meta_data->>'full_name'
        ),
        ''
      ),
      nullif(
        btrim(
          v_invite.intended_full_name
        ),
        ''
      ),
      split_part(
        new.email,
        '@',
        1
      ),
      'Employee'
    );

  insert into public.profiles(
    id,
    company_id,
    role,
    full_name,
    is_active,
    academy_required,
    academy_certified,
    academy_version
  )
  values(
    new.id,
    v_invite.company_id,
    'academy',
    v_name,
    true,
    true,
    false,
    1
  );

  update public.employee_invites
  set
    status = 'accepted',
    accepted_by = new.id,
    accepted_at = now()
  where id = v_invite.id;

  insert into public.academy_enrollments(
    employee_id,
    company_id,
    invite_id,
    academy_version,
    status,
    current_mission,
    started_at
  )
  values(
    new.id,
    v_invite.company_id,
    v_invite.id,
    1,
    'enrolled',
    1,
    null
  );

  insert into public.academy_mission_progress(
    employee_id,
    company_id,
    academy_version,
    mission_number,
    status
  )
  select
    new.id,
    v_invite.company_id,
    1,
    m.mission_number,
    case
      when m.mission_number = 1
        then 'available'
      else 'locked'
    end
  from public.academy_mission_catalog m
  where m.academy_version = 1
    and m.required = true
  on conflict do nothing;

  insert into public.academy_events(
    company_id,
    employee_id,
    invite_id,
    event_type,
    metadata
  )
  values(
    v_invite.company_id,
    new.id,
    v_invite.id,
    'academy_account_created',
    jsonb_build_object(
      'email',
      lower(new.email),
      'academy_version',
      1
    )
  );

  -- Do not keep the bearer token in Auth metadata.
  update auth.users
  set raw_user_meta_data =
    raw_user_meta_data
    - 'academy_invite_token'
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_dmh_academy_signup
  on auth.users;

create trigger on_dmh_academy_signup
after insert on auth.users
for each row
execute function public.handle_dmh_academy_signup();

-- ------------------------------------------------------------
-- 3. ACADEMY STATE
-- ------------------------------------------------------------

create or replace function public.dmh_academy_get_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_enrollment public.academy_enrollments%rowtype;
  v_progress jsonb;
begin

  select *
    into v_profile
  from public.profiles
  where id = auth.uid()
    and is_active = true;

  if not found then
    raise exception
      'Active DMHOUSE profile required.';
  end if;

  if v_profile.role::text not in (
    'academy',
    'employee'
  ) then
    raise exception
      'Academy access is unavailable for this account.';
  end if;

  select *
    into v_enrollment
  from public.academy_enrollments
  where employee_id = auth.uid();

  if not found then
    raise exception
      'Academy enrollment not found.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'missionNumber',
        p.mission_number,
        'status',
        p.status,
        'bestScore',
        p.best_score,
        'attemptCount',
        p.attempt_count,
        'startedAt',
        p.started_at,
        'completedAt',
        p.completed_at
      )
      order by p.mission_number
    ),
    '[]'::jsonb
  )
  into v_progress
  from public.academy_mission_progress p
  where p.employee_id = auth.uid()
    and p.academy_version =
      v_enrollment.academy_version;

  return jsonb_build_object(
    'employeeId',
    v_profile.id,
    'role',
    v_profile.role::text,
    'academyRequired',
    v_profile.academy_required,
    'academyCertified',
    v_profile.academy_certified,
    'academyCertifiedAt',
    v_profile.academy_certified_at,
    'academyFinalScore',
    v_profile.academy_final_score,
    'academyVersion',
    v_enrollment.academy_version,
    'status',
    v_enrollment.status,
    'currentMission',
    v_enrollment.current_mission,
    'missions',
    v_progress
  );
end;
$$;

revoke all
on function public.dmh_academy_get_state()
from public;

grant execute
on function public.dmh_academy_get_state()
to authenticated;

-- ------------------------------------------------------------
-- 4. START MISSION
-- ------------------------------------------------------------

create or replace function public.dmh_academy_start_mission(
  p_mission integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_enrollment public.academy_enrollments%rowtype;
  v_progress public.academy_mission_progress%rowtype;
begin

  if p_mission < 1
     or p_mission > 6
  then
    raise exception
      'Mission must be between 1 and 6.';
  end if;

  select *
    into v_profile
  from public.profiles
  where id = auth.uid()
    and is_active = true
    and role::text in (
      'academy',
      'employee'
    );

  if not found then
    raise exception
      'Academy access required.';
  end if;

  select *
    into v_enrollment
  from public.academy_enrollments
  where employee_id = auth.uid()
  for update;

  if not found then
    raise exception
      'Academy enrollment not found.';
  end if;

  select *
    into v_progress
  from public.academy_mission_progress
  where employee_id = auth.uid()
    and academy_version =
      v_enrollment.academy_version
    and mission_number =
      p_mission
  for update;

  if not found then
    raise exception
      'Mission progress record not found.';
  end if;

  if v_progress.status = 'locked' then
    raise exception
      'Complete the previous mission first.';
  end if;

  if v_progress.status <> 'complete' then

    update public.academy_mission_progress
    set
      status = 'in_progress',
      started_at =
        coalesce(
          started_at,
          now()
        ),
      updated_at = now()
    where employee_id = auth.uid()
      and academy_version =
        v_enrollment.academy_version
      and mission_number =
        p_mission;

    update public.academy_enrollments
    set
      status = 'in_progress',
      current_mission =
        greatest(
          current_mission,
          p_mission
        ),
      started_at =
        coalesce(
          started_at,
          now()
        )
    where employee_id =
      auth.uid();

    insert into public.academy_events(
      company_id,
      employee_id,
      event_type,
      metadata
    )
    values(
      v_profile.company_id,
      auth.uid(),
      'academy_mission_started',
      jsonb_build_object(
        'mission',
        p_mission
      )
    );

  end if;

  return public.dmh_academy_get_state();
end;
$$;

revoke all
on function public.dmh_academy_start_mission(integer)
from public;

grant execute
on function public.dmh_academy_start_mission(integer)
to authenticated;

-- ------------------------------------------------------------
-- 5. SERVER-SCORED ATTEMPT
--
-- The CLIENT does not supply its score.
-- It only submits answer indexes:
--
-- {
--   "q01": 1,
--   "q02": 0
-- }
--
-- Correct answers remain in a table the client cannot read.
-- ------------------------------------------------------------

create or replace function public.dmh_academy_submit_attempt(
  p_mission integer,
  p_answers jsonb,
  p_professional_commitment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_enrollment public.academy_enrollments%rowtype;

  v_total numeric := 0;
  v_correct numeric := 0;

  v_score numeric(5,2);
  v_passing numeric(5,2);
  v_passed boolean;

  v_attempt integer;
  v_expected integer;
  v_received integer;

  v_all_complete boolean;
begin

  if p_mission < 1
     or p_mission > 6
  then
    raise exception
      'Mission must be between 1 and 6.';
  end if;

  if p_answers is null
     or jsonb_typeof(p_answers) <> 'object'
  then
    raise exception
      'Mission answers are required.';
  end if;

  select *
    into v_profile
  from public.profiles
  where id = auth.uid()
    and is_active = true
    and role::text in (
      'academy',
      'employee'
    );

  if not found then
    raise exception
      'Academy access required.';
  end if;

  select *
    into v_enrollment
  from public.academy_enrollments
  where employee_id = auth.uid()
  for update;

  if not found then
    raise exception
      'Academy enrollment not found.';
  end if;

  if not exists(
    select 1
    from public.academy_mission_progress p
    where p.employee_id = auth.uid()
      and p.academy_version =
        v_enrollment.academy_version
      and p.mission_number =
        p_mission
      and p.status <> 'locked'
  ) then
    raise exception
      'Mission is locked.';
  end if;

  select
    count(*),
    coalesce(
      sum(weight),
      0
    )
  into
    v_expected,
    v_total
  from public.academy_assessment_keys k
  where k.academy_version =
      v_enrollment.academy_version
    and k.mission_number =
      p_mission;

  if v_expected = 0 then
    raise exception
      'Assessment key is not configured.';
  end if;

  select count(*)
  into v_received
  from jsonb_object_keys(
    p_answers
  );

  if v_received <> v_expected then
    raise exception
      'All assessment items must be answered.';
  end if;

  select coalesce(
    sum(
      case
        when
          (p_answers ->> k.item_key)
            ~ '^[0-9]+$'
          and
          (p_answers ->> k.item_key)::integer
            = k.correct_choice
        then k.weight
        else 0
      end
    ),
    0
  )
  into v_correct
  from public.academy_assessment_keys k
  where k.academy_version =
      v_enrollment.academy_version
    and k.mission_number =
      p_mission;

  v_score :=
    round(
      (
        v_correct
        / nullif(
            v_total,
            0
          )
      ) * 100,
      2
    );

  select passing_score
    into v_passing
  from public.academy_mission_catalog
  where academy_version =
      v_enrollment.academy_version
    and mission_number =
      p_mission
    and is_active = true;

  if v_passing is null then
    raise exception
      'Mission configuration is unavailable.';
  end if;

  v_passed :=
    v_score >= v_passing;

  if p_mission = 1
     and v_passed
     and not p_professional_commitment
  then
    raise exception
      'Professional commitment must be accepted to complete Mission 1.';
  end if;

  select
    coalesce(
      max(a.attempt_number),
      0
    ) + 1
  into v_attempt
  from public.academy_attempts a
  where a.employee_id =
      auth.uid()
    and a.academy_version =
      v_enrollment.academy_version
    and a.mission_number =
      p_mission;

  insert into public.academy_attempts(
    employee_id,
    company_id,
    academy_version,
    mission_number,
    attempt_number,
    score,
    passed,
    answers,
    completed_at
  )
  values(
    auth.uid(),
    v_profile.company_id,
    v_enrollment.academy_version,
    p_mission,
    v_attempt,
    v_score,
    v_passed,
    p_answers,
    now()
  );

  update public.academy_mission_progress
  set
    status =
      case
        when v_passed
          then 'complete'
        else 'in_progress'
      end,

    best_score =
      greatest(
        coalesce(
          best_score,
          0
        ),
        v_score
      ),

    attempt_count =
      attempt_count + 1,

    started_at =
      coalesce(
        started_at,
        now()
      ),

    completed_at =
      case
        when v_passed
          then coalesce(
            completed_at,
            now()
          )
        else completed_at
      end,

    updated_at = now()

  where employee_id =
      auth.uid()
    and academy_version =
      v_enrollment.academy_version
    and mission_number =
      p_mission;

  insert into public.academy_events(
    company_id,
    employee_id,
    event_type,
    metadata
  )
  values(
    v_profile.company_id,
    auth.uid(),
    case
      when v_passed
        then 'academy_mission_passed'
      else 'academy_mission_failed'
    end,
    jsonb_build_object(
      'mission',
      p_mission,
      'attempt',
      v_attempt,
      'score',
      v_score
    )
  );

  if v_passed
     and p_mission < 6
  then

    update public.academy_mission_progress
    set
      status =
        case
          when status = 'locked'
            then 'available'
          else status
        end,
      updated_at = now()
    where employee_id =
        auth.uid()
      and academy_version =
        v_enrollment.academy_version
      and mission_number =
        p_mission + 1;

    update public.academy_enrollments
    set current_mission =
      greatest(
        current_mission,
        p_mission + 1
      )
    where employee_id =
      auth.uid();

  end if;

  -- --------------------------------------------------------
  -- FINAL CERTIFICATION
  -- --------------------------------------------------------

  if v_passed
     and p_mission = 6
  then

    select
      count(*) = 6
    into v_all_complete
    from public.academy_mission_progress p
    where p.employee_id =
        auth.uid()
      and p.academy_version =
        v_enrollment.academy_version
      and p.status = 'complete';

    if not v_all_complete then
      raise exception
        'All six Academy missions must be completed before certification.';
    end if;

    perform set_config(
      'dmh.academy_internal',
      '1',
      true
    );

    update public.profiles
    set
      role = 'employee',
      academy_required = true,
      academy_certified = true,
      academy_certified_at = now(),
      academy_final_score = v_score,
      academy_version =
        v_enrollment.academy_version
    where id = auth.uid()
      and role::text = 'academy';

    update public.academy_enrollments
    set
      status = 'certified',
      current_mission = 6,
      final_score = v_score,
      completed_at = now()
    where employee_id =
      auth.uid();

    insert into public.academy_events(
      company_id,
      employee_id,
      event_type,
      metadata
    )
    values(
      v_profile.company_id,
      auth.uid(),
      'academy_certification_granted',
      jsonb_build_object(
        'academy_version',
        v_enrollment.academy_version,
        'final_score',
        v_score
      )
    );

  end if;

  return jsonb_build_object(
    'mission',
    p_mission,
    'attempt',
    v_attempt,
    'score',
    v_score,
    'passed',
    v_passed,
    'certified',
    (
      select academy_certified
      from public.profiles
      where id = auth.uid()
    )
  );
end;
$$;

revoke all
on function public.dmh_academy_submit_attempt(
  integer,
  jsonb,
  boolean
)
from public;

grant execute
on function public.dmh_academy_submit_attempt(
  integer,
  jsonb,
  boolean
)
to authenticated;

-- ------------------------------------------------------------
-- 6. OWNER ACADEMY ROSTER
-- ------------------------------------------------------------

create or replace function public.dmh_owner_academy_roster()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.profiles%rowtype;
begin

  select *
    into v_owner
  from public.profiles
  where id = auth.uid()
    and role::text = 'owner'
    and is_active = true;

  if not found then
    raise exception
      'Owner access required.';
  end if;

  return jsonb_build_object(

    'invites',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            i.id,
            'email',
            i.email,
            'fullName',
            i.intended_full_name,
            'status',
            case
              when i.status = 'pending'
                   and i.expires_at <= now()
                then 'expired'
              else i.status
            end,
            'expiresAt',
            i.expires_at,
            'acceptedAt',
            i.accepted_at,
            'createdAt',
            i.created_at
          )
          order by i.created_at desc
        )
        from public.employee_invites i
        where i.company_id =
          v_owner.company_id
      ),
      '[]'::jsonb
    ),

    'employees',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            p.id,
            'name',
            p.full_name,
            'email',
            u.email,
            'role',
            p.role::text,
            'active',
            p.is_active,
            'academyRequired',
            p.academy_required,
            'certified',
            p.academy_certified,
            'certifiedAt',
            p.academy_certified_at,
            'finalScore',
            p.academy_final_score,
            'academyVersion',
            p.academy_version,
            'academyStatus',
            e.status,
            'currentMission',
            e.current_mission,
            'startedAt',
            e.started_at,
            'completedAt',
            e.completed_at
          )
          order by p.full_name
        )
        from public.profiles p
        left join auth.users u
          on u.id = p.id
        left join public.academy_enrollments e
          on e.employee_id = p.id
        where p.company_id =
          v_owner.company_id
          and p.role::text in (
            'academy',
            'employee'
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all
on function public.dmh_owner_academy_roster()
from public;

grant execute
on function public.dmh_owner_academy_roster()
to authenticated;

-- ------------------------------------------------------------
-- 7. OWNER MAY REQUIRE RECERTIFICATION
--
-- Owner can REMOVE portal access.
-- Owner cannot manually grant certification.
-- ------------------------------------------------------------

create or replace function public.dmh_owner_require_academy_recertification(
  p_employee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.profiles%rowtype;
  v_employee public.profiles%rowtype;
begin

  select *
    into v_owner
  from public.profiles
  where id = auth.uid()
    and role::text = 'owner'
    and is_active = true;

  if not found then
    raise exception
      'Owner access required.';
  end if;

  select *
    into v_employee
  from public.profiles
  where id = p_employee_id
    and company_id =
      v_owner.company_id
    and role::text = 'employee'
  for update;

  if not found then
    raise exception
      'Certified employee not found.';
  end if;

  perform set_config(
    'dmh.academy_internal',
    '1',
    true
  );

  update public.profiles
  set
    role = 'academy',
    academy_required = true,
    academy_certified = false,
    academy_certified_at = null,
    academy_final_score = null
  where id = p_employee_id;

  update public.academy_enrollments
  set
    status = 'recertification_required',
    current_mission = 1,
    completed_at = null,
    final_score = null
  where employee_id =
    p_employee_id;

  update public.academy_mission_progress
  set
    status =
      case
        when mission_number = 1
          then 'available'
        else 'locked'
      end,
    best_score = null,
    attempt_count = 0,
    started_at = null,
    completed_at = null,
    updated_at = now()
  where employee_id =
    p_employee_id;

  insert into public.academy_events(
    company_id,
    employee_id,
    actor_id,
    event_type,
    metadata
  )
  values(
    v_owner.company_id,
    p_employee_id,
    auth.uid(),
    'academy_recertification_required',
    jsonb_build_object(
      'reason',
      nullif(
        btrim(
          coalesce(
            p_reason,
            ''
          )
        ),
        ''
      )
    )
  );
end;
$$;

revoke all
on function public.dmh_owner_require_academy_recertification(
  uuid,
  text
)
from public;

grant execute
on function public.dmh_owner_require_academy_recertification(
  uuid,
  text
)
to authenticated;

-- ============================================================
-- END MIGRATION 069
-- ============================================================
