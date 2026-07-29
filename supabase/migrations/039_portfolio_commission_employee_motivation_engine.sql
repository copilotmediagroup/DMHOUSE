-- DMH Sales OS v2.4.1
-- Portfolio Commission & Employee Motivation Engine

alter table public.portfolios
  add column if not exists employee_commission_type text not null default 'percentage'
    check (employee_commission_type in ('percentage','flat')),
  add column if not exists employee_commission_value numeric(12,2) not null default 0
    check (employee_commission_value >= 0),
  add column if not exists employee_commission_visible boolean not null default true;

comment on column public.portfolios.employee_commission_type is 'percentage of sale price or flat payout';
comment on column public.portfolios.employee_commission_value is 'percentage rate or flat dollar amount';
comment on column public.portfolios.employee_commission_visible is 'controls whether employees can see potential payout';

create or replace function public.dmh_portfolio_employee_payout(p_portfolio_id uuid, p_sale_price numeric default null)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  select round(
    case
      when employee_commission_type='percentage' then coalesce(p_sale_price,asking_price,0) * employee_commission_value / 100
      else employee_commission_value
    end
  ,2)
  from public.portfolios
  where id=p_portfolio_id;
$$;

grant execute on function public.dmh_portfolio_employee_payout(uuid,numeric) to authenticated;
