// ============================================================
// DGP LinkShop — Carrito de compras dinámico
// · Botón flotante + panel modal Glassmorphism, sin recargas.
// · Sumar/restar/eliminar con actualización SELECTIVA del DOM:
//   cada línea tiene su propio nodo; solo se toca lo que cambia.
// · Cupones: validación en vivo vía RPC validar_cupon; el total
//   definitivo SIEMPRE lo recalcula el servidor en crear_pedido.
// · Sin pagos internos: al confirmar, se registra el pedido en
//   Supabase y se redirige a WhatsApp con el detalle estructurado.
// · Persistencia en sessionStorage por tienda.
// ============================================================
import { supabase } from './supabase-client.js';
import { icono } from './iconos.js';
import { notificar, registrarError } from './notificaciones.js';

let negocio = null;
let colorPrimario = '#818cf8';
let items = new Map();   // productoId → {id, nombre, precio, cantidad}
let cupon = null;        // {codigo, tipo, valor} validado por el servidor
const filas = new Map(); // productoId → nodo <li> en el panel

const claveAlmacen = () => `dgp:carrito:${negocio.slug}`;
const dinero = (n) => `$${Number(n).toFixed(2)}`;

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------
export function inicializarCarrito(negocioActual) {
  negocio = negocioActual;
  colorPrimario = negocio.theme?.color_primario ?? '#818cf8';
  restaurar();
  inyectarUI();
  actualizarBurbuja();
}

/** precio = precio unitario FINAL mostrado (con descuento del producto) */
export function agregarAlCarrito({ id, nombre, precio }) {
  const existente = items.get(id);
  if (existente) {
    existente.cantidad = Math.min(existente.cantidad + 1, 99);
  } else {
    items.set(id, { id, nombre, precio, cantidad: 1 });
  }
  persistir();
  actualizarBurbuja();
  sincronizarFila(id);
  actualizarTotales();
  notificar(`"${nombre}" añadido al carrito.`, 'exito');
}

// ------------------------------------------------------------
// Persistencia por tienda (sobrevive navegación, muere con la pestaña)
// ------------------------------------------------------------
function persistir() {
  try {
    sessionStorage.setItem(claveAlmacen(), JSON.stringify([...items.values()]));
  } catch { /* sin almacenamiento: el carrito vive solo en memoria */ }
}

function restaurar() {
  try {
    const crudo = sessionStorage.getItem(claveAlmacen());
    if (crudo) items = new Map(JSON.parse(crudo).map((it) => [it.id, it]));
  } catch { items = new Map(); }
}

// ------------------------------------------------------------
// Construcción de la UI (una sola vez)
// ------------------------------------------------------------
function inyectarUI() {
  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <button id="carrito-burbuja" aria-label="Abrir carrito de compras"
      class="fixed bottom-6 right-6 z-30 btn-liquid flex items-center gap-2 shadow-2xl">
      ${icono('carrito', 'w-5 h-5')}
      <span id="carrito-conteo" class="min-w-6 h-6 px-1.5 rounded-full bg-white/25 text-xs font-bold flex items-center justify-center">0</span>
    </button>

    <div id="carrito-fondo" class="fixed inset-0 z-40 hidden bg-black/60 backdrop-blur-sm"></div>

    <aside id="carrito-panel" aria-label="Carrito de compras"
      class="fixed top-0 right-0 z-50 h-full w-full max-w-md glass rounded-none md:rounded-l-3xl flex flex-col translate-x-full transition-transform duration-300">
      <header class="flex items-center justify-between p-5 border-b border-white/10">
        <h2 class="font-bold text-lg flex items-center gap-2">${icono('carrito')} Tu pedido</h2>
        <button id="carrito-cerrar" aria-label="Cerrar carrito" class="glass glass-hover p-2 rounded-full">${icono('cerrar', 'w-4 h-4')}</button>
      </header>

      <ul id="carrito-lineas" class="flex-1 overflow-y-auto p-5 space-y-3"></ul>
      <p id="carrito-vacio" class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm p-5 hidden">
        ${icono('paquete', 'w-10 h-10 text-slate-500')} Tu carrito está vacío
      </p>

      <footer class="p-5 border-t border-white/10 space-y-4">
        <div class="flex gap-2">
          <input id="carrito-cupon" class="input-glass flex-1 uppercase text-sm" placeholder="¿Tienes un cupón?" maxlength="24" autocomplete="off" />
          <button id="carrito-aplicar" class="glass glass-hover px-4 rounded-xl text-sm font-semibold">Aplicar</button>
        </div>
        <p id="carrito-cupon-estado" class="text-xs h-4"></p>

        <input id="carrito-nombre" class="input-glass text-sm" placeholder="Tu nombre (opcional)" maxlength="60" autocomplete="name" />

        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between text-slate-300"><dt>Subtotal</dt><dd id="carrito-subtotal">$0.00</dd></div>
          <div id="carrito-fila-descuento" class="flex justify-between text-emerald-300 hidden"><dt>Descuento</dt><dd id="carrito-descuento">-$0.00</dd></div>
          <div class="flex justify-between font-bold text-base pt-1 border-t border-white/10"><dt>Total</dt><dd id="carrito-total">$0.00</dd></div>
        </dl>

        <button id="carrito-confirmar" class="btn-liquid w-full flex items-center justify-center gap-2 text-sm" disabled>
          ${icono('mensaje', 'w-5 h-5')} Confirmar pedido por WhatsApp
        </button>
        <p class="text-[11px] text-slate-500 text-center">No pagas aquí: coordinas el pago y la entrega directamente con la tienda.</p>
      </footer>
    </aside>`;
  document.body.appendChild(raiz);

  document.getElementById('carrito-burbuja').addEventListener('click', abrir);
  document.getElementById('carrito-cerrar').addEventListener('click', cerrar);
  document.getElementById('carrito-fondo').addEventListener('click', cerrar);
  document.getElementById('carrito-aplicar').addEventListener('click', aplicarCupon);
  document.getElementById('carrito-confirmar').addEventListener('click', confirmarPedido);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
}

function abrir() {
  for (const id of items.keys()) sincronizarFila(id);
  actualizarTotales();
  document.getElementById('carrito-fondo').classList.remove('hidden');
  requestAnimationFrame(() =>
    document.getElementById('carrito-panel').classList.remove('translate-x-full')
  );
}

function cerrar() {
  document.getElementById('carrito-panel').classList.add('translate-x-full');
  document.getElementById('carrito-fondo').classList.add('hidden');
}

// ------------------------------------------------------------
// Render selectivo: cada producto tiene SU <li>; nunca se
// reconstruye la lista completa.
// ------------------------------------------------------------
function sincronizarFila(id) {
  const item = items.get(id);
  const lista = document.getElementById('carrito-lineas');
  if (!lista) return;

  if (!item) {
    filas.get(id)?.remove();
    filas.delete(id);
    return;
  }

  let fila = filas.get(id);
  if (!fila) {
    fila = document.createElement('li');
    fila.className = 'glass p-3 flex items-center gap-3';
    fila.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate" data-campo="nombre"></p>
        <p class="text-xs text-slate-400" data-campo="unitario"></p>
      </div>
      <div class="flex items-center gap-1">
        <button data-accion="restar" aria-label="Restar uno" class="glass glass-hover w-7 h-7 rounded-full flex items-center justify-center">${icono('menos', 'w-3.5 h-3.5')}</button>
        <span data-campo="cantidad" class="w-7 text-center text-sm font-bold"></span>
        <button data-accion="sumar" aria-label="Sumar uno" class="glass glass-hover w-7 h-7 rounded-full flex items-center justify-center">${icono('mas', 'w-3.5 h-3.5')}</button>
      </div>
      <p data-campo="subtotal" class="w-16 text-right text-sm font-bold"></p>
      <button data-accion="quitar" aria-label="Quitar del carrito" class="text-rose-300 hover:text-rose-200 transition p-1">${icono('basura', 'w-4 h-4')}</button>`;
    fila.querySelector('[data-accion="sumar"]').addEventListener('click', () => cambiarCantidad(id, +1));
    fila.querySelector('[data-accion="restar"]').addEventListener('click', () => cambiarCantidad(id, -1));
    fila.querySelector('[data-accion="quitar"]').addEventListener('click', () => quitar(id));
    filas.set(id, fila);
    lista.appendChild(fila);
  }

  fila.querySelector('[data-campo="nombre"]').textContent = item.nombre;
  fila.querySelector('[data-campo="unitario"]').textContent = `${dinero(item.precio)} c/u`;
  fila.querySelector('[data-campo="cantidad"]').textContent = item.cantidad;
  fila.querySelector('[data-campo="subtotal"]').textContent = dinero(item.precio * item.cantidad);
}

function cambiarCantidad(id, delta) {
  const item = items.get(id);
  if (!item) return;
  item.cantidad = Math.max(1, Math.min(99, item.cantidad + delta));
  persistir();
  sincronizarFila(id);
  actualizarBurbuja();
  actualizarTotales();
}

function quitar(id) {
  items.delete(id);
  persistir();
  sincronizarFila(id);
  actualizarBurbuja();
  actualizarTotales();
}

function actualizarBurbuja() {
  const conteo = document.getElementById('carrito-conteo');
  if (conteo) {
    conteo.textContent = [...items.values()].reduce((s, it) => s + it.cantidad, 0);
  }
}

// ------------------------------------------------------------
// Totales (subtotal − descuento del cupón)
// ------------------------------------------------------------
function calcularTotales() {
  const subtotal = [...items.values()].reduce((s, it) => s + it.precio * it.cantidad, 0);
  let descuento = 0;
  if (cupon) {
    descuento = cupon.tipo === 'percent'
      ? subtotal * (cupon.valor / 100)
      : Math.min(cupon.valor, subtotal);
  }
  return { subtotal, descuento, total: Math.max(0, subtotal - descuento) };
}

function actualizarTotales() {
  const { subtotal, descuento, total } = calcularTotales();
  document.getElementById('carrito-subtotal').textContent = dinero(subtotal);
  document.getElementById('carrito-descuento').textContent = `-${dinero(descuento)}`;
  document.getElementById('carrito-fila-descuento').classList.toggle('hidden', descuento === 0);
  document.getElementById('carrito-total').textContent = dinero(total);
  document.getElementById('carrito-confirmar').disabled = items.size === 0;
  document.getElementById('carrito-vacio').classList.toggle('hidden', items.size > 0);
}

// ------------------------------------------------------------
// Cupones: validación en vivo contra el servidor
// ------------------------------------------------------------
async function aplicarCupon() {
  const input = document.getElementById('carrito-cupon');
  const estadoEl = document.getElementById('carrito-cupon-estado');
  const codigo = input.value.trim().toUpperCase();
  if (!codigo) return;

  estadoEl.textContent = 'Validando cupón…';
  estadoEl.className = 'text-xs h-4 text-slate-400';
  try {
    const { data, error } = await supabase.rpc('validar_cupon', {
      p_business_id: negocio.id,
      p_codigo: codigo,
    });
    if (error) throw error;

    if (data.valido) {
      cupon = { codigo: data.codigo, tipo: data.tipo, valor: Number(data.valor) };
      estadoEl.textContent = data.tipo === 'percent'
        ? `Cupón ${data.codigo} aplicado: −${data.valor}%`
        : `Cupón ${data.codigo} aplicado: −${dinero(data.valor)}`;
      estadoEl.className = 'text-xs h-4 text-emerald-400';
    } else {
      cupon = null;
      estadoEl.textContent = data.mensaje;
      estadoEl.className = 'text-xs h-4 text-rose-400';
    }
  } catch (err) {
    registrarError('carrito/validar-cupon', err);
    cupon = null;
    estadoEl.textContent = 'No se pudo validar el cupón. Intenta de nuevo.';
    estadoEl.className = 'text-xs h-4 text-rose-400';
  }
  actualizarTotales();
}

// ------------------------------------------------------------
// Confirmación: pedido en Supabase → mensaje → WhatsApp.
// El servidor recalcula precios y re-valida el cupón; el mensaje
// se construye con LO QUE DEVOLVIÓ el servidor, no con el estado
// local (así el WhatsApp siempre coincide con el pedido real).
// ------------------------------------------------------------
async function confirmarPedido() {
  if (!negocio.whatsapp) {
    notificar('Esta tienda aún no configuró su WhatsApp de pedidos.', 'error');
    return;
  }
  const boton = document.getElementById('carrito-confirmar');
  boton.disabled = true;

  try {
    const { data: pedido, error } = await supabase.rpc('crear_pedido', {
      p_business_id: negocio.id,
      p_items: [...items.values()].map((it) => ({ id: it.id, cantidad: it.cantidad })),
      p_codigo_cupon: cupon?.codigo ?? null,
      p_nombre_cliente: document.getElementById('carrito-nombre').value.trim() || null,
    });
    if (error) throw error;

    window.location.href =
      `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(construirMensaje(pedido))}`;

    // Pedido registrado: se limpia el carrito local
    items.clear();
    filas.forEach((f) => f.remove());
    filas.clear();
    cupon = null;
    persistir();
    actualizarBurbuja();
    actualizarTotales();
    cerrar();
  } catch (err) {
    registrarError('carrito/crear-pedido', err);
    const msg = err.message ?? '';
    if (msg.includes('CUPON_INVALIDO')) {
      cupon = null;
      actualizarTotales();
      notificar('El cupón dejó de ser válido. Se quitó de tu pedido: revisa el total.', 'error');
    } else if (msg.includes('PRODUCTO_NO_DISPONIBLE')) {
      notificar('Un producto del carrito ya no está disponible. Actualiza la página.', 'error');
    } else {
      notificar('No se pudo registrar el pedido. Revisa tu conexión e intenta de nuevo.', 'error');
    }
  } finally {
    boton.disabled = items.size === 0;
  }
}

function construirMensaje(pedido) {
  const nombre = document.getElementById('carrito-nombre').value.trim();
  const lineas = pedido.detalle
    .map((l) => `• ${l.cantidad} x ${l.nombre} — ${dinero(l.subtotal)}`)
    .join('\n');

  return [
    `*NUEVO PEDIDO #${pedido.numero}* — ${negocio.name}`,
    '––––––––––––––––––',
    lineas,
    '––––––––––––––––––',
    `Subtotal: ${dinero(pedido.subtotal)}`,
    pedido.descuento > 0 ? `Descuento (${pedido.cupon}): -${dinero(pedido.descuento)}` : null,
    `*TOTAL: ${dinero(pedido.total)}*`,
    nombre ? `Cliente: ${nombre}` : null,
    '',
    'Pedido enviado desde mi tienda DGP LinkShop',
  ].filter(Boolean).join('\n');
}
