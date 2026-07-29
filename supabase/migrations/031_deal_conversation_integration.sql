-- DMH Sales OS v1.7.1 — Deal-to-Conversation Integration

alter table public.conversations
  add column if not exists opportunity_id uuid references public.sales_opportunities(id) on delete set null;

create index if not exists conversations_opportunity_idx on public.conversations(opportunity_id);

create or replace function public.dmh_create_deal_from_conversation(
  p_conversation_id uuid,
  p_title text default null,
  p_portfolio_id uuid default null,
  p_asking_price numeric default 0
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_conversation conversations%rowtype; v_id uuid;
begin
  select company_id into v_company from profiles where id=auth.uid();
  select * into v_conversation from conversations where id=p_conversation_id and company_id=v_company;
  if v_conversation.id is null then raise exception 'Conversation not found'; end if;
  if v_conversation.opportunity_id is not null then return v_conversation.opportunity_id; end if;
  insert into sales_opportunities(company_id,agency_id,portfolio_id,owner_id,title,stage,asking_price,probability,updated_at)
  values(v_company,v_conversation.agency_id,p_portfolio_id,coalesce(v_conversation.assigned_employee_id,auth.uid()),coalesce(nullif(trim(p_title),''),coalesce(v_conversation.subject,'Buyer opportunity')),'negotiating',coalesce(p_asking_price,0),60,now())
  returning id into v_id;
  update conversations set opportunity_id=v_id,status='negotiating',updated_at=now() where id=p_conversation_id;
  update agencies set pipeline_stage='negotiating',pipeline_stage_changed_at=now(),status='negotiating' where id=v_conversation.agency_id and company_id=v_company;
  insert into deal_timeline_events(company_id,opportunity_id,event_type,title,detail,created_by)
  values(v_company,v_id,'created_from_conversation','Deal created from buyer conversation',v_conversation.subject,auth.uid());
  return v_id;
end $$;
grant execute on function public.dmh_create_deal_from_conversation(uuid,text,uuid,numeric) to authenticated;

create or replace function public.dmh_sync_deal_conversation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.stage='contracts' and old.stage is distinct from new.stage then
    update conversations set status='closing',updated_at=now() where opportunity_id=new.id;
    update agencies set pipeline_stage='contracts',pipeline_stage_changed_at=now(),status='offer_submitted' where id=new.agency_id;
  elsif new.stage='closed_won' and old.stage is distinct from new.stage then
    update conversations set status='closed',next_follow_up_at=null,updated_at=now() where opportunity_id=new.id;
    update agencies set pipeline_stage='closed_won',pipeline_stage_changed_at=now(),status='closed' where id=new.agency_id;
  elsif new.stage='closed_lost' and old.stage is distinct from new.stage then
    update conversations set status='closed',next_follow_up_at=null,updated_at=now() where opportunity_id=new.id;
    update agencies set pipeline_stage='closed_lost',pipeline_stage_changed_at=now(),status='not_interested' where id=new.agency_id;
  elsif new.stage in ('negotiating','verbal_agreement') and old.stage is distinct from new.stage then
    update conversations set status='negotiating',updated_at=now() where opportunity_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_deal_conversation on public.sales_opportunities;
create trigger trg_sync_deal_conversation after update of stage on public.sales_opportunities
for each row execute function public.dmh_sync_deal_conversation();

-- Backfill links where one open conversation and one active opportunity exist for an agency.
update conversations c set opportunity_id=o.id
from sales_opportunities o
where c.opportunity_id is null and o.company_id=c.company_id and o.agency_id=c.agency_id
  and o.stage not in ('closed_won','closed_lost')
  and o.id=(select o2.id from sales_opportunities o2 where o2.company_id=c.company_id and o2.agency_id=c.agency_id and o2.stage not in ('closed_won','closed_lost') order by o2.updated_at desc limit 1);

notify pgrst, 'reload schema';
