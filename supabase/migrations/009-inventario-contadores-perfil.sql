-- ============================================================
-- DGP LinkShop — Migración 009: Límites Premium, inventario,
-- contadores (views/WhatsApp) y campos de perfil
-- Ejecutar DESPUÉS de 008-plan-premium.sql
-- ============================================================

-- 1. Límite de productos por plan: free 5 · pro 100 · premium 400
create or replace function public.plan_product_limit(p public.plan_type)
returns integer language sql immutable set search_path = '' as $$
  select case p
    when 'free'    then 5
    when 'pro'     then 100
    when 'premium' then 400
  end;
$$;

-- 2. Inventario (stock) por producto. null = no se controla stock.
alter table public.products
  add column if not exists stock integer check (stock is null or stock >= 0);

-- 3. Contadores de la tienda (para "Contador de Views y WhatsApp")
alter table public.businesses
  add column if not exists view_count     integer not null default 0,
  add column if not exists whatsapp_count integer not null default 0;

-- Incrementos públicos (la tienda es anónima). security definer para
-- poder actualizar sin exponer UPDATE directo sobre businesses.
create or replace function public.sumar_vista(p_business_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.businesses set view_count = view_count + 1
   where id = p_business_id and is_published;
$$;

create or replace function public.sumar_whatsapp(p_business_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.businesses set whatsapp_count = whatsapp_count + 1
   where id = p_business_id and is_published;
$$;

revoke all on function public.sumar_vista(uuid)    from public;
revoke all on function public.sumar_whatsapp(uuid) from public;
grant execute on function public.sumar_vista(uuid)    to anon, authenticated;
grant execute on function public.sumar_whatsapp(uuid) to anon, authenticated;

-- 4. Campos de perfil solicitados en el registro
alter table public.profiles
  add column if not exists last_name  text,
  add column if not exists cedula_rif text,
  add column if not exists phone      text;

-- El trigger de registro copia los nuevos campos desde los metadatos
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, last_name, cedula_rif, phone)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'cedula_rif',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;
