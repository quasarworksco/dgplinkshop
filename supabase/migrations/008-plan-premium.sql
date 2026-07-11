-- ============================================================
-- DGP LinkShop — Migración 008: Plan Premium (valor del enum)
-- Ejecutar DESPUÉS de 007-limite-pro-100.sql
-- ============================================================
-- Se añade el valor 'premium' al enum. DEBE ir en su propia
-- migración (no se puede usar un valor de enum recién creado en
-- la misma transacción que lo crea).
-- ============================================================
alter type public.plan_type add value if not exists 'premium';
