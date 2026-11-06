// ============================================================
// DGP LinkShop — Panel súper-admin (solo el dueño de la plataforma)
// Lista todas las tiendas y clientes. El acceso lo controla la
// función es_superadmin() + RLS: aunque alguien abra esta página,
// sin el flag no verá datos de otros.
// ============================================================
import { supabase } from './supabase-client.js';
import { requerirSesion, cerrarSesion } from './auth.js';
import { icono } from './iconos.js';
import { urlDeTienda } from './subdominio.js';
import { registrarError, notificar } from './notificaciones.js';

const $ = (id) => document.getElementById(id);

function mostrar(cual) {
  $('estado-cargando').classList.add('hidden');
  $('estado-denegado').classList.toggle('hidden', cual !== 'denegado');
  $('estado-denegado').classList.toggle('flex', cual === 'denegado');
  $('estado-ok').classList.toggle('hidden', cual !== 'ok');
}

function escapar(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

const ESTILO_PLAN = {
  pro: 'bg-blue-50 text-blue-700',
  free: 'bg-slate-100 text-slate-600',
};

(async function iniciar() {
  const usuario = await requerirSesion();
  if (!usuario) return;

  // ¿Es súper-admin?
  const { data: esAdmin, error } = await supabase.rpc('es_superadmin');
  if (error) {
    registrarError('admin/verificar', error);
    return mostrar('denegado');
  }
  if (!esAdmin) return mostrar('denegado');

  await cargarConfigCobros();
  await cargarPagos();
  await cargarResenas();
  await cargarTiendas();
  mostrar('ok');
})();

// ------------------------------------------------------------
// Cobros y suscripciones (configuración central)
// ------------------------------------------------------------
async function cargarConfigCobros() {
  const { data, error } = await supabase
    .from('config_plataforma')
    .select('tasa_bs, pm_titular, pm_ci, pm_telefono, pm_banco, binance_id, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) { registrarError('admin/cargar-config', error); return; }
  const c = data ?? {};
  $('cfg-cobros-tasa').value = c.tasa_bs ?? '';
  $('cfg-cobros-pm-titular').value = c.pm_titular ?? '';
  $('cfg-cobros-pm-ci').value = c.pm_ci ?? '';
  $('cfg-cobros-pm-telefono').value = c.pm_telefono ?? '';
  $('cfg-cobros-pm-banco').value = c.pm_banco ?? '';
  $('cfg-cobros-binance').value = c.binance_id ?? '';
  if (c.updated_at) {
    const f = new Date(c.updated_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('cfg-cobros-estado').textContent = `Última actualización: ${f}`;
  }
}

$('btn-cobros-guardar').addEventListener('click', async () => {
  const boton = $('btn-cobros-guardar');
  const valor = $('cfg-cobros-tasa').value.trim();
  const tasa = valor === '' ? null : Number(valor);
  if (tasa !== null && (!isFinite(tasa) || tasa <= 0)) {
    return notificar('Escribe una tasa válida (mayor a 0) o déjala vacía.', 'error');
  }
  boton.disabled = true;
  boton.innerHTML = '<span class="spinner"></span> Guardando…';
  const { error } = await supabase.rpc('guardar_config_cobros', {
    p_tasa_bs: tasa,
    p_pm_titular: $('cfg-cobros-pm-titular').value.trim(),
    p_pm_ci: $('cfg-cobros-pm-ci').value.trim(),
    p_pm_telefono: $('cfg-cobros-pm-telefono').value.trim(),
    p_pm_banco: $('cfg-cobros-pm-banco').value.trim(),
    p_binance_id: $('cfg-cobros-binance').value.trim(),
  });
  boton.disabled = false;
  boton.textContent = 'Guardar configuración';
  if (error) { registrarError('admin/guardar-config', error); return notificar('No se pudo guardar la configuración.', 'error'); }
  notificar('Configuración de cobros guardada.', 'exito');
  await cargarConfigCobros();
});

function estrellasSVG(n) {
  let o = '';
  for (let i = 1; i <= 5; i++) {
    o += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${i <= n ? '#f59e0b' : 'none'}" stroke="${i <= n ? '#f59e0b' : '#cbd5e1'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }
  return o;
}

// ------------------------------------------------------------
// Reseñas por aprobar (moderación del landing)
// ------------------------------------------------------------
async function cargarResenas() {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, name, rating, comment, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: true });
  if (error) { registrarError('admin/cargar-resenas', error); return; }

  const resenas = data ?? [];
  $('admin-resenas-seccion').classList.toggle('hidden', resenas.length === 0);
  $('admin-resenas-conteo').textContent = resenas.length;

  const cont = $('admin-resenas');
  cont.innerHTML = resenas
    .map((r) => {
      const fecha = new Date(r.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `
      <article class="tarjeta-solida p-5" data-resena="${r.id}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-bold text-slate-900">${escapar(r.name)}</p>
            <p class="text-xs text-slate-400">${fecha}</p>
          </div>
          <div class="flex gap-0.5">${estrellasSVG(r.rating)}</div>
        </div>
        ${r.comment ? `<p class="mt-2 text-sm text-slate-600 leading-relaxed">"${escapar(r.comment)}"</p>` : '<p class="mt-2 text-sm text-slate-400 italic">Sin comentario</p>'}
        <div class="flex gap-2 mt-4">
          <button data-accion="aprobar" class="btn btn-primario flex-1 text-sm">Aprobar</button>
          <button data-accion="eliminar" class="btn btn-claro flex-1 text-sm text-rose-600">Eliminar</button>
        </div>
      </article>`;
    })
    .join('');

  cont.querySelectorAll('[data-resena]').forEach((art) => {
    const id = art.dataset.resena;
    art.querySelector('[data-accion="aprobar"]').addEventListener('click', () => resolverResena(id, true));
    art.querySelector('[data-accion="eliminar"]').addEventListener('click', () => resolverResena(id, false));
  });
}

async function resolverResena(id, aprobar) {
  const { error } = aprobar
    ? await supabase.from('reviews').update({ approved: true }).eq('id', id)
    : await supabase.from('reviews').delete().eq('id', id);
  if (error) { registrarError('admin/resolver-resena', error); return notificar('No se pudo procesar la reseña.', 'error'); }
  notificar(aprobar ? 'Reseña aprobada y publicada.' : 'Reseña eliminada.', 'exito');
  await cargarResenas();
}

// ------------------------------------------------------------
// Pagos por confirmar
// ------------------------------------------------------------
async function cargarPagos() {
  const { data, error } = await supabase
    .from('admin_pagos')
    .select('*')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) { registrarError('admin/cargar-pagos', error); return; }

  const pagos = data ?? [];
  $('admin-pagos-seccion').classList.toggle('hidden', pagos.length === 0);
  $('admin-pagos-conteo').textContent = pagos.length;

  const cont = $('admin-pagos');
  cont.innerHTML = pagos
    .map((p) => {
      const fecha = new Date(p.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `
      <article class="tarjeta-solida p-5" data-pago="${p.id}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-bold text-slate-900">${escapar(p.negocio)} · <span class="uppercase text-blue-700">${escapar(p.plan)}</span></p>
            <p class="text-xs text-slate-400">${escapar(p.owner_email)} · ${fecha}</p>
          </div>
          <p class="font-extrabold text-slate-900">$${Number(p.amount || 0).toFixed(2)}</p>
        </div>
        <div class="mt-2 text-sm text-slate-600">
          <p>Método: <strong>${p.method === 'pagomovil' ? 'Pago Móvil' : 'Binance'}</strong>${p.reference ? ` · Ref: ${escapar(p.reference)}` : ''}</p>
        </div>
        ${p.receipt_url ? `<a href="${p.receipt_url}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold mt-2">${icono('imagen', 'w-3.5 h-3.5')} Ver comprobante</a>` : ''}
        <div class="flex gap-2 mt-4">
          <button data-accion="confirmar" class="btn btn-primario flex-1 text-sm">Confirmar</button>
          <button data-accion="rechazar" class="btn btn-claro flex-1 text-sm text-rose-600">Rechazar</button>
        </div>
      </article>`;
    })
    .join('');

  cont.querySelectorAll('[data-pago]').forEach((art) => {
    const id = art.dataset.pago;
    art.querySelector('[data-accion="confirmar"]').addEventListener('click', () => resolverPago(id, 'confirmar_pago', 'Pago confirmado, plan activado.'));
    art.querySelector('[data-accion="rechazar"]').addEventListener('click', () => resolverPago(id, 'rechazar_pago', 'Pago rechazado.'));
  });
}

async function resolverPago(id, rpc, mensaje) {
  const { error } = await supabase.rpc(rpc, { p_payment_id: id });
  if (error) { registrarError('admin/' + rpc, error); return notificar('No se pudo procesar el pago.', 'error'); }
  notificar(mensaje, 'exito');
  await cargarPagos();
  await cargarTiendas();
}

async function cargarTiendas() {
  const { data, error } = await supabase
    .from('admin_tiendas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    registrarError('admin/cargar-tiendas', error);
    notificar('No se pudieron cargar las tiendas.', 'error');
    return;
  }

  const tiendas = data ?? [];

  // Métricas
  $('m-total').textContent = tiendas.length;
  $('m-publicadas').textContent = tiendas.filter((t) => t.is_published).length;
  $('m-pro').textContent = tiendas.filter((t) => t.plan === 'pro').length;
  $('m-productos').textContent = tiendas.reduce((s, t) => s + Number(t.num_productos || 0), 0);

  $('admin-vacio').classList.toggle('hidden', tiendas.length > 0);

  const hoyD = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  // Botones de acción (iconos SVG consistentes)
  const SVG_RENOVAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  const SVG_PAUSA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" class="w-4 h-4"><path d="M8 4v16"/><path d="M16 4v16"/></svg>';
  const SVG_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M6 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5z"/></svg>';
  // Avatar con iniciales + color de marca determinista según el nombre
  const GRADIENTES = [
    'linear-gradient(135deg,#4f46e5,#2563eb)', 'linear-gradient(135deg,#0891b2,#06b6d4)',
    'linear-gradient(135deg,#7c3aed,#6366f1)', 'linear-gradient(135deg,#db2777,#f472b6)',
    'linear-gradient(135deg,#ea580c,#f59e0b)', 'linear-gradient(135deg,#059669,#10b981)',
    'linear-gradient(135deg,#0d9488,#2dd4bf)', 'linear-gradient(135deg,#4338ca,#818cf8)',
  ];
  const avatarDe = (nombre) => {
    const txt = (nombre || '?').trim();
    const iniciales = txt.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    let h = 0; for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) >>> 0;
    return { iniciales: escapar(iniciales), grad: GRADIENTES[h % GRADIENTES.length] };
  };
  const cuerpo = $('tabla-tiendas');
  cuerpo.innerHTML = tiendas
    .map((t) => {
      const url = urlDeTienda(t.slug);
      const planClase = ESTILO_PLAN[t.plan] ?? ESTILO_PLAN.free;
      const dePago = t.plan === 'pro' || t.plan === 'premium';
      const pu = t.paid_until ? new Date(t.paid_until + 'T00:00:00') : null;
      const vencido = dePago && pu && pu < hoyD;
      // Meses completos pagados por delante
      let meses = 0;
      if (pu) { meses = (pu.getFullYear() - hoyD.getFullYear()) * 12 + (pu.getMonth() - hoyD.getMonth()); if (pu.getDate() < hoyD.getDate()) meses--; }
      const badgeMeses = meses >= 1
        ? ` <span class="ml-1 inline-block px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">${meses} ${meses === 1 ? 'mes' : 'meses'}</span>` : '';
      const vence = !dePago
        ? '<span class="text-slate-300">Gratis</span>'
        : (pu
          ? `<span class="${vencido ? 'text-rose-600 font-semibold' : 'text-slate-700 font-medium'}">${pu.toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}</span>${badgeMeses}`
          : '<span class="text-slate-400">—</span>');
      const punto = (c) => `<span class="w-2 h-2 rounded-full ${c}"></span>`;
      let estado;
      if (t.is_paused) estado = `<span class="inline-flex items-center gap-1 text-amber-600 font-semibold">${punto('bg-amber-500')}Pausada</span>`;
      else if (t.vigente) estado = `<span class="inline-flex items-center gap-1 text-emerald-600 font-semibold">${punto('bg-emerald-500')}Activa</span>`;
      else estado = `<span class="inline-flex items-center gap-1 text-rose-600 font-semibold">${punto('bg-rose-500')}${dePago ? 'Vencida' : 'Prueba vencida'}</span>`;
      const av = avatarDe(t.name);
      const avatar = t.logo_url
        ? `<img src="${escapar(t.logo_url)}" alt="${escapar(t.name)}" loading="lazy" class="avatar-inicial object-cover" style="background:#fff;" onerror="this.outerHTML='<span class=\\'avatar-inicial\\' style=\\'background:${av.grad}\\'>${av.iniciales}</span>'" />`
        : `<span class="avatar-inicial" style="background:${av.grad};">${av.iniciales}</span>`;
      return `
        <tr class="fila-tienda border-b border-slate-50" data-tienda="${t.id}" data-nombre="${escapar(t.name)}" data-pausada="${t.is_paused ? '1' : '0'}">
          <td class="px-5 py-3.5">
            <div class="flex items-center gap-3">
              ${avatar}
              <div class="min-w-0">
                <p class="font-semibold text-slate-900 truncate">${escapar(t.name)}</p>
                <p class="text-xs text-slate-400 truncate">${escapar(t.slug)}.dgpgroupusa.com</p>
              </div>
            </div>
          </td>
          <td class="px-5 py-3.5">
            <p class="text-slate-700">${escapar(t.owner_name || '—')}</p>
            <p class="text-xs text-slate-400">${escapar(t.owner_email)}</p>
          </td>
          <td class="px-5 py-3.5"><span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase ${planClase}">${escapar(t.plan)}</span></td>
          <td class="px-5 py-3.5 text-center font-semibold text-slate-700">${t.num_productos}</td>
          <td class="px-5 py-3.5 text-xs">${vence}</td>
          <td class="px-5 py-3.5 text-xs font-medium">${estado}</td>
          <td class="px-5 py-3.5">
            <div class="flex justify-end">
              <div class="acciones-grupo">
                ${dePago ? `<button data-accion="renovar" title="Sumar un mes de pago" aria-label="Renovar" class="acc-btn hover:bg-emerald-100 hover:text-emerald-600">${SVG_RENOVAR}</button>` : ''}
                <button data-accion="pausar" title="${t.is_paused ? 'Reactivar tienda' : 'Pausar tienda'}" aria-label="${t.is_paused ? 'Reactivar' : 'Pausar'}" class="acc-btn hover:bg-amber-100 hover:text-amber-600">${t.is_paused ? SVG_PLAY : SVG_PAUSA}</button>
                <a href="${url}" target="_blank" rel="noopener" title="Ver tienda" aria-label="Ver" class="acc-btn hover:bg-blue-100 hover:text-blue-600">${icono('externo', 'w-4 h-4')}</a>
                <button data-accion="eliminar" title="Eliminar cuenta" aria-label="Eliminar" class="acc-btn hover:bg-rose-100 hover:text-rose-600">${icono('basura', 'w-4 h-4')}</button>
              </div>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  cuerpo.querySelectorAll('[data-accion="renovar"]').forEach((btn) => {
    const fila = btn.closest('[data-tienda]'); const id = fila.dataset.tienda;
    btn.addEventListener('click', async () => {
      if (!confirm('Sumar UN mes de pago a esta tienda.\nHaz clic varias veces para sumar varios meses.\n\n¿Continuar?')) return;
      const { error } = await supabase.rpc('renovar_suscripcion', { p_business_id: id });
      if (error) { registrarError('admin/renovar', error); return notificar('No se pudo renovar.', 'error'); }
      notificar('Se sumó un mes de suscripción.', 'exito');
      await cargarTiendas();
    });
  });

  cuerpo.querySelectorAll('[data-accion="pausar"]').forEach((btn) => {
    const fila = btn.closest('[data-tienda]'); const id = fila.dataset.tienda;
    const pausada = fila.dataset.pausada === '1';
    btn.addEventListener('click', async () => {
      const txt = pausada ? '¿Reactivar esta tienda?' : '¿Pausar esta tienda? Dejará de mostrarse al público hasta que la reactives.';
      if (!confirm(txt)) return;
      const { error } = await supabase.rpc('pausar_tienda', { p_business_id: id, p_pausar: !pausada });
      if (error) { registrarError('admin/pausar', error); return notificar('No se pudo cambiar el estado.', 'error'); }
      notificar(pausada ? 'Tienda reactivada.' : 'Tienda pausada.', 'exito');
      await cargarTiendas();
    });
  });

  cuerpo.querySelectorAll('[data-accion="eliminar"]').forEach((btn) => {
    const fila = btn.closest('[data-tienda]'); const id = fila.dataset.tienda; const nombre = fila.dataset.nombre;
    btn.addEventListener('click', async () => {
      if (!confirm(`Eliminar DEFINITIVAMENTE la cuenta "${nombre}".\n\nSe borran su tienda, productos, pedidos y datos. Esta acción no se puede deshacer.\n\n¿Continuar?`)) return;
      const { error } = await supabase.rpc('eliminar_cuenta', { p_business_id: id });
      if (error) { registrarError('admin/eliminar', error); return notificar('No se pudo eliminar la cuenta.', 'error'); }
      notificar('Cuenta eliminada.', 'exito');
      await cargarTiendas();
    });
  });
}

$('btn-logout').addEventListener('click', cerrarSesion);
