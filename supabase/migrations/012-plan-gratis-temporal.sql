-- ============================================================
-- DGP LinkShop — Migración 012: Plan gratuito temporal (3 días)
-- Al vencer la prueba, la tienda se pausa (deja de aparecer en
-- storefront) hasta que el dueño elija y pague un plan.
-- El bloqueo del PANEL es visual (panel.js); la PAUSA de la
-- tienda se hace aquí, del lado del servidor.
-- Ejecutar DESPUÉS de 010 (usa subscriptions.trial_ends_at).
-- ============================================================

-- 1) Helper: ¿la tienda está vigente para mostrarse al público?
--    SECURITY DEFINER para poder leer subscriptions sin exponer
--    esas filas al visitante anónimo (RLS no deja verlas).
--    - Plan pago: vigente si status = 'active'.
--    - Plan gratis: vigente mientras la prueba no haya vencido
--      (trial_ends_at nulo = sin límite; futuro = aún vigente).
--    - Sin fila de suscripción: no bloquear (true).
create or replace function public.tienda_activa(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select
       case
         when s.plan <> 'free' then s.status = 'active'
         when s.trial_ends_at is null then true
         else s.trial_ends_at > now()
       end
     from public.subscriptions s
     where s.business_id = p_business_id),
    true);
$$;

revoke all on function public.tienda_activa(uuid) from public;
grant execute on function public.tienda_activa(uuid) to anon, authenticated;

-- 2) La vista pública ahora exige tienda vigente (mismo orden de
--    columnas que la 006, solo cambia el WHERE).
create or replace view public.storefront
with (security_invoker = true) as
select b.id, b.name, b.slug, b.description, b.category,
       b.logo_url, b.cover_url, b.whatsapp, b.theme, b.tasa_bs
  from public.businesses b
 where b.is_published = true
   and public.tienda_activa(b.id);

-- 3) Nuevos negocios: la prueba gratis dura 3 días desde el alta.
create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (business_id, plan, status, monthly_price, trial_ends_at)
  values (new.id, 'free', 'active', 0, now() + interval '3 days');
  return new;
end;
$$;

-- 4) Negocios gratis ya existentes: les damos 3 días de gracia
--    desde ahora (para no bloquearlos de golpe). Ajusta si prefieres.
update public.subscriptions
   set trial_ends_at = now() + interval '3 days'
 where plan = 'free'
   and trial_ends_at is null;
