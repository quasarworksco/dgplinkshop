-- ============================================================
-- DGP LinkShop — Migración 026: vistas de distribuidor con SECURITY DEFINER
-- Las vistas del distribuidor deben saltarse el RLS de las tablas base (él no
-- es dueño de las tiendas asignadas). Se protegen con el filtro
-- distribuidor_id = auth.uid(): cada distribuidor ve SOLO sus clientes.
-- (Aplicada vía MCP.)
-- ============================================================
drop view if exists public.distribuidor_tiendas;
create view public.distribuidor_tiendas with (security_invoker=false) as
  select b.id, b.name, b.slug, b.logo_url, b.is_published, b.created_at,
         p.email as owner_email, p.full_name as owner_name,
         coalesce(s.plan::text,'free') as plan,
         s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente,
         (select count(*) from products pr where pr.business_id=b.id) as num_productos
    from businesses b
    join profiles p on p.id=b.owner_id
    left join subscriptions s on s.business_id=b.id
   where b.distribuidor_id = auth.uid();
grant select on public.distribuidor_tiendas to authenticated;

drop view if exists public.distribuidor_pagos;
create view public.distribuidor_pagos with (security_invoker=false) as
  select pm.id, pm.business_id, pm.plan, pm.method, pm.amount, pm.status,
         pm.created_at, pm.reviewed_at,
         b.name as negocio, p.email as owner_email,
         round(pm.amount * coalesce(d.comision_distribuidor,0)/100.0, 2) as comision,
         d.comision_distribuidor as porcentaje
    from payments pm
    join businesses b on b.id=pm.business_id
    join profiles p on p.id=b.owner_id
    join profiles d on d.id = b.distribuidor_id
   where b.distribuidor_id = auth.uid();
grant select on public.distribuidor_pagos to authenticated;
