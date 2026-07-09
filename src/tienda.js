// ============================================================
// DGP LinkShop — Tienda pública (storefront multi-tenant)
// Se sirve en <slug>.dgp-link.com. En local: tienda.html?tienda=<slug>
//
// Rendimiento (pensado para escalar a 50+ negocios activos):
//  · Datos del negocio cacheados en sessionStorage (TTL 10 min)
//    → 1 consulta a Supabase por visitante, no por página vista.
//  · Productos paginados de 12 en 12 con .range() + scroll
//    infinito → un plan PRO de 50 productos nunca baja todo
//    el catálogo de golpe.
//  · Imágenes con lazy loading (placeholder borroso de ~1 KB
//    de Cloudinary, imagen real solo al acercarse al viewport).
//  · Render append-only con DocumentFragment: cada página se
//    añade al grid sin re-renderizar lo ya pintado.
// ============================================================
import { supabase } from './supabase-client.js';
import { obtenerSlugDeTienda } from './subdominio.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { guardarEnCache, leerDeCache } from './cache-local.js';

const PRODUCTOS_POR_PAGINA = 12;
const $ = (id) => document.getElementById(id);

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

  if (!error && data) guardarEnCache(clave, data, 10);
  return data ?? null;
}

// ------------------------------------------------------------
// Catálogo paginado: página N → .range(desde, hasta)
// ------------------------------------------------------------
async function cargarPaginaDeProductos() {
  if (cargando || finDeCatalogo) return;
  cargando = true;

  const desde = pagina * PRODUCTOS_POR_PAGINA;
  const { data } = await supabase
    .from('products')
    .select('id, name, description, price, image_url')
    .eq('business_id', negocio.id)
    .eq('is_active', true)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .range(desde, desde + PRODUCTOS_POR_PAGINA - 1);

  const lote = data ?? [];
  if (lote.length < PRODUCTOS_POR_PAGINA) finDeCatalogo = true;

  // Append-only: fragmento en memoria → una sola inserción al DOM
  const fragmento = document.createDocumentFragment();
  for (const p of lote) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'glass glass-hover p-3 flex flex-col';
    tarjeta.innerHTML = `
      <div class="aspect-square rounded-xl overflow-hidden bg-white/5 flex items-center justify-center text-4xl">
        ${p.image_url ? imgLazy(p.image_url, 'w_500,h_500,c_fill,q_auto,f_auto', escapar(p.name)) : '📦'}
      </div>
      <h3 class="font-semibold mt-3 text-sm leading-snug">${escapar(p.name)}</h3>
      ${p.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapar(p.description)}</p>` : ''}
      <p class="mt-auto pt-2 font-bold" style="color:${colorPrimario}">$${Number(p.price).toFixed(2)}</p>`;
    fragmento.appendChild(tarjeta);
  }
  $('tienda-productos').appendChild(fragmento);
  observarImagenesLazy($('tienda-productos'));

  if (pagina === 0 && lote.length === 0) {
    $('tienda-sin-productos').classList.remove('hidden');
  }
  $('sentinela-scroll').classList.toggle('hidden', finDeCatalogo);

  pagina += 1;
  cargando = false;
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

  if (negocio.whatsapp) {
    const btn = $('tienda-whatsapp');
    btn.href = `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(
      `Hola ${negocio.name} 👋, vi tu tienda en DGP LinkShop y quiero hacer un pedido.`
    )}`;
    btn.classList.remove('hidden');
  }

  await cargarPaginaDeProductos();
  observadorScroll.observe($('sentinela-scroll'));
  mostrarEstado('tienda');
})();
