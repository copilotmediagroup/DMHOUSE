-- ============================================================
-- DMHOUSE Sales OS
-- Migration 070
-- Hiring Core Candidate Intelligence
--
-- RECOVERED FROM LIVE PRODUCTION SCHEMA
--
-- Canonical candidate identity
-- Hiring cycles
-- Immutable hiring timeline
-- Owner candidate intelligence
-- Owner candidate dossier
-- ============================================================


-- ============================================================
-- 1. CANDIDATE IDENTITY
-- ============================================================

create table if not exists public.hiring_candidates (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  user_id uuid
    references public.profiles(id)
    on delete set null,

  email text not null,

  normalized_email text not null,

  full_name text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique(
    company_id,
    normalized_email
  )
);


create index if not exists
hiring_candidates_company_idx
on public.hiring_candidates(
  company_id,
  created_at desc
);


create unique index if not exists
hiring_candidates_user_unique_idx
on public.hiring_candidates(
  user_id
)
where user_id is not null;


-- ============================================================
-- 2. CANDIDATE CYCLES
-- ============================================================

create table if not exists public.hiring_candidate_cycles (
  id uuid primary key
    default gen_random_uuid(),

  candidate_id uuid not null
    references public.hiring_candidates(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  invite_id uuid not null
    references public.employee_invites(id)
    on delete cascade,

  is_current boolean not null
    default true,

  owner_status text not null
    default 'active'
    check (
      owner_status in (
        'active',
        'rejected',
        'archived'
      )
    ),

  owner_decision_at timestamptz,

  owner_decision_by uuid,

  owner_decision_reason text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique(invite_id)
);


create index if not exists
hiring_candidate_cycles_candidate_idx
on public.hiring_candidate_cycles(
  candidate_id,
  created_at desc
);


create index if not exists
hiring_candidate_cycles_company_idx
on public.hiring_candidate_cycles(
  company_id,
  created_at desc
);


create unique index if not exists
hiring_candidate_one_current_cycle_idx
on public.hiring_candidate_cycles(
  candidate_id
)
where is_current = true;


-- ============================================================
-- 3. IMMUTABLE HIRING EVENTS
-- ============================================================

create table if not exists public.hiring_events (
  id bigint generated always as identity
    primary key,

  candidate_id uuid not null
    references public.hiring_candidates(id)
    on delete cascade,

  cycle_id uuid
    references public.hiring_candidate_cycles(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  actor_id uuid,

  event_type text not null,

  source_type text,

  source_key text,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now()
);


create index if not exists
hiring_events_candidate_idx
on public.hiring_events(
  candidate_id,
  created_at desc
);


create index if not exists
hiring_events_company_idx
on public.hiring_events(
  company_id,
  created_at desc
);


create unique index if not exists
hiring_events_source_unique_idx
on public.hiring_events(
  source_type,
  source_key
)
where
  source_type is not null
  and source_key is not null;


-- ============================================================
-- 4. UPDATED-AT ENGINE
-- ============================================================

create or replace function
public.dmh_hiring_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;


drop trigger if exists
hiring_candidates_touch_updated_at
on public.hiring_candidates;


create trigger
hiring_candidates_touch_updated_at
before update
on public.hiring_candidates
for each row
execute function
public.dmh_hiring_touch_updated_at();


drop trigger if exists
hiring_candidate_cycles_touch_updated_at
on public.hiring_candidate_cycles;


create trigger
hiring_candidate_cycles_touch_updated_at
before update
on public.hiring_candidate_cycles
for each row
execute function
public.dmh_hiring_touch_updated_at();


-- ============================================================
-- 5. RLS
-- ============================================================

alter table public.hiring_candidates
  enable row level security;

alter table public.hiring_candidate_cycles
  enable row level security;

alter table public.hiring_events
  enable row level security;


drop policy if exists
"candidate reads own hiring identity"
on public.hiring_candidates;

create policy
"candidate reads own hiring identity"
on public.hiring_candidates
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists
"owner reads company hiring candidates"
on public.hiring_candidates;

create policy
"owner reads company hiring candidates"
on public.hiring_candidates
for select
to authenticated
using (
  company_id =
    public.current_company_id()

  and

  public.current_role()::text =
    'owner'
);


drop policy if exists
"candidate reads own hiring cycles"
on public.hiring_candidate_cycles;

create policy
"candidate reads own hiring cycles"
on public.hiring_candidate_cycles
for select
to authenticated
using (
  exists (
    select 1
    from public.hiring_candidates c
    where
      c.id =
        hiring_candidate_cycles.candidate_id
      and
      c.user_id =
        auth.uid()
  )
);


drop policy if exists
"owner reads company hiring cycles"
on public.hiring_candidate_cycles;

create policy
"owner reads company hiring cycles"
on public.hiring_candidate_cycles
for select
to authenticated
using (
  company_id =
    public.current_company_id()

  and

  public.current_role()::text =
    'owner'
);


drop policy if exists
"candidate reads own hiring timeline"
on public.hiring_events;

create policy
"candidate reads own hiring timeline"
on public.hiring_events
for select
to authenticated
using (
  exists (
    select 1
    from public.hiring_candidates c
    where
      c.id =
        hiring_events.candidate_id
      and
      c.user_id =
        auth.uid()
  )
);


drop policy if exists
"owner reads company hiring timeline"
on public.hiring_events;

create policy
"owner reads company hiring timeline"
on public.hiring_events
for select
to authenticated
using (
  company_id =
    public.current_company_id()

  and

  public.current_role()::text =
    'owner'
);


grant select
on public.hiring_candidates
to authenticated;

grant select
on public.hiring_candidate_cycles
to authenticated;

grant select
on public.hiring_events
to authenticated;


-- ============================================================
-- 6. OWNER CANONICAL CANDIDATE INTELLIGENCE
-- ============================================================

create or replace function
public.dmh_owner_candidate_intelligence()
returns table(
  candidate_id uuid,
  cycle_id uuid,
  user_id uuid,
  full_name text,
  email text,
  stage text,
  invite_status text,
  owner_status text,
  learning_pace text,
  missions_completed bigint,
  active_learning_seconds bigint,
  practice_average numeric,
  learning_started_at timestamptz,
  learning_target_at timestamptz,
  learning_deadline_at timestamptz,
  learning_completed_at timestamptz,
  final_attempts_used integer,
  final_attempt_limit integer,
  final_assessment_status text,
  latest_attempt integer,
  latest_exam_status text,
  latest_score numeric,
  best_score numeric,
  average_response_ms integer,
  timed_out_count integer,
  cooldown_until timestamptz,
  certified boolean,
  certified_at timestamptz,
  last_activity_at timestamptz,
  candidate_created_at timestamptz
)
language sql
security definer
set search_path = public
as $function$

with candidate_base as (

  select

    c.id
      as candidate_id,

    cy.id
      as cycle_id,

    c.user_id,

    coalesce(
      p.full_name,
      c.full_name,
      ei.intended_full_name,
      split_part(
        c.email,
        '@',
        1
      )
    )
      as full_name,

    c.email,

    ei.status::text
      as invite_status,

    cy.owner_status,

    c.company_id,

    c.created_at
      as candidate_created_at,

    p.role::text
      as profile_role,

    coalesce(
      p.academy_certified,
      false
    )
      as academy_certified,

    p.academy_certified_at,

    e.academy_version,

    e.status::text
      as enrollment_status,

    e.learning_started_at,

    e.learning_target_at,

    e.learning_deadline_at,

    e.learning_completed_at,

    e.final_attempts_used,

    e.final_attempt_limit,

    e.final_assessment_status,

    e.next_final_attempt_at,

    learn.missions_completed,

    learn.active_learning_seconds,

    learn.practice_average,

    learn.learning_last_activity,

    latest_exam.attempt_number
      as latest_attempt,

    latest_exam.status
      as latest_exam_status,

    latest_exam.final_score
      as latest_score,

    latest_exam.average_response_ms,

    latest_exam.timed_out_count,

    latest_exam.exam_last_activity,

    exam_rollup.best_score

  from public.hiring_candidates c

  join public.hiring_candidate_cycles cy
    on cy.candidate_id =
        c.id
    and cy.is_current =
        true

  join public.employee_invites ei
    on ei.id =
      cy.invite_id

  left join public.profiles p
    on p.id =
      c.user_id

  left join public.academy_enrollments e
    on e.employee_id =
      c.user_id


  left join lateral (

    select

      count(*)
        filter (
          where a.completed_at
            is not null
        )
        as missions_completed,

      coalesce(
        sum(a.active_seconds),
        0
      )
        as active_learning_seconds,

      round(
        avg(
          a.best_practice_score
        ),
        2
      )
        as practice_average,

      max(
        a.last_activity_at
      )
        as learning_last_activity

    from public.academy_learning_activity a

    where a.employee_id =
      c.user_id

      and (
        e.academy_version is null
        or a.academy_version =
          e.academy_version
      )

  ) learn
  on true


  left join lateral (

    select

      s.attempt_number,

      s.status::text
        as status,

      s.final_score,

      s.average_response_ms,

      s.timed_out_count,

      greatest(
        s.started_at,
        coalesce(
          s.finished_at,
          s.started_at
        )
      )
        as exam_last_activity

    from public.academy_exam_sessions s

    where s.employee_id =
      c.user_id

    order by
      s.created_at desc

    limit 1

  ) latest_exam
  on true


  left join lateral (

    select

      max(s.final_score)
        as best_score

    from public.academy_exam_sessions s

    where s.employee_id =
      c.user_id

  ) exam_rollup
  on true


  where
    c.company_id =
      public.current_company_id()

    and

    public.current_role()::text =
      'owner'
)


select

  b.candidate_id,

  b.cycle_id,

  b.user_id,

  b.full_name,

  b.email,


  case

    when b.owner_status =
      'archived'
    then
      'archived'


    when b.owner_status =
      'rejected'
    then
      'rejected'


    when
      b.profile_role =
        'employee'
      and
      b.academy_certified =
        true
    then
      'hired'


    when
      b.enrollment_status =
        'certified'
      or
      b.academy_certified =
        true
    then
      'certified'


    when
      b.user_id is null
      and b.invite_status =
        'pending'
    then
      'invited'


    when
      b.user_id is null
      and b.invite_status in (
        'expired',
        'revoked'
      )
    then
      'expired'


    when
      b.user_id is not null
      and b.enrollment_status
        is null
    then
      'registered'


    when
      b.learning_completed_at
        is null
      and
      b.learning_deadline_at
        is not null
      and
      now() >
        b.learning_deadline_at
    then
      'expired'


    when
      b.latest_exam_status =
        'active'
    then
      'assessing'


    when
      b.final_assessment_status =
        'failed'
      and
      coalesce(
        b.final_attempts_used,
        0
      )
      >=
      coalesce(
        b.final_attempt_limit,
        3
      )
      and
      b.next_final_attempt_at
        is null
    then
      'locked'


    when
      b.final_assessment_status =
        'failed'
      and
      b.next_final_attempt_at
        is not null
      and
      now() <
        b.next_final_attempt_at
    then
      'cooldown'


    when
      b.learning_completed_at
        is not null
      or
      coalesce(
        b.missions_completed,
        0
      ) >= 5
    then
      'assessment_ready'


    else
      'learning'

  end
    as stage,


  b.invite_status,

  b.owner_status,


  case

    when b.learning_completed_at
      is not null
    then
      'completed'

    when b.learning_started_at
      is null
    then
      'not_started'

    when b.learning_deadline_at
      is not null
      and now() >
        b.learning_deadline_at
    then
      'expired'

    when b.learning_target_at
      is not null
      and now() >
        b.learning_target_at
    then
      'late'

    when now() >
      b.learning_started_at
      + interval '24 hours'
    then
      'on_track'

    else
      'excellent'

  end
    as learning_pace,


  coalesce(
    b.missions_completed,
    0
  )
    as missions_completed,


  coalesce(
    b.active_learning_seconds,
    0
  )
    as active_learning_seconds,


  b.practice_average,

  b.learning_started_at,

  b.learning_target_at,

  b.learning_deadline_at,

  b.learning_completed_at,


  coalesce(
    b.final_attempts_used,
    0
  )
    as final_attempts_used,


  coalesce(
    b.final_attempt_limit,
    3
  )
    as final_attempt_limit,


  b.final_assessment_status,

  b.latest_attempt,

  b.latest_exam_status,

  b.latest_score,

  b.best_score,

  b.average_response_ms,

  b.timed_out_count,


  b.next_final_attempt_at
    as cooldown_until,


  b.academy_certified
    as certified,


  b.academy_certified_at
    as certified_at,


  greatest(

    b.candidate_created_at,

    coalesce(
      b.learning_last_activity,
      b.candidate_created_at
    ),

    coalesce(
      b.exam_last_activity,
      b.candidate_created_at
    )

  )
    as last_activity_at,


  b.candidate_created_at

from candidate_base b

order by
  last_activity_at desc;

$function$;


revoke all
on function
public.dmh_owner_candidate_intelligence()
from public;

grant execute
on function
public.dmh_owner_candidate_intelligence()
to authenticated;


-- ============================================================
-- 7. OWNER CANDIDATE DOSSIER
-- ============================================================

create or replace function
public.dmh_owner_candidate_dossier(
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_summary jsonb;

  v_candidate public.hiring_candidates%rowtype;

  v_missions jsonb;

  v_attempts jsonb;

  v_timeline jsonb;
begin

  if public.current_role()::text <>
    'owner'
  then

    raise exception
      'Owner access required.';

  end if;


  select c.*
  into v_candidate
  from public.hiring_candidates c
  where c.id =
      p_candidate_id
    and c.company_id =
      public.current_company_id();


  if not found then

    raise exception
      'Candidate not found.';

  end if;


  select to_jsonb(x)
  into v_summary

  from public.dmh_owner_candidate_intelligence() x

  where x.candidate_id =
    p_candidate_id;


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(

          'missionNumber',
          a.mission_number,

          'firstOpenedAt',
          a.first_opened_at,

          'lastActivityAt',
          a.last_activity_at,

          'completedAt',
          a.completed_at,

          'activeSeconds',
          a.active_seconds,

          'viewCount',
          a.view_count,

          'practiceAttemptCount',
          a.practice_attempt_count,

          'firstPracticeScore',
          a.first_practice_score,

          'bestPracticeScore',
          a.best_practice_score,

          'latestPracticeScore',
          a.latest_practice_score

        )

        order by
          a.mission_number
      ),

      '[]'::jsonb
    )

  into v_missions

  from public.academy_learning_activity a

  where a.employee_id =
    v_candidate.user_id;


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(

          'sessionId',
          s.id,

          'attemptNumber',
          s.attempt_number,

          'status',
          s.status,

          'startedAt',
          s.started_at,

          'finishedAt',
          s.finished_at,

          'score',
          s.final_score,

          'correctCount',
          s.correct_count,

          'timedOutCount',
          s.timed_out_count,

          'averageResponseMs',
          s.average_response_ms
        )

        order by
          s.attempt_number
      ),

      '[]'::jsonb
    )

  into v_attempts

  from public.academy_exam_sessions s

  where s.employee_id =
    v_candidate.user_id;


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(

          'id',
          h.id,

          'eventType',
          h.event_type,

          'actorId',
          h.actor_id,

          'metadata',
          h.metadata,

          'createdAt',
          h.created_at
        )

        order by
          h.created_at desc
      ),

      '[]'::jsonb
    )

  into v_timeline

  from (

    select *
    from public.hiring_events

    where candidate_id =
      p_candidate_id

    order by
      created_at desc

    limit 100

  ) h;


  return jsonb_build_object(

    'summary',
    v_summary,

    'missions',
    v_missions,

    'assessmentHistory',
    v_attempts,

    'timeline',
    v_timeline
  );

end;
$function$;


revoke all
on function
public.dmh_owner_candidate_dossier(uuid)
from public;

grant execute
on function
public.dmh_owner_candidate_dossier(uuid)
to authenticated;


-- ============================================================
-- END MIGRATION 070
-- ============================================================
