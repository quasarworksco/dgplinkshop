// ============================================================
// DGP LinkShop — Tienda pública (storefront multi-tenant)
// Se sirve en <slug>.dgpgroupusa.com. En local: tienda.html?tienda=<slug>
//
// · Productos destacados primero, con insignia (estrella SVG).
// · Descuentos por producto: precio original tachado + precio final.
// · Carrito flotante (src/carrito.js) → pedido por WhatsApp.
// · Rendimiento: caché sessionStorage del negocio (TTL 10 min),
//   paginación de 12 en 12 con scroll infinito, lazy loading de
//   imágenes y render append-only con DocumentFragment.
// ============================================================
import { supabase } from './supabase-client.js';
import { obtenerSlugDeTienda } from './subdominio.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { guardarEnCache, leerDeCache } from './cache-local.js';
import { inicializarCarrito, agregarAlCarrito } from './carrito.js';
import { icono, hidratarIconos } from './iconos.js';
import { registrarError } from './notificaciones.js';

const PRODUCTOS_POR_PAGINA = 12;
const $ = (id) => document.getElementById(id);
const dinero = (n) => `$${Number(n).toFixed(2)}`;

let negocio = null;
let colorPrimario = '#818cf8';
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
// Catálogo paginado: destacados primero, luego el resto
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

  // Append-only: fragmento en memoria → una sola inserción al DOM
  const fragmento = document.createDocumentFragment();
  for (const p of lote) fragmento.appendChild(crearTarjeta(p));
  $('tienda-productos').appendChild(fragmento);
  observarImagenesLazy($('tienda-productos'));

  if (pagina === 0 && lote.length === 0) {
    $('tienda-sin-productos').classList.remove('hidden');
  }
  $('sentinela-scroll').classList.toggle('hidden', finDeCatalogo);

  pagina += 1;
  cargando = false;
}

function crearTarjeta(p) {
  const final = precioFinal(p);
  const conDescuento = (p.discount_percent ?? 0) > 0;

  const tarjeta = document.createElement('article');
  tarjeta.className = 'glass glass-hover p-3 flex flex-col relative';
  tarjeta.innerHTML = `
    ${p.is_featured ? `
      <span class="absolute top-2 left-2 z-10 glass px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-300 flex items-center gap-1">
        ${icono('estrella', 'w-3 h-3')} Destacado
      </span>` : ''}
    ${conDescuento ? `
      <span class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${colorPrimario}">
        -${p.discount_percent}%
      </span>` : ''}
    <div class="aspect-square rounded-xl overflow-hidden bg-white/5 flex items-center justify-center text-slate-400">
      ${p.image_url
        ? imgLazy(p.image_url, 'w_500,h_500,c_fill,q_auto,f_auto', escapar(p.name))
        : icono('paquete', 'w-10 h-10')}
    </div>
    <h3 class="font-semibold mt-3 text-sm leading-snug">${escapar(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapar(p.description)}</p>` : ''}
    <div class="mt-auto pt-2 flex items-end justify-between gap-2">
      <div>
        ${conDescuento ? `<p class="text-[11px] text-slate-500 line-through">${dinero(p.price)}</p>` : ''}
        <p class="font-bold" style="color:${colorPrimario}">${dinero(final)}</p>
      </div>
      <button data-accion="agregar" aria-label="Agregar ${escapar(p.name)} al carrito"
        class="glass glass-hover w-9 h-9 rounded-full flex items-center justify-center" style="color:${colorPrimario}">
        ${icono('mas', 'w-4 h-4')}
      </button>
    </div>`;

  tarjeta.querySelector('[data-accion="agregar"]').addEventListener('click', () =>
    agregarAlCarrito({ id: p.id, nombre: p.name, precio: final })
  );
  return tarjeta;
}

// Scroll infinito: cuando el centinela entra al viewport, pide otra página
const observadorScroll = new IntersectionObserver(
  (entradas) => {
    if (entradas[0].isIntersecting) cargarPaginaDeProductos();
  },
  { rootMargin: '400px' }
);

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
(async function iniciar() {
  hidratarIconos();

  const slug = obtenerSlugDeTienda();
  if (!slug) return mostrarEstado('error');

  negocio = await obtenerNegocio(slug);
  if (!negocio) return mostrarEstado('error');

  // Identidad de la tienda
  document.title = `${negocio.name} — DGP LinkShop`;
  $('tienda-nombre').textContent = negocio.name;
  $('tienda-descripcion').textContent = negocio.description ?? '';
  colorPrimario = negocio.theme?.color_primario ?? '#818cf8';
  document.documentElement.style.setProperty('--dgp-primario', colorPrimario);
  document.documentElement.style.setProperty('--dgp-acento', negocio.theme?.color_acento ?? '#22d3ee');

  if (negocio.logo_url) {
    $('tienda-logo').innerHTML = imgLazy(
      negocio.logo_url,
      'w_200,h_200,c_fill,q_auto,f_auto',
      escapar(negocio.name)
    );
    observarImagenesLazy($('tienda-logo'));
  }

  inicializarCarrito(negocio);
  await cargarPaginaDeProductos();
  observadorScroll.observe($('sentinela-scroll'));
  mostrarEstado('tienda');
})();
