-- DMH Sales OS v1.6.2 — Conversation Control Engine
-- Keeps assignment separate from active control and allows the owner to return control.

create or replace function public.dmh_set_conversation_state(
 p_conversation_id uuid,
 p_status text default null,
 p_assigned_employee_id uuid default null,
 p_owner_joined boolean default null,
 p_take_ownership boolean default null,
 p_release_ownership boolean default null
)
returns void language plpgsql security definer set search_path=public as $$
declare v_role text; v_company uuid; v_old uuid; v_new uuid;
begin
 select role,company_id into v_role,v_company from profiles where id=auth.uid() and is_active=true;
 if v_company is null then raise exception 'Active membership required.'; end if;
 select assigned_employee_id into v_old from conversations where id=p_conversation_id and company_id=v_company;
 if not found then raise exception 'Conversation not found.'; end if;
 if v_role<>'owner' and (p_assigned_employee_id is not null or p_owner_joined is not null or p_take_ownership is not null or p_release_ownership is not null) then
  raise exception 'Owner access required.';
 end if;

 v_new:=coalesce(p_assigned_employee_id,v_old);
 update conversations set
  status=coalesce(p_status,status),
  assigned_employee_id=v_new,
  owner_joined=coalesce(p_owner_joined,owner_joined),
  owner_taken_over=case when p_release_ownership=true then false when p_take_ownership=true then true else owner_taken_over end,
  updated_at=now()
 where id=p_conversation_id;

 if p_assigned_employee_id is distinct from v_old then
  insert into conversation_assignment_history(company_id,conversation_id,from_employee_id,to_employee_id,changed_by,reason)
  values(v_company,p_conversation_id,v_old,p_assigned_employee_id,auth.uid(),'Conversation reassigned');
 end if;
 if p_take_ownership=true then
  insert into conversation_assignment_history(company_id,conversation_id,from_employee_id,to_employee_id,changed_by,reason)
  values(v_company,p_conversation_id,v_old,v_old,auth.uid(),'Owner took control');
 end if;
 if p_release_ownership=true then
  insert into conversation_assignment_history(company_id,conversation_id,from_employee_id,to_employee_id,changed_by,reason)
  values(v_company,p_conversation_id,v_old,v_old,auth.uid(),'Owner returned control');
 end if;
end $$;

grant execute on function public.dmh_set_conversation_state(uuid,text,uuid,boolean,boolean,boolean) to authenticated;
