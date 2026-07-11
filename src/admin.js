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

  await cargarTiendas();
  mostrar('ok');
})();

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

  const cuerpo = $('tabla-tiendas');
  cuerpo.innerHTML = tiendas
    .map((t) => {
      const url = urlDeTienda(t.slug);
      const fecha = new Date(t.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
      const planClase = ESTILO_PLAN[t.plan] ?? ESTILO_PLAN.free;
      const estado = t.is_published
        ? '<span class="inline-flex items-center gap-1 text-emerald-600"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Publicada</span>'
        : '<span class="inline-flex items-center gap-1 text-slate-400"><span class="w-2 h-2 rounded-full bg-slate-300"></span>Borrador</span>';
      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/60">
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
          <td class="px-5 py-3 text-xs font-medium">${estado}</td>
          <td class="px-5 py-3 text-slate-500">${fecha}</td>
          <td class="px-5 py-3 text-right">
            <a href="${url}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold">
              ${icono('externo', 'w-3.5 h-3.5')} Ver
            </a>
          </td>
        </tr>`;
    })
    .join('');
}

$('btn-logout').addEventListener('click', cerrarSesion);
