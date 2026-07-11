-- ============================================================
-- DGP LinkShop — Migración 011: Reseñas del landing
-- ============================================================
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  rating     int  not null check (rating between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 400),
  approved   boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;

drop policy if exists "reviews: leer aprobadas" on public.reviews;
create policy "reviews: leer aprobadas" on public.reviews for select to anon, authenticated
  using (approved = true);

drop policy if exists "reviews: cualquiera crea" on public.reviews;
create policy "reviews: cualquiera crea" on public.reviews for insert to anon, authenticated
  with check (rating between 1 and 5 and char_length(name) between 1 and 60);

drop policy if exists "reviews: superadmin gestiona" on public.reviews;
create policy "reviews: superadmin gestiona" on public.reviews for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());
