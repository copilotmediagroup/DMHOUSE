begin;

create table if not exists public.company_payment_settings(
  company_id uuid primary key,
  beneficiary_name text not null default '',
  bank_name text not null default '',
  bank_address text not null default '',
  routing_number text not null default '',
  account_number text not null default '',
  swift_bic text not null default '',
  wire_reference text not null default '',
  payment_terms text not null default 'Payment in full by wire transfer before final portfolio release.',
  payment_deadline text not null default 'Payment due within 2 business days of execution.',
  additional_instructions text not null default '',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_payment_settings enable row level security;

create or replace function public.dmh_get_company_payment_settings()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.company_payment_settings%rowtype;
begin
  select *
  into v_profile
  from public.profiles
  where id=auth.uid();

  if v_profile.id is null
     or v_profile.role not in ('owner','employee') then
    raise exception 'Staff access required';
  end if;

  select *
  into v_settings
  from public.company_payment_settings
  where company_id=v_profile.company_id;

  if v_settings.company_id is null then
    return jsonb_build_object(
      'beneficiary_name','',
      'bank_name','',
      'bank_address','',
      'routing_number','',
      'account_number','',
      'swift_bic','',
      'wire_reference','',
      'payment_terms','Payment in full by wire transfer before final portfolio release.',
      'payment_deadline','Payment due within 2 business days of execution.',
      'additional_instructions',''
    );
  end if;

  return to_jsonb(v_settings);
end;
$$;

create or replace function public.dmh_save_company_payment_settings(
  p_beneficiary_name text,
  p_bank_name text,
  p_bank_address text default '',
  p_routing_number text default '',
  p_account_number text default '',
  p_swift_bic text default '',
  p_wire_reference text default '',
  p_payment_terms text default 'Payment in full by wire transfer before final portfolio release.',
  p_payment_deadline text default 'Payment due within 2 business days of execution.',
  p_additional_instructions text default ''
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select *
  into v_profile
  from public.profiles
  where id=auth.uid();

  if v_profile.id is null or v_profile.role<>'owner' then
    raise exception 'Owner access required';
  end if;

  if nullif(trim(p_beneficiary_name),'') is null then
    raise exception 'Beneficiary name is required';
  end if;

  if nullif(trim(p_bank_name),'') is null then
    raise exception 'Bank name is required';
  end if;

  if nullif(trim(p_routing_number),'') is null then
    raise exception 'Routing number is required';
  end if;

  if nullif(trim(p_account_number),'') is null then
    raise exception 'Account number is required';
  end if;

  insert into public.company_payment_settings(
    company_id,
    beneficiary_name,
    bank_name,
    bank_address,
    routing_number,
    account_number,
    swift_bic,
    wire_reference,
    payment_terms,
    payment_deadline,
    additional_instructions,
    updated_by,
    updated_at
  )
  values(
    v_profile.company_id,
    trim(p_beneficiary_name),
    trim(p_bank_name),
    trim(p_bank_address),
    trim(p_routing_number),
    trim(p_account_number),
    trim(p_swift_bic),
    trim(p_wire_reference),
    trim(p_payment_terms),
    trim(p_payment_deadline),
    trim(p_additional_instructions),
    auth.uid(),
    now()
  )
  on conflict(company_id)
  do update set
    beneficiary_name=excluded.beneficiary_name,
    bank_name=excluded.bank_name,
    bank_address=excluded.bank_address,
    routing_number=excluded.routing_number,
    account_number=excluded.account_number,
    swift_bic=excluded.swift_bic,
    wire_reference=excluded.wire_reference,
    payment_terms=excluded.payment_terms,
    payment_deadline=excluded.payment_deadline,
    additional_instructions=excluded.additional_instructions,
    updated_by=auth.uid(),
    updated_at=now();
end;
$$;

grant execute on function public.dmh_get_company_payment_settings() to authenticated;

grant execute on function public.dmh_save_company_payment_settings(
  text,text,text,text,text,text,text,text,text,text
) to authenticated;

commit;
