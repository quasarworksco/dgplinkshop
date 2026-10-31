-- ============================================================
-- DGP LinkShop — Migración 017: Vencimiento real + pausar/eliminar cuentas
-- - tienda_activa exige pago vigente (3 días de gracia) y respeta la pausa
--   manual del súper-admin; así una tienda vencida deja de mostrarse.
-- - pausar_tienda / eliminar_cuenta para el panel súper-admin.
-- - admin_tiendas expone is_paused y 'vigente'.
-- Ejecutar DESPUÉS de 016. (Aplicada vía MCP.)
-- ============================================================

alter table public.businesses
  add column if not exists is_paused boolean not null default false;

create or replace function public.tienda_activa(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select
       (not coalesce(b.is_paused, false))
       and case
             when s.plan <> 'free' then
               s.status = 'active' and (s.paid_until is null or s.paid_until + 3 >= current_date)
             when s.trial_ends_at is null then true
             else s.trial_ends_at > now()
           end
     from public.businesses b
     left join public.subscriptions s on s.business_id = b.id
     where b.id = p_business_id),
    true);
$$;
revoke all on function public.tienda_activa(uuid) from public;
grant execute on function public.tienda_activa(uuid) to anon, authenticated;

create or replace function public.pausar_tienda(p_business_id uuid, p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.businesses set is_paused = p_pausar where id = p_business_id;
end; $$;
revoke all on function public.pausar_tienda(uuid, boolean) from public, anon;
grant execute on function public.pausar_tienda(uuid, boolean) to authenticated;

create or replace function public.eliminar_cuenta(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is null then raise exception 'NEGOCIO_NO_ENCONTRADO'; end if;
  if v_owner = auth.uid() then raise exception 'NO_PUEDES_ELIMINARTE'; end if;
  delete from public.businesses where id = p_business_id;
  delete from public.profiles where id = v_owner;
  begin
    delete from auth.users where id = v_owner;
  exception when others then null;
  end;
end; $$;
revoke all on function public.eliminar_cuenta(uuid) from public, anon;
grant execute on function public.eliminar_cuenta(uuid) to authenticated;

create or replace view public.admin_tiendas with (security_invoker = true) as
select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
       p.email as owner_email, p.full_name as owner_name,
       coalesce(s.plan::text, 'free') as plan, coalesce(s.status::text, 'active') as sub_status,
       (select count(*) from public.products pr where pr.business_id = b.id) as num_productos,
       s.paid_until, b.is_paused, public.tienda_activa(b.id) as vigente
from public.businesses b
join public.profiles p on p.id = b.owner_id
left join public.subscriptions s on s.business_id = b.id;
