-- ============================================================
-- DGP LinkShop — Migración 005: Súper-admin de la plataforma
-- Ejecutar DESPUÉS de 004-endurecimiento-seguridad.sql
-- ============================================================
-- Una cuenta designada (el dueño de DGP LinkShop) puede VER todas
-- las tiendas y clientes (solo lectura). No puede modificar sus
-- datos. Para activar un súper-admin:
--   update public.profiles set is_superadmin = true where email = 'tucorreo';
-- ============================================================

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

-- ¿El usuario actual es súper-admin? (definer: lee profiles sin RLS)
create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.es_superadmin() from public, anon;
grant execute on function public.es_superadmin() to authenticated;

-- Políticas de solo-lectura para el súper-admin (se suman a las del dueño)
create policy "businesses: superadmin lee todas"
  on public.businesses for select to authenticated using (public.es_superadmin());
create policy "profiles: superadmin lee todos"
  on public.profiles for select to authenticated using (public.es_superadmin());
create policy "subscriptions: superadmin lee todas"
  on public.subscriptions for select to authenticated using (public.es_superadmin());
create policy "products: superadmin lee todos"
  on public.products for select to authenticated using (public.es_superadmin());
create policy "orders: superadmin lee todos"
  on public.orders for select to authenticated using (public.es_superadmin());

-- Vista consolidada para el panel súper-admin (respeta RLS del que consulta)
create or replace view public.admin_tiendas
with (security_invoker = true) as
select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
       p.email as owner_email, p.full_name as owner_name,
       coalesce(s.plan::text, 'free') as plan,
       coalesce(s.status::text, 'active') as sub_status,
       (select count(*) from public.products pr where pr.business_id = b.id) as num_productos
from public.businesses b
join public.profiles p on p.id = b.owner_id
left join public.subscriptions s on s.business_id = b.id;
