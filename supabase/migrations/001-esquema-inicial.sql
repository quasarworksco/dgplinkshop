-- ============================================================
-- DGP LinkShop — Migración 001: Esquema inicial
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Modelo multi-tenant:
--   auth.users (Supabase Auth)
--     └── profiles      (1:1  — datos del dueño del negocio)
--           └── businesses   (1:1 en el MVP — la tienda/tenant)
--                 ├── subscriptions (1:1 — plan y estado de pago)
--                 └── products      (1:N — catálogo, limitado por plan)
-- ============================================================

-- ------------------------------------------------------------
-- 0. Tipos enumerados
-- ------------------------------------------------------------
create type public.plan_type as enum ('free', 'pro');
create type public.subscription_status as enum ('active', 'pending_payment', 'past_due', 'canceled');

-- ------------------------------------------------------------
-- 1. PROFILES — perfil público del usuario (espejo de auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil del dueño de negocio. Se crea automáticamente al registrarse (trigger handle_new_user).';

-- ------------------------------------------------------------
-- 2. BUSINESSES — el negocio/tienda (tenant)
-- ------------------------------------------------------------
create table public.businesses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  -- slug = subdominio: negocio1.dgpgroupusa.com  →  slug 'negocio1'
  slug         text not null unique
               check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$')
               check (slug not in ('www','app','api','admin','panel','dashboard','mail','soporte','dgp')),
  description  text,
  category     text,
  logo_url     text,          -- URL de Cloudinary
  cover_url    text,          -- URL de Cloudinary
  whatsapp     text,          -- número para el botón de pedidos
  theme        jsonb not null default '{"color_primario": "#818cf8", "color_acento": "#22d3ee"}'::jsonb,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- MVP: un negocio por usuario. Para multi-tienda en el futuro, eliminar este índice.
create unique index businesses_one_per_owner on public.businesses (owner_id);
create index businesses_slug_idx on public.businesses (slug);

comment on column public.businesses.slug is 'Subdominio único de la tienda: <slug>.dgpgroupusa.com';

-- ------------------------------------------------------------
-- 3. SUBSCRIPTIONS — plan y facturación del negocio
--    FREE: 5 productos | PRO: $30 inscripción + $20/mes, 50 productos
-- ------------------------------------------------------------
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null unique references public.businesses (id) on delete cascade,
  plan                 public.plan_type not null default 'free',
  status               public.subscription_status not null default 'active',
  enrollment_paid      boolean not null default false,  -- inscripción PRO de $30 (pago único)
  enrollment_fee       numeric(10,2) not null default 0,
  monthly_price        numeric(10,2) not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,                     -- null en plan free (no vence)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.subscriptions is 'Una suscripción por negocio. Los cambios de plan los hace el backend (service_role), nunca el cliente.';

-- Límite de productos según el plan (única fuente de verdad)
create or replace function public.plan_product_limit(p public.plan_type)
returns integer
language sql
immutable
as $$
  select case p
    when 'free' then 5
    when 'pro'  then 50
  end;
$$;

-- ------------------------------------------------------------
-- 4. PRODUCTS — catálogo de cada negocio
-- ------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  price       numeric(10,2) not null default 0 check (price >= 0),
  image_url   text,          -- URL de Cloudinary
  is_active   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index products_business_idx on public.products (business_id);

-- ------------------------------------------------------------
-- 5. TRIGGER: hacer cumplir el límite de productos por plan
--    Se ejecuta ANTES de insertar; si el negocio ya alcanzó su
--    límite (5 free / 50 pro), la inserción falla con un error
--    legible que el frontend muestra al usuario.
-- ------------------------------------------------------------
create or replace function public.enforce_product_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select public.plan_product_limit(s.plan)
    into v_limit
    from public.subscriptions s
   where s.business_id = new.business_id
     and s.status = 'active';

  -- Sin suscripción activa (p. ej. PRO impago) → se trata como plan free
  if v_limit is null then
    v_limit := 5;
  end if;

  select count(*) into v_count
    from public.products
   where business_id = new.business_id;

  if v_count >= v_limit then
    raise exception 'LIMITE_PRODUCTOS: tu plan permite un máximo de % productos. Mejora a PRO para ampliar tu catálogo.', v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_product_limit
  before insert on public.products
  for each row execute function public.enforce_product_limit();

-- ------------------------------------------------------------
-- 6. TRIGGER: crear el perfil automáticamente al registrarse
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 7. TRIGGER: toda tienda nueva nace con suscripción FREE activa
-- ------------------------------------------------------------
create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (business_id, plan, status, monthly_price)
  values (new.id, 'free', 'active', 0);
  return new;
end;
$$;

create trigger trg_on_business_created
  after insert on public.businesses
  for each row execute function public.handle_new_business();

-- ------------------------------------------------------------
-- 8. TRIGGER: mantener updated_at al día
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_profiles      before update on public.profiles      for each row execute function public.touch_updated_at();
create trigger trg_touch_businesses    before update on public.businesses    for each row execute function public.touch_updated_at();
create trigger trg_touch_subscriptions before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger trg_touch_products      before update on public.products      for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 9. VISTA pública para la tienda (lo que ve un visitante anónimo)
-- ------------------------------------------------------------
create or replace view public.storefront as
select b.id, b.name, b.slug, b.description, b.category,
       b.logo_url, b.cover_url, b.whatsapp, b.theme
  from public.businesses b
 where b.is_published = true;
