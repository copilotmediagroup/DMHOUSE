-- DMH Sales OS v2.7.2 — NDA Invitation Transaction Entry Engine
-- Sending the NDA creates/opens the buyer's transaction and portal access.

alter table public.buyer_profiles
  alter column user_id drop not null;

create unique index if not exists buyer_profiles_company_email_uidx
  on public.buyer_profiles (company_id, lower(email));

create or replace function public.dmh_upsert_transaction_buyer(
  p_email text,
  p_company_name text,
  p_contact_name text,
  p_title text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_buyer_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null
     or v_profile.role not in ('owner','employee') then
    raise exception 'Staff access required';
  end if;

  if v_email = ''
     or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid buyer email is required';
  end if;

  select id into v_buyer_id
  from public.buyer_profiles
  where company_id = v_profile.company_id
    and lower(email) = v_email
  limit 1;

  if v_buyer_id is null then
    insert into public.buyer_profiles (
      company_id,
      user_id,
      company_name,
      contact_name,
      email,
      phone,
      status
    ) values (
      v_profile.company_id,
      null,
      coalesce(nullif(trim(p_company_name), ''), 'Buyer Company'),
      coalesce(nullif(trim(p_contact_name), ''), 'Buyer'),
      v_email,
      nullif(trim(p_phone), ''),
      'approved'
    )
    returning id into v_buyer_id;
  else
    update public.buyer_profiles
    set company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
        contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name),
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        status = case when status in ('denied','suspended') then status else 'approved' end,
        approved_at = coalesce(approved_at, now()),
        approved_by = coalesce(approved_by, auth.uid())
    where id = v_buyer_id;
  end if;

  insert into public.buyer_activity_events (
    company_id,
    buyer_id,
    event_type,
    metadata
  ) values (
    v_profile.company_id,
    v_buyer_id,
    'transaction_buyer_prepared',
    jsonb_build_object(
      'email', v_email,
      'companyName', p_company_name,
      'contactName', p_contact_name,
      'title', p_title,
      'preparedBy', auth.uid()
    )
  );

  return v_buyer_id;
end;
$$;

grant execute on function public.dmh_upsert_transaction_buyer(text,text,text,text,text)
to authenticated;

create or replace function public.dmh_link_buyer_auth_user(
  p_buyer_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.buyer_profiles
  set user_id = p_user_id,
      status = 'approved',
      approved_at = coalesce(approved_at, now())
  where id = p_buyer_id;

  if not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    insert into public.profiles (
      id,
      company_id,
      role,
      full_name,
      is_active
    )
    select
      p_user_id,
      bp.company_id,
      'buyer',
      bp.contact_name,
      true
    from public.buyer_profiles bp
    where bp.id = p_buyer_id;
  end if;
end;
$$;

grant execute on function public.dmh_link_buyer_auth_user(uuid,uuid)
to service_role;
