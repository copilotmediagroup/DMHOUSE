-- DMH Sales OS v1.3.7
-- Company-wide contact protection, contact data governance, and email health.

alter table public.agency_contacts
  add column if not exists email_status text not null default 'active',
  add column if not exists phone_status text not null default 'active',
  add column if not exists email_bounce_type text,
  add column if not exists email_bounce_count integer not null default 0,
  add column if not exists email_last_bounced_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

alter table public.agencies
  add column if not exists general_email_status text not null default 'active',
  add column if not exists phone_status text not null default 'active',
  add column if not exists email_bounce_type text,
  add column if not exists email_bounce_count integer not null default 0,
  add column if not exists email_last_bounced_at timestamptz;

create table if not exists public.contact_suppression_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  agency_id uuid references public.agencies(id) on delete cascade,
  contact_id uuid references public.agency_contacts(id) on delete set null,
  channel text not null check (channel in ('phone','email')),
  normalized_value text not null,
  contacted_by uuid references public.profiles(id),
  contacted_at timestamptz not null default now(),
  outcome text,
  suppressed_until timestamptz,
  source text not null default 'portal',
  provider_event_id text,
  override_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists contact_suppression_provider_event_uq
  on public.contact_suppression_ledger(company_id, provider_event_id)
  where provider_event_id is not null;
create index if not exists contact_suppression_lookup_idx
  on public.contact_suppression_ledger(company_id, channel, normalized_value, contacted_at desc);

create table if not exists public.contact_data_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  agency_id uuid references public.agencies(id) on delete cascade,
  contact_id uuid references public.agency_contacts(id) on delete set null,
  actor_id uuid references public.profiles(id),
  action text not null,
  field_name text,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.contact_suppression_ledger enable row level security;
alter table public.contact_data_audit enable row level security;

drop policy if exists contact_suppression_company_read on public.contact_suppression_ledger;
create policy contact_suppression_company_read on public.contact_suppression_ledger
for select using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists contact_data_audit_company_read on public.contact_data_audit;
create policy contact_data_audit_company_read on public.contact_data_audit
for select using (company_id = (select company_id from public.profiles where id = auth.uid()));

create or replace function public.dmh_normalize_phone(v text)
returns text language sql immutable as $$
  select case
    when regexp_replace(coalesce(v,''), '[^0-9]', '', 'g') = '' then ''
    when length(regexp_replace(coalesce(v,''), '[^0-9]', '', 'g')) = 10
      then '1' || regexp_replace(v, '[^0-9]', '', 'g')
    else regexp_replace(v, '[^0-9]', '', 'g')
  end
$$;

create or replace function public.dmh_normalize_email(v text)
returns text language sql immutable as $$
  select lower(trim(coalesce(v,'')))
$$;

create or replace function public.dmh_contact_eligibility(
  p_channel text,
  p_value text,
  p_agency_id uuid default null
) returns table(
  allowed boolean,
  reason text,
  last_contacted_at timestamptz,
  suppressed_until timestamptz,
  contacted_by_name text,
  outcome text
) language plpgsql security definer set search_path=public as $$
declare
  v_company uuid;
  v_norm text;
  v_row record;
  v_status text := 'active';
  v_followup boolean := false;
begin
  select company_id into v_company from profiles where id=auth.uid();
  if v_company is null then raise exception 'Profile is not ready.'; end if;
  v_norm := case when p_channel='phone' then dmh_normalize_phone(p_value) else dmh_normalize_email(p_value) end;
  if v_norm='' then return query select false,'No contact value is available.',null::timestamptz,null::timestamptz,null::text,null::text; return; end if;

  if p_channel='email' then
    select coalesce(general_email_status,'active') into v_status from agencies where id=p_agency_id and dmh_normalize_email(general_email)=v_norm;
    if not found then select coalesce(email_status,'active') into v_status from agency_contacts where company_id=v_company and archived_at is null and dmh_normalize_email(email)=v_norm limit 1; end if;
  else
    select coalesce(phone_status,'active') into v_status from agencies where id=p_agency_id and dmh_normalize_phone(phone)=v_norm;
    if not found then select coalesce(phone_status,'active') into v_status from agency_contacts where company_id=v_company and archived_at is null and dmh_normalize_phone(phone)=v_norm limit 1; end if;
  end if;

  if v_status in ('bounced','invalid','disconnected','do_not_contact','archived') then
    return query select false,initcap(replace(v_status,'_',' ')) || ' contact channel.',null::timestamptz,null::timestamptz,null::text,null::text; return;
  end if;

  select exists(
    select 1 from follow_ups f
    where f.company_id=v_company and f.agency_id=p_agency_id and f.completed_at is null
      and f.due_at <= now()+interval '24 hours' and f.due_at >= now()-interval '24 hours'
  ) into v_followup;

  select l.contacted_at,l.suppressed_until,p.full_name,l.outcome into v_row
  from contact_suppression_ledger l left join profiles p on p.id=l.contacted_by
  where l.company_id=v_company and l.channel=p_channel and l.normalized_value=v_norm
  order by l.contacted_at desc limit 1;

  if v_row.suppressed_until is not null and v_row.suppressed_until>now() and not v_followup then
    return query select false,'Protected by the company-wide 30-day contact rule.',v_row.contacted_at,v_row.suppressed_until,v_row.full_name,v_row.outcome; return;
  end if;
  return query select true,case when v_followup then 'Authorized scheduled follow-up.' else 'Contact is available.' end,v_row.contacted_at,v_row.suppressed_until,v_row.full_name,v_row.outcome;
end $$;

grant execute on function public.dmh_contact_eligibility(text,text,uuid) to authenticated;

create or replace function public.dmh_register_contact_attempt(
  p_agency_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_value text,
  p_outcome text,
  p_source text default 'portal',
  p_override_reason text default null,
  p_provider_event_id text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_company uuid; v_role text; v_norm text; v_check record; v_id uuid; v_count int;
begin
  select company_id,role into v_company,v_role from profiles where id=auth.uid();
  if v_company is null then raise exception 'Profile is not ready.'; end if;
  select * into v_check from dmh_contact_eligibility(p_channel,p_value,p_agency_id);
  if not v_check.allowed and not (v_role='owner' and nullif(trim(p_override_reason),'') is not null) then
    raise exception 'CONTACT_PROTECTED|%|%|%',coalesce(v_check.reason,''),coalesce(v_check.contacted_by_name,''),coalesce(v_check.suppressed_until::text,'');
  end if;
  v_norm := case when p_channel='phone' then dmh_normalize_phone(p_value) else dmh_normalize_email(p_value) end;
  insert into contact_suppression_ledger(company_id,agency_id,contact_id,channel,normalized_value,contacted_by,outcome,suppressed_until,source,provider_event_id,override_reason)
  values(v_company,p_agency_id,p_contact_id,p_channel,v_norm,auth.uid(),p_outcome,now()+interval '30 days',coalesce(p_source,'portal'),p_provider_event_id,p_override_reason)
  returning id into v_id;

  if p_channel='email' and lower(coalesce(p_outcome,'')) like '%bounce%' then
    if p_contact_id is not null then
      update agency_contacts set email_bounce_count=email_bounce_count+1,email_last_bounced_at=now(),email_bounce_type=case when lower(p_outcome) like '%hard%' then 'hard' else 'soft' end,
        email_status=case when lower(p_outcome) like '%hard%' or email_bounce_count+1>=3 then 'bounced' else 'active' end,updated_at=now(),updated_by=auth.uid()
      where id=p_contact_id;
    else
      update agencies set email_bounce_count=email_bounce_count+1,email_last_bounced_at=now(),email_bounce_type=case when lower(p_outcome) like '%hard%' then 'hard' else 'soft' end,
        general_email_status=case when lower(p_outcome) like '%hard%' or email_bounce_count+1>=3 then 'bounced' else 'active' end
      where id=p_agency_id;
    end if;
  end if;
  return v_id;
end $$;

grant execute on function public.dmh_register_contact_attempt(uuid,uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.dmh_owner_update_contact_channel(
  p_agency_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_value text,
  p_status text default 'active',
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_role text; v_old text;
begin
  select company_id,role into v_company,v_role from profiles where id=auth.uid();
  if v_role<>'owner' then raise exception 'Owner access required.'; end if;
  if p_contact_id is null then
    if p_channel='email' then select general_email into v_old from agencies where id=p_agency_id and company_id=v_company; update agencies set general_email=nullif(trim(p_value),''),general_email_status=p_status where id=p_agency_id and company_id=v_company;
    else select phone into v_old from agencies where id=p_agency_id and company_id=v_company; update agencies set phone=nullif(trim(p_value),''),phone_status=p_status where id=p_agency_id and company_id=v_company; end if;
  else
    if p_channel='email' then select email into v_old from agency_contacts where id=p_contact_id and company_id=v_company; update agency_contacts set email=nullif(trim(p_value),''),email_status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_contact_id and company_id=v_company;
    else select phone into v_old from agency_contacts where id=p_contact_id and company_id=v_company; update agency_contacts set phone=nullif(trim(p_value),''),phone_status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_contact_id and company_id=v_company; end if;
  end if;
  insert into contact_data_audit(company_id,agency_id,contact_id,actor_id,action,field_name,old_value,new_value,reason)
  values(v_company,p_agency_id,p_contact_id,auth.uid(),'channel_updated',p_channel,v_old,p_value,p_reason);
end $$;

grant execute on function public.dmh_owner_update_contact_channel(uuid,uuid,text,text,text,text) to authenticated;

create or replace view public.email_health_stats as
select company_id,
  count(*) filter (where channel='email') as email_attempts,
  count(*) filter (where channel='email' and lower(coalesce(outcome,'')) not like '%bounce%') as non_bounced,
  count(*) filter (where channel='email' and lower(coalesce(outcome,'')) like '%hard%bounce%') as hard_bounces,
  count(*) filter (where channel='email' and lower(coalesce(outcome,'')) like '%soft%bounce%') as soft_bounces,
  count(*) filter (where channel='email' and lower(coalesce(outcome,'')) like '%bounce%') as total_bounces
from contact_suppression_ledger group by company_id;

grant select on public.email_health_stats to authenticated;
