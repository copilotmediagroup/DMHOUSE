-- DMH Sales OS v2.5.1 — Buyer Deal Room Completion Engine

alter table public.offers add column if not exists buyer_id uuid references public.buyer_profiles(id) on delete set null;
alter table public.offers add column if not exists reservation_expires_at timestamptz;
alter table public.offers add column if not exists accepted_at timestamptz;
alter table public.offers add column if not exists withdrawn_at timestamptz;

create table if not exists public.buyer_deal_rooms (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 offer_id uuid not null unique references public.offers(id) on delete cascade,
 status text not null default 'negotiating' check(status in ('negotiating','offer_accepted','agreement_pending','payment_pending','release_ready','closed','cancelled','expired')),
 reservation_expires_at timestamptz,
 agreement_approved_at timestamptz,
 agreement_approved_by uuid references public.profiles(id),
 payment_confirmed_at timestamptz,
 payment_confirmed_by uuid references public.profiles(id),
 final_file_released_at timestamptz,
 final_file_released_by uuid references public.profiles(id),
 closed_at timestamptz,
 closed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(buyer_id,portfolio_id)
);

create table if not exists public.buyer_deal_documents (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 room_id uuid not null references public.buyer_deal_rooms(id) on delete cascade,
 document_type text not null check(document_type in ('sample','purchase_agreement','signed_agreement','payment_proof','payment_instructions','final_portfolio','other')),
 title text not null,
 storage_path text,
 external_url text,
 status text not null default 'uploaded' check(status in ('requested','uploaded','approved','rejected','released','superseded')),
 visible_to_buyer boolean not null default false,
 uploaded_by uuid references public.profiles(id),
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);

create table if not exists public.buyer_document_downloads (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 room_id uuid not null references public.buyer_deal_rooms(id) on delete cascade,
 document_id uuid not null references public.buyer_deal_documents(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 downloaded_at timestamptz not null default now()
);

create index if not exists buyer_deal_rooms_company_status_idx on public.buyer_deal_rooms(company_id,status,updated_at desc);
create index if not exists buyer_deal_documents_room_idx on public.buyer_deal_documents(room_id,document_type,created_at desc);
create index if not exists buyer_downloads_document_idx on public.buyer_document_downloads(document_id,downloaded_at desc);

alter table public.buyer_deal_rooms enable row level security;
alter table public.buyer_deal_documents enable row level security;
alter table public.buyer_document_downloads enable row level security;

drop policy if exists "deal room participants read" on public.buyer_deal_rooms;
create policy "deal room participants read" on public.buyer_deal_rooms for select using (
 (company_id=public.current_company_id() and public.current_role() in ('owner','employee')) or buyer_id=public.current_buyer_id()
);
drop policy if exists "owner manages deal rooms" on public.buyer_deal_rooms;
create policy "owner manages deal rooms" on public.buyer_deal_rooms for all using (company_id=public.current_company_id() and public.current_role()='owner') with check (company_id=public.current_company_id() and public.current_role()='owner');
drop policy if exists "deal participants read documents" on public.buyer_deal_documents;
create policy "deal participants read documents" on public.buyer_deal_documents for select using (
 exists(select 1 from public.buyer_deal_rooms r where r.id=room_id and ((r.company_id=public.current_company_id() and public.current_role() in ('owner','employee')) or (r.buyer_id=public.current_buyer_id() and visible_to_buyer)))
);
drop policy if exists "owner manages deal documents" on public.buyer_deal_documents;
create policy "owner manages deal documents" on public.buyer_deal_documents for all using (company_id=public.current_company_id() and public.current_role()='owner') with check (company_id=public.current_company_id() and public.current_role()='owner');
drop policy if exists "owner reads downloads" on public.buyer_document_downloads;
create policy "owner reads downloads" on public.buyer_document_downloads for select using (company_id=public.current_company_id() and public.current_role()='owner');
drop policy if exists "buyer records downloads" on public.buyer_document_downloads;
create policy "buyer records downloads" on public.buyer_document_downloads for insert with check (buyer_id=public.current_buyer_id());

create or replace function public.dmh_deal_room_snapshot(p_portfolio_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_buyer uuid; v_company uuid; v_room jsonb; v_offer jsonb; v_messages jsonb; v_docs jsonb; v_rounds jsonb;
begin
 v_buyer:=public.current_buyer_id(); v_company:=public.current_company_id();
 if public.current_role()='buyer' then
  if v_buyer is null then raise exception 'Buyer profile required'; end if;
  select to_jsonb(r) into v_room from buyer_deal_rooms r where r.buyer_id=v_buyer and r.portfolio_id=p_portfolio_id;
 else
  select to_jsonb(r) into v_room from buyer_deal_rooms r where r.company_id=v_company and r.portfolio_id=p_portfolio_id order by r.updated_at desc limit 1;
 end if;
 if v_room is null then return jsonb_build_object('room',null,'offer',null,'messages','[]'::jsonb,'documents','[]'::jsonb,'rounds','[]'::jsonb); end if;
 select to_jsonb(o) into v_offer from offers o where o.id=(v_room->>'offer_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb) into v_messages from buyer_deal_messages m where m.offer_id=(v_room->>'offer_id')::uuid or (m.buyer_id=(v_room->>'buyer_id')::uuid and m.portfolio_id=p_portfolio_id);
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]'::jsonb) into v_docs from buyer_deal_documents d where d.room_id=(v_room->>'id')::uuid and (public.current_role()<>'buyer' or d.visible_to_buyer);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.round_number),'[]'::jsonb) into v_rounds from offer_rounds x where x.offer_id=(v_room->>'offer_id')::uuid;
 return jsonb_build_object('room',v_room,'offer',v_offer,'messages',v_messages,'documents',v_docs,'rounds',v_rounds);
end $$;
grant execute on function public.dmh_deal_room_snapshot(uuid) to authenticated;

create or replace function public.dmh_deal_offer_action(p_offer_id uuid,p_action text,p_amount numeric default null,p_message text default null,p_reservation_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_offer offers%rowtype; v_buyer buyer_profiles%rowtype; v_actor text; v_round int; v_room uuid;
begin
 select * into v_offer from offers where id=p_offer_id for update; if not found then raise exception 'Offer not found'; end if;
 v_actor:=public.current_role()::text;
 if v_actor='buyer' then select * into v_buyer from buyer_profiles where id=public.current_buyer_id(); if v_offer.buyer_id<>v_buyer.id then raise exception 'Access denied'; end if;
 elsif v_actor not in ('owner','employee') or v_offer.company_id<>public.current_company_id() then raise exception 'Access denied'; end if;
 if p_action not in ('counter','accept','reject','withdraw','request_info') then raise exception 'Invalid action'; end if;
 if p_action='counter' and coalesce(p_amount,0)<=0 then raise exception 'Counter amount required'; end if;
 select coalesce(max(round_number),0)+1 into v_round from offer_rounds where offer_id=p_offer_id;
 insert into offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by)
 values(v_offer.company_id,p_offer_id,v_round,case when v_actor='buyer' then 'buyer' when v_actor='owner' then 'owner' else 'employee' end,
 case when p_action='withdraw' then 'reject' else p_action end,case when p_action='counter' then p_amount else v_offer.current_amount end,v_offer.payment_terms,p_message,auth.uid());
 update offers set current_amount=case when p_action='counter' then p_amount else current_amount end,
  status=case when p_action='accept' then 'accepted'::offer_status when p_action in ('reject','withdraw') then 'rejected'::offer_status else status end,
  accepted_at=case when p_action='accept' then now() else accepted_at end,
  withdrawn_at=case when p_action='withdraw' then now() else withdrawn_at end,
  reservation_expires_at=coalesce(p_reservation_expires_at,reservation_expires_at),updated_at=now() where id=p_offer_id;
 insert into buyer_deal_rooms(company_id,buyer_id,portfolio_id,offer_id,status,reservation_expires_at)
 values(v_offer.company_id,v_offer.buyer_id,v_offer.portfolio_id,p_offer_id,case when p_action='accept' then 'offer_accepted' else 'negotiating' end,p_reservation_expires_at)
 on conflict(offer_id) do update set status=case when p_action='accept' then 'offer_accepted' else buyer_deal_rooms.status end,reservation_expires_at=coalesce(p_reservation_expires_at,buyer_deal_rooms.reservation_expires_at),updated_at=now()
 returning id into v_room;
end $$;
grant execute on function public.dmh_deal_offer_action(uuid,text,numeric,text,timestamptz) to authenticated;

create or replace function public.dmh_deal_gate(p_room_id uuid,p_gate text)
returns void language plpgsql security definer set search_path=public as $$
declare r buyer_deal_rooms%rowtype;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 select * into r from buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update; if not found then raise exception 'Room not found'; end if;
 if p_gate='agreement' then update buyer_deal_rooms set agreement_approved_at=now(),agreement_approved_by=auth.uid(),status='payment_pending',updated_at=now() where id=p_room_id;
 elsif p_gate='payment' then if r.agreement_approved_at is null then raise exception 'Approve agreement first'; end if; update buyer_deal_rooms set payment_confirmed_at=now(),payment_confirmed_by=auth.uid(),status='release_ready',updated_at=now() where id=p_room_id;
 elsif p_gate='release' then if r.payment_confirmed_at is null then raise exception 'Confirm payment first'; end if; update buyer_deal_rooms set final_file_released_at=now(),final_file_released_by=auth.uid(),updated_at=now() where id=p_room_id; update buyer_deal_documents set visible_to_buyer=true,status='released',approved_at=now(),approved_by=auth.uid() where room_id=p_room_id and document_type='final_portfolio';
 else raise exception 'Invalid gate'; end if;
end $$;
grant execute on function public.dmh_deal_gate(uuid,text) to authenticated;

create or replace function public.dmh_close_buyer_deal(p_room_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare r buyer_deal_rooms%rowtype; o offers%rowtype; s_id uuid; c numeric;
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 select * into r from buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update; if not found then raise exception 'Room not found'; end if;
 if r.agreement_approved_at is null or r.payment_confirmed_at is null or r.final_file_released_at is null then raise exception 'Agreement, payment, and final release are required'; end if;
 select * into o from offers where id=r.offer_id;
 insert into sales(company_id,portfolio_id,buyer_agency_id,winning_employee_id,sale_price,paid_at,closed_at,gross_revenue,revenue_status)
 values(o.company_id,o.portfolio_id,o.agency_id,case when exists(select 1 from profiles where id=o.employee_id and role='employee') then o.employee_id else null end,o.current_amount,now(),now(),o.current_amount,'unreconciled')
 on conflict(portfolio_id) do update set sale_price=excluded.sale_price,paid_at=excluded.paid_at,closed_at=excluded.closed_at returning id into s_id;
 select case when p.employee_commission_visible then case when p.employee_commission_type='percentage' then round(o.current_amount*coalesce(p.employee_commission_value,0)/100,2) else coalesce(p.employee_commission_value,0) end else 0 end into c from portfolios p where p.id=o.portfolio_id;
 if c>0 and exists(select 1 from profiles where id=o.employee_id and role='employee') then insert into commissions(company_id,sale_id,employee_id,amount,status,commission_type,rate,base_amount) values(o.company_id,s_id,o.employee_id,c,'pending',case when (select employee_commission_type from portfolios where id=o.portfolio_id)='percentage' then 'percent_revenue' else 'flat' end,(select employee_commission_value from portfolios where id=o.portfolio_id),o.current_amount) on conflict do nothing; end if;
 update portfolios set status='sold' where id=o.portfolio_id;
 update buyer_deal_rooms set status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now() where id=p_room_id;
 return s_id;
end $$;
grant execute on function public.dmh_close_buyer_deal(uuid) to authenticated;

-- Ensure direct buyer offers are linked to a buyer and room.
create or replace function public.dmh_buyer_submit_offer(p_portfolio_id uuid,p_amount numeric,p_payment_terms text default null,p_conditions text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_buyer buyer_profiles%rowtype; v_offer uuid;
begin
 select * into v_buyer from buyer_profiles where id=public.current_buyer_id() and status='approved'; if v_buyer.id is null then raise exception 'Approved buyer access required'; end if;
 if not exists(select 1 from buyer_portfolio_access where buyer_id=v_buyer.id and portfolio_id=p_portfolio_id and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Portfolio access denied'; end if;
 if not exists(select 1 from buyer_disclosures where buyer_id=v_buyer.id and portfolio_id=p_portfolio_id and acknowledged) then raise exception 'Disclosure acknowledgment required'; end if;
 if v_buyer.agency_id is null then insert into agencies(company_id,name,domain,phone) values(v_buyer.company_id,v_buyer.company_name,split_part(v_buyer.email,'@',2),v_buyer.phone) returning id into v_buyer.agency_id; update buyer_profiles set agency_id=v_buyer.agency_id where id=v_buyer.id; end if;
 insert into offers(company_id,portfolio_id,agency_id,employee_id,buyer_id,status,current_amount,payment_terms,conditions,employee_recommendation)
 values(v_buyer.company_id,p_portfolio_id,v_buyer.agency_id,auth.uid(),v_buyer.id,'submitted',p_amount,p_payment_terms,p_conditions,'Submitted directly through Buyer Portal') returning id into v_offer;
 insert into offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by) values(v_buyer.company_id,v_offer,1,'buyer','offer',p_amount,p_payment_terms,p_conditions,auth.uid());
 insert into buyer_deal_rooms(company_id,buyer_id,portfolio_id,offer_id,status) values(v_buyer.company_id,v_buyer.id,p_portfolio_id,v_offer,'negotiating');
 update portfolios set status='negotiating' where id=p_portfolio_id and status='active';
 insert into buyer_activity_events(company_id,buyer_id,portfolio_id,event_type,metadata) values(v_buyer.company_id,v_buyer.id,p_portfolio_id,'offer_submitted',jsonb_build_object('offer_id',v_offer,'amount',p_amount));
 return v_offer;
end $$;
grant execute on function public.dmh_buyer_submit_offer(uuid,numeric,text,text) to authenticated;
