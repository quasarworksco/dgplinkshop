-- ============================================================
-- DGP LinkShop — Migración 005: Slugs reservados
-- Ejecutar DESPUÉS de 004-endurecimiento-seguridad.sql
-- ============================================================
-- Impide que un cliente registre como tienda un subdominio que ya
-- está en uso en el DNS (p. ej. novastore.dgp-link.com, que apunta
-- a otra página en GitHub). Su CNAME propio le gana al comodín, así
-- que ese host nunca llegaría a la app; aquí evitamos que alguien
-- reclame ese slug y quede con una tienda que no resuelve.
--
-- Tabla editable: para reservar un subdominio nuevo en el futuro,
-- basta un INSERT (no hace falta otra migración).
-- ============================================================

create table public.reserved_slugs (
  slug       text primary key check (slug = lower(slug)),
  reason     text,
  created_at timestamptz not null default now()
);

insert into public.reserved_slugs (slug, reason) values
  -- sistema
  ('www', 'sistema'), ('app', 'sistema'), ('api', 'sistema'), ('admin', 'sistema'),
  ('panel', 'sistema'), ('dashboard', 'sistema'), ('mail', 'sistema'),
  ('soporte', 'sistema'), ('dgp', 'sistema'),
  -- subdominios ya usados en GoDaddy (otras páginas del dueño)
  ('novastore', 'subdominio existente'), ('orangeultrasound', 'subdominio existente'),
  ('bossafashion', 'subdominio existente'), ('cleaningroup', 'subdominio existente'),
  ('leidyluniow', 'subdominio existente'), ('pezdorado', 'subdominio existente');

-- Lectura pública (el wizard consulta disponibilidad); nadie escribe
-- desde el cliente (solo el backend con service_role).
alter table public.reserved_slugs enable row level security;

create policy "reserved_slugs: lectura publica"
  on public.reserved_slugs for select
  to anon, authenticated
  using (true);

-- Enforcement server-side: rechaza crear/renombrar una tienda con un
-- slug reservado, sin importar lo que envíe el cliente.
create or replace function public.enforce_reserved_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.reserved_slugs where slug = lower(new.slug)) then
    raise exception 'SLUG_RESERVADO: la dirección "%" está reservada y no se puede usar.', new.slug
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reserved_slug() from public, anon, authenticated;

create trigger trg_enforce_reserved_slug
  before insert or update of slug on public.businesses
  for each row execute function public.enforce_reserved_slug();
