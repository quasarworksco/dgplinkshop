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

  await cargarPagos();
  await cargarResenas();
  await cargarTiendas();
  mostrar('ok');
})();

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

  const hoy = new Date().toISOString().slice(0, 10);
  const cuerpo = $('tabla-tiendas');
  cuerpo.innerHTML = tiendas
    .map((t) => {
      const url = urlDeTienda(t.slug);
      const planClase = ESTILO_PLAN[t.plan] ?? ESTILO_PLAN.free;
      const dePago = t.plan === 'pro' || t.plan === 'premium';
      const vencido = dePago && t.paid_until && t.paid_until < hoy;
      const vence = dePago
        ? (t.paid_until ? `<span class="${vencido ? 'text-rose-600 font-semibold' : 'text-slate-500'}">${new Date(t.paid_until).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>` : '<span class="text-slate-400">—</span>')
        : '<span class="text-slate-300">Gratis</span>';
      const estado = t.is_published
        ? '<span class="inline-flex items-center gap-1 text-emerald-600"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Publicada</span>'
        : '<span class="inline-flex items-center gap-1 text-slate-400"><span class="w-2 h-2 rounded-full bg-slate-300"></span>Borrador</span>';
      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/60" data-tienda="${t.id}">
          <td class="px-5 py-3">
            <p class="font-semibold text-slate-900">${escapar(t.name)}</p>
            <p class="text-xs text-slate-400">${escapar(t.slug)}.dgpgroupusa.com</p>
          </td>
          <td class="px-5 py-3">
            <p class="text-slate-700">${escapar(t.owner_name || '—')}</p>
            <p class="text-xs text-slate-400">${escapar(t.owner_email)}</p>
          </td>
          <td class="px-5 py-3"><span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase ${planClase}">${escapar(t.plan)}</span></td>
          <td class="px-5 py-3 text-center font-semibold text-slate-700">${t.num_productos}</td>
          <td class="px-5 py-3 text-xs">${vence}</td>
          <td class="px-5 py-3 text-xs font-medium">${estado}</td>
          <td class="px-5 py-3 text-right whitespace-nowrap">
            ${dePago ? `<button data-accion="renovar" class="text-emerald-600 hover:text-emerald-700 text-xs font-semibold mr-3">Renovar</button>` : ''}
            <a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold">
              ${icono('externo', 'w-3.5 h-3.5')} Ver
            </a>
          </td>
        </tr>`;
    })
    .join('');

  cuerpo.querySelectorAll('[data-accion="renovar"]').forEach((btn) => {
    const id = btn.closest('[data-tienda]').dataset.tienda;
    btn.addEventListener('click', async () => {
      if (!confirm('¿Renovar la suscripción de esta tienda hasta el próximo día 5?')) return;
      const { error } = await supabase.rpc('renovar_suscripcion', { p_business_id: id });
      if (error) { registrarError('admin/renovar', error); return notificar('No se pudo renovar.', 'error'); }
      notificar('Suscripción renovada.', 'exito');
      await cargarTiendas();
    });
  });
}

$('btn-logout').addEventListener('click', cerrarSesion);
