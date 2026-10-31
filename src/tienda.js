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
import { optimizada } from './cloudinary.js';
import { guardarEnCache, leerDeCache } from './cache-local.js';
import { inicializarCarrito, agregarAlCarrito } from './carrito.js';
import { icono } from './iconos.js';
import { chipTag } from './tags-estilo.js';
import { registrarError, notificar } from './notificaciones.js';

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
let modoMayorista = false;   // catálogo mayorista (?mayor=1)

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
const precioFinal = (p) =>
  modoMayorista
    ? Number(p.wholesale_price)
    : Math.round(p.price * (1 - (p.discount_percent ?? 0) / 100) * 100) / 100;

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
  const conDesc = !modoMayorista && (p.discount_percent ?? 0) > 0;
  const minMayor = modoMayorista ? Math.max(1, p.wholesale_min ?? 1) : 1;
  const esTop = !modoMayorista && topVendidos.has(p.id);
  const agotado = p.stock === 0;
  const disponibles = (p.stock != null && p.stock > 0)
    ? (p.stock <= 5 ? `¡Últimas ${p.stock}!` : `${p.stock} disponibles`)
    : null;

  const art = document.createElement('article');
  art.className = compacta
    ? 'tarjeta-solida tarjeta-hover p-3 flex flex-col shrink-0 w-44 snap-start relative'
    : 'tarjeta-solida tarjeta-hover p-3 flex flex-col relative';
  art.innerHTML = `
    ${esTop ? `<span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 shadow-sm flex items-center gap-1">${icono('estrella', 'w-3 h-3')} Más vendido</span>`
      : (p.is_featured ? `<span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 shadow-sm flex items-center gap-1" style="color:${colorPrimario}">${icono('destello', 'w-3 h-3')} Destacado</span>` : '')}
    ${conDesc ? `<span class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${colorPrimario}">-${p.discount_percent}%</span>` : ''}
    <div class="aspect-square rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-300 relative">
      ${p.image_url ? imgLazy(p.image_url, 'w_500,h_500,c_fill,q_auto,f_auto', escapar(p.name)) : icono('paquete', 'w-9 h-9')}
      ${agotado ? '<span class="absolute inset-0 bg-white/60 flex items-center justify-center text-xs font-bold text-slate-700">Agotado</span>' : ''}
    </div>
    <h3 class="font-semibold text-slate-900 mt-3 text-sm leading-snug line-clamp-2">${escapar(p.name)}</h3>
    ${p.description ? `<p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapar(p.description)}</p>` : ''}
    ${(!compacta && p.tags && p.tags.length) ? `<div class="flex flex-wrap gap-1 mt-2">${p.tags.slice(0, 4).map((t) => chipTag(t, { boton: true })).join('')}</div>` : ''}
    <div class="mt-auto pt-3 flex items-end justify-between gap-2">
      <div class="min-w-0">
        ${conDesc ? `<p class="text-[11px] text-slate-400 line-through leading-none truncate">${usd(p.price)}</p>` : ''}
        <p class="font-extrabold leading-tight truncate" style="color:${colorPrimario}">${usd(final)}</p>
        ${tasaBs ? `<p class="text-[11px] text-slate-500 leading-tight truncate">Bs ${fmtBs.format(final * tasaBs)}</p>` : ''}
        ${modoMayorista && minMayor > 1 ? `<p class="text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">Mín. ${minMayor} uds</p>` : ''}
        ${disponibles ? `<p class="text-[11px] font-semibold leading-tight mt-0.5 ${p.stock <= 5 ? 'text-amber-600' : 'text-slate-500'}">${disponibles}</p>` : ''}
      </div>
      <button data-add aria-label="Agregar ${escapar(p.name)}" ${agotado ? 'disabled' : ''} class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed" style="background:${colorPrimario}">${icono('mas', 'w-4 h-4')}</button>
    </div>`;
  if (!agotado) {
    art.querySelector('[data-add]').addEventListener('click', (e) => {
      e.stopPropagation();
      agregarAlCarrito({ id: p.id, nombre: p.name, precio: final, minimo: minMayor, max: p.stock ?? null });
    });
  }
  art.querySelectorAll('[data-tag]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); filtrarPorTag(b.dataset.tag); })
  );
  // Toda la tarjeta abre la vista rápida del producto
  art.classList.add('cursor-pointer');
  art.addEventListener('click', () => abrirQuickView(p));
  return art;
}

// ------------------------------------------------------------
// Vista rápida de producto (quick-view)
// ------------------------------------------------------------
let pvCantidad = 1;

function cerrarQuickView() {
  const ov = $('pv-overlay');
  ov.classList.remove('abierto');
  ov.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  // Limpia el parámetro ?producto de la URL sin recargar
  if (new URLSearchParams(location.search).has('producto')) {
    const u = new URL(location.href); u.searchParams.delete('producto');
    history.replaceState(null, '', u.pathname + u.search);
  }
}

async function compartirProducto(p) {
  const u = new URL(location.href);
  u.searchParams.set('producto', p.id);
  const url = u.origin + u.pathname + '?producto=' + p.id;
  const datos = { title: p.name, text: `${p.name} — ${negocio?.name ?? ''}`, url };
  try {
    if (navigator.share) { await navigator.share(datos); return; }
    await navigator.clipboard.writeText(url);
    notificar('Enlace del producto copiado', 'exito');
  } catch (_) { /* el usuario canceló */ }
}

function abrirQuickView(p) {
  const final = precioFinal(p);
  const conDesc = !modoMayorista && (p.discount_percent ?? 0) > 0;
  const minMayor = modoMayorista ? Math.max(1, p.wholesale_min ?? 1) : 1;
  const esTop = !modoMayorista && topVendidos.has(p.id);
  const agotado = p.stock === 0;
  const topeStock = p.stock != null ? p.stock : 99;
  pvCantidad = Math.max(1, minMayor);

  const insignia = esTop
    ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600">${icono('estrella', 'w-3.5 h-3.5')} Más vendido</span>`
    : (p.is_featured ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style="background:${tinte(colorPrimario, .12)};color:${colorPrimario}">${icono('destello', 'w-3.5 h-3.5')} Destacado</span>` : '');
  const disponibles = (p.stock != null && p.stock > 0)
    ? (p.stock <= 5 ? `<span class="text-amber-600 font-semibold">¡Solo quedan ${p.stock}!</span>` : `<span class="text-emerald-600 font-semibold">${p.stock} disponibles</span>`)
    : (p.stock === 0 ? '<span class="text-rose-600 font-semibold">Agotado</span>' : '');

  const img = p.image_url
    ? `<img src="${optimizada(p.image_url, 'w_900,h_900,c_fill,q_auto,f_auto')}" alt="${escapar(p.name)}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center text-slate-300">${icono('paquete', 'w-16 h-16')}</div>`;

  const panel = $('pv-panel');
  panel.innerHTML = `
    <button data-cerrar aria-label="Cerrar" class="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 transition">${icono('cerrar', 'w-5 h-5')}</button>
    <div class="overflow-y-auto">
      <div class="grid sm:grid-cols-2">
        <div class="relative aspect-square sm:aspect-auto sm:min-h-full bg-slate-100">
          ${img}
          ${conDesc ? `<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white" style="background:${colorPrimario}">-${p.discount_percent}%</span>` : ''}
          ${agotado ? '<span class="absolute inset-0 bg-white/55 flex items-center justify-center text-base font-bold text-slate-700">Agotado</span>' : ''}
        </div>
        <div class="p-5 sm:p-6 flex flex-col">
          ${insignia ? `<div class="mb-2">${insignia}</div>` : ''}
          <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">${escapar(p.name)}</h2>
          <div class="mt-2 flex items-baseline gap-2 flex-wrap">
            ${conDesc ? `<span class="text-sm text-slate-400 line-through">${usd(p.price)}</span>` : ''}
            <span class="text-2xl font-extrabold" style="color:${colorPrimario}">${usd(final)}</span>
          </div>
          ${tasaBs ? `<p class="text-sm text-slate-500 mt-0.5">Bs ${fmtBs.format(final * tasaBs)}</p>` : ''}
          ${modoMayorista && minMayor > 1 ? `<p class="text-xs font-semibold text-slate-500 mt-1">Compra mínima: ${minMayor} unidades</p>` : ''}
          ${disponibles ? `<p class="text-sm mt-2">${disponibles}</p>` : ''}
          ${p.description ? `<p class="text-sm text-slate-600 leading-relaxed mt-3 whitespace-pre-line">${escapar(p.description)}</p>` : ''}
          ${(p.tags && p.tags.length) ? `<div class="flex flex-wrap gap-1.5 mt-3">${p.tags.slice(0, 6).map((t) => chipTag(t)).join('')}</div>` : ''}

          <div class="mt-auto pt-5 flex items-center gap-3 flex-wrap">
            <div class="pv-stepper" ${agotado ? 'style="display:none"' : ''}>
              <button data-menos class="pv-step-btn" aria-label="Quitar uno">${icono('menos', 'w-4 h-4')}</button>
              <span data-cant class="min-w-[2.5rem] text-center font-bold text-slate-900">${pvCantidad}</span>
              <button data-mas class="pv-step-btn" aria-label="Agregar uno">${icono('mas', 'w-4 h-4')}</button>
            </div>
            <button data-agregar ${agotado ? 'disabled' : ''} class="btn btn-primario flex-1 min-w-[12rem] justify-center" style="background:${colorPrimario};box-shadow:none">
              ${icono('carrito', 'w-5 h-5')} ${agotado ? 'No disponible' : 'Agregar al carrito'}
            </button>
            <button data-compartir aria-label="Compartir producto" class="btn btn-claro w-11 h-11 !p-0 justify-center" title="Compartir">${icono('enviar', 'w-5 h-5')}</button>
          </div>
        </div>
      </div>
    </div>`;

  // Controles
  const elCant = panel.querySelector('[data-cant]');
  const btnMenos = panel.querySelector('[data-menos]');
  const btnMas = panel.querySelector('[data-mas]');
  const pintarStepper = () => {
    elCant.textContent = pvCantidad;
    if (btnMenos) btnMenos.disabled = pvCantidad <= Math.max(1, minMayor);
    if (btnMas) btnMas.disabled = pvCantidad >= topeStock;
  };
  pintarStepper();
  btnMenos?.addEventListener('click', () => { pvCantidad = Math.max(Math.max(1, minMayor), pvCantidad - 1); pintarStepper(); });
  btnMas?.addEventListener('click', () => { pvCantidad = Math.min(topeStock, pvCantidad + 1); pintarStepper(); });
  panel.querySelector('[data-cerrar]').addEventListener('click', cerrarQuickView);
  panel.querySelector('[data-compartir]').addEventListener('click', () => compartirProducto(p));
  if (!agotado) {
    panel.querySelector('[data-agregar]').addEventListener('click', () => {
      agregarAlCarrito({ id: p.id, nombre: p.name, precio: final, minimo: minMayor, max: p.stock ?? null, cantidad: pvCantidad });
      cerrarQuickView();
    });
  }

  const ov = $('pv-overlay');
  ov.classList.add('abierto');
  ov.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

// Buscar por una etiqueta al tocarla en una tarjeta
function filtrarPorTag(tag) {
  busqueda = tag;
  pagina = 0;
  const input = $('tienda-buscar');
  if (input) input.value = tag;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------
// Filtro + paginación (client-side)
// ------------------------------------------------------------
function filtrados() {
  let lista = todos;
  if (categoriaActual !== 'all') lista = lista.filter((p) => p.category_id === categoriaActual);
  const q = busqueda.trim().toLowerCase();
  if (q) lista = lista.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(q))
  );
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

  // Modo mayorista: solo si la tienda lo activó y viene ?mayor=1
  const pideMayor = new URLSearchParams(window.location.search).has('mayor');
  modoMayorista = pideMayor && negocio.wholesale_enabled === true;

  colorPrimario = negocio.theme?.color_primario ?? '#2563eb';
  tasaBs = negocio.tasa_bs ? Number(negocio.tasa_bs) : null;
  document.documentElement.style.setProperty('--tienda', colorPrimario);

  // Identidad
  document.title = `${negocio.name} — DGP LinkShop`;
  $('tienda-nombre').textContent = negocio.name;
  $('tienda-descripcion').textContent = negocio.description ?? '';
  $('ico-destacados').style.color = colorPrimario;

  // Portada opcional + tinte de la marca (texto siempre legible)
  if (negocio.cover_url) {
    $('tienda-cover').style.backgroundImage = `url('${optimizada(negocio.cover_url, 'w_1400,h_520,c_fill,q_auto,f_auto')}')`;
    $('tienda-overlay').style.background =
      `linear-gradient(180deg, ${tinte(colorPrimario, 0.22)} 0%, rgba(255,255,255,0.60) 46%, rgba(255,255,255,0.94) 100%)`;
  } else {
    $('tienda-overlay').style.background =
      `linear-gradient(180deg, ${tinte(colorPrimario, 0.16)} 0%, ${tinte(colorPrimario, 0.05)} 55%, transparent 100%)`;
  }

  // Pastilla de categoría del negocio
  const CAT_LABEL = { comida: 'Comida y postres', moda: 'Moda y accesorios', belleza: 'Belleza y perfumería', hogar: 'Hogar y decoración', servicios: 'Servicios', tecnologia: 'Tecnología', otro: 'Otro' };
  if (negocio.category) {
    const el = $('tienda-categoria');
    el.textContent = CAT_LABEL[negocio.category] || negocio.category;
    el.classList.remove('hidden');
  }

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
    .select('id, name, description, price, image_url, is_featured, discount_percent, category_id, sold_count, stock, wholesale_price, wholesale_min, tags')
    .eq('business_id', negocio.id)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) registrarError('tienda/cargar-productos', error);
  todos = prods ?? [];

  // Al mayor: solo productos con precio mayorista, y aviso visible.
  if (modoMayorista) {
    todos = todos.filter((p) => p.wholesale_price != null);
    $('tienda-mayor-aviso').classList.remove('hidden');
  }

  // Las filas "Más vendidos" y "Recomendados" no aplican al mayor.
  if (!modoMayorista) {
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

  inicializarCarrito(negocio, { mayorista: modoMayorista });

  // Vista rápida: cerrar al tocar el fondo o con Escape
  $('pv-fondo').addEventListener('click', cerrarQuickView);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('pv-overlay').classList.contains('abierto')) cerrarQuickView();
  });

  // Cuenta la visita (contador de la tienda), sin bloquear el render
  supabase.rpc('sumar_vista', { p_business_id: negocio.id }).then(() => {}, () => {});
  render();
  mostrarEstado('tienda');

  // Enlace profundo: ?producto=<id> abre su vista rápida directamente
  const idProducto = new URLSearchParams(location.search).get('producto');
  if (idProducto) {
    const p = todos.find((x) => x.id === idProducto);
    if (p) abrirQuickView(p);
  }
})();
