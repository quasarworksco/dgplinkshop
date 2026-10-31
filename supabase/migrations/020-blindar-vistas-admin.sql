-- ============================================================
-- DGP LinkShop — Migración 020: Blindar vistas de administración
-- Las vistas admin_tiendas y admin_pagos SOLO devuelven filas cuando
-- el que consulta es súper-admin (public.es_superadmin()). Así, aunque
-- alguien abra /public/admin.html, sin el flag no obtiene NINGÚN dato.
-- Capas de seguridad del panel: (1) UI comprueba es_superadmin();
-- (2) estas vistas filtran por es_superadmin(); (3) las RPC de acción
-- (renovar/pausar/eliminar/confirmar) lanzan NO_AUTORIZADO sin el flag.
-- Ejecutar DESPUÉS de 019. (Aplicada vía MCP.)
-- ============================================================

create or replace view public.admin_tiendas with (security_invoker = true) as
  select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
         p.email as owner_email, p.full_name as owner_name,
         coalesce(s.plan::text, 'free') as plan,
         coalesce(s.status::text, 'active') as sub_status,
         (select count(*) from products pr where pr.business_id = b.id) as num_productos,
         s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente
    from businesses b
    join profiles p on p.id = b.owner_id
    left join subscriptions s on s.business_id = b.id
   where public.es_superadmin();

create or replace view public.admin_pagos with (security_invoker = true) as
  select pm.id, pm.business_id, pm.plan, pm.method, pm.reference, pm.amount,
         pm.receipt_url, pm.status, pm.created_at,
         b.name as negocio, b.slug, p.email as owner_email
    from payments pm
    join businesses b on b.id = pm.business_id
    join profiles p on p.id = b.owner_id
   where public.es_superadmin();
