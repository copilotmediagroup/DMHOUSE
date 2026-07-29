-- DMH Sales OS v1.7.0 — Negotiation & Closing Engine

alter table public.sales_opportunities
  add column if not exists current_offer numeric(14,2),
  add column if not exists current_counter numeric(14,2),
  add column if not exists decision_maker text,
  add column if not exists terms text,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists funded_at timestamptz;

create table if not exists public.deal_timeline_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  opportunity_id uuid not null references public.sales_opportunities(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  amount numeric(14,2),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.deal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  opportunity_id uuid not null references public.sales_opportunities(id) on delete cascade,
  item_key text not null,
  label text not null,
  completed boolean not null default false,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(opportunity_id,item_key)
);

create index if not exists deal_timeline_opportunity_idx on public.deal_timeline_events(opportunity_id,created_at desc);
create index if not exists deal_checklist_opportunity_idx on public.deal_checklist_items(opportunity_id);

alter table public.deal_timeline_events enable row level security;
alter table public.deal_checklist_items enable row level security;

drop policy if exists deal_timeline_company_all on public.deal_timeline_events;
create policy deal_timeline_company_all on public.deal_timeline_events for all
using (company_id=(select company_id from public.profiles where id=auth.uid()))
with check (company_id=(select company_id from public.profiles where id=auth.uid()));

drop policy if exists deal_checklist_company_all on public.deal_checklist_items;
create policy deal_checklist_company_all on public.deal_checklist_items for all
using (company_id=(select company_id from public.profiles where id=auth.uid()))
with check (company_id=(select company_id from public.profiles where id=auth.uid()));

create or replace function public.dmh_initialize_deal_checklist(p_opportunity_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
 select company_id into v_company from profiles where id=auth.uid();
 if not exists(select 1 from sales_opportunities where id=p_opportunity_id and company_id=v_company) then raise exception 'Opportunity not found'; end if;
 insert into deal_checklist_items(company_id,opportunity_id,item_key,label) values
 (v_company,p_opportunity_id,'nda','NDA completed'),
 (v_company,p_opportunity_id,'purchase_agreement','Purchase agreement signed'),
 (v_company,p_opportunity_id,'wire_instructions','Wire instructions delivered'),
 (v_company,p_opportunity_id,'portfolio_delivered','Portfolio delivered'),
 (v_company,p_opportunity_id,'funds_received','Funds received')
 on conflict(opportunity_id,item_key) do nothing;
end $$;
grant execute on function public.dmh_initialize_deal_checklist(uuid) to authenticated;

create or replace function public.dmh_record_deal_event(
 p_opportunity_id uuid,
 p_event_type text,
 p_title text,
 p_detail text default null,
 p_amount numeric default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
 select company_id into v_company from profiles where id=auth.uid();
 if not exists(select 1 from sales_opportunities where id=p_opportunity_id and company_id=v_company) then raise exception 'Opportunity not found'; end if;
 insert into deal_timeline_events(company_id,opportunity_id,event_type,title,detail,amount,created_by)
 values(v_company,p_opportunity_id,p_event_type,p_title,p_detail,p_amount,auth.uid());
end $$;
grant execute on function public.dmh_record_deal_event(uuid,text,text,text,numeric) to authenticated;

create or replace function public.dmh_toggle_deal_checklist(p_item_id uuid,p_completed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
 select company_id into v_company from profiles where id=auth.uid();
 update deal_checklist_items set completed=p_completed,completed_by=case when p_completed then auth.uid() else null end,completed_at=case when p_completed then now() else null end
 where id=p_item_id and company_id=v_company;
end $$;
grant execute on function public.dmh_toggle_deal_checklist(uuid,boolean) to authenticated;

create or replace function public.dmh_deal_dashboard()
returns jsonb language sql security definer set search_path=public as $$
 with me as (select company_id from profiles where id=auth.uid()), o as (
  select * from sales_opportunities where company_id=(select company_id from me)
 ), won as (select * from o where stage='closed_won')
 select jsonb_build_object(
  'activePipeline',coalesce((select sum(asking_price) from o where stage not in ('closed_won','closed_lost')),0),
  'negotiations',(select count(*) from o where stage in ('negotiating','verbal_agreement')),
  'closing',(select count(*) from o where stage='contracts'),
  'fundedThisMonth',coalesce((select sum(coalesce(closed_amount,asking_price)) from won where date_trunc('month',coalesce(funded_at,closed_at))=date_trunc('month',current_date)),0),
  'averageDaysToClose',coalesce((select round(avg(extract(epoch from (coalesce(funded_at,closed_at)-created_at))/86400)::numeric,1) from won),0)
 )
$$;
grant execute on function public.dmh_deal_dashboard() to authenticated;
