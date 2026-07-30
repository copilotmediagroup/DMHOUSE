-- DMH Sales OS v1.4.0 — Sales Pipeline Engine

alter table public.agencies
  add column if not exists pipeline_stage text not null default 'new',
  add column if not exists pipeline_stage_changed_at timestamptz not null default now();

update public.agencies set pipeline_stage = case status
  when 'new' then 'new'
  when 'researching' then 'researching'
  when 'contacted' then 'first_contact'
  when 'qualified' then 'decision_maker_found'
  when 'portfolio_sent' then 'portfolio_sent'
  when 'negotiating' then 'negotiating'
  when 'offer_submitted' then 'verbal_agreement'
  when 'closed' then 'closed_won'
  when 'not_interested' then 'closed_lost'
  when 'do_not_contact' then 'closed_lost'
  else 'new' end
where pipeline_stage='new';

create table if not exists public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  owner_id uuid references public.profiles(id),
  title text not null,
  stage text not null default 'new',
  asking_price numeric(14,2) not null default 0,
  probability integer not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  closed_amount numeric(14,2),
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists sales_opportunities_company_stage_idx on public.sales_opportunities(company_id,stage);
create index if not exists sales_opportunities_agency_idx on public.sales_opportunities(agency_id);

create table if not exists public.pipeline_stage_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  opportunity_id uuid references public.sales_opportunities(id) on delete cascade,
  changed_by uuid references public.profiles(id),
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now()
);

alter table public.sales_opportunities enable row level security;
alter table public.pipeline_stage_history enable row level security;

drop policy if exists sales_opportunities_company_all on public.sales_opportunities;
create policy sales_opportunities_company_all on public.sales_opportunities for all
using (company_id=(select company_id from public.profiles where id=auth.uid()))
with check (company_id=(select company_id from public.profiles where id=auth.uid()));

drop policy if exists pipeline_stage_history_company_read on public.pipeline_stage_history;
create policy pipeline_stage_history_company_read on public.pipeline_stage_history for select
using (company_id=(select company_id from public.profiles where id=auth.uid()));

create or replace function public.dmh_move_pipeline_stage(p_agency_id uuid,p_stage text)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_from text;
begin
 select company_id into v_company from profiles where id=auth.uid();
 if p_stage not in ('new','researching','first_contact','conversation_started','decision_maker_found','portfolio_requested','portfolio_sent','negotiating','verbal_agreement','contracts','closed_won','closed_lost') then raise exception 'Invalid pipeline stage'; end if;
 select pipeline_stage into v_from from agencies where id=p_agency_id and company_id=v_company;
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

create or replace function public.dmh_pipeline_forecast()
returns jsonb language sql security definer set search_path=public as $$
 with me as (select company_id from profiles where id=auth.uid()), o as (
 select * from sales_opportunities where company_id=(select company_id from me)
 ), won as (select * from o where stage='closed_won'), open_o as (select * from o where stage not in ('closed_won','closed_lost'))
 select jsonb_build_object(
  'totalPipeline',coalesce((select sum(asking_price) from open_o),0),
  'weightedPipeline',coalesce((select sum(asking_price*probability/100.0) from open_o),0),
  'expectedThisMonth',coalesce((select sum(asking_price*probability/100.0) from open_o where date_trunc('month',expected_close_date)=date_trunc('month',current_date)),0),
  'negotiations',(select count(*) from open_o where stage in ('negotiating','verbal_agreement','contracts')),
  'portfoliosSent',(select count(*) from open_o where stage='portfolio_sent'),
  'winRate',case when (select count(*) from o where stage in ('closed_won','closed_lost'))=0 then 0 else round(100.0*(select count(*) from won)/(select count(*) from o where stage in ('closed_won','closed_lost')),1) end,
  'averageDaysToClose',coalesce((select round(avg(extract(epoch from (closed_at-created_at))/86400)::numeric,1) from won),0)
 )
$$;
grant execute on function public.dmh_pipeline_forecast() to authenticated;
