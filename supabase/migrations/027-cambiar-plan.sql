-- ============================================================
-- DGP LinkShop — Migración 027: cambiar_plan (súper-admin)
-- Cambia el plan de una tienda (free/pro/premium). Al pasar a un plan
-- de pago sin pago vigente, queda 'past_due' (NO activo), para que los
-- que no han pagado no cuenten como plan activo. (Aplicada vía MCP.)
-- ============================================================
create or replace function public.cambiar_plan(p_business_id uuid, p_plan text)
returns void language plpgsql security definer set search_path=public as $$
declare v_pu date; v_valido boolean;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_plan not in ('free','pro','premium') then raise exception 'PLAN_INVALIDO'; end if;

  insert into subscriptions (business_id, plan, status)
    values (p_business_id, p_plan::plan_type, 'active')
    on conflict (business_id) do nothing;

  if p_plan = 'free' then
    update subscriptions set plan='free', status='active', paid_until=null
     where business_id = p_business_id;
  else
    select paid_until into v_pu from subscriptions where business_id=p_business_id;
    v_valido := v_pu is not null and v_pu + 3 >= current_date;
    update subscriptions
       set plan = p_plan::plan_type,
           status = case when v_valido then 'active'::subscription_status
                         else 'past_due'::subscription_status end
     where business_id = p_business_id;
  end if;
end; $$;
revoke all on function public.cambiar_plan(uuid,text) from public, anon;
grant execute on function public.cambiar_plan(uuid,text) to authenticated;
