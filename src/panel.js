// ============================================================
// DGP LinkShop — Panel de administración del negocio
// Pestañas: Catálogo (CRUD + destacados + descuentos),
// Pedidos (historial + cambio de estado) y Cupones (CRUD).
//
// Rendimiento: render selectivo del DOM en las tres secciones
// (Map id → nodo; crear/editar/eliminar toca solo su tarjeta).
// El límite de productos por plan lo hace cumplir la BD
// (trigger enforce_product_limit); la UI solo lo refleja.
// ============================================================
import { supabase } from './supabase-client.js';
import { requerirSesion, cerrarSesion } from './auth.js';
import { subirImagen, optimizada } from './cloudinary.js';
import { imgLazy, observarImagenesLazy } from './lazy-imagenes.js';
import { urlDeTienda } from './subdominio.js';
import { PLANES } from './config.js';
import { icono, hidratarIconos } from './iconos.js';
import { notificar, registrarError } from './notificaciones.js';

const $ = (id) => document.getElementById(id);
const dinero = (n) => `$${Number(n).toFixed(2)}`;

let negocio = null;
let suscripcion = null;
let imagenSubidaUrl = null;

// Estado por sección: datos + su nodo en el DOM
const productos = new Map();
const tarjetasProducto = new Map();
const tarjetasPedido = new Map();
const tarjetasCupon = new Map();
let pedidosCargados = false;
let cuponesCargados = false;

const ESTADOS_PEDIDO = {
  pendiente: { texto: 'Pendiente', clase: 'text-amber-600' },
  procesado: { texto: 'Procesado', clase: 'text-blue-600' },
  entregado: { texto: 'Entregado', clase: 'text-emerald-600' },
  cancelado: { texto: 'Cancelado', clase: 'text-rose-600' },
};

// ------------------------------------------------------------
// Carga inicial
// ------------------------------------------------------------
(async function iniciar() {
  hidratarIconos();

  const usuario = await requerirSesion();
  if (!usuario) return;

  const { data: b, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', usuario.id)
    .maybeSingle();

  if (error) {
    registrarError('panel/cargar-negocio', error);
    notificar('No se pudo cargar tu negocio. Recarga la página.', 'error');
    return;
  }
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
  activarPestanas();

  // Enlace al panel súper-admin, solo si esta cuenta lo es
  supabase.rpc('es_superadmin').then(({ data }) => {
    if (data) $('enlace-admin').classList.remove('hidden');
  });

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
// Pestañas (Catálogo / Pedidos / Cupones) con carga perezosa
// ------------------------------------------------------------
function activarPestanas() {
  const botones = document.querySelectorAll('[data-tab]');
  botones.forEach((btn) =>
    btn.addEventListener('click', async () => {
      botones.forEach((b) => b.classList.toggle('activa', b === btn));
      document.querySelectorAll('[data-seccion]').forEach((sec) =>
        sec.classList.toggle('hidden', sec.dataset.seccion !== btn.dataset.tab)
      );
      if (btn.dataset.tab === 'pedidos' && !pedidosCargados) await cargarPedidos();
      if (btn.dataset.tab === 'cupones' && !cuponesCargados) await cargarCupones();
    })
  );
  document.querySelector('[data-tab="catalogo"]').classList.add('activa');
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// ============================================================
// SECCIÓN 1: CATÁLOGO
// ============================================================
async function cargarCatalogo() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', negocio.id)
    .order('created_at', { ascending: false });
  if (error) {
    registrarError('panel/cargar-productos', error);
    return notificar('No se pudieron cargar los productos.', 'error');
  }

  const fragmento = document.createDocumentFragment();
  for (const p of data ?? []) {
    productos.set(p.id, p);
    const tarjeta = crearTarjetaProducto(p);
    tarjetasProducto.set(p.id, tarjeta);
    fragmento.appendChild(tarjeta);
  }
  const lista = $('lista-productos');
  lista.appendChild(fragmento);
  observarImagenesLazy(lista);
  actualizarContadores();
}

function crearTarjetaProducto(p) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-solida tarjeta-hover p-4 flex flex-col relative';
  pintarTarjetaProducto(tarjeta, p);
  return tarjeta;
}

/** Pinta (o repinta) UNA sola tarjeta — nunca el catálogo entero */
function pintarTarjetaProducto(tarjeta, p) {
  const conDescuento = (p.discount_percent ?? 0) > 0;
  tarjeta.innerHTML = `
    ${p.is_featured ? `
      <span class="absolute top-2 left-2 z-10 bg-white shadow-sm px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-600 flex items-center gap-1">
        ${icono('estrella', 'w-3 h-3')} Destacado
      </span>` : ''}
    ${conDescuento ? `
      <span class="absolute top-2 right-2 z-10 bg-white shadow-sm px-2 py-0.5 rounded-full text-[10px] font-bold text-blue-600 flex items-center gap-1">
        ${icono('porcentaje', 'w-3 h-3')} -${p.discount_percent}%
      </span>` : ''}
    <div class="h-36 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-300">
      ${p.image_url
        ? imgLazy(p.image_url, 'w_500,h_300,c_fill,q_auto,f_auto', escapar(p.name))
        : icono('paquete', 'w-9 h-9')}
    </div>
    <h3 class="font-semibold text-slate-900 mt-3 truncate">${escapar(p.name)}</h3>
    <p class="text-blue-600 font-bold">
      ${conDescuento ? `<span class="text-slate-400 line-through text-sm font-normal mr-1">${dinero(p.price)}</span>` : ''}
      ${dinero(p.price * (1 - (p.discount_percent ?? 0) / 100))}
    </p>
    <div class="flex gap-2 mt-3">
      <button data-accion="editar" class="btn btn-claro flex-1 py-1.5 text-xs">${icono('lapiz', 'w-3.5 h-3.5')} Editar</button>
      <button data-accion="eliminar" class="btn btn-claro flex-1 py-1.5 text-xs text-rose-600">${icono('basura', 'w-3.5 h-3.5')} Eliminar</button>
    </div>`;
  tarjeta.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalProducto(p));
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

// --- Modal de producto -------------------------------------
function abrirModalProducto(producto = null) {
  imagenSubidaUrl = producto?.image_url ?? null;
  $('modal-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  $('prod-id').value = producto?.id ?? '';
  $('prod-nombre').value = producto?.name ?? '';
  $('prod-precio').value = producto?.price ?? '';
  $('prod-descuento').value = producto?.discount_percent ?? 0;
  $('prod-destacado').checked = producto?.is_featured ?? false;
  $('prod-descripcion').value = producto?.description ?? '';
  $('prod-imagen').value = '';
  $('modal-error').classList.add('hidden');
  $('modal-producto').classList.remove('hidden');
  $('modal-producto').classList.add('flex');
}

function cerrarModalProducto() {
  $('modal-producto').classList.add('hidden');
  $('modal-producto').classList.remove('flex');
}

$('btn-nuevo-producto').addEventListener('click', () => abrirModalProducto());
$('btn-cancelar').addEventListener('click', cerrarModalProducto);
$('modal-producto').addEventListener('click', (e) => {
  if (e.target === $('modal-producto')) cerrarModalProducto();
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
    registrarError('panel/subir-imagen', err);
    errorModal('modal-error', err.message);
    e.target.value = '';
  }
});

function errorModal(idElemento, texto) {
  const el = $(idElemento);
  el.textContent = texto;
  el.classList.remove('hidden');
}

$('form-producto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('btn-guardar-producto');
  boton.disabled = true;

  const datos = {
    name: $('prod-nombre').value.trim(),
    price: Number($('prod-precio').value),
    discount_percent: Math.min(90, Math.max(0, Number($('prod-descuento').value) || 0)),
    is_featured: $('prod-destacado').checked,
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
    registrarError('panel/guardar-producto', error);
    errorModal(
      'modal-error',
      error.message.includes('LIMITE_PRODUCTOS')
        ? `Tu plan ${planActual().nombre} permite máximo ${planActual().limiteProductos} productos. ¡Mejora a PRO para ampliar tu catálogo!`
        : 'No se pudo guardar: ' + error.message
    );
    return;
  }

  productos.set(fila.id, fila);
  if (tarjetasProducto.has(fila.id)) {
    pintarTarjetaProducto(tarjetasProducto.get(fila.id), fila);
  } else {
    const tarjeta = crearTarjetaProducto(fila);
    tarjetasProducto.set(fila.id, tarjeta);
    $('lista-productos').prepend(tarjeta);
  }
  actualizarContadores();
  cerrarModalProducto();
  notificar('Producto guardado.', 'exito');
});

async function eliminarProducto(id) {
  const producto = productos.get(id);
  if (!confirm(`¿Eliminar "${producto?.name}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    registrarError('panel/eliminar-producto', error);
    return notificar('No se pudo eliminar el producto.', 'error');
  }
  tarjetasProducto.get(id)?.remove();
  tarjetasProducto.delete(id);
  productos.delete(id);
  actualizarContadores();
}

// ============================================================
// SECCIÓN 2: PEDIDOS (historial de ventas + estado interno)
// ============================================================
async function cargarPedidos() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('business_id', negocio.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    registrarError('panel/cargar-pedidos', error);
    return notificar('No se pudieron cargar los pedidos.', 'error');
  }
  pedidosCargados = true;

  const fragmento = document.createDocumentFragment();
  for (const pedido of data ?? []) {
    const tarjeta = crearTarjetaPedido(pedido);
    tarjetasPedido.set(pedido.id, tarjeta);
    fragmento.appendChild(tarjeta);
  }
  $('lista-pedidos').appendChild(fragmento);
  $('pedidos-vacio').classList.toggle('hidden', (data ?? []).length > 0);
}

function crearTarjetaPedido(pedido) {
  const fecha = new Date(pedido.created_at).toLocaleString('es', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const lineas = (pedido.items ?? [])
    .map((l) => `<li class="flex justify-between"><span>${l.cantidad} x ${escapar(l.nombre)}</span><span>${dinero(l.subtotal)}</span></li>`)
    .join('');

  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-solida p-5';
  tarjeta.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="font-bold text-slate-900">Pedido #${pedido.numero}
          ${pedido.customer_name ? `<span class="font-normal text-slate-500">· ${escapar(pedido.customer_name)}</span>` : ''}
        </p>
        <p class="text-xs text-slate-400 flex items-center gap-1">${icono('reloj', 'w-3 h-3')} ${fecha}</p>
      </div>
      <div class="flex items-center gap-3">
        <p class="font-bold text-lg text-slate-900">${dinero(pedido.total)}</p>
        <select data-campo="estado" class="campo text-xs py-1.5 px-3 w-auto font-semibold ${ESTADOS_PEDIDO[pedido.status]?.clase ?? ''}" aria-label="Estado del pedido #${pedido.numero}">
          ${Object.entries(ESTADOS_PEDIDO)
            .map(([valor, e]) => `<option value="${valor}" ${valor === pedido.status ? 'selected' : ''}>${e.texto}</option>`)
            .join('')}
        </select>
      </div>
    </div>
    <ul class="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 space-y-1">${lineas}</ul>
    ${pedido.coupon_code ? `<p class="text-xs text-emerald-600 mt-2 flex items-center gap-1">${icono('cupon', 'w-3 h-3')} Cupón ${pedido.coupon_code}: -${dinero(pedido.discount_total)}</p>` : ''}`;

  const selector = tarjeta.querySelector('[data-campo="estado"]');
  selector.addEventListener('change', async () => {
    const nuevo = selector.value;
    const { error } = await supabase.from('orders').update({ status: nuevo }).eq('id', pedido.id);
    if (error) {
      registrarError('panel/estado-pedido', error);
      selector.value = pedido.status;
      return notificar('No se pudo actualizar el estado.', 'error');
    }
    pedido.status = nuevo;
    selector.className = `campo text-xs py-1.5 px-3 w-auto font-semibold ${ESTADOS_PEDIDO[nuevo].clase}`;
    notificar(`Pedido #${pedido.numero} marcado como ${ESTADOS_PEDIDO[nuevo].texto.toLowerCase()}.`, 'exito');
  });
  return tarjeta;
}

// ============================================================
// SECCIÓN 3: CUPONES
// ============================================================
async function cargarCupones() {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('business_id', negocio.id)
    .order('created_at', { ascending: false });
  if (error) {
    registrarError('panel/cargar-cupones', error);
    return notificar('No se pudieron cargar los cupones.', 'error');
  }
  cuponesCargados = true;

  const fragmento = document.createDocumentFragment();
  for (const cupon of data ?? []) {
    const tarjeta = crearTarjetaCupon(cupon);
    tarjetasCupon.set(cupon.id, tarjeta);
    fragmento.appendChild(tarjeta);
  }
  $('lista-cupones').appendChild(fragmento);
  actualizarVacioCupones();
}

function actualizarVacioCupones() {
  $('cupones-vacio').classList.toggle('hidden', tarjetasCupon.size > 0);
}

function crearTarjetaCupon(cupon) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-solida p-5';
  pintarTarjetaCupon(tarjeta, cupon);
  return tarjeta;
}

function pintarTarjetaCupon(tarjeta, cupon) {
  const vencido = cupon.valid_until && new Date(cupon.valid_until) < new Date();
  const agotado = cupon.max_uses !== null && cupon.times_used >= cupon.max_uses;
  const estado = !cupon.is_active ? 'Inactivo' : vencido ? 'Vencido' : agotado ? 'Agotado' : 'Activo';
  const claseEstado = estado === 'Activo' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100';

  tarjeta.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="font-mono font-bold text-lg tracking-wider text-slate-900 flex items-center gap-2">${icono('cupon', 'w-4 h-4 text-blue-500')} ${cupon.code}</p>
        <p class="text-sm text-slate-500 mt-1">
          ${cupon.discount_type === 'percent' ? `${Number(cupon.discount_value)}% de descuento` : `${dinero(cupon.discount_value)} de descuento`}
        </p>
      </div>
      <span class="px-3 py-1 rounded-full text-xs font-bold ${claseEstado}">${estado}</span>
    </div>
    <div class="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 space-y-1">
      <p>Usos: ${cupon.times_used}${cupon.max_uses ? ` de ${cupon.max_uses}` : ' (ilimitado)'}</p>
      <p>Vence: ${cupon.valid_until ? new Date(cupon.valid_until).toLocaleDateString('es') : 'sin vencimiento'}</p>
    </div>
    <div class="flex gap-2 mt-4">
      <button data-accion="alternar" class="btn btn-claro flex-1 py-1.5 text-xs">
        ${cupon.is_active ? 'Desactivar' : 'Activar'}
      </button>
      <button data-accion="eliminar" class="btn btn-claro flex-1 py-1.5 text-xs text-rose-600">
        ${icono('basura', 'w-3.5 h-3.5')} Eliminar
      </button>
    </div>`;

  tarjeta.querySelector('[data-accion="alternar"]').addEventListener('click', async () => {
    const { data: fila, error } = await supabase
      .from('coupons')
      .update({ is_active: !cupon.is_active })
      .eq('id', cupon.id)
      .select()
      .single();
    if (error) {
      registrarError('panel/alternar-cupon', error);
      return notificar('No se pudo actualizar el cupón.', 'error');
    }
    pintarTarjetaCupon(tarjeta, fila);
  });

  tarjeta.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar el cupón ${cupon.code}?`)) return;
    const { error } = await supabase.from('coupons').delete().eq('id', cupon.id);
    if (error) {
      registrarError('panel/eliminar-cupon', error);
      return notificar('No se pudo eliminar el cupón.', 'error');
    }
    tarjeta.remove();
    tarjetasCupon.delete(cupon.id);
    actualizarVacioCupones();
  });
}

// --- Modal de cupón -----------------------------------------
$('btn-nuevo-cupon').addEventListener('click', () => {
  $('form-cupon').reset();
  $('cupon-error').classList.add('hidden');
  $('modal-cupon').classList.remove('hidden');
  $('modal-cupon').classList.add('flex');
});

function cerrarModalCupon() {
  $('modal-cupon').classList.add('hidden');
  $('modal-cupon').classList.remove('flex');
}

$('btn-cancelar-cupon').addEventListener('click', cerrarModalCupon);
$('modal-cupon').addEventListener('click', (e) => {
  if (e.target === $('modal-cupon')) cerrarModalCupon();
});

$('form-cupon').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('btn-guardar-cupon');
  boton.disabled = true;

  const vence = $('cupon-vence').value; // fin del día local elegido
  const datos = {
    business_id: negocio.id,
    code: $('cupon-codigo').value.trim().toUpperCase(),
    discount_type: $('cupon-tipo').value,
    discount_value: Number($('cupon-valor').value),
    valid_until: vence ? new Date(`${vence}T23:59:59`).toISOString() : null,
    max_uses: $('cupon-usos').value ? Number($('cupon-usos').value) : null,
  };

  const { data: fila, error } = await supabase.from('coupons').insert(datos).select().single();
  boton.disabled = false;
  if (error) {
    registrarError('panel/crear-cupon', error);
    errorModal(
      'cupon-error',
      error.code === '23505'
        ? 'Ya tienes un cupón con ese código.'
        : 'No se pudo crear el cupón: revisa el código (solo letras, números y guiones).'
    );
    return;
  }

  const tarjeta = crearTarjetaCupon(fila);
  tarjetasCupon.set(fila.id, tarjeta);
  $('lista-cupones').prepend(tarjeta);
  actualizarVacioCupones();
  cerrarModalCupon();
  notificar(`Cupón ${fila.code} creado.`, 'exito');
});

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

$('btn-logout').addEventListener('click', cerrarSesion);
