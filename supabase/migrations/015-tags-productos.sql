-- ============================================================
-- DGP LinkShop — Migración 015: Etiquetas (tags) por producto
-- Permite describir productos por estilo (ej. perfumes: floral,
-- especiado, dulce) para búsqueda y filtrado en la tienda.
-- Ejecutar DESPUÉS de 013.
-- ============================================================

alter table public.products
  add column if not exists tags text[] not null default '{}';

-- Índice GIN para búsquedas rápidas por etiqueta (contains / overlap).
create index if not exists products_tags_idx on public.products using gin (tags);
