-- ============================================================
-- DGP LinkShop — Migración 002: Seguridad (Row Level Security)
-- Ejecutar DESPUÉS de 001-esquema-inicial.sql
-- ============================================================
-- Principio: el cliente (navegador) usa la clave ANON.
--   · Un usuario autenticado solo ve y gestiona SUS datos.
--   · Un visitante anónimo solo ve tiendas publicadas y sus
--     productos activos (lectura, nunca escritura).
--   · subscriptions: solo lectura para el dueño; los cambios de
--     plan/pagos los hace el backend con service_role.
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.businesses    enable row level security;
alter table public.subscriptions enable row level security;
alter table public.products      enable row level security;

-- ------------------------------------------------------------
-- PROFILES: cada quien su propio perfil
-- ------------------------------------------------------------
create policy "profiles: leer el propio"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: actualizar el propio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- (el insert lo hace el trigger handle_new_user con security definer)

-- ------------------------------------------------------------
-- BUSINESSES: el dueño gestiona; el público ve lo publicado
-- ------------------------------------------------------------
create policy "businesses: publicas visibles para todos"
  on public.businesses for select
  to anon, authenticated
  using (is_published = true);

create policy "businesses: el dueño ve la suya siempre"
  on public.businesses for select
  to authenticated
  using (owner_id = auth.uid());

create policy "businesses: crear solo como dueño"
  on public.businesses for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "businesses: actualizar solo la propia"
  on public.businesses for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "businesses: eliminar solo la propia"
  on public.businesses for delete
  to authenticated
  using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Helper: ¿el usuario actual es dueño de este negocio?
-- ------------------------------------------------------------
create or replace function public.is_business_owner(b_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses
     where id = b_id and owner_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- PRODUCTS: el dueño gestiona su catálogo; el público ve
-- productos activos de tiendas publicadas
-- ------------------------------------------------------------
create policy "products: activos de tiendas publicadas"
  on public.products for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.businesses b
       where b.id = business_id and b.is_published = true
    )
  );

create policy "products: el dueño ve todo su catálogo"
  on public.products for select
  to authenticated
  using (public.is_business_owner(business_id));

create policy "products: crear en el propio negocio"
  on public.products for insert
  to authenticated
  with check (public.is_business_owner(business_id));

create policy "products: actualizar los propios"
  on public.products for update
  to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "products: eliminar los propios"
  on public.products for delete
  to authenticated
  using (public.is_business_owner(business_id));

-- ------------------------------------------------------------
-- SUBSCRIPTIONS: solo lectura para el dueño.
-- Sin políticas de insert/update/delete → el cliente NUNCA puede
-- cambiarse de plan a sí mismo; eso lo hace el backend
-- (service_role ignora RLS) tras confirmar el pago.
-- ------------------------------------------------------------
create policy "subscriptions: leer la del propio negocio"
  on public.subscriptions for select
  to authenticated
  using (public.is_business_owner(business_id));
