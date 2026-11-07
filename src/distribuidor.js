// ============================================================
// DGP LinkShop — Panel de distribuidor (socio)
// Solo lectura: ve a SUS clientes (plan, estado, vencimiento),
// el historial de pagos y su comisión. El acceso lo controla
// es_distribuidor() + RLS (las vistas filtran por auth.uid()).
// ============================================================
import { supabase } from './supabase-client.js';
import { requerirSesion, cerrarSesion } from './auth.js';
import { registrarError, notificar } from './notificaciones.js';

const $ = (id) => document.getElementById(id);
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

function mostrar(cual) {
  $('estado-cargando').classList.add('hidden');
  $('estado-denegado').classList.toggle('hidden', cual !== 'denegado');
  $('estado-denegado').classList.toggle('flex', cual === 'denegado');
  $('estado-ok').classList.toggle('hidden', cual !== 'ok');
}
function escapar(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }

function avatarDe(nombre) {
  const txt = (nombre || '?').trim();
  const ini = txt.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return { ini: escapar(ini) };
}

(async function iniciar() {
  const usuario = await requerirSesion();
  if (!usuario) return;

  const { data: esDist, error } = await supabase.rpc('es_distribuidor');
  if (error) { registrarError('dist/verificar', error); return mostrar('denegado'); }
  if (!esDist) return mostrar('denegado');

  await cargarClientes();
  await cargarPagos();
  mostrar('ok');
})();

const hoyD = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

async function cargarClientes() {
  const { data, error } = await supabase
    .from('distribuidor_tiendas').select('*').order('created_at', { ascending: false });
  if (error) { registrarError('dist/clientes', error); notificar('No se pudieron cargar tus clientes.', 'error'); return; }
  const tiendas = data ?? [];

  $('m-clientes').textContent = tiendas.length;
  $('m-activos').textContent = tiendas.filter((t) => t.vigente && !t.is_paused).length;
  $('clientes-vacio').classList.toggle('hidden', tiendas.length > 0);

  const punto = (c) => `<span class="w-2 h-2 rounded-full ${c}"></span>`;
  $('tabla-clientes').innerHTML = tiendas.map((t) => {
    const av = avatarDe(t.name);
    const dePago = t.plan === 'pro' || t.plan === 'premium';
    const pu = t.paid_until ? new Date(t.paid_until + 'T00:00:00') : null;
    const vencido = dePago && pu && pu < hoyD;
    const vence = !dePago
      ? '<span class="text-slate-300">Gratis</span>'
      : (pu ? `<span class="${vencido ? 'text-rose-600 font-semibold' : 'text-slate-700 font-medium'}">${pu.toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}</span>` : '<span class="text-slate-400">—</span>');
    let estado;
    if (t.is_paused) estado = `<span class="inline-flex items-center gap-1 text-amber-600 font-semibold">${punto('bg-amber-500')}Pausada</span>`;
    else if (t.vigente) estado = `<span class="inline-flex items-center gap-1 text-emerald-600 font-semibold">${punto('bg-emerald-500')}Al día</span>`;
    else estado = `<span class="inline-flex items-center gap-1 text-rose-600 font-semibold">${punto('bg-rose-500')}${dePago ? 'Vencida' : 'Gratis'}</span>`;
    const avatar = t.logo_url
      ? `<img src="${escapar(t.logo_url)}" alt="" loading="lazy" class="avatar-inicial object-cover" style="background:#fff" onerror="this.outerHTML='<span class=\\'avatar-inicial\\'>${av.ini}</span>'" />`
      : `<span class="avatar-inicial">${av.ini}</span>`;
    return `
      <tr class="border-b border-slate-50 hover:bg-slate-50/60">
        <td class="px-5 py-3.5"><div class="flex items-center gap-3">${avatar}<div class="min-w-0"><p class="font-semibold text-slate-900 truncate">${escapar(t.name)}</p><p class="text-xs text-slate-400 truncate">${escapar(t.slug)}.dgpgroupusa.com</p></div></div></td>
        <td class="px-5 py-3.5"><p class="text-slate-700">${escapar(t.owner_name || '—')}</p><p class="text-xs text-slate-400">${escapar(t.owner_email)}</p></td>
        <td class="px-5 py-3.5"><span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase ${t.plan === 'free' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}">${escapar(t.plan)}</span></td>
        <td class="px-5 py-3.5 text-xs">${vence}</td>
        <td class="px-5 py-3.5 text-xs font-medium">${estado}</td>
      </tr>`;
  }).join('');
}

async function cargarPagos() {
  const { data, error } = await supabase
    .from('distribuidor_pagos').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) { registrarError('dist/pagos', error); return; }
  const pagos = data ?? [];

  const generado = pagos.filter((p) => p.status === 'confirmado').reduce((s, p) => s + Number(p.amount || 0), 0);
  const comision = pagos.filter((p) => p.status === 'confirmado').reduce((s, p) => s + Number(p.comision || 0), 0);
  $('m-generado').textContent = usd(generado);
  $('m-comision').textContent = usd(comision);
  $('pagos-vacio').classList.toggle('hidden', pagos.length > 0);

  const estadoBadge = (s) => {
    if (s === 'confirmado') return '<span class="inline-flex items-center gap-1 text-emerald-600 font-semibold"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Confirmado</span>';
    if (s === 'rechazado') return '<span class="inline-flex items-center gap-1 text-rose-600 font-semibold"><span class="w-2 h-2 rounded-full bg-rose-500"></span>Rechazado</span>';
    return '<span class="inline-flex items-center gap-1 text-amber-600 font-semibold"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Pendiente</span>';
  };

  $('tabla-pagos').innerHTML = pagos.map((p) => {
    const fecha = new Date(p.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
    const metodo = p.method === 'pagomovil' ? 'Pago Móvil' : (p.method === 'binance' ? 'Binance' : escapar(p.method || '—'));
    const comisionTxt = p.status === 'confirmado'
      ? `<span class="font-bold text-emerald-600">${usd(p.comision)}</span>`
      : `<span class="text-slate-300">${usd(p.comision)}</span>`;
    return `
      <tr class="border-b border-slate-50 hover:bg-slate-50/60">
        <td class="px-5 py-3 text-slate-500 whitespace-nowrap">${fecha}</td>
        <td class="px-5 py-3 font-semibold text-slate-900">${escapar(p.negocio)}</td>
        <td class="px-5 py-3"><span class="uppercase font-bold text-xs text-blue-700">${escapar(p.plan)}</span></td>
        <td class="px-5 py-3 font-semibold text-slate-800">${usd(p.amount)}</td>
        <td class="px-5 py-3 text-slate-600">${metodo}</td>
        <td class="px-5 py-3 text-xs">${estadoBadge(p.status)}</td>
        <td class="px-5 py-3 text-right">${comisionTxt}</td>
      </tr>`;
  }).join('');
}

$('btn-logout').addEventListener('click', cerrarSesion);
