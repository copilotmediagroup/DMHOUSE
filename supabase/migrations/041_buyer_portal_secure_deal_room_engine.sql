-- DMH Sales OS v2.5.0 — Buyer Portal & Secure Deal Room Engine
alter type public.user_role add value if not exists 'buyer';

create table if not exists public.buyer_profiles (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 agency_id uuid references public.agencies(id) on delete set null,
 company_name text not null,
 contact_name text not null,
 email text not null,
 phone text,
 status text not null default 'pending' check (status in ('pending','approved','denied','suspended')),
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);

create table if not exists public.buyer_portfolio_access (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 can_view_face_value boolean not null default true,
 can_view_asking_price boolean not null default true,
 can_download_sample boolean not null default false,
 expires_at timestamptz,
 granted_by uuid references public.profiles(id),
 granted_at timestamptz not null default now(),
 revoked_at timestamptz,
 unique(buyer_id,portfolio_id)
);

create table if not exists public.buyer_disclosures (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 disclosure_version text not null default 'AS-IS-v1',
 acknowledged boolean not null default false,
 acknowledged_at timestamptz,
 ip_note text,
 created_at timestamptz not null default now(),
 unique(buyer_id,portfolio_id,disclosure_version)
);

create table if not exists public.buyer_deal_messages (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 offer_id uuid references public.offers(id) on delete cascade,
 sender_role text not null check (sender_role in ('buyer','owner','employee','system')),
 sender_id uuid,
 body text not null,
 created_at timestamptz not null default now()
);

create table if not exists public.buyer_activity_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 buyer_id uuid not null references public.buyer_profiles(id) on delete cascade,
 portfolio_id uuid references public.portfolios(id) on delete set null,
 event_type text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create index if not exists buyer_profiles_company_status_idx on public.buyer_profiles(company_id,status);
create index if not exists buyer_access_buyer_idx on public.buyer_portfolio_access(buyer_id,revoked_at,expires_at);
create index if not exists buyer_messages_room_idx on public.buyer_deal_messages(buyer_id,portfolio_id,created_at);
create index if not exists buyer_activity_company_idx on public.buyer_activity_events(company_id,created_at desc);

alter table public.buyer_profiles enable row level security;
alter table public.buyer_portfolio_access enable row level security;
alter table public.buyer_disclosures enable row level security;
alter table public.buyer_deal_messages enable row level security;
alter table public.buyer_activity_events enable row level security;

create or replace function public.current_buyer_id() returns uuid language sql stable security definer set search_path=public as $$
 select id from public.buyer_profiles where user_id=auth.uid() limit 1
$$;

create policy "owner manages buyers" on public.buyer_profiles for all using (company_id=public.current_company_id() and public.current_role()='owner') with check (company_id=public.current_company_id() and public.current_role()='owner');
create policy "buyer reads self" on public.buyer_profiles for select using (user_id=auth.uid());
create policy "owner manages buyer access" on public.buyer_portfolio_access for all using (company_id=public.current_company_id() and public.current_role()='owner') with check (company_id=public.current_company_id() and public.current_role()='owner');
create policy "buyer reads own access" on public.buyer_portfolio_access for select using (buyer_id=public.current_buyer_id() and revoked_at is null and (expires_at is null or expires_at>now()));
create policy "owner manages disclosures" on public.buyer_disclosures for all using (company_id=public.current_company_id() and public.current_role()='owner') with check (company_id=public.current_company_id() and public.current_role()='owner');
create policy "buyer manages own disclosures" on public.buyer_disclosures for all using (buyer_id=public.current_buyer_id()) with check (buyer_id=public.current_buyer_id());
create policy "room participants read messages" on public.buyer_deal_messages for select using ((company_id=public.current_company_id() and public.current_role() in ('owner','employee')) or buyer_id=public.current_buyer_id());
create policy "room participants send messages" on public.buyer_deal_messages for insert with check ((company_id=public.current_company_id() and public.current_role() in ('owner','employee')) or buyer_id=public.current_buyer_id());
create policy "owner reads buyer activity" on public.buyer_activity_events for select using (company_id=public.current_company_id() and public.current_role()='owner');
create policy "buyer creates activity" on public.buyer_activity_events for insert with check (buyer_id=public.current_buyer_id());

create or replace function public.bootstrap_dmh_buyer(p_company_name text,p_contact_name text,p_phone text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user auth.users%rowtype; v_company uuid; v_buyer uuid;
begin
 select * into v_user from auth.users where id=auth.uid();
 if v_user.id is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from public.profiles where id=auth.uid()) then return auth.uid(); end if;
 select id into v_company from public.companies order by created_at asc limit 1;
 if v_company is null then raise exception 'Seller company is not configured'; end if;
 insert into public.profiles(id,company_id,role,full_name,is_active) values(auth.uid(),v_company,'buyer',coalesce(nullif(trim(p_contact_name),''),'Buyer'),true);
 insert into public.buyer_profiles(company_id,user_id,company_name,contact_name,email,phone)
 values(v_company,auth.uid(),coalesce(nullif(trim(p_company_name),''),'Buyer Company'),coalesce(nullif(trim(p_contact_name),''),'Buyer'),coalesce(v_user.email,''),nullif(trim(p_phone),'')) returning id into v_buyer;
 return v_buyer;
end $$;

create or replace function public.dmh_set_buyer_status(p_buyer_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 if p_status not in ('pending','approved','denied','suspended') then raise exception 'Invalid buyer status'; end if;
 update public.buyer_profiles set status=p_status,approved_at=case when p_status='approved' then now() else approved_at end,approved_by=case when p_status='approved' then auth.uid() else approved_by end where id=p_buyer_id and company_id=public.current_company_id();
end $$;

create or replace function public.dmh_grant_buyer_portfolio_access(p_buyer_id uuid,p_portfolio_id uuid,p_can_download_sample boolean default false,p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'owner' then raise exception 'Owner access required'; end if;
 insert into public.buyer_portfolio_access(company_id,buyer_id,portfolio_id,can_download_sample,expires_at,granted_by,revoked_at)
 values(public.current_company_id(),p_buyer_id,p_portfolio_id,p_can_download_sample,p_expires_at,auth.uid(),null)
 on conflict(buyer_id,portfolio_id) do update set can_download_sample=excluded.can_download_sample,expires_at=excluded.expires_at,granted_by=auth.uid(),granted_at=now(),revoked_at=null;
end $$;

create or replace function public.dmh_buyer_marketplace()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('buyer',to_jsonb(bp),'portfolios',coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'name',p.name,'category',p.category,'accountCount',p.account_count,
  'faceValue',case when a.can_view_face_value then p.face_value else null end,
  'askingPrice',case when a.can_view_asking_price then p.asking_price else null end,
  'description',p.description,'sellingPoints',p.selling_points,'status',p.status,
  'canDownloadSample',a.can_download_sample,'expiresAt',a.expires_at,
  'disclosureSigned',coalesce(d.acknowledged,false)
 ) order by p.created_at desc) filter(where p.id is not null),'[]'::jsonb))
 from public.buyer_profiles bp
 left join public.buyer_portfolio_access a on a.buyer_id=bp.id and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
 left join public.portfolios p on p.id=a.portfolio_id and p.status in ('active','negotiating','reserved','payment_pending')
 left join public.buyer_disclosures d on d.buyer_id=bp.id and d.portfolio_id=p.id and d.disclosure_version='AS-IS-v1'
 where bp.user_id=auth.uid()
 group by bp.id
$$;

create or replace function public.dmh_buyer_acknowledge_disclosure(p_portfolio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_buyer uuid:=public.current_buyer_id(); v_company uuid;
begin
 select company_id into v_company from public.buyer_profiles where id=v_buyer and status='approved';
 if v_company is null then raise exception 'Approved buyer access required'; end if;
 insert into public.buyer_disclosures(company_id,buyer_id,portfolio_id,acknowledged,acknowledged_at)
 values(v_company,v_buyer,p_portfolio_id,true,now()) on conflict(buyer_id,portfolio_id,disclosure_version) do update set acknowledged=true,acknowledged_at=now();
 insert into public.buyer_activity_events(company_id,buyer_id,portfolio_id,event_type) values(v_company,v_buyer,p_portfolio_id,'disclosure_acknowledged');
end $$;

create or replace function public.dmh_buyer_submit_offer(p_portfolio_id uuid,p_amount numeric,p_payment_terms text default null,p_conditions text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_buyer public.buyer_profiles%rowtype; v_offer uuid; v_round int;
begin
 select * into v_buyer from public.buyer_profiles where id=public.current_buyer_id() and status='approved';
 if v_buyer.id is null then raise exception 'Approved buyer access required'; end if;
 if not exists(select 1 from public.buyer_portfolio_access where buyer_id=v_buyer.id and portfolio_id=p_portfolio_id and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Portfolio access denied'; end if;
 if not exists(select 1 from public.buyer_disclosures where buyer_id=v_buyer.id and portfolio_id=p_portfolio_id and acknowledged) then raise exception 'Disclosure acknowledgment required'; end if;
 if v_buyer.agency_id is null then
  insert into public.agencies(company_id,name,domain,phone) values(v_buyer.company_id,v_buyer.company_name,split_part(v_buyer.email,'@',2),v_buyer.phone) returning id into v_buyer.agency_id;
  update public.buyer_profiles set agency_id=v_buyer.agency_id where id=v_buyer.id;
 end if;
 insert into public.offers(company_id,portfolio_id,agency_id,employee_id,status,current_amount,payment_terms,conditions,employee_recommendation)
 values(v_buyer.company_id,p_portfolio_id,v_buyer.agency_id,auth.uid(),'submitted',p_amount,p_payment_terms,p_conditions,'Submitted directly through Buyer Portal') returning id into v_offer;
 insert into public.offer_rounds(company_id,offer_id,round_number,actor_role,action,amount,terms,message,created_by)
 values(v_buyer.company_id,v_offer,1,'buyer','offer',p_amount,p_payment_terms,p_conditions,auth.uid());
 insert into public.buyer_activity_events(company_id,buyer_id,portfolio_id,event_type,metadata) values(v_buyer.company_id,v_buyer.id,p_portfolio_id,'offer_submitted',jsonb_build_object('offer_id',v_offer,'amount',p_amount));
 return v_offer;
end $$;
