-- DMH Sales OS v3.1.0 — Portfolio Delivery Vault Engine
-- Owner-only unmasked file custody, owner-only payment verification,
-- immediate vs delayed delivery, buyer countdown, private signed downloads.

alter table public.buyer_deal_rooms
  add column if not exists delivery_method text not null default 'delayed',
  add column if not exists delivery_eta_hours integer,
  add column if not exists delivery_due_at timestamptz,
  add column if not exists delivery_configured_at timestamptz,
  add column if not exists delivery_configured_by uuid references public.profiles(id),
  add column if not exists final_file_uploaded_at timestamptz;

alter table public.buyer_deal_rooms drop constraint if exists buyer_deal_rooms_delivery_method_check;
alter table public.buyer_deal_rooms add constraint buyer_deal_rooms_delivery_method_check
  check (delivery_method in ('immediate','delayed'));

-- Repair/expand the legacy room status constraint for current closing stages.
alter table public.buyer_deal_rooms drop constraint if exists buyer_deal_rooms_status_check;
alter table public.buyer_deal_rooms add constraint buyer_deal_rooms_status_check check(status in (
  'negotiating','offer_accepted','agreement_pending','payment_pending','release_ready',
  'delivery_pending','files_released','closed','cancelled','expired'
));

-- Private bucket. Public URLs are never used for unmasked files.
insert into storage.buckets(id,name,public,file_size_limit)
values('buyer-delivery-vault','buyer-delivery-vault',false,524288000)
on conflict(id) do update set public=false;

-- Remove older policies with these names so this migration is rerunnable.
drop policy if exists "vault owner uploads" on storage.objects;
drop policy if exists "vault owner reads" on storage.objects;
drop policy if exists "vault owner updates" on storage.objects;
drop policy if exists "vault owner deletes" on storage.objects;
drop policy if exists "vault released buyer reads" on storage.objects;

-- Object path format: <company_id>/<room_id>/<uuid>-<filename>
create policy "vault owner uploads" on storage.objects for insert to authenticated with check (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
);
create policy "vault owner reads" on storage.objects for select to authenticated using (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
);
create policy "vault owner updates" on storage.objects for update to authenticated using (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
) with check (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
);
create policy "vault owner deletes" on storage.objects for delete to authenticated using (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='owner'
  and (storage.foldername(name))[1]=public.current_company_id()::text
);
create policy "vault released buyer reads" on storage.objects for select to authenticated using (
  bucket_id='buyer-delivery-vault'
  and public.current_role()='buyer'
  and exists (
    select 1
    from public.buyer_deal_documents d
    join public.buyer_deal_rooms r on r.id=d.room_id
    where d.storage_path=storage.objects.name
      and d.document_type='final_portfolio'
      and d.visible_to_buyer=true
      and d.status='released'
      and r.buyer_id=public.current_buyer_id()
      and r.payment_confirmed_at is not null
      and r.final_file_released_at is not null
  )
);

-- Employees may see delivery status in the room, but never the unmasked document row.
drop policy if exists "deal participants read documents" on public.buyer_deal_documents;
create policy "deal participants read documents" on public.buyer_deal_documents for select using (
  exists(
    select 1 from public.buyer_deal_rooms r
    where r.id=room_id and (
      (r.company_id=public.current_company_id() and public.current_role()='owner')
      or (r.company_id=public.current_company_id() and public.current_role()='employee' and document_type<>'final_portfolio')
      or (r.buyer_id=public.current_buyer_id() and visible_to_buyer)
    )
  )
);

drop policy if exists "staff read file download history" on public.buyer_deal_file_downloads;
create policy "owner reads file download history" on public.buyer_deal_file_downloads for select using (
  company_id=public.current_company_id() and public.current_role()='owner'
);

create or replace function public.dmh_configure_delivery(
  p_room_id uuid,
  p_delivery_method text,
  p_eta_hours integer default null
)
returns void language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype; v_has_file boolean;
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  if p_delivery_method not in ('immediate','delayed') then raise exception 'Invalid delivery method'; end if;
  if p_delivery_method='delayed' and coalesce(p_eta_hours,0)<=0 then raise exception 'Delivery time is required'; end if;
  select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Deal room not found'; end if;
  select exists(select 1 from public.buyer_deal_documents where room_id=p_room_id and document_type='final_portfolio' and status<>'superseded') into v_has_file;
  if p_delivery_method='immediate' and not v_has_file then raise exception 'Upload the unmasked file before selecting Immediate Download'; end if;

  update public.buyer_deal_rooms set
    delivery_method=p_delivery_method,
    delivery_eta_hours=case when p_delivery_method='delayed' then p_eta_hours else null end,
    delivery_due_at=case when payment_confirmed_at is not null and p_delivery_method='delayed' then payment_confirmed_at + make_interval(hours=>p_eta_hours) else null end,
    delivery_configured_at=now(),delivery_configured_by=auth.uid(),updated_at=now()
  where id=p_room_id;
  perform public.dmh_append_deal_event(p_room_id,'delivery_configured',jsonb_build_object('method',p_delivery_method,'eta_hours',p_eta_hours));
end $$;
grant execute on function public.dmh_configure_delivery(uuid,text,integer) to authenticated;

create or replace function public.dmh_register_vault_file(
  p_room_id uuid,
  p_title text,
  p_storage_path text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype; v_id uuid;
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Deal room not found'; end if;
  if coalesce(trim(p_title),'')='' or coalesce(trim(p_storage_path),'')='' then raise exception 'File title and storage path are required'; end if;
  if split_part(p_storage_path,'/',1)<>r.company_id::text or split_part(p_storage_path,'/',2)<>r.id::text then raise exception 'Invalid vault path'; end if;

  update public.buyer_deal_documents set status='superseded',visible_to_buyer=false
  where room_id=p_room_id and document_type='final_portfolio' and status<>'superseded';

  insert into public.buyer_deal_documents(company_id,room_id,document_type,title,storage_path,status,visible_to_buyer,uploaded_by)
  values(r.company_id,r.id,'final_portfolio',trim(p_title),trim(p_storage_path),'uploaded',false,auth.uid()) returning id into v_id;
  update public.buyer_deal_rooms set final_file_uploaded_at=now(),updated_at=now() where id=p_room_id;
  perform public.dmh_append_deal_event(p_room_id,'final_file_secured',jsonb_build_object('document_id',v_id));
  return v_id;
end $$;
grant execute on function public.dmh_register_vault_file(uuid,text,text) to authenticated;

-- Owner verification is the only event that starts delayed delivery or unlocks an immediate file.
create or replace function public.dmh_verify_buyer_payment(
  p_room_id uuid,
  p_method text,
  p_reference text default null,
  p_amount numeric default null,
  p_notes text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare r public.buyer_deal_rooms%rowtype; v_count integer;
begin
  if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
  select * into r from public.buyer_deal_rooms where id=p_room_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'Deal room not found'; end if;
  if r.agreement_approved_at is null then raise exception 'Approve the purchase agreement first'; end if;
  if r.delivery_configured_at is null then raise exception 'Configure delivery before verifying payment'; end if;
  if coalesce(trim(p_method),'')='' then raise exception 'Payment method is required'; end if;

  update public.buyer_deal_rooms set
    payment_method=trim(p_method),payment_reference=nullif(trim(coalesce(p_reference,'')),''),
    payment_amount=p_amount,payment_notes=nullif(trim(coalesce(p_notes,'')),''),
    payment_confirmed_at=coalesce(payment_confirmed_at,now()),payment_confirmed_by=auth.uid(),
    delivery_due_at=case when delivery_method='delayed' then coalesce(payment_confirmed_at,now()) + make_interval(hours=>delivery_eta_hours) else null end,
    status=case when delivery_method='immediate' then 'release_ready' else 'delivery_pending' end,updated_at=now()
  where id=p_room_id;

  perform public.dmh_append_deal_event(p_room_id,'payment_verified',jsonb_build_object('method',trim(p_method),'reference',nullif(trim(coalesce(p_reference,'')),''),'amount',p_amount));

  if r.delivery_method='immediate' then
    update public.buyer_deal_documents set visible_to_buyer=true,status='released',approved_at=coalesce(approved_at,now()),approved_by=auth.uid()
    where room_id=p_room_id and document_type='final_portfolio' and status='uploaded';
    get diagnostics v_count=row_count;
    if v_count=0 then raise exception 'Immediate delivery file is missing'; end if;
    update public.buyer_deal_rooms set final_file_released_at=now(),final_file_released_by=auth.uid(),status='files_released',updated_at=now() where id=p_room_id;
    perform public.dmh_append_deal_event(p_room_id,'files_released',jsonb_build_object('delivery_method','immediate','document_count',v_count));
  end if;
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
  update public.buyer_deal_documents set visible_to_buyer=true,status='released',approved_at=coalesce(approved_at,now()),approved_by=auth.uid()
  where room_id=p_room_id and document_type='final_portfolio' and status='uploaded';
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'Upload the unmasked portfolio file before release'; end if;
  update public.buyer_deal_rooms set final_file_released_at=coalesce(final_file_released_at,now()),final_file_released_by=auth.uid(),status='files_released',updated_at=now() where id=p_room_id;
  perform public.dmh_append_deal_event(p_room_id,'files_released',jsonb_build_object('delivery_method',r.delivery_method,'document_count',v_count));
  return v_count;
end $$;
grant execute on function public.dmh_release_buyer_files(uuid) to authenticated;

create or replace function public.dmh_log_deal_download(p_document_id uuid,p_user_agent text default null)
returns text language plpgsql security definer set search_path=public as $$
declare d public.buyer_deal_documents%rowtype; r public.buyer_deal_rooms%rowtype; v_buyer uuid;
begin
  select * into d from public.buyer_deal_documents where id=p_document_id and document_type='final_portfolio' and visible_to_buyer=true and status='released';
  if not found then raise exception 'Document is not available for download'; end if;
  select * into r from public.buyer_deal_rooms where id=d.room_id;
  v_buyer:=public.current_buyer_id();
  if v_buyer is null or r.buyer_id<>v_buyer then raise exception 'Buyer access required'; end if;
  if r.payment_confirmed_at is null or r.final_file_released_at is null then raise exception 'File release is not complete'; end if;
  insert into public.buyer_deal_file_downloads(company_id,room_id,document_id,buyer_id,downloaded_by,user_agent)
  values(r.company_id,r.id,d.id,v_buyer,auth.uid(),nullif(p_user_agent,''));
  perform public.dmh_append_deal_event(r.id,'file_downloaded',jsonb_build_object('document_id',d.id));
  return coalesce(d.storage_path,d.external_url,'');
end $$;
grant execute on function public.dmh_log_deal_download(uuid,text) to authenticated;

create or replace function public.dmh_deal_room_snapshot(p_portfolio_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_buyer uuid:=public.current_buyer_id(); v_role text:=public.current_role()::text; v_room jsonb; v_offer jsonb; v_messages jsonb; v_docs jsonb; v_rounds jsonb; v_events jsonb; v_downloads jsonb;
begin
 if v_role='buyer' then
  select to_jsonb(r) into v_room from public.buyer_deal_rooms r where r.buyer_id=v_buyer and r.portfolio_id=p_portfolio_id order by r.updated_at desc limit 1;
 else
  select to_jsonb(r) into v_room from public.buyer_deal_rooms r where r.company_id=v_company and r.portfolio_id=p_portfolio_id order by r.updated_at desc limit 1;
 end if;
 if v_room is null then return jsonb_build_object('room',null,'offer',null,'messages','[]'::jsonb,'documents','[]'::jsonb,'rounds','[]'::jsonb,'events','[]'::jsonb,'downloads','[]'::jsonb); end if;
 select to_jsonb(o) into v_offer from public.offers o where o.id=(v_room->>'offer_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb) into v_messages from public.buyer_deal_messages m where m.offer_id=(v_room->>'offer_id')::uuid or (m.buyer_id=(v_room->>'buyer_id')::uuid and m.portfolio_id=p_portfolio_id);
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]'::jsonb) into v_docs from public.buyer_deal_documents d where d.room_id=(v_room->>'id')::uuid and (
   v_role='owner' or (v_role='employee' and d.document_type<>'final_portfolio') or (v_role='buyer' and d.visible_to_buyer)
 );
 select coalesce(jsonb_agg(to_jsonb(x) order by x.round_number),'[]'::jsonb) into v_rounds from public.offer_rounds x where x.offer_id=(v_room->>'offer_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_events from public.buyer_deal_events e where e.room_id=(v_room->>'id')::uuid;
 if v_role='owner' then select coalesce(jsonb_agg(to_jsonb(dl) order by dl.downloaded_at desc),'[]'::jsonb) into v_downloads from public.buyer_deal_file_downloads dl where dl.room_id=(v_room->>'id')::uuid;
 elsif v_role='buyer' then select coalesce(jsonb_agg(to_jsonb(dl) order by dl.downloaded_at desc),'[]'::jsonb) into v_downloads from public.buyer_deal_file_downloads dl where dl.room_id=(v_room->>'id')::uuid and dl.buyer_id=v_buyer;
 else v_downloads:='[]'::jsonb; end if;
 return jsonb_build_object('room',v_room,'offer',v_offer,'messages',v_messages,'documents',v_docs,'rounds',v_rounds,'events',v_events,'downloads',v_downloads);
end $$;
grant execute on function public.dmh_deal_room_snapshot(uuid) to authenticated;
