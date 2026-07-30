-- DMH Sales OS v3.0.6 — Staff Deal Room Command Engine
-- Read-only command-center RPC. Does not alter invitation delivery or authentication.

create or replace function public.dmh_staff_deal_room_command()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with staff as (
    select id, company_id, role
    from public.profiles
    where id = auth.uid()
      and role in ('owner','employee')
  ),
  cycles as (
    select distinct on (c.buyer_id, coalesce(c.portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid))
      c.*
    from public.buyer_invitation_cycles c
    join staff s on s.company_id = c.company_id
    order by c.buyer_id,
      coalesce(c.portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid),
      c.started_at desc
  ),
  rows as (
    select
      c.id as transaction_id,
      c.buyer_id,
      c.portfolio_id,
      c.document_id,
      c.status as cycle_status,
      c.started_at,
      c.expires_at as cycle_expires_at,
      c.invite_count,
      b.company_name as buyer_company,
      b.contact_name as buyer_name,
      b.email as buyer_email,
      b.phone as buyer_phone,
      p.name as portfolio_name,
      p.category as portfolio_category,
      p.account_count,
      p.asking_price,
      d.document_type,
      d.title as document_title,
      d.status as document_status,
      d.seller_signed_at,
      d.buyer_signed_at,
      d.sent_at,
      i.id as latest_invitation_id,
      i.delivery_status,
      i.sent_at as invitation_sent_at,
      i.opened_at,
      i.redeemed_at,
      i.expires_at as invitation_expires_at,
      i.failure_reason,
      r.id as room_id,
      r.status as room_status,
      r.agreement_approved_at,
      r.payment_confirmed_at,
      r.final_file_released_at,
      r.closed_at,
      o.current_amount as offer_amount,
      (select count(*) from public.buyer_deal_messages m
        where m.buyer_id=c.buyer_id
          and (c.portfolio_id is null or m.portfolio_id=c.portfolio_id)) as message_count,
      greatest(
        c.started_at,
        coalesce(i.sent_at,c.started_at),
        coalesce(i.opened_at,c.started_at),
        coalesce(i.redeemed_at,c.started_at),
        coalesce(d.buyer_signed_at,c.started_at),
        coalesce(r.updated_at,c.started_at)
      ) as last_activity_at
    from cycles c
    join public.buyer_profiles b on b.id=c.buyer_id
    left join public.portfolios p on p.id=c.portfolio_id
    left join public.deal_documents_generated d on d.id=c.document_id
    left join lateral (
      select x.* from public.buyer_invitations x
      where x.cycle_id=c.id
      order by x.sent_at desc
      limit 1
    ) i on true
    left join public.buyer_deal_rooms r
      on r.buyer_id=c.buyer_id and r.portfolio_id=c.portfolio_id
    left join public.offers o on o.id=r.offer_id
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by last_activity_at desc),'[]'::jsonb)
  from rows;
$$;

grant execute on function public.dmh_staff_deal_room_command() to authenticated;
