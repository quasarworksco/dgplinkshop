-- ============================================================
-- DGP LinkShop — Migración 013: Catálogo mayorista (beneficio PRO)
-- Cada producto puede tener precio al mayor + cantidad mínima.
-- El negocio activa el catálogo mayorista (solo PRO/Premium) y
-- comparte un link/QR con `?mayor=1`. El servidor cobra el precio
-- mayorista y exige la cantidad mínima al crear el pedido.
-- Ejecutar DESPUÉS de 012.
-- ============================================================

-- 1) Columnas de producto: precio al mayor y cantidad mínima.
alter table public.products
  add column if not exists wholesale_price numeric(10,2) check (wholesale_price is null or wholesale_price >= 0),
  add column if not exists wholesale_min   integer not null default 1 check (wholesale_min >= 1);

-- 2) Interruptor por negocio: ¿ofrece catálogo mayorista?
alter table public.businesses
  add column if not exists wholesale_enabled boolean not null default false;

-- 3) La vista pública expone el interruptor (columna al FINAL para
--    no romper el orden de columnas existente).
create or replace view public.storefront
with (security_invoker = true) as
select b.id, b.name, b.slug, b.description, b.category,
       b.logo_url, b.cover_url, b.whatsapp, b.theme, b.tasa_bs,
       b.wholesale_enabled
  from public.businesses b
 where b.is_published = true
   and public.tienda_activa(b.id);

-- 4) crear_pedido con modo mayorista. Reemplaza la firma de 4
--    argumentos por una de 5 (se elimina la anterior para no dejar
--    dos sobrecargas ambiguas para PostgREST).
drop function if exists public.crear_pedido(uuid, jsonb, text, text);

create or replace function public.crear_pedido(
  p_business_id   uuid,
  p_items         jsonb,               -- [{"id":"uuid","cantidad":2}, ...]
  p_codigo_cupon  text default null,
  p_nombre_cliente text default null,
  p_mayorista     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item      jsonb;
  v_prod      record;
  v_cantidad  integer;
  v_precio    numeric(10,2);
  v_detalle   jsonb := '[]'::jsonb;
  v_subtotal  numeric(10,2) := 0;
  v_descuento numeric(10,2) := 0;
  v_cupon     public.coupons%rowtype;
  v_codigo    text := null;
  v_pedido    public.orders%rowtype;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and is_published) then
    raise exception 'TIENDA_NO_DISPONIBLE: la tienda no está disponible en este momento.';
  end if;
  -- El modo mayorista exige que el negocio lo tenga activado.
  if p_mayorista and not exists (
       select 1 from public.businesses where id = p_business_id and wholesale_enabled) then
    raise exception 'MAYORISTA_NO_DISPONIBLE: esta tienda no ofrece catálogo mayorista.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PEDIDO_VACIO: el pedido no tiene productos.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'PEDIDO_INVALIDO: demasiadas líneas en el pedido.';
  end if;

  -- Recalcular cada línea desde la base de datos
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::integer, 0);
    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'CANTIDAD_INVALIDA: revisa las cantidades del carrito.';
    end if;

    select id, name, price, discount_percent, wholesale_price, wholesale_min into v_prod
      from public.products
     where id = (v_item ->> 'id')::uuid
       and business_id = p_business_id
       and is_active = true;
    if not found then
      raise exception 'PRODUCTO_NO_DISPONIBLE: un producto del carrito ya no está disponible.';
    end if;

    if p_mayorista then
      if v_prod.wholesale_price is null then
        raise exception 'PRODUCTO_NO_DISPONIBLE: un producto del carrito no está disponible al mayor.';
      end if;
      if v_cantidad < v_prod.wholesale_min then
        raise exception 'CANTIDAD_MINIMA: no alcanzas la cantidad mínima al mayor de un producto.';
      end if;
      v_precio := v_prod.wholesale_price;
    else
      v_precio := round(v_prod.price * (1 - v_prod.discount_percent / 100.0), 2);
    end if;

    v_subtotal := v_subtotal + v_precio * v_cantidad;
    v_detalle  := v_detalle || jsonb_build_object(
      'id', v_prod.id,
      'nombre', v_prod.name,
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'subtotal', round(v_precio * v_cantidad, 2)
    );
  end loop;

  -- Cupón: re-validación server-side con bloqueo de fila
  if p_codigo_cupon is not null and length(trim(p_codigo_cupon)) > 0 then
    select * into v_cupon
      from public.coupons
     where business_id = p_business_id
       and code = upper(trim(p_codigo_cupon))
       for update;

    if not found
       or not v_cupon.is_active
       or now() < v_cupon.valid_from
       or (v_cupon.valid_until is not null and now() > v_cupon.valid_until)
       or (v_cupon.max_uses is not null and v_cupon.times_used >= v_cupon.max_uses) then
      raise exception 'CUPON_INVALIDO: el cupón no es válido, está vencido o agotó sus usos.';
    end if;

    v_codigo    := v_cupon.code;
    v_descuento := case v_cupon.discount_type
                     when 'percent' then round(v_subtotal * v_cupon.discount_value / 100.0, 2)
                     else least(v_cupon.discount_value, v_subtotal)
                   end;

    update public.coupons set times_used = times_used + 1 where id = v_cupon.id;
  end if;

  insert into public.orders
    (business_id, customer_name, items, subtotal, discount_total, coupon_code, total)
  values
    (p_business_id,
     nullif(trim(coalesce(p_nombre_cliente, '')), ''),
     v_detalle,
     round(v_subtotal, 2),
     v_descuento,
     v_codigo,
     round(v_subtotal - v_descuento, 2))
  returning * into v_pedido;

  return jsonb_build_object(
    'numero',    v_pedido.numero,
    'detalle',   v_detalle,
    'subtotal',  v_pedido.subtotal,
    'descuento', v_pedido.discount_total,
    'cupon',     v_pedido.coupon_code,
    'total',     v_pedido.total
  );
end;
$$;

revoke all on function public.crear_pedido(uuid, jsonb, text, text, boolean) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, boolean) to anon, authenticated;
