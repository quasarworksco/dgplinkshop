-- ============================================================
-- DGP LinkShop — Migración 019: Renovación acumulativa
-- Renovar SUMA un mes a lo ya pagado (base = mayor entre paid_until y hoy).
-- Varios clics = varios meses por delante. confirmar_pago hace lo mismo.
-- Ejecutar DESPUÉS de 018. (Aplicada vía MCP.)
-- ============================================================

create or replace function public.renovar_suscripcion(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_base date; v_proximo date;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  select greatest(coalesce(paid_until, current_date), current_date) into v_base
    from public.subscriptions where business_id = p_business_id;
  if v_base is null then raise exception 'SIN_SUSCRIPCION'; end if;
  v_proximo := (v_base + interval '1 month')::date;
  update public.subscriptions set status = 'active', paid_until = v_proximo
   where business_id = p_business_id;
end; $$;
revoke all on function public.renovar_suscripcion(uuid) from public, anon;
grant execute on function public.renovar_suscripcion(uuid) to authenticated;

create or replace function public.confirmar_pago(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pago public.payments%rowtype; v_base date; v_proximo date;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into v_pago from public.payments where id = p_payment_id;
  if not found then raise exception 'PAGO_NO_ENCONTRADO'; end if;
  select greatest(coalesce(paid_until, current_date), current_date) into v_base
    from public.subscriptions where business_id = v_pago.business_id;
  v_proximo := (coalesce(v_base, current_date) + interval '1 month')::date;
  update public.subscriptions
     set plan = v_pago.plan, status = 'active', paid_until = v_proximo, monthly_price = v_pago.amount
   where business_id = v_pago.business_id;
  update public.payments set status = 'confirmado', reviewed_at = now() where id = p_payment_id;
end; $$;
revoke all on function public.confirmar_pago(uuid) from public, anon;
grant execute on function public.confirmar_pago(uuid) to authenticated;
