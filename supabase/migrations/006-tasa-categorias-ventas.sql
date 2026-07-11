-- ============================================================
-- DGP LinkShop — Migración 006: Tasa Bs, categorías y ventas
-- Ejecutar DESPUÉS de 005-super-admin.sql
-- ============================================================
-- · businesses.tasa_bs: tasa del dólar en Bs (manual). null = no
--   mostrar precios en Bs.
-- · categories: categorías por negocio (el dueño las gestiona);
--   products.category_id las referencia.
-- · products.sold_count: contador de "más vendidos", que crear_pedido
--   incrementa de forma atómica con cada pedido.
-- ============================================================

alter table public.businesses
  add column if not exists tasa_bs numeric(14,2);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);
create index if not exists categories_business_idx on public.categories(business_id);

alter table public.categories enable row level security;

create policy "categories: el dueño gestiona"
  on public.categories for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "categories: publicas de tiendas publicadas"
  on public.categories for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.is_published));

alter table public.products
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists sold_count integer not null default 0;
create index if not exists products_category_idx on public.products(category_id);

create or replace view public.storefront
with (security_invoker = true) as
select b.id, b.name, b.slug, b.description, b.category,
       b.logo_url, b.cover_url, b.whatsapp, b.theme, b.tasa_bs
  from public.businesses b
 where b.is_published = true;

-- crear_pedido incrementa sold_count (ver cuerpo completo aplicado en la BD).
-- Esta migración se aplicó vía MCP; el cuerpo de crear_pedido añade:
--   update public.products set sold_count = sold_count + v_cantidad where id = v_prod.id;
-- dentro del bucle de líneas del pedido.
