-- DMHOUSE Sales OS
-- Buyer Invite Identity Bootstrap Repair
--
-- Fixes invited buyers being treated as brand-new buyer records
-- after Supabase magic-link authentication.
--
-- Existing invited buyer:
-- auth user -> buyer_profiles.user_id -> missing profiles row
--
-- True self signup:
-- auth user -> create profiles row -> create buyer_profiles row

begin;

create or replace function public.bootstrap_dmh_buyer(
  p_company_name text,
  p_contact_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user auth.users%rowtype;
  v_company uuid;
  v_buyer public.buyer_profiles%rowtype;
  v_existing_profile public.profiles%rowtype;
begin

  select *
  into v_user
  from auth.users
  where id=auth.uid();

  if v_user.id is null then
    raise exception 'Authentication required';
  end if;


  /*
    If the application profile already exists,
    return the associated buyer identity when possible.

    This also makes the function idempotent.
  */

  select *
  into v_existing_profile
  from public.profiles
  where id=auth.uid();

  if v_existing_profile.id is not null then

    select *
    into v_buyer
    from public.buyer_profiles
    where user_id=auth.uid()
    limit 1;

    if v_buyer.id is not null then
      return v_buyer.id;
    end if;

    /*
      Preserve legacy behavior for an already-created
      profile that does not yet have buyer_profiles.
    */

    if v_existing_profile.role <> 'buyer' then
      raise exception 'Authenticated profile is not a buyer';
    end if;

    v_company:=v_existing_profile.company_id;

  else

    /*
      IMPORTANT:
      Invitation service already links user_id onto the
      existing buyer_profiles row before the buyer opens
      the secure portal.

      Find that row FIRST.
    */

    select *
    into v_buyer
    from public.buyer_profiles
    where user_id=auth.uid()
    limit 1;


    if v_buyer.id is not null then

      /*
        INVITED BUYER PATH

        Do NOT create another buyer_profiles row.

        Create only the application profile required
        by PortfolioStore / role routing.
      */

      insert into public.profiles(
        id,
        company_id,
        role,
        full_name,
        is_active
      )
      values(
        auth.uid(),
        v_buyer.company_id,
        'buyer',
        coalesce(
          nullif(trim(v_buyer.contact_name),''),
          nullif(trim(p_contact_name),''),
          split_part(coalesce(v_user.email,''),'@',1),
          'Buyer'
        ),
        true
      )
      on conflict(id) do update
      set
        company_id=excluded.company_id,
        role='buyer',
        full_name=excluded.full_name,
        is_active=true;

      return v_buyer.id;

    end if;


    /*
      TRUE SELF-SIGNUP PATH

      No invitation-created buyer exists.
    */

    select id
    into v_company
    from public.companies
    order by created_at asc
    limit 1;

    if v_company is null then
      raise exception 'Seller company is not configured';
    end if;


    insert into public.profiles(
      id,
      company_id,
      role,
      full_name,
      is_active
    )
    values(
      auth.uid(),
      v_company,
      'buyer',
      coalesce(
        nullif(trim(p_contact_name),''),
        split_part(coalesce(v_user.email,''),'@',1),
        'Buyer'
      ),
      true
    )
    on conflict(id) do nothing;

  end if;


  /*
    If we reached this point, there is no existing
    buyer record attached to this auth user.
  */

  insert into public.buyer_profiles(
    company_id,
    user_id,
    company_name,
    contact_name,
    email,
    phone
  )
  values(
    v_company,
    auth.uid(),
    coalesce(
      nullif(trim(p_company_name),''),
      'Buyer Company'
    ),
    coalesce(
      nullif(trim(p_contact_name),''),
      split_part(coalesce(v_user.email,''),'@',1),
      'Buyer'
    ),
    lower(coalesce(v_user.email,'')),
    nullif(trim(p_phone),'')
  )
  returning *
  into v_buyer;

  return v_buyer.id;

end;
$$;

grant execute
on function public.bootstrap_dmh_buyer(text,text,text)
to authenticated;

commit;
