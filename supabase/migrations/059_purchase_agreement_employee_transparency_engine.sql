-- DMH Sales OS v3.1.3 — Purchase Agreement + Employee Commission Transparency Engine
-- Employees see system-recorded deal milestones and commission status for deals assigned to them.
-- Employees cannot approve price, sign/countersign agreements, verify payment, release files, or mark commission paid.

alter table public.buyer_deal_rooms
  add column if not exists purchase_agreement_generated_at timestamptz,
  add column if not exists purchase_agreement_sent_at timestamptz,
  add column if not exists purchase_agreement_buyer_signed_at timestamptz,
  add column if not exists purchase_agreement_owner_signed_at timestamptz,
  add column if not exists purchase_agreement_executed_at timestamptz;

create or replace function public.dmh_sync_purchase_agreement_milestones()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_room uuid;
begin
  if new.document_type <> 'purchase_agreement' then return new; end if;
  select id into v_room from public.buyer_deal_rooms
   where portfolio_id=new.portfolio_id and buyer_id=new.buyer_id
   order by created_at desc limit 1;
  if v_room is null then return new; end if;
  update public.buyer_deal_rooms set
    purchase_agreement_generated_at=coalesce(purchase_agreement_generated_at,new.created_at),
    purchase_agreement_sent_at=case when new.status in ('sent_to_buyer','fully_executed') then coalesce(purchase_agreement_sent_at,new.updated_at,now()) else purchase_agreement_sent_at end,
    purchase_agreement_buyer_signed_at=coalesce(purchase_agreement_buyer_signed_at,new.buyer_signed_at),
    purchase_agreement_owner_signed_at=coalesce(purchase_agreement_owner_signed_at,new.seller_signed_at),
    purchase_agreement_executed_at=case when new.status='fully_executed' then coalesce(purchase_agreement_executed_at,new.updated_at,now()) else purchase_agreement_executed_at end
  where id=v_room;
  return new;
end $$;

drop trigger if exists trg_dmh_sync_purchase_agreement_milestones on public.deal_documents_generated;
create trigger trg_dmh_sync_purchase_agreement_milestones
after insert or update of status,buyer_signed_at,seller_signed_at on public.deal_documents_generated
for each row execute function public.dmh_sync_purchase_agreement_milestones();

create or replace function public.dmh_employee_deal_transparency()
returns table(
  room_id uuid, portfolio_id uuid, portfolio_name text, buyer_name text, buyer_company text,
  agreed_price numeric, current_stage text, stage_rank int,
  nda_signed_at timestamptz, masked_access_at timestamptz, price_agreed_at timestamptz,
  agreement_generated_at timestamptz, agreement_sent_at timestamptz,
  buyer_signed_at timestamptz, owner_signed_at timestamptz, agreement_executed_at timestamptz,
  payment_verified_at timestamptz, file_released_at timestamptz, buyer_downloaded_at timestamptz, closed_at timestamptz,
  commission_amount numeric, commission_status text, commission_paid_at timestamptz,
  commission_requirement text
) language sql stable security definer set search_path=public as $$
with mine as (
 select r.*,o.employee_id,o.current_amount,o.accepted_at,o.final_price_approved_at,
        p.name portfolio_name,b.contact_name buyer_name,b.company_name buyer_company
 from public.buyer_deal_rooms r
 join public.offers o on o.id=r.offer_id
 join public.portfolios p on p.id=r.portfolio_id
 left join public.buyer_profiles b on b.id=r.buyer_id
 where r.company_id=public.current_company_id()
   and public.current_role()='employee'
   and o.employee_id=auth.uid()
), milestones as (
 select m.*,
  (select max(d.buyer_signed_at) from public.deal_documents_generated d where d.portfolio_id=m.portfolio_id and d.buyer_id=m.buyer_id and d.document_type='nda' and d.status='fully_executed') nda_at,
  (select max(a.created_at) from public.buyer_activity_events a where a.portfolio_id=m.portfolio_id and a.buyer_id=m.buyer_id and a.event_type in ('masked_portfolio_viewed','masked_portfolio_downloaded')) masked_at,
  (select max(fd.downloaded_at) from public.buyer_file_downloads fd where fd.room_id=m.id) downloaded_at,
  s.id sale_id
 from mine m left join public.sales s on s.portfolio_id=m.portfolio_id and s.winning_employee_id=auth.uid()
)
select m.id,m.portfolio_id,m.portfolio_name,coalesce(m.buyer_name,'Buyer'),coalesce(m.buyer_company,'Buyer'),
 coalesce(m.current_amount,0),
 case
  when m.closed_at is not null then 'Completed'
  when m.final_file_released_at is not null then 'Files Released'
  when m.payment_confirmed_at is not null then 'Payment Verified'
  when m.purchase_agreement_executed_at is not null then 'Agreement Executed'
  when m.purchase_agreement_buyer_signed_at is not null then 'Buyer Signed Agreement'
  when m.purchase_agreement_sent_at is not null then 'Agreement Sent'
  when m.purchase_agreement_generated_at is not null then 'Agreement Generated'
  when coalesce(m.final_price_approved_at,m.accepted_at) is not null then 'Price Agreed'
  when m.nda_at is not null then 'NDA Signed'
  else 'Invitation / NDA Pending' end,
 case
  when m.closed_at is not null then 10 when m.final_file_released_at is not null then 9
  when m.payment_confirmed_at is not null then 8 when m.purchase_agreement_executed_at is not null then 7
  when m.purchase_agreement_buyer_signed_at is not null then 6 when m.purchase_agreement_sent_at is not null then 5
  when m.purchase_agreement_generated_at is not null then 4 when coalesce(m.final_price_approved_at,m.accepted_at) is not null then 3
  when m.nda_at is not null then 2 else 1 end,
 m.nda_at,m.masked_at,coalesce(m.final_price_approved_at,m.accepted_at),m.purchase_agreement_generated_at,
 m.purchase_agreement_sent_at,m.purchase_agreement_buyer_signed_at,m.purchase_agreement_owner_signed_at,
 m.purchase_agreement_executed_at,m.payment_confirmed_at,m.final_file_released_at,m.downloaded_at,m.closed_at,
 coalesce(c.amount,0),coalesce(c.status,case when m.payment_confirmed_at is not null then 'earned' else 'potential' end),c.paid_at,
 case when c.paid_at is not null then 'Paid' when m.payment_confirmed_at is not null then 'Commission earned — awaiting payment' when m.purchase_agreement_executed_at is not null then 'Payment must be verified' when coalesce(m.final_price_approved_at,m.accepted_at) is not null then 'Purchase Agreement must be fully executed' else 'Final price must be approved' end
from milestones m left join public.commissions c on c.sale_id=m.sale_id and c.employee_id=auth.uid()
order by stage_rank desc,m.created_at desc;
$$;
grant execute on function public.dmh_employee_deal_transparency() to authenticated;

create or replace function public.dmh_owner_mark_commission_paid(p_commission_id uuid,p_reference text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 update public.commissions c set status='paid',paid_at=now(),notes=concat_ws(' · ',nullif(c.notes,''),nullif(p_reference,''))
 where c.id=p_commission_id and c.company_id=public.current_company_id()
   and exists(select 1 from public.sales s where s.id=c.sale_id and s.paid_at is not null);
 if not found then raise exception 'Commission unavailable or buyer payment has not been verified'; end if;
end $$;
grant execute on function public.dmh_owner_mark_commission_paid(uuid,text) to authenticated;
