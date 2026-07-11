-- ============================================================
-- DGP LinkShop — Migración 007: Plan PRO permite 100 productos
-- Ejecutar DESPUÉS de 006-tasa-categorias-ventas.sql
-- ============================================================
-- El plan PRO pasa de 50 a 100 productos. (El precio del plan
-- vive en el frontend, src/config.js; la BD solo controla el
-- límite de productos.)
-- ============================================================
create or replace function public.plan_product_limit(p public.plan_type)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'free' then 5
    when 'pro'  then 100
  end;
$$;
