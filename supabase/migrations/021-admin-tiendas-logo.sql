-- ============================================================
-- DGP LinkShop — Migración 021: Logo de la tienda en el panel admin
-- Expone businesses.logo_url en la vista admin_tiendas para que el
-- panel súper-admin muestre el logo que cada tienda subió en lugar de
-- las iniciales (las iniciales quedan como respaldo si no hay logo).
-- La columna nueva va al final (CREATE OR REPLACE no permite insertarla
-- en medio). Mantiene el blindaje por es_superadmin(). Ejecutar DESPUÉS
-- de 020. (Aplicada vía MCP.)
-- ============================================================
create or replace view public.admin_tiendas with (security_invoker = true) as
  select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
         p.email as owner_email, p.full_name as owner_name,
         coalesce(s.plan::text, 'free') as plan,
         coalesce(s.status::text, 'active') as sub_status,
         (select count(*) from products pr where pr.business_id = b.id) as num_productos,
         s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente,
         b.logo_url
    from businesses b
    join profiles p on p.id = b.owner_id
    left join subscriptions s on s.business_id = b.id
   where public.es_superadmin();
