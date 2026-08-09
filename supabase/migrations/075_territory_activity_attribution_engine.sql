-- ============================================================
-- DMHOUSE Sales OS
-- Migration 075
-- Territory Activity Attribution Engine
--
-- Territory → Prospecting → Agency → Outreach → Sale
--
-- PURPOSE
--
-- Preserve which territory generated business activity.
--
-- Existing Google Maps search workflow is NOT replaced.
-- Existing prospect_searches, agencies, outreach and sales
-- workflows remain operational.
--
-- Attribution is additive and automatic.
-- ============================================================


-- ============================================================
-- 1. PROSPECT SEARCH TERRITORY ATTRIBUTION
-- ============================================================

alter table public.prospect_searches
add column if not exists territory_id uuid;


alter table public.prospect_searches
add column if not exists territory_market_key text;


create index if not exists
prospect_searches_territory_idx
on public.prospect_searches(
  company_id,
  territory_id,
  created_at desc
);


-- ============================================================
-- 2. AGENCY ORIGIN TERRITORY
--
-- An agency keeps the market in which it was originally
-- discovered even after the live territory assignment ends.
-- ============================================================

alter table public.agencies
add column if not exists origin_territory_id uuid;


alter table public.agencies
add column if not exists origin_market_key text;


create index if not exists
agencies_origin_territory_idx
on public.agencies(
  company_id,
  origin_territory_id,
  created_at desc
);


-- ============================================================
-- 3. RESOLVE TERRITORY FOR ACTIVITY
--
-- Finds the employee territory assignment that covered
-- a given point in time.
--
-- Preferred match:
-- exact search location = territory center address.
--
-- Fallback:
-- most recent assignment for that employee covering the time.
-- ============================================================

create or replace function
public.dmh_resolve_employee_territory(
  p_company_id uuid,
  p_employee_id uuid,
  p_occurred_at timestamptz,
  p_location text default null
)
returns table(
  territory_id uuid,
  market_key text
)
language sql
stable
security definer
set search_path to 'public'
as $function$

  select
    r.territory_id,
    r.market_key

  from public.territory_assignment_registry r

  where
    r.company_id =
      p_company_id

    and r.employee_id =
      p_employee_id

    and r.starts_at <=
      coalesce(
        p_occurred_at,
        now()
      )

    and (
      r.expires_at is null

      or

      r.expires_at >=
        coalesce(
          p_occurred_at,
          now()
        )
    )

  order by

    case

      when p_location is not null
        and lower(trim(r.center_address)) =
            lower(trim(p_location))
      then 0

      else 1

    end,

    r.starts_at desc

  limit 1;

$function$;


revoke all on function
public.dmh_resolve_employee_territory(
  uuid,
  uuid,
  timestamptz,
  text
)
from public;


-- ============================================================
-- 4. AUTOMATIC PROSPECT SEARCH ATTRIBUTION
-- ============================================================

create or replace function
public.dmh_attribute_prospect_search_territory()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare

  v_territory_id uuid;
  v_market_key text;

begin

  if new.territory_id is not null
     and new.territory_market_key is not null
  then
    return new;
  end if;


  select
    x.territory_id,
    x.market_key

  into
    v_territory_id,
    v_market_key

  from public.dmh_resolve_employee_territory(
    new.company_id,
    new.employee_id,
    coalesce(
      new.created_at,
      now()
    ),
    new.location
  ) x;


  new.territory_id :=
    coalesce(
      new.territory_id,
      v_territory_id
    );


  new.territory_market_key :=
    coalesce(
      new.territory_market_key,
      v_market_key
    );


  return new;

end;
$function$;


drop trigger if exists
attribute_prospect_search_territory
on public.prospect_searches;


create trigger
attribute_prospect_search_territory
before insert
on public.prospect_searches
for each row
execute function
public.dmh_attribute_prospect_search_territory();


-- ============================================================
-- 5. AUTOMATIC AGENCY ORIGIN ATTRIBUTION
--
-- Agencies created by employees inherit the territory active
-- when they were discovered.
-- ============================================================

create or replace function
public.dmh_attribute_agency_origin_territory()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare

  v_territory_id uuid;
  v_market_key text;

begin

  if new.origin_territory_id is not null
     and new.origin_market_key is not null
  then
    return new;
  end if;


  if new.discovered_by is null then
    return new;
  end if;


  select
    x.territory_id,
    x.market_key

  into
    v_territory_id,
    v_market_key

  from public.dmh_resolve_employee_territory(
    new.company_id,
    new.discovered_by,
    coalesce(
      new.created_at,
      now()
    ),
    null
  ) x;


  new.origin_territory_id :=
    coalesce(
      new.origin_territory_id,
      v_territory_id
    );


  new.origin_market_key :=
    coalesce(
      new.origin_market_key,
      v_market_key
    );


  return new;

end;
$function$;


drop trigger if exists
attribute_agency_origin_territory
on public.agencies;


create trigger
attribute_agency_origin_territory
before insert
on public.agencies
for each row
execute function
public.dmh_attribute_agency_origin_territory();


-- ============================================================
-- 6. BACKFILL EXISTING PROSPECT SEARCHES
-- ============================================================

update public.prospect_searches ps
set
  territory_id = (
    select x.territory_id
    from public.dmh_resolve_employee_territory(
      ps.company_id,
      ps.employee_id,
      ps.created_at,
      ps.location
    ) x
    limit 1
  ),

  territory_market_key = (
    select x.market_key
    from public.dmh_resolve_employee_territory(
      ps.company_id,
      ps.employee_id,
      ps.created_at,
      ps.location
    ) x
    limit 1
  )

where ps.territory_id is null

and exists (
  select 1
  from public.dmh_resolve_employee_territory(
    ps.company_id,
    ps.employee_id,
    ps.created_at,
    ps.location
  )
);


-- ============================================================
-- 7. BACKFILL EXISTING AGENCY ORIGIN
-- ============================================================

update public.agencies a
set
  origin_territory_id = (
    select x.territory_id
    from public.dmh_resolve_employee_territory(
      a.company_id,
      a.discovered_by,
      a.created_at,
      null
    ) x
    limit 1
  ),

  origin_market_key = (
    select x.market_key
    from public.dmh_resolve_employee_territory(
      a.company_id,
      a.discovered_by,
      a.created_at,
      null
    ) x
    limit 1
  )

where a.origin_territory_id is null

and a.discovered_by is not null

and exists (
  select 1
  from public.dmh_resolve_employee_territory(
    a.company_id,
    a.discovered_by,
    a.created_at,
    null
  )
);


-- ============================================================
-- 8. OWNER TERRITORY PERFORMANCE RPC
--
-- Territory metrics are based on the market where an agency
-- originated.
--
-- Outreach follows the agency origin.
-- Sales follow the buyer agency origin.
--
-- This prevents later employee reassignment from rewriting
-- historical market performance.
-- ============================================================

create or replace function
public.dmh_owner_territory_performance()
returns table(

  territory_id uuid,

  market_key text,

  territory_name text,

  employee_id uuid,

  employee_name text,

  starts_at timestamptz,

  expires_at timestamptz,

  prospect_searches bigint,

  agencies_discovered bigint,

  calls_made bigint,

  emails_sent bigint,

  outreach_total bigint,

  deals_closed bigint,

  gross_revenue numeric

)
language sql
security definer
set search_path to 'public'
as $function$

with authorized as (

  select r.*

  from public.territory_assignment_registry r

  where
    public.current_role()::text =
      'owner'

    and r.company_id =
      public.current_company_id()

),


search_metrics as (

  select

    ps.territory_id,

    count(*)::bigint
      as prospect_searches

  from public.prospect_searches ps

  where ps.company_id =
    public.current_company_id()

  group by
    ps.territory_id

),


agency_metrics as (

  select

    a.origin_territory_id
      as territory_id,

    count(*)::bigint
      as agencies_discovered

  from public.agencies a

  where a.company_id =
    public.current_company_id()

  group by
    a.origin_territory_id

),


outreach_metrics as (

  select

    a.origin_territory_id
      as territory_id,

    count(*)::bigint
      as outreach_total,

    count(*) filter(
      where oa.activity_type in (
        'call',
        'voicemail'
      )
    )::bigint
      as calls_made,

    count(*) filter(
      where oa.activity_type =
        'email'
    )::bigint
      as emails_sent

  from public.outreach_activities oa

  join public.agencies a
    on a.id =
      oa.agency_id

  where oa.company_id =
    public.current_company_id()

  group by
    a.origin_territory_id

),


sales_metrics as (

  select

    a.origin_territory_id
      as territory_id,

    count(s.id)::bigint
      as deals_closed,

    coalesce(
      sum(s.sale_price),
      0
    )::numeric
      as gross_revenue

  from public.sales s

  join public.agencies a
    on a.id =
      s.buyer_agency_id

  where s.company_id =
    public.current_company_id()

  group by
    a.origin_territory_id

)


select

  r.territory_id,

  r.market_key,

  r.territory_name,

  r.employee_id,

  p.full_name
    as employee_name,

  r.starts_at,

  r.expires_at,

  coalesce(
    sm.prospect_searches,
    0
  )::bigint,

  coalesce(
    am.agencies_discovered,
    0
  )::bigint,

  coalesce(
    om.calls_made,
    0
  )::bigint,

  coalesce(
    om.emails_sent,
    0
  )::bigint,

  coalesce(
    om.outreach_total,
    0
  )::bigint,

  coalesce(
    sam.deals_closed,
    0
  )::bigint,

  coalesce(
    sam.gross_revenue,
    0
  )::numeric


from authorized r


left join public.profiles p
  on p.id =
    r.employee_id


left join search_metrics sm
  on sm.territory_id =
    r.territory_id


left join agency_metrics am
  on am.territory_id =
    r.territory_id


left join outreach_metrics om
  on om.territory_id =
    r.territory_id


left join sales_metrics sam
  on sam.territory_id =
    r.territory_id


order by
  r.starts_at desc;

$function$;


revoke all
on function
public.dmh_owner_territory_performance()
from public;


grant execute
on function
public.dmh_owner_territory_performance()
to authenticated;


-- ============================================================
-- 9. OWNER MARKET PERFORMANCE ROLLUP
--
-- Combines repeated assignments of the same market.
-- ============================================================

create or replace function
public.dmh_owner_market_performance()
returns table(

  market_key text,

  territory_name text,

  assignments bigint,

  employees bigint,

  prospect_searches bigint,

  agencies_discovered bigint,

  calls_made bigint,

  emails_sent bigint,

  outreach_total bigint,

  deals_closed bigint,

  gross_revenue numeric

)
language sql
security definer
set search_path to 'public'
as $function$

with assignment_performance as (

  select *
  from public.dmh_owner_territory_performance()

)

select

  ap.market_key,

  max(ap.territory_name)
    as territory_name,

  count(*)::bigint
    as assignments,

  count(
    distinct ap.employee_id
  )::bigint
    as employees,

  sum(
    ap.prospect_searches
  )::bigint,

  sum(
    ap.agencies_discovered
  )::bigint,

  sum(
    ap.calls_made
  )::bigint,

  sum(
    ap.emails_sent
  )::bigint,

  sum(
    ap.outreach_total
  )::bigint,

  sum(
    ap.deals_closed
  )::bigint,

  sum(
    ap.gross_revenue
  )::numeric


from assignment_performance ap

group by
  ap.market_key

order by
  sum(ap.gross_revenue) desc,
  sum(ap.agencies_discovered) desc;

$function$;


revoke all
on function
public.dmh_owner_market_performance()
from public;


grant execute
on function
public.dmh_owner_market_performance()
to authenticated;


-- ============================================================
-- END MIGRATION 075
-- ============================================================
