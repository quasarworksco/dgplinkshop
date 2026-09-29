-- ============================================================
-- DGP LinkShop — Migración 016: Stock funcional (descuento y devolución)
-- - crear_pedido descuenta stock, evita sobreventa y (recupera) el
--   conteo de más vendidos (sold_count), que se había perdido en 013.
-- - Al cancelar un pedido, el stock se devuelve automáticamente.
-- Ejecutar DESPUÉS de 015.
-- ============================================================

alter table public.orders
  add column if not exists stock_devuelto boolean not null default false;

-- 1) crear_pedido: valida stock, lo descuenta y suma sold_count.
create or replace function public.crear_pedido(
  p_business_id   uuid,
  p_items         jsonb,
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
  v_item jsonb; v_prod record; v_cantidad integer; v_precio numeric(10,2);
  v_detalle jsonb := '[]'::jsonb; v_subtotal numeric(10,2) := 0; v_descuento numeric(10,2) := 0;
  v_cupon public.coupons%rowtype; v_codigo text := null; v_pedido public.orders%rowtype;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and is_published) then
    raise exception 'TIENDA_NO_DISPONIBLE: la tienda no está disponible en este momento.';
  end if;
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

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::integer, 0);
    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'CANTIDAD_INVALIDA: revisa las cantidades del carrito.';
    end if;
    -- for update: bloquea la fila para evitar sobreventa en pedidos simultáneos
    select id, name, price, discount_percent, wholesale_price, wholesale_min, stock into v_prod
      from public.products
     where id = (v_item ->> 'id')::uuid and business_id = p_business_id and is_active = true
     for update;
    if not found then
      raise exception 'PRODUCTO_NO_DISPONIBLE: un producto del carrito ya no está disponible.';
    end if;
    if v_prod.stock is not null and v_cantidad > v_prod.stock then
      raise exception 'STOCK_INSUFICIENTE: no hay suficiente stock de un producto.';
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
      'id', v_prod.id, 'nombre', v_prod.name, 'cantidad', v_cantidad,
      'precio_unitario', v_precio, 'subtotal', round(v_precio * v_cantidad, 2));

    -- Descuenta stock (si se controla) y suma al contador de más vendidos.
    update public.products
       set sold_count = sold_count + v_cantidad,
           stock = case when stock is not null then greatest(stock - v_cantidad, 0) else null end
     where id = v_prod.id;
  end loop;

  if p_codigo_cupon is not null and length(trim(p_codigo_cupon)) > 0 then
    select * into v_cupon from public.coupons
     where business_id = p_business_id and code = upper(trim(p_codigo_cupon)) for update;
    if not found or not v_cupon.is_active or now() < v_cupon.valid_from
       or (v_cupon.valid_until is not null and now() > v_cupon.valid_until)
       or (v_cupon.max_uses is not null and v_cupon.times_used >= v_cupon.max_uses) then
      raise exception 'CUPON_INVALIDO: el cupón no es válido, está vencido o agotó sus usos.';
    end if;
    v_codigo := v_cupon.code;
    v_descuento := case v_cupon.discount_type
                     when 'percent' then round(v_subtotal * v_cupon.discount_value / 100.0, 2)
                     else least(v_cupon.discount_value, v_subtotal) end;
    update public.coupons set times_used = times_used + 1 where id = v_cupon.id;
  end if;

  insert into public.orders
    (business_id, customer_name, items, subtotal, discount_total, coupon_code, total)
  values
    (p_business_id, nullif(trim(coalesce(p_nombre_cliente, '')), ''), v_detalle,
     round(v_subtotal, 2), v_descuento, v_codigo, round(v_subtotal - v_descuento, 2))
  returning * into v_pedido;

  return jsonb_build_object('numero', v_pedido.numero, 'detalle', v_detalle,
    'subtotal', v_pedido.subtotal, 'descuento', v_pedido.discount_total,
    'cupon', v_pedido.coupon_code, 'total', v_pedido.total);
end; $$;

-- 2) Al cancelar un pedido, devolver el stock y descontar sold_count (una sola vez).
create or replace function public.restaurar_stock_al_cancelar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_item jsonb;
begin
  if new.status = 'cancelado'
     and old.status is distinct from 'cancelado'
     and not coalesce(old.stock_devuelto, false) then
    for v_item in select * from jsonb_array_elements(new.items) loop
      update public.products
         set stock = case when stock is not null then stock + (v_item->>'cantidad')::int else null end,
             sold_count = greatest(sold_count - (v_item->>'cantidad')::int, 0)
       where id = (v_item->>'id')::uuid;
    end loop;
    new.stock_devuelto := true;
  end if;
  return new;
end; $$;

drop trigger if exists trg_orders_restaurar_stock on public.orders;
create trigger trg_orders_restaurar_stock
  before update on public.orders
  for each row execute function public.restaurar_stock_al_cancelar();
