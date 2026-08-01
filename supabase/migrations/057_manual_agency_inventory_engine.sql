alter table public.agencies
  add column if not exists zip text,
  add column if not exists source_label text,
  add column if not exists internal_notes text,
  add column if not exists is_test boolean not null default false,
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references public.profiles(id) on delete set null;

create or replace function public.dmh_release_agency_from_inventory(p_agency_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id();
begin
  update public.agencies
     set assigned_to=null, ownership_expires_at=now(), released_at=now(), released_by=auth.uid(), updated_at=now()
   where id=p_agency_id and company_id=v_company
     and (public.current_role()='owner' or assigned_to=auth.uid());
  if not found then raise exception 'Agency is not assigned to you.'; end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_company,auth.uid(),'agency_inventory_released','agency',p_agency_id,jsonb_build_object('scope','single'));
end $$;

grant execute on function public.dmh_release_agency_from_inventory(uuid) to authenticated;

create or replace function public.dmh_clear_my_agency_inventory()
returns integer language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_count integer;
begin
  with released as (
    update public.agencies
       set assigned_to=null, ownership_expires_at=now(), released_at=now(), released_by=auth.uid(), updated_at=now()
     where company_id=v_company and assigned_to=auth.uid()
     returning id
  ) select count(*) into v_count from released;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,metadata)
  values(v_company,auth.uid(),'agency_inventory_cleared','agency',jsonb_build_object('released_count',v_count));
  return v_count;
end $$;

grant execute on function public.dmh_clear_my_agency_inventory() to authenticated;
