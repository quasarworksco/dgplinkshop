-- ============================================================
-- DGP LinkShop — Migración 022: Configuración central de cobros
-- Una sola fila (config_plataforma) que el súper-admin edita desde su
-- panel: tasa del día en Bs (para mostrar el plan en bolívares) y los
-- datos a los que el cliente paga su suscripción (Pago Móvil + Binance).
-- Antes estaban fijos en el código de panel.html; ahora son editables.
--   · Lectura: cualquier usuario autenticado (el cliente ve a dónde pagar).
--   · Escritura: solo súper-admin, vía RPC guardar_config_cobros (NO_AUTORIZADO sin el flag).
-- Ejecutar DESPUÉS de 021. (Aplicada vía MCP.)
-- ============================================================
create table if not exists public.config_plataforma (
  id int primary key default 1 check (id = 1),
  tasa_bs numeric,                 -- Bs por 1 USD (para mostrar el plan en bolívares)
  pm_titular text,
  pm_ci text,
  pm_telefono text,
  pm_banco text,
  binance_id text,
  updated_at timestamptz default now(),
  updated_by uuid
);

insert into public.config_plataforma (id, tasa_bs, pm_titular, pm_ci, pm_telefono, pm_banco, binance_id)
values (1, null, 'Paul Espina', '27.610.902', '0412-1002090', 'BNC', 'Paulalejo123@gmail.com')
on conflict (id) do nothing;

alter table public.config_plataforma enable row level security;

drop policy if exists config_plataforma_leer on public.config_plataforma;
create policy config_plataforma_leer on public.config_plataforma
  for select to authenticated using (true);

create or replace function public.guardar_config_cobros(
  p_tasa_bs numeric, p_pm_titular text, p_pm_ci text,
  p_pm_telefono text, p_pm_banco text, p_binance_id text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.config_plataforma set
    tasa_bs = p_tasa_bs,
    pm_titular = nullif(btrim(p_pm_titular), ''),
    pm_ci = nullif(btrim(p_pm_ci), ''),
    pm_telefono = nullif(btrim(p_pm_telefono), ''),
    pm_banco = nullif(btrim(p_pm_banco), ''),
    binance_id = nullif(btrim(p_binance_id), ''),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
end; $$;
revoke all on function public.guardar_config_cobros(numeric,text,text,text,text,text) from public, anon;
grant execute on function public.guardar_config_cobros(numeric,text,text,text,text,text) to authenticated;
