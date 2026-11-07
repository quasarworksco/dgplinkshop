-- ============================================================
-- DGP LinkShop — Migración 025: Vistas admin para distribuidores
-- admin_tiendas: +distribuidor_id (para ver/asignar desde el panel).
-- admin_distribuidores: lista de distribuidores con nº de clientes,
-- total generado y comisión total. Ambas solo para súper-admin.
-- (Aplicada vía MCP.)
-- ============================================================
create or replace view public.admin_tiendas with (security_invoker = true) as
  select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
         p.email as owner_email, p.full_name as owner_name,
         coalesce(s.plan::text, 'free') as plan,
         coalesce(s.status::text, 'active') as sub_status,
         (select count(*) from products pr where pr.business_id = b.id) as num_productos,
         s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente,
         b.logo_url, b.distribuidor_id
    from businesses b
    join profiles p on p.id = b.owner_id
    left join subscriptions s on s.business_id = b.id
   where public.es_superadmin();

create or replace view public.admin_distribuidores with (security_invoker = true) as
  select d.id, d.email, d.full_name, d.comision_distribuidor as porcentaje,
         (select count(*) from businesses b where b.distribuidor_id = d.id) as num_clientes,
         coalesce((select sum(pm.amount) from payments pm
                   join businesses b2 on b2.id = pm.business_id
                   where b2.distribuidor_id = d.id and pm.status = 'confirmado'), 0) as total_generado,
         coalesce((select sum(pm.amount) from payments pm
                   join businesses b2 on b2.id = pm.business_id
                   where b2.distribuidor_id = d.id and pm.status = 'confirmado'), 0)
           * coalesce(d.comision_distribuidor,0)/100.0 as comision_total
    from profiles d
   where public.es_superadmin() and d.comision_distribuidor is not null and d.comision_distribuidor > 0;
