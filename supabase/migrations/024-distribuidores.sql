-- ============================================================
-- DGP LinkShop — Migración 024: Sistema de distribuidores (socios)
-- Un distribuidor revende el servicio y gana una comisión (% configurable)
-- sobre los pagos de SUS clientes. Solo VE/controla a sus clientes (RLS).
--   · profiles.comision_distribuidor: NULL = no es distribuidor; >0 = % comisión
--   · businesses.distribuidor_id: a qué distribuidor pertenece la tienda
--   · es_distribuidor(), vistas distribuidor_tiendas / distribuidor_pagos
--   · RPCs súper-admin: set_distribuidor, asignar_distribuidor
-- (Aplicada vía MCP.)
-- ============================================================
alter table public.profiles add column if not exists comision_distribuidor numeric;
alter table public.businesses add column if not exists distribuidor_id uuid references public.profiles(id) on delete set null;
create index if not exists idx_businesses_distribuidor on public.businesses(distribuidor_id);

create or replace function public.es_distribuidor()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select comision_distribuidor is not null and comision_distribuidor > 0
                   from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.es_distribuidor() from public, anon;
grant execute on function public.es_distribuidor() to authenticated;

create or replace view public.distribuidor_tiendas with (security_invoker=true) as
  select b.id, b.name, b.slug, b.logo_url, b.is_published, b.created_at,
         p.email as owner_email, p.full_name as owner_name,
         coalesce(s.plan::text,'free') as plan,
         s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente,
         (select count(*) from products pr where pr.business_id=b.id) as num_productos
    from businesses b
    join profiles p on p.id=b.owner_id
    left join subscriptions s on s.business_id=b.id
   where b.distribuidor_id = auth.uid();

create or replace view public.distribuidor_pagos with (security_invoker=true) as
  select pm.id, pm.business_id, pm.plan, pm.method, pm.amount, pm.status,
         pm.created_at, pm.reviewed_at,
         b.name as negocio, p.email as owner_email,
         round(pm.amount * coalesce(d.comision_distribuidor,0)/100.0, 2) as comision,
         d.comision_distribuidor as porcentaje
    from payments pm
    join businesses b on b.id=pm.business_id
    join profiles p on p.id=b.owner_id
    join profiles d on d.id = b.distribuidor_id
   where b.distribuidor_id = auth.uid();

create or replace function public.set_distribuidor(p_email text, p_comision numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_uid uuid;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  select id into v_uid from public.profiles where lower(email)=lower(btrim(p_email));
  if v_uid is null then raise exception 'USUARIO_NO_ENCONTRADO'; end if;
  update public.profiles set comision_distribuidor = p_comision where id = v_uid;
end; $$;
revoke all on function public.set_distribuidor(text,numeric) from public, anon;
grant execute on function public.set_distribuidor(text,numeric) to authenticated;

create or replace function public.asignar_distribuidor(p_business_id uuid, p_distribuidor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.businesses set distribuidor_id = p_distribuidor_id where id = p_business_id;
end; $$;
revoke all on function public.asignar_distribuidor(uuid,uuid) from public, anon;
grant execute on function public.asignar_distribuidor(uuid,uuid) to authenticated;
