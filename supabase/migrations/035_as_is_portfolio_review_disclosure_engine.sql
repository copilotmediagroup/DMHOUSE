-- DMH Sales OS v2.2.1
-- AS-IS Portfolio Review & Disclosure Engine

create table if not exists public.portfolio_as_is_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null unique references public.portfolios(id) on delete cascade,
  review_status text not null default 'not_reviewed' check (review_status in (
    'not_reviewed','review_complete','disclosure_required','material_discrepancy','hold_from_marketing','owner_approved_with_disclosure'
  )),
  sale_condition text not null default 'as_is',
  chain_of_title_provided boolean not null default false,
  account_media_provided boolean not null default false,
  prior_sale_history_provided boolean not null default false,
  original_agreements_provided boolean not null default false,
  payment_history_provided boolean not null default false,
  account_numbers_present boolean,
  creditor_names_consistent boolean,
  dates_consistent boolean,
  advertised_account_count bigint,
  verified_account_count bigint,
  advertised_face_value numeric(14,2),
  verified_face_value numeric(14,2),
  oldest_account_date date,
  newest_account_date date,
  duplicate_count integer not null default 0,
  blank_critical_field_percent numeric(5,2),
  available_fields text[] not null default '{}',
  missing_fields text[] not null default '{}',
  detected_issues jsonb not null default '[]'::jsonb,
  seller_description text,
  reviewer_notes text,
  disclosure_text text,
  owner_override_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  owner_approved_by uuid references public.profiles(id),
  owner_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_buyer_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  contact_email text not null,
  contact_name text,
  disclosure_version text not null default 'v1',
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  unique(portfolio_id, contact_email, disclosure_version)
);

create index if not exists idx_as_is_reviews_company on public.portfolio_as_is_reviews(company_id, review_status);
create index if not exists idx_buyer_ack_portfolio on public.portfolio_buyer_acknowledgments(portfolio_id, acknowledged);

alter table public.portfolio_as_is_reviews enable row level security;
alter table public.portfolio_buyer_acknowledgments enable row level security;

drop policy if exists as_is_reviews_company_access on public.portfolio_as_is_reviews;
create policy as_is_reviews_company_access on public.portfolio_as_is_reviews
for all using (company_id = public.dmh_current_company_id())
with check (company_id = public.dmh_current_company_id());

drop policy if exists buyer_ack_company_access on public.portfolio_buyer_acknowledgments;
create policy buyer_ack_company_access on public.portfolio_buyer_acknowledgments
for all using (company_id = public.dmh_current_company_id())
with check (company_id = public.dmh_current_company_id());

create or replace function public.dmh_touch_as_is_review()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.review_status in ('review_complete','disclosure_required','material_discrepancy','owner_approved_with_disclosure')
     and new.reviewed_at is null then
    new.reviewed_at = now();
    new.reviewed_by = auth.uid();
  end if;
  if new.review_status = 'owner_approved_with_disclosure' then
    if coalesce(trim(new.owner_override_reason),'') = '' then
      raise exception 'Owner approval requires a written disclosure or override reason.';
    end if;
    new.owner_approved_at = now();
    new.owner_approved_by = auth.uid();
  end if;
  return new;
end;$$;

drop trigger if exists trg_touch_as_is_review on public.portfolio_as_is_reviews;
create trigger trg_touch_as_is_review before insert or update on public.portfolio_as_is_reviews
for each row execute function public.dmh_touch_as_is_review();

create or replace function public.dmh_portfolio_marketable(p_portfolio_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.portfolio_as_is_reviews r
    where r.portfolio_id = p_portfolio_id
      and r.company_id = public.dmh_current_company_id()
      and r.review_status in ('review_complete','owner_approved_with_disclosure')
  );
$$;

grant execute on function public.dmh_portfolio_marketable(uuid) to authenticated;

create or replace function public.dmh_block_unreviewed_marketing()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    if not public.dmh_portfolio_marketable(new.id) then
      raise exception 'Complete the AS-IS review or approve the portfolio with disclosure before activation.';
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists trg_block_unreviewed_marketing on public.portfolios;
create trigger trg_block_unreviewed_marketing before update of status on public.portfolios
for each row execute function public.dmh_block_unreviewed_marketing();

create or replace function public.dmh_generate_as_is_disclosure(p_portfolio_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare r public.portfolio_as_is_reviews%rowtype; p public.portfolios%rowtype; result text;
begin
  select * into r from public.portfolio_as_is_reviews where portfolio_id=p_portfolio_id and company_id=public.dmh_current_company_id();
  select * into p from public.portfolios where id=p_portfolio_id and company_id=public.dmh_current_company_id();
  if r.id is null then raise exception 'Review not found.'; end if;
  result := 'Portfolio: '||p.name||E'\nSale Condition: AS IS\n\n';
  result := result||'No warranties or guarantees are made regarding collectability, balances, dates, documentation, recovery, prior sale history, or legal enforceability.'||E'\n\n';
  result := result||'Available fields: '||coalesce(array_to_string(r.available_fields, ', '),'Not specified')||E'\n';
  result := result||'Not provided: '||coalesce(array_to_string(r.missing_fields, ', '),'Not specified')||E'\n';
  result := result||'Detected issues: '||coalesce((select string_agg(value->>'message','; ') from jsonb_array_elements(r.detected_issues)), 'None recorded')||E'\n\n';
  result := result||'Buyer must conduct independent due diligence and acknowledge these disclosures before purchase.';
  update public.portfolio_as_is_reviews set disclosure_text=result where id=r.id;
  return result;
end;$$;

grant execute on function public.dmh_generate_as_is_disclosure(uuid) to authenticated;
