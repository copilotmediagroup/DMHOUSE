-- DMH Sales OS v3.0.7 — Digital Closing Engine
-- Adds structured payment verification, release controls, download history and a transaction audit trail.

alter table public.buyer_deal_rooms
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_amount numeric(14,2),
  add column if not exists payment_notes text;

create table if not exists public.buyer_deal_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  room_id uuid not null references public.buyer_deal_rooms(id) on delete cascade,
  buyer_id uuid references public.buyer_profiles(id) on delete set null,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  event_type text not null,
  actor_role text,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.buyer_deal_file_downloads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  room_id uuid not null references public.buyer_deal_rooms(id) on delete cascade,
  document_id uuid not null references public.buyer_deal_documents(id) on delete cascade,
  buyer_id uuid references public.buyer_profiles(id) on delete set null,
  downloaded_by uuid,
  downloaded_at timestamptz not null default now(),
  user_agent text
);

create index if not exists buyer_deal_events_room_created_idx
  on public.buyer_deal_events(room_id,created_at desc);
create index if not exists buyer_deal_downloads_room_created_idx
  on public.buyer_deal_file_downloads(room_id,downloaded_at desc);

alter table public.buyer_deal_events enable row level security;
alter table public.buyer_deal_file_downloads enable row level security;

drop policy if exists "deal participants read closing events" on public.buyer_deal_events;
create policy "deal participants read closing events" on public.buyer_deal_events for select using (
  (company_id=public.current_company_id() and public.current_role() in ('owner','employee'))
  or buyer_id=public.current_buyer_id()
);

drop policy if exists "staff read file download history" on public.buyer_deal_file_downloads;
create policy "staff read file download history" on public.buyer_deal_file_downloads for select using (
  company_id=public.current_company_id() and public.current_role() in ('owner','employee')
);

drop policy if exists "buyer reads own file downloads" on public.buyer_deal_file_downloads;
create policy "buyer reads own file downloads" on public.buyer_deal_file_downloads for select using (
  buyer_id=public.current_buyer_id()
);

create or replace function public.dmh_append_deal_event(
  p_room_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype;
begin
  select * into r from public.buyer_deal_rooms where id=p_room_id;
  if not found then raise exception 'Deal room not found'; end if;
  insert into public.buyer_deal_events(company_id,room_id,buyer_id,portfolio_id,event_type,actor_role,actor_id,metadata)
  values(r.company_id,r.id,r.buyer_id,r.portfolio_id,p_event_type,public.current_role()::text,auth.uid(),coalesce(p_metadata,'{}'::jsonb));
end $$;

create or replace function public.dmh_verify_buyer_payment(
  p_room_id uuid,
  p_method text,
  p_reference text default null,
  p_amount numeric default null,
  p_notes text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype;
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Deal room not found'; end if;
  if r.agreement_approved_at is null then raise exception 'Approve the purchase agreement first'; end if;
  if coalesce(trim(p_method),'')='' then raise exception 'Payment method is required'; end if;

  update public.buyer_deal_rooms set
    payment_method=trim(p_method),
    payment_reference=nullif(trim(coalesce(p_reference,'')),''),
    payment_amount=p_amount,
    payment_notes=nullif(trim(coalesce(p_notes,'')),''),
    payment_confirmed_at=coalesce(payment_confirmed_at,now()),
    payment_confirmed_by=auth.uid(),
    status='release_ready',
    updated_at=now()
  where id=p_room_id;

  perform public.dmh_append_deal_event(p_room_id,'payment_verified',jsonb_build_object(
    'method',trim(p_method),'reference',nullif(trim(coalesce(p_reference,'')),''),'amount',p_amount
  ));
end $$;
grant execute on function public.dmh_verify_buyer_payment(uuid,text,text,numeric,text) to authenticated;

create or replace function public.dmh_release_buyer_files(p_room_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype; v_count integer;
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Deal room not found'; end if;
  if r.payment_confirmed_at is null then raise exception 'Verify payment before releasing files'; end if;

  update public.buyer_deal_documents
  set visible_to_buyer=true,status='released',approved_at=coalesce(approved_at,now()),approved_by=auth.uid()
  where room_id=p_room_id and document_type='final_portfolio';
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'Upload a final portfolio document before release'; end if;

  update public.buyer_deal_rooms
  set final_file_released_at=coalesce(final_file_released_at,now()),final_file_released_by=auth.uid(),status='files_released',updated_at=now()
  where id=p_room_id;

  perform public.dmh_append_deal_event(p_room_id,'files_released',jsonb_build_object('document_count',v_count));
  return v_count;
end $$;
grant execute on function public.dmh_release_buyer_files(uuid) to authenticated;

create or replace function public.dmh_log_deal_download(p_document_id uuid,p_user_agent text default null)
returns text language plpgsql security definer set search_path=public as $$
declare d public.buyer_deal_documents%rowtype; r public.buyer_deal_rooms%rowtype; v_buyer uuid;
begin
  select * into d from public.buyer_deal_documents where id=p_document_id and visible_to_buyer=true and status='released';
  if not found then raise exception 'Document is not available for download'; end if;
  select * into r from public.buyer_deal_rooms where id=d.room_id;
  v_buyer:=public.current_buyer_id();
  if v_buyer is null or r.buyer_id<>v_buyer then raise exception 'Buyer access required'; end if;
  if r.payment_confirmed_at is null or r.final_file_released_at is null then raise exception 'File release is not complete'; end if;

  insert into public.buyer_deal_file_downloads(company_id,room_id,document_id,buyer_id,downloaded_by,user_agent)
  values(r.company_id,r.id,d.id,v_buyer,auth.uid(),nullif(p_user_agent,''));
  perform public.dmh_append_deal_event(r.id,'file_downloaded',jsonb_build_object('document_id',d.id,'title',d.title));
  return coalesce(d.external_url,'');
end $$;
grant execute on function public.dmh_log_deal_download(uuid,text) to authenticated;

create or replace function public.dmh_deal_room_snapshot(p_portfolio_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_buyer uuid:=public.current_buyer_id(); v_room jsonb; v_offer jsonb; v_messages jsonb; v_docs jsonb; v_rounds jsonb; v_events jsonb; v_downloads jsonb;
begin
 if public.current_role()='buyer' then
  select to_jsonb(r) into v_room from public.buyer_deal_rooms r where r.buyer_id=v_buyer and r.portfolio_id=p_portfolio_id order by r.updated_at desc limit 1;
 else
  select to_jsonb(r) into v_room from public.buyer_deal_rooms r where r.company_id=v_company and r.portfolio_id=p_portfolio_id order by r.updated_at desc limit 1;
 end if;
 if v_room is null then return jsonb_build_object('room',null,'offer',null,'messages','[]'::jsonb,'documents','[]'::jsonb,'rounds','[]'::jsonb,'events','[]'::jsonb,'downloads','[]'::jsonb); end if;
 select to_jsonb(o) into v_offer from public.offers o where o.id=(v_room->>'offer_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb) into v_messages from public.buyer_deal_messages m where m.offer_id=(v_room->>'offer_id')::uuid or (m.buyer_id=(v_room->>'buyer_id')::uuid and m.portfolio_id=p_portfolio_id);
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]'::jsonb) into v_docs from public.buyer_deal_documents d where d.room_id=(v_room->>'id')::uuid and (public.current_role()<>'buyer' or d.visible_to_buyer);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.round_number),'[]'::jsonb) into v_rounds from public.offer_rounds x where x.offer_id=(v_room->>'offer_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_events from public.buyer_deal_events e where e.room_id=(v_room->>'id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(dl) order by dl.downloaded_at desc),'[]'::jsonb) into v_downloads from public.buyer_deal_file_downloads dl where dl.room_id=(v_room->>'id')::uuid and (public.current_role()<>'buyer' or dl.buyer_id=v_buyer);
 return jsonb_build_object('room',v_room,'offer',v_offer,'messages',v_messages,'documents',v_docs,'rounds',v_rounds,'events',v_events,'downloads',v_downloads);
end $$;
grant execute on function public.dmh_deal_room_snapshot(uuid) to authenticated;
