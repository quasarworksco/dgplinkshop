-- ============================================================
-- DGP LinkShop — Migración 003: Pedidos, cupones y descuentos
-- Ejecutar DESPUÉS de 002-politicas-rls.sql
-- ============================================================
-- · products gana is_featured (destacados) y discount_percent.
-- · coupons: cupones por negocio, limitados por fecha y/o usos.
-- · orders: historial de pedidos (el pago ocurre fuera, por
--   WhatsApp; aquí solo se lleva el control interno).
-- · La creación de pedidos y la validación de cupones son
--   SERVER-SIDE (funciones security definer): el cliente nunca
--   calcula precios ni valida cupones por su cuenta.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Productos: destacados y descuento propio
-- ------------------------------------------------------------
alter table public.products
  add column is_featured boolean not null default false,
  add column discount_percent integer not null default 0
    check (discount_percent between 0 and 90);

-- ------------------------------------------------------------
-- 2. CUPONS — cupones por negocio
-- ------------------------------------------------------------
create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  code           text not null check (code = upper(code) and code ~ '^[A-Z0-9-]{3,24}$'),
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  valid_from     timestamptz not null default now(),
  valid_until    timestamptz,          -- null = sin vencimiento
  max_uses       integer check (max_uses is null or max_uses > 0),  -- null = ilimitado
  times_used     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, code)           -- el mismo código puede existir en negocios distintos
);

create index coupons_business_idx on public.coupons (business_id);
create trigger trg_touch_coupons before update on public.coupons
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 3. ORDERS — pedidos recibidos (control interno)
-- ------------------------------------------------------------
create type public.order_status as enum ('pendiente', 'procesado', 'entregado', 'cancelado');

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity,   -- número corto legible (#42)
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_name  text,
  items          jsonb not null,       -- [{id, nombre, cantidad, precio_unitario, subtotal}]
  subtotal       numeric(10,2) not null,
  discount_total numeric(10,2) not null default 0,
  coupon_code    text,
  total          numeric(10,2) not null,
  status         public.order_status not null default 'pendiente',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index orders_business_idx on public.orders (business_id, created_at desc);
create trigger trg_touch_orders before update on public.orders
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 4. RLS de coupons y orders
-- ------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.orders  enable row level security;

-- Cupones: solo el dueño los gestiona. El público NUNCA lee la
-- tabla; valida códigos a través de la función validar_cupon.
create policy "coupons: el dueño gestiona los suyos"
  on public.coupons for all
  to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- Pedidos: el dueño los ve y cambia su estado. No hay política de
-- insert: los pedidos SOLO entran por la función crear_pedido.
create policy "orders: el dueño ve los de su negocio"
  on public.orders for select
  to authenticated
  using (public.is_business_owner(business_id));

create policy "orders: el dueño actualiza el estado"
  on public.orders for update
  to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- ------------------------------------------------------------
-- 5. VALIDAR CUPÓN (server-side, para feedback en vivo del carrito)
--    Devuelve {valido, mensaje} o {valido, tipo, valor, codigo}.
--    security definer: el anónimo no lee la tabla, solo pregunta.
-- ------------------------------------------------------------
create or replace function public.validar_cupon(p_business_id uuid, p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.coupons%rowtype;
begin
  select * into c
    from public.coupons
   where business_id = p_business_id
     and code = upper(trim(p_codigo));

  if not found then
    return jsonb_build_object('valido', false, 'mensaje', 'Ese cupón no existe.');
  end if;
  if not c.is_active then
    return jsonb_build_object('valido', false, 'mensaje', 'Este cupón ya no está activo.');
  end if;
  if now() < c.valid_from then
    return jsonb_build_object('valido', false, 'mensaje', 'Este cupón aún no está vigente.');
  end if;
  if c.valid_until is not null and now() > c.valid_until then
    return jsonb_build_object('valido', false, 'mensaje', 'Este cupón ya venció.');
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    return jsonb_build_object('valido', false, 'mensaje', 'Este cupón agotó sus usos.');
  end if;

  return jsonb_build_object(
    'valido', true,
    'codigo', c.code,
    'tipo',   c.discount_type,
    'valor',  c.discount_value
  );
end;
$$;

revoke all on function public.validar_cupon(uuid, text) from public;
grant execute on function public.validar_cupon(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. CREAR PEDIDO (server-side)
--    El servidor recalcula TODOS los precios desde products
--    (con su descuento), re-valida el cupón bloqueando su fila
--    (for update: dos pedidos simultáneos no exceden max_uses),
--    incrementa su contador e inserta el pedido. El cliente solo
--    envía ids y cantidades — nunca precios.
-- ------------------------------------------------------------
create or replace function public.crear_pedido(
  p_business_id   uuid,
  p_items         jsonb,               -- [{"id":"uuid","cantidad":2}, ...]
  p_codigo_cupon  text default null,
  p_nombre_cliente text default null
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

    select id, name, price, discount_percent into v_prod
      from public.products
     where id = (v_item ->> 'id')::uuid
       and business_id = p_business_id
       and is_active = true;
    if not found then
      raise exception 'PRODUCTO_NO_DISPONIBLE: un producto del carrito ya no está disponible.';
    end if;

    v_precio   := round(v_prod.price * (1 - v_prod.discount_percent / 100.0), 2);
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

revoke all on function public.crear_pedido(uuid, jsonb, text, text) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text) to anon, authenticated;
