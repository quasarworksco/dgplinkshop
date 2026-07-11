-- ============================================================
-- DGP LinkShop — Migración 004: Endurecimiento de seguridad
-- Ejecutar DESPUÉS de 003-pedidos-cupones.sql
-- ============================================================
-- Cierra los avisos del linter de Supabase:
--  · Fija search_path en las funciones que no lo tenían.
--  · Revoca EXECUTE de las funciones de trigger (los triggers
--    las ejecutan internamente; no deben ser llamables por RPC).
--  · is_business_owner solo lo usan las políticas RLS de usuarios
--    autenticados; el rol anónimo nunca lo necesita.
--
-- Nota: crear_pedido y validar_cupon SÍ quedan ejecutables por
-- anon/authenticated a propósito — la tienda pública (anónima)
-- las necesita. Ese aviso del linter es esperado y correcto.
-- ============================================================

alter function public.plan_product_limit(public.plan_type) set search_path = '';
alter function public.touch_updated_at() set search_path = '';

revoke all on function public.enforce_product_limit() from public, anon, authenticated;
revoke all on function public.handle_new_user()       from public, anon, authenticated;
revoke all on function public.handle_new_business()    from public, anon, authenticated;
revoke all on function public.touch_updated_at()       from public, anon, authenticated;

revoke all on function public.is_business_owner(uuid) from public, anon;
