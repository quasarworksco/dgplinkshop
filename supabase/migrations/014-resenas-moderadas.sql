-- ============================================================
-- DGP LinkShop — Migración 014: Reseñas moderadas
-- Las reseñas nuevas entran SIN aprobar; el súper-admin las
-- aprueba (o elimina) desde su panel. Solo las aprobadas se
-- muestran en el landing (política "reviews: leer aprobadas").
-- La gestión ya la permite la política "reviews: superadmin
-- gestiona" (for all) creada en 011.
-- Ejecutar DESPUÉS de 011.
-- ============================================================

-- Nuevas reseñas quedan pendientes de aprobación.
alter table public.reviews alter column approved set default false;

-- Índice para listar rápido las pendientes en el panel admin.
create index if not exists reviews_pendientes_idx
  on public.reviews (created_at) where approved = false;
