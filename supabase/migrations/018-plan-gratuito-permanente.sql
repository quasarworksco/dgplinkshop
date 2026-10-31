-- ============================================================
-- DGP LinkShop — Migración 018: Plan Gratuito permanente
-- El plan Gratuito ya no vence a los 3 días: queda siempre activo.
-- El límite de 5 productos lo sigue haciendo cumplir el trigger
-- enforce_product_limit. Solo los planes de pago vencen (con 3 días
-- de gracia) y la pausa manual del admin aplica a cualquiera.
-- Ejecutar DESPUÉS de 017. (Aplicada vía MCP.)
-- ============================================================

create or replace function public.tienda_activa(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select
       (not coalesce(b.is_paused, false))
       and case
             when s.plan <> 'free' then
               s.status = 'active' and (s.paid_until is null or s.paid_until + 3 >= current_date)
             else true
           end
     from public.businesses b
     left join public.subscriptions s on s.business_id = b.id
     where b.id = p_business_id),
    true);
$$;
revoke all on function public.tienda_activa(uuid) from public;
grant execute on function public.tienda_activa(uuid) to anon, authenticated;
