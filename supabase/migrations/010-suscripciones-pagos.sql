-- ============================================================
-- DGP LinkShop — Migración 010: Suscripciones y pagos
-- Ejecutar DESPUÉS de 009 (y de haber agregado 'premium' al enum)
-- ============================================================
alter table public.subscriptions
  add column if not exists paid_until date,
  add column if not exists trial_ends_at timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan public.plan_type not null,
  method text not null check (method in ('pagomovil','binance')),
  reference text,
  amount numeric(10,2),
  receipt_url text,
  status text not null default 'pendiente' check (status in ('pendiente','confirmado','rechazado')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists payments_business_idx on public.payments(business_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status);

alter table public.payments enable row level security;
create policy "payments: el dueño crea" on public.payments for insert to authenticated
  with check (public.is_business_owner(business_id));
create policy "payments: el dueño ve los suyos" on public.payments for select to authenticated
  using (public.is_business_owner(business_id));
create policy "payments: superadmin ve" on public.payments for select to authenticated
  using (public.es_superadmin());

create or replace function public.confirmar_pago(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pago public.payments%rowtype; v_proximo date;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into v_pago from public.payments where id = p_payment_id;
  if not found then raise exception 'PAGO_NO_ENCONTRADO'; end if;
  v_proximo := (date_trunc('month', current_date) + interval '1 month' + interval '4 days')::date;
  update public.subscriptions
     set plan = v_pago.plan, status = 'active', paid_until = v_proximo, monthly_price = v_pago.amount
   where business_id = v_pago.business_id;
  update public.payments set status = 'confirmado', reviewed_at = now() where id = p_payment_id;
end; $$;
revoke all on function public.confirmar_pago(uuid) from public, anon;
grant execute on function public.confirmar_pago(uuid) to authenticated;

create or replace function public.rechazar_pago(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.payments set status = 'rechazado', reviewed_at = now() where id = p_payment_id;
end; $$;
revoke all on function public.rechazar_pago(uuid) from public, anon;
grant execute on function public.rechazar_pago(uuid) to authenticated;

create or replace function public.renovar_suscripcion(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_proximo date;
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  v_proximo := (date_trunc('month', current_date) + interval '1 month' + interval '4 days')::date;
  update public.subscriptions set status = 'active', paid_until = v_proximo where business_id = p_business_id;
end; $$;
revoke all on function public.renovar_suscripcion(uuid) from public, anon;
grant execute on function public.renovar_suscripcion(uuid) to authenticated;

create or replace view public.admin_pagos with (security_invoker = true) as
select pm.id, pm.business_id, pm.plan, pm.method, pm.reference, pm.amount,
       pm.receipt_url, pm.status, pm.created_at,
       b.name as negocio, b.slug, p.email as owner_email
from public.payments pm
join public.businesses b on b.id = pm.business_id
join public.profiles p on p.id = b.owner_id;

create or replace view public.admin_tiendas with (security_invoker = true) as
select b.id, b.name, b.slug, b.is_published, b.whatsapp, b.created_at,
       p.email as owner_email, p.full_name as owner_name,
       coalesce(s.plan::text, 'free') as plan, coalesce(s.status::text, 'active') as sub_status,
       s.paid_until,
       (select count(*) from public.products pr where pr.business_id = b.id) as num_productos
from public.businesses b
join public.profiles p on p.id = b.owner_id
left join public.subscriptions s on s.business_id = b.id;
