// ============================================================
// DGP LinkShop — Panel del negocio: catálogo de productos
// CRUD con límite por plan (5 free / 50 pro). El límite REAL lo
// hace cumplir la base de datos (trigger enforce_product_limit);
// la UI solo lo refleja.
//
// Rendimiento:
//  · Render selectivo del DOM: cada producto tiene SU tarjeta
//    (Map id → elemento). Crear/editar/eliminar toca solo esa
//    tarjeta; el resto del catálogo nunca se re-renderiza.
//  · Imágenes con lazy loading (módulo lazy-imagenes.js).
//  · insert/update piden la fila resultante con .select() para
//    actualizar la UI sin re-consultar todo el catálogo.
// ============================================================
import { supabase } from './supabase-client.js';
import { requerirSesion, cerrarSesion } from './auth.js';
import { subirImagen, optimizada } from './cloudinary.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { urlDeTienda } from './subdominio.js';
import { PLANES } from './config.js';

const $ = (id) => document.getElementById(id);

let negocio = null;
let suscripcion = null;
let imagenSubidaUrl = null;

// Estado del catálogo: datos + su tarjeta en el DOM
const productos = new Map(); // id → fila de Supabase
const tarjetas = new Map();  // id → <article> en el DOM

// ------------------------------------------------------------
// Carga inicial
// ------------------------------------------------------------
(async function iniciar() {
  const usuario = await requerirSesion();
  if (!usuario) return;

  const { data: b } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', usuario.id)
    .maybeSingle();

  if (!b) {
    window.location.href = '/public/wizard.html';
    return;
  }
  negocio = b;

  const { data: s } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', negocio.id)
    .maybeSingle();
  suscripcion = s;

  renderEncabezado();
  await cargarCatalogo();
})();

function planActual() {
  return PLANES[suscripcion?.plan ?? 'free'];
}

function renderEncabezado() {
  $('panel-nombre').textContent = negocio.name;
  const url = urlDeTienda(negocio.slug);
  $('panel-url').textContent = url.replace('https://', '');
  $('panel-url').href = url;
  $('ver-tienda').href = url;
  $('panel-plan').textContent = planActual().nombre;
  $('panel-limite').textContent = planActual().limiteProductos;
  if (negocio.logo_url) {
    $('panel-logo').innerHTML =
      `<img src="${optimizada(negocio.logo_url, 'w_128,h_128,c_fill,q_auto,f_auto')}" alt="Logo" class="w-full h-full object-cover" />`;
  }
}

// ------------------------------------------------------------
// Catálogo: carga única + tarjetas individuales
// ------------------------------------------------------------
async function cargarCatalogo() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', negocio.id)
    .order('created_at', { ascending: false });
  if (error) return avisar('No se pudieron cargar los productos.');

  const fragmento = document.createDocumentFragment();
  for (const p of data ?? []) {
    productos.set(p.id, p);
    const tarjeta = crearTarjeta(p);
    tarjetas.set(p.id, tarjeta);
    fragmento.appendChild(tarjeta);
  }
  const lista = $('lista-productos');
  lista.appendChild(fragmento);
  observarImagenesLazy(lista);
  actualizarContadores();
}

function crearTarjeta(p) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'glass glass-hover p-4 flex flex-col';
  pintarTarjeta(tarjeta, p);
  return tarjeta;
}

/** Pinta (o repinta) UNA sola tarjeta — nunca el catálogo entero */
function pintarTarjeta(tarjeta, p) {
  tarjeta.innerHTML = `
    <div class="h-36 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center text-4xl">
      ${p.image_url ? imgLazy(p.image_url, 'w_500,h_300,c_fill,q_auto,f_auto', escapar(p.name)) : '📦'}
    </div>
    <h3 class="font-semibold mt-3 truncate">${escapar(p.name)}</h3>
    <p class="text-indigo-300 font-bold">$${Number(p.price).toFixed(2)}</p>
    <div class="flex gap-2 mt-3">
      <button data-accion="editar" class="glass glass-hover flex-1 py-1.5 rounded-full text-xs font-semibold">✏️ Editar</button>
      <button data-accion="eliminar" class="glass glass-hover flex-1 py-1.5 rounded-full text-xs font-semibold text-rose-300">🗑️ Eliminar</button>
    </div>`;
  tarjeta.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModal(p));
  tarjeta.querySelector('[data-accion="eliminar"]').addEventListener('click', () => eliminarProducto(p.id));
  observarImagenesLazy(tarjeta);
}

function actualizarContadores() {
  const total = productos.size;
  const limite = planActual().limiteProductos;
  $('panel-conteo').textContent = total;
  $('catalogo-vacio').classList.toggle('hidden', total > 0);

  const enLimite = total >= limite && suscripcion?.plan !== 'pro';
  $('aviso-limite').classList.toggle('hidden', !enLimite);
  $('aviso-limite').classList.toggle('flex', enLimite);
  $('btn-nuevo-producto').disabled = total >= limite;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// ------------------------------------------------------------
// Modal crear / editar
// ------------------------------------------------------------
function abrirModal(producto = null) {
  imagenSubidaUrl = producto?.image_url ?? null;
  $('modal-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  $('prod-id').value = producto?.id ?? '';
  $('prod-nombre').value = producto?.name ?? '';
  $('prod-precio').value = producto?.price ?? '';
  $('prod-descripcion').value = producto?.description ?? '';
  $('prod-imagen').value = '';
  $('modal-error').classList.add('hidden');
  $('modal-producto').classList.remove('hidden');
  $('modal-producto').classList.add('flex');
}

function cerrarModal() {
  $('modal-producto').classList.add('hidden');
  $('modal-producto').classList.remove('flex');
}

$('btn-nuevo-producto').addEventListener('click', () => abrirModal());
$('btn-cancelar').addEventListener('click', cerrarModal);
$('modal-producto').addEventListener('click', (e) => {
  if (e.target === $('modal-producto')) cerrarModal();
});

$('prod-imagen').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const barra = $('prod-progreso');
  barra.classList.remove('hidden');
  try {
    imagenSubidaUrl = await subirImagen(archivo, 'productos', (pct) => {
      barra.firstElementChild.style.width = pct + '%';
    });
  } catch (err) {
    errorModal(err.message);
    e.target.value = '';
  }
});

function errorModal(texto) {
  const el = $('modal-error');
  el.textContent = texto;
  el.classList.remove('hidden');
}

// ------------------------------------------------------------
// Guardar: actualiza SOLO la tarjeta afectada
// ------------------------------------------------------------
$('form-producto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('btn-guardar-producto');
  boton.disabled = true;

  const datos = {
    name: $('prod-nombre').value.trim(),
    price: Number($('prod-precio').value),
    description: $('prod-descripcion').value.trim() || null,
    image_url: imagenSubidaUrl,
  };
  const id = $('prod-id').value;

  // .select().single() devuelve la fila final → UI al día sin re-consultar todo
  const { data: fila, error } = id
    ? await supabase.from('products').update(datos).eq('id', id).select().single()
    : await supabase.from('products').insert({ ...datos, business_id: negocio.id }).select().single();

  boton.disabled = false;
  if (error) {
    // El trigger de límite lanza un mensaje que empieza con LIMITE_PRODUCTOS
    errorModal(
      error.message.includes('LIMITE_PRODUCTOS')
        ? `Tu plan ${planActual().nombre} permite máximo ${planActual().limiteProductos} productos. ¡Mejora a PRO para ampliar tu catálogo!`
        : 'No se pudo guardar: ' + error.message
    );
    return;
  }

  productos.set(fila.id, fila);
  if (tarjetas.has(fila.id)) {
    pintarTarjeta(tarjetas.get(fila.id), fila); // edición: repinta esa tarjeta
  } else {
    const tarjeta = crearTarjeta(fila); // creación: se antepone al grid
    tarjetas.set(fila.id, tarjeta);
    $('lista-productos').prepend(tarjeta);
  }
  actualizarContadores();
  cerrarModal();
});

// ------------------------------------------------------------
// Eliminar: quita SOLO el nodo de esa tarjeta
// ------------------------------------------------------------
async function eliminarProducto(id) {
  const producto = productos.get(id);
  if (!confirm(`¿Eliminar "${producto?.name}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return avisar('No se pudo eliminar el producto.');
  tarjetas.get(id)?.remove();
  tarjetas.delete(id);
  productos.delete(id);
  actualizarContadores();
}

// ------------------------------------------------------------
// Upgrade a PRO (placeholder hasta integrar pagos)
// ------------------------------------------------------------
$('btn-upgrade').addEventListener('click', () => {
  alert(
    'Plan PRO — $30 de inscripción + $20/mes.\n\n' +
      'Escríbenos por WhatsApp para activar tu plan; en cuanto confirmemos el pago, ' +
      'tu límite sube a 50 productos automáticamente.'
  );
});

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function avisar(texto) {
  const t = document.createElement('div');
  t.className = 'toast glass px-6 py-3 text-sm';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

$('btn-logout').addEventListener('click', cerrarSesion);
