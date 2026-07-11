// ============================================================
// DGP LinkShop — Tienda pública (storefront multi-tenant)
// Tema claro; el color del dueño es el acento. Multi-moneda (Bs).
//
// Rendimiento: se cargan TODOS los productos activos en una sola
// consulta (máx. 50) y el filtrado por categoría, la búsqueda y la
// paginación ocurren en el navegador → instantáneo y con mínimo
// consumo de datos. Imágenes con lazy loading.
// ============================================================
import { supabase } from './supabase-client.js';
import { obtenerSlugDeTienda } from './subdominio.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { guardarEnCache, leerDeCache } from './cache-local.js';
import { inicializarCarrito, agregarAlCarrito } from './carrito.js';
import { icono } from './iconos.js';
import { registrarError } from './notificaciones.js';

const POR_PAGINA = 12;
const $ = (id) => document.getElementById(id);
const usd = (n) => `$${Number(n).toFixed(2)}`;
const fmtBs = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 });

let negocio = null;
let colorPrimario = '#2563eb';
let tasaBs = null;
let todos = [];
let categorias = [];
let topVendidos = new Set(); // ids con badge "Más vendido"

let categoriaActual = 'all';
let busqueda = '';
let pagina = 0;

function mostrarEstado(cual) {
  $('estado-cargando').classList.add('hidden');
  $('estado-error').classList.toggle('hidden', cual !== 'error');
  $('estado-error').classList.toggle('flex', cual === 'error');
  $('estado-tienda').classList.toggle('hidden', cual !== 'tienda');
}

function escapar(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
function tinte(hex, a) {
  const h = (hex || '#2563eb').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const precioFinal = (p) => Math.round(p.price * (1 - (p.discount_percent ?? 0) / 100) * 100) / 100;

// ------------------------------------------------------------
// Datos
// ------------------------------------------------------------
async function obtenerNegocio(slug) {
  const clave = `dgp:tienda:${slug}`;
  const cacheado = leerDeCache(clave);
  if (cacheado) return cacheado;
  const { data, error } = await supabase.from('storefront').select('*').eq('slug', slug).maybeSingle();
  if (error) registrarError('tienda/cargar-negocio', error);
  if (!error && data) guardarEnCache(clave, data, 10);
  return data ?? null;
}

// ------------------------------------------------------------
// Tarjeta de producto
// ------------------------------------------------------------
function crearTarjeta(p, { compacta = false } = {}) {
  const final = precioFinal(p);
  const conDesc = (p.discount_percent ?? 0) > 0;
  const esTop = topVendidos.has(p.id);
  const bs = tasaBs ? ` · Bs ${fmtBs.format(final * tasaBs)}` : '';

  const art = document.createElement('article');
  art.className = compacta
    ? 'tarjeta-solida tarjeta-hover p-3 flex flex-col shrink-0 w-44 snap-start relative'
    : 'tarjeta-solida tarjeta-hover p-3 flex flex-col relative';
  art.innerHTML = `
    ${esTop ? `<span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 shadow-sm flex items-center gap-1">${icono('estrella', 'w-3 h-3')} Más vendido</span>`
      : (p.is_featured ? `<span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 shadow-sm flex items-center gap-1" style="color:${colorPrimario}">${icono('destello', 'w-3 h-3')} Destacado</span>` : '')}
    ${conDesc ? `<span class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${colorPrimario}">-${p.discount_percent}%</span>` : ''}
    <div class="aspect-square rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-300">
      ${p.image_url ? imgLazy(p.image_url, 'w_500,h_500,c_fill,q_auto,f_auto', escapar(p.name)) : icono('paquete', 'w-9 h-9')}
    </div>
    <h3 class="font-semibold text-slate-900 mt-3 text-sm leading-snug line-clamp-2">${escapar(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapar(p.description)}</p>` : ''}
    <div class="mt-auto pt-3 flex items-end justify-between gap-2">
      <div>
        ${conDesc ? `<p class="text-[11px] text-slate-400 line-through leading-none">${usd(p.price)}</p>` : ''}
        <p class="font-extrabold leading-tight" style="color:${colorPrimario}">${usd(final)}</p>
        ${tasaBs ? `<p class="text-[11px] text-slate-500 leading-tight">Bs ${fmtBs.format(final * tasaBs)}</p>` : ''}
      </div>
      <button data-add aria-label="Agregar ${escapar(p.name)}" class="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm transition hover:brightness-110 active:scale-95" style="background:${colorPrimario}">${icono('mas', 'w-4 h-4')}</button>
    </div>`;
  art.querySelector('[data-add]').addEventListener('click', () =>
    agregarAlCarrito({ id: p.id, nombre: p.name, precio: final })
  );
  return art;
}

// ------------------------------------------------------------
// Filtro + paginación (client-side)
// ------------------------------------------------------------
function filtrados() {
  let lista = todos;
  if (categoriaActual !== 'all') lista = lista.filter((p) => p.category_id === categoriaActual);
  const q = busqueda.trim().toLowerCase();
  if (q) lista = lista.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  return lista;
}

function render() {
  const filtrando = categoriaActual !== 'all' || busqueda.trim() !== '';
  $('seccion-vendidos').classList.toggle('hidden', filtrando || $('tienda-vendidos').children.length === 0);
  $('seccion-destacados').classList.toggle('hidden', filtrando || $('tienda-destacados').children.length === 0);
  $('titulo-catalogo').textContent = filtrando ? 'Resultados' : 'Catálogo';

  const lista = filtrados();
  const totalPag = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  if (pagina > totalPag - 1) pagina = totalPag - 1;
  if (pagina < 0) pagina = 0;
  const slice = lista.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);

  const grid = $('tienda-productos');
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const p of slice) frag.appendChild(crearTarjeta(p));
  grid.appendChild(frag);
  observarImagenesLazy(grid);

  $('tienda-sin-resultados').classList.toggle('hidden', lista.length > 0);

  const pag = $('paginacion');
  pag.classList.toggle('hidden', totalPag <= 1);
  pag.classList.toggle('flex', totalPag > 1);
  $('pag-info').textContent = `Página ${pagina + 1} de ${totalPag}`;
  $('pag-prev').disabled = pagina === 0;
  $('pag-next').disabled = pagina >= totalPag - 1;
}

// ------------------------------------------------------------
// Categorías (tabs)
// ------------------------------------------------------------
function renderTabsCategorias() {
  const cont = $('tienda-categorias');
  const tabs = [{ id: 'all', name: 'Todos' }, ...categorias];
  cont.innerHTML = tabs
    .map((c) => `<button data-cat="${c.id}" class="tab-cat shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition whitespace-nowrap">${escapar(c.name)}</button>`)
    .join('');
  cont.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      categoriaActual = b.dataset.cat;
      pagina = 0;
      pintarTabActiva();
      render();
    })
  );
  pintarTabActiva();
}

function pintarTabActiva() {
  document.querySelectorAll('#tienda-categorias [data-cat]').forEach((b) => {
    const activa = b.dataset.cat === categoriaActual;
    b.style.background = activa ? colorPrimario : '#fff';
    b.style.color = activa ? '#fff' : '#334155';
    b.style.borderColor = activa ? colorPrimario : '#e2e8f0';
  });
}

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
(async function iniciar() {
  const slug = obtenerSlugDeTienda();
  if (!slug) return mostrarEstado('error');

  negocio = await obtenerNegocio(slug);
  if (!negocio) return mostrarEstado('error');

  colorPrimario = negocio.theme?.color_primario ?? '#2563eb';
  tasaBs = negocio.tasa_bs ? Number(negocio.tasa_bs) : null;
  document.documentElement.style.setProperty('--tienda', colorPrimario);

  // Identidad
  document.title = `${negocio.name} — DGP LinkShop`;
  $('tienda-nombre').textContent = negocio.name;
  $('tienda-descripcion').textContent = negocio.description ?? '';
  $('ico-destacados').style.color = colorPrimario;
  $('tienda-banner').style.background =
    `linear-gradient(180deg, ${tinte(colorPrimario, 0.14)} 0%, ${tinte(colorPrimario, 0.04)} 55%, transparent 100%)`;

  if (tasaBs) {
    $('tienda-tasa').textContent = `${fmtBs.format(tasaBs)} Bs / $1`;
    $('tienda-tasa-barra').classList.remove('hidden');
  }
  if (negocio.logo_url) {
    $('tienda-logo').innerHTML = imgLazy(negocio.logo_url, 'w_240,h_240,c_fill,q_auto,f_auto', escapar(negocio.name));
    observarImagenesLazy($('tienda-logo'));
  }

  // Categorías (para los tabs)
  const { data: cats } = await supabase
    .from('categories').select('id, name').eq('business_id', negocio.id)
    .order('position', { ascending: true }).order('name', { ascending: true });
  categorias = cats ?? [];
  renderTabsCategorias();

  // Todos los productos activos (una sola consulta)
  const { data: prods, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url, is_featured, discount_percent, category_id, sold_count')
    .eq('business_id', negocio.id)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) registrarError('tienda/cargar-productos', error);
  todos = prods ?? [];

  // Top vendidos (badge): top 5 con ventas > 0
  const conVentas = todos.filter((p) => (p.sold_count ?? 0) > 0).sort((a, b) => b.sold_count - a.sold_count);
  topVendidos = new Set(conVentas.slice(0, 5).map((p) => p.id));

  // Fila "Más vendidos" (hasta 8)
  if (conVentas.length > 0) {
    const cont = $('tienda-vendidos');
    conVentas.slice(0, 8).forEach((p) => cont.appendChild(crearTarjeta(p, { compacta: true })));
    observarImagenesLazy(cont);
  }
  // Fila "Recomendados" (destacados)
  const destacados = todos.filter((p) => p.is_featured);
  if (destacados.length > 0) {
    const cont = $('tienda-destacados');
    destacados.slice(0, 10).forEach((p) => cont.appendChild(crearTarjeta(p, { compacta: true })));
    observarImagenesLazy(cont);
  }

  // Buscador
  let t = null;
  $('tienda-buscar').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { busqueda = e.target.value; pagina = 0; render(); }, 180);
  });
  // Paginación
  $('pag-prev').addEventListener('click', () => { pagina--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('pag-next').addEventListener('click', () => { pagina++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  inicializarCarrito(negocio);
  render();
  mostrarEstado('tienda');
})();
