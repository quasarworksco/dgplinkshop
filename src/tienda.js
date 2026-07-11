// ============================================================
// DGP LinkShop — Tienda pública (storefront multi-tenant)
// Tema claro profesional; el color de la tienda (elegido por el
// dueño) se usa como acento. En local: tienda.html?tienda=<slug>
//
// · Sección de productos recomendados (destacados).
// · Catálogo paginado (12 en 12) con scroll infinito.
// · Caché sessionStorage del negocio (TTL 10 min), lazy loading
//   de imágenes y render append-only con DocumentFragment.
// ============================================================
import { supabase } from './supabase-client.js';
import { obtenerSlugDeTienda } from './subdominio.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { guardarEnCache, leerDeCache } from './cache-local.js';
import { inicializarCarrito, agregarAlCarrito } from './carrito.js';
import { icono } from './iconos.js';
import { registrarError } from './notificaciones.js';

const PRODUCTOS_POR_PAGINA = 12;
const $ = (id) => document.getElementById(id);
const dinero = (n) => `$${Number(n).toFixed(2)}`;

let negocio = null;
let colorPrimario = '#2563eb';
let pagina = 0;
let cargando = false;
let finDeCatalogo = false;

function mostrarEstado(cual) {
  $('estado-cargando').classList.add('hidden');
  $('estado-error').classList.toggle('hidden', cual !== 'error');
  $('estado-error').classList.toggle('flex', cual === 'error');
  $('estado-tienda').classList.toggle('hidden', cual !== 'tienda');
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

/** Convierte #rrggbb a rgba(r,g,b,alpha) para tintes suaves */
function tinte(hex, alpha) {
  const h = (hex || '#2563eb').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Precio unitario final que ve el cliente (descuento del producto aplicado) */
function precioFinal(p) {
  return Math.round(p.price * (1 - (p.discount_percent ?? 0) / 100) * 100) / 100;
}

// ------------------------------------------------------------
// Datos del negocio: primero caché, luego Supabase
// ------------------------------------------------------------
async function obtenerNegocio(slug) {
  const clave = `dgp:tienda:${slug}`;
  const cacheado = leerDeCache(clave);
  if (cacheado) return cacheado;

  const { data, error } = await supabase
    .from('storefront')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) registrarError('tienda/cargar-negocio', error);
  if (!error && data) guardarEnCache(clave, data, 10);
  return data ?? null;
}

// ------------------------------------------------------------
// Tarjeta de producto (catálogo)
// ------------------------------------------------------------
function crearTarjeta(p, { destacada = false } = {}) {
  const final = precioFinal(p);
  const conDescuento = (p.discount_percent ?? 0) > 0;

  const tarjeta = document.createElement('article');
  tarjeta.className = destacada
    ? 'tarjeta-solida tarjeta-hover p-3 flex flex-col shrink-0 w-44 snap-start relative'
    : 'tarjeta-solida tarjeta-hover p-3 flex flex-col relative';
  tarjeta.innerHTML = `
    ${p.is_featured && !destacada ? `
      <span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 shadow-sm flex items-center gap-1" style="color:${colorPrimario}">
        ${icono('estrella', 'w-3 h-3')} Destacado
      </span>` : ''}
    ${conDescuento ? `
      <span class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${colorPrimario}">
        -${p.discount_percent}%
      </span>` : ''}
    <div class="aspect-square rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-300">
      ${p.image_url
        ? imgLazy(p.image_url, 'w_500,h_500,c_fill,q_auto,f_auto', escapar(p.name))
        : icono('paquete', 'w-9 h-9')}
    </div>
    <h3 class="font-semibold text-slate-900 mt-3 text-sm leading-snug line-clamp-2">${escapar(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapar(p.description)}</p>` : ''}
    <div class="mt-auto pt-3 flex items-end justify-between gap-2">
      <div>
        ${conDescuento ? `<p class="text-[11px] text-slate-400 line-through leading-none">${dinero(p.price)}</p>` : ''}
        <p class="font-extrabold leading-tight" style="color:${colorPrimario}">${dinero(final)}</p>
      </div>
      <button data-accion="agregar" aria-label="Agregar ${escapar(p.name)} al carrito"
        class="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm transition hover:brightness-110 active:scale-95" style="background:${colorPrimario}">
        ${icono('mas', 'w-4 h-4')}
      </button>`;
  tarjeta.querySelector('[data-accion="agregar"]').addEventListener('click', () =>
    agregarAlCarrito({ id: p.id, nombre: p.name, precio: final })
  );
  return tarjeta;
}

// ------------------------------------------------------------
// Productos recomendados (destacados)
// ------------------------------------------------------------
async function cargarDestacados() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url, is_featured, discount_percent')
    .eq('business_id', negocio.id)
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { registrarError('tienda/destacados', error); return; }
  if (!data || data.length === 0) return;

  const cont = $('tienda-destacados');
  const frag = document.createDocumentFragment();
  for (const p of data) frag.appendChild(crearTarjeta(p, { destacada: true }));
  cont.appendChild(frag);
  observarImagenesLazy(cont);
  $('tienda-destacados-seccion').classList.remove('hidden');
}

// ------------------------------------------------------------
// Catálogo paginado
// ------------------------------------------------------------
async function cargarPaginaDeProductos() {
  if (cargando || finDeCatalogo) return;
  cargando = true;

  const desde = pagina * PRODUCTOS_POR_PAGINA;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url, is_featured, discount_percent')
    .eq('business_id', negocio.id)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .range(desde, desde + PRODUCTOS_POR_PAGINA - 1);

  if (error) registrarError('tienda/cargar-productos', error);
  const lote = data ?? [];
  if (lote.length < PRODUCTOS_POR_PAGINA) finDeCatalogo = true;

  const fragmento = document.createDocumentFragment();
  for (const p of lote) fragmento.appendChild(crearTarjeta(p));
  $('tienda-productos').appendChild(fragmento);
  observarImagenesLazy($('tienda-productos'));

  if (pagina === 0 && lote.length === 0) $('tienda-sin-productos').classList.remove('hidden');
  $('sentinela-scroll').classList.toggle('hidden', finDeCatalogo);

  pagina += 1;
  cargando = false;
}

const observadorScroll = new IntersectionObserver(
  (entradas) => { if (entradas[0].isIntersecting) cargarPaginaDeProductos(); },
  { rootMargin: '400px' }
);

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
(async function iniciar() {
  const slug = obtenerSlugDeTienda();
  if (!slug) return mostrarEstado('error');

  negocio = await obtenerNegocio(slug);
  if (!negocio) return mostrarEstado('error');

  colorPrimario = negocio.theme?.color_primario ?? '#2563eb';
  document.documentElement.style.setProperty('--tienda', colorPrimario);

  // Identidad
  document.title = `${negocio.name} — DGP LinkShop`;
  $('tienda-nombre').textContent = negocio.name;
  $('tienda-descripcion').textContent = negocio.description ?? '';
  $('ico-destacados').style.color = colorPrimario;

  // Banner con tinte del color de la tienda
  $('tienda-banner').style.background =
    `linear-gradient(180deg, ${tinte(colorPrimario, 0.14)} 0%, ${tinte(colorPrimario, 0.04)} 55%, transparent 100%)`;

  if (negocio.logo_url) {
    $('tienda-logo').innerHTML = imgLazy(
      negocio.logo_url, 'w_240,h_240,c_fill,q_auto,f_auto', escapar(negocio.name)
    );
    observarImagenesLazy($('tienda-logo'));
  }

  inicializarCarrito(negocio);
  await cargarDestacados();
  await cargarPaginaDeProductos();
  observadorScroll.observe($('sentinela-scroll'));
  mostrarEstado('tienda');
})();
