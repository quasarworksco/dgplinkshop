// ============================================================
// DGP LinkShop — Carrito de compras dinámico (tema claro)
// · Botón flotante + panel deslizable, sin recargas.
// · Sumar/restar/eliminar con actualización selectiva del DOM.
// · Multi-moneda: total en USD y en Bs (si el dueño puso tasa).
// · Cupones validados contra el servidor (RPC validar_cupon).
// · Entrega: recoger / delivery local (con ubicación) / envío nacional.
// · Sin pagos internos: registra el pedido (RPC crear_pedido) y
//   redirige a WhatsApp con todo el detalle.
// El color de acento es el que eligió el dueño de la tienda.
// ============================================================
import { supabase } from './supabase-client.js';
import { icono } from './iconos.js';
import { notificar, registrarError } from './notificaciones.js';

let negocio = null;
let color = '#2563eb';
let tasaBs = null;
let items = new Map();
let cupon = null;
let entrega = 'recoger';         // 'recoger' | 'local' | 'nacional'
let ubicacion = null;            // {lat, lng}
const filas = new Map();

const claveAlmacen = () => `dgp:carrito:${negocio.slug}`;
const usd = (n) => `$${Number(n).toFixed(2)}`;
const fmtBs = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 });
const enBs = (n) => `Bs ${fmtBs.format(Number(n) * tasaBs)}`;

const ETIQUETA_ENTREGA = {
  recoger: 'Recoger en tienda',
  local: 'Delivery local',
  nacional: 'Envío nacional',
};

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------
export function inicializarCarrito(negocioActual) {
  negocio = negocioActual;
  color = negocio.theme?.color_primario ?? '#2563eb';
  tasaBs = negocio.tasa_bs ? Number(negocio.tasa_bs) : null;
  restaurar();
  inyectarUI();
  actualizarBurbuja();
}

export function agregarAlCarrito({ id, nombre, precio }) {
  const ex = items.get(id);
  if (ex) ex.cantidad = Math.min(ex.cantidad + 1, 99);
  else items.set(id, { id, nombre, precio, cantidad: 1 });
  persistir();
  actualizarBurbuja();
  sincronizarFila(id);
  actualizarTotales();
  notificar(`"${nombre}" añadido al carrito`, 'exito');
}

// ------------------------------------------------------------
// Persistencia
// ------------------------------------------------------------
function persistir() {
  try { sessionStorage.setItem(claveAlmacen(), JSON.stringify([...items.values()])); } catch {}
}
function restaurar() {
  try {
    const c = sessionStorage.getItem(claveAlmacen());
    if (c) items = new Map(JSON.parse(c).map((it) => [it.id, it]));
  } catch { items = new Map(); }
}

// ------------------------------------------------------------
// UI
// ------------------------------------------------------------
function inyectarUI() {
  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <button id="carrito-burbuja" aria-label="Abrir carrito"
      class="fixed bottom-6 right-6 z-30 flex items-center gap-2 pl-4 pr-3 py-3 rounded-full text-white shadow-lg transition hover:brightness-110 active:scale-95"
      style="background:${color}; box-shadow:0 10px 30px ${color}55">
      ${icono('carrito', 'w-5 h-5')}
      <span id="carrito-conteo" class="min-w-6 h-6 px-1.5 rounded-full bg-white/25 text-xs font-bold flex items-center justify-center">0</span>
    </button>

    <div id="carrito-fondo" class="fixed inset-0 z-40 hidden bg-slate-900/40 backdrop-blur-sm"></div>

    <aside id="carrito-panel" aria-label="Carrito"
      class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col translate-x-full transition-transform duration-300">
      <header class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 class="font-bold text-lg flex items-center gap-2" style="color:${color}">${icono('carrito', 'w-5 h-5')}<span class="text-slate-900">Tu pedido</span></h2>
        <button id="carrito-cerrar" aria-label="Cerrar" class="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">${icono('cerrar', 'w-4 h-4')}</button>
      </header>

      <ul id="carrito-lineas" class="flex-1 overflow-y-auto p-5 space-y-3"></ul>
      <div id="carrito-vacio" class="flex-1 flex-col items-center justify-center gap-3 text-slate-400 text-sm p-5 hidden">
        ${icono('paquete', 'w-12 h-12')}<p>Tu carrito está vacío</p>
      </div>

      <footer class="border-t border-slate-100 bg-slate-50/60 max-h-[62vh] overflow-y-auto">
        <div class="p-5 space-y-4">
          <!-- Cupón -->
          <div class="flex gap-2">
            <input id="carrito-cupon" class="campo flex-1 uppercase text-sm" placeholder="¿Tienes un cupón?" maxlength="24" autocomplete="off" />
            <button id="carrito-aplicar" class="btn btn-claro text-sm px-4">Aplicar</button>
          </div>
          <p id="carrito-cupon-estado" class="text-xs h-4 -mt-2"></p>

          <input id="carrito-nombre" class="campo text-sm" placeholder="Tu nombre (opcional)" maxlength="60" autocomplete="name" />

          <!-- Entrega -->
          <div>
            <p class="text-sm font-medium text-slate-700 mb-2">¿Cómo quieres recibir tu pedido?</p>
            <div id="carrito-entrega" class="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button type="button" data-entrega="recoger" class="opt-entrega py-2 rounded-lg border transition">Recoger</button>
              <button type="button" data-entrega="local" class="opt-entrega py-2 rounded-lg border transition">Delivery local</button>
              <button type="button" data-entrega="nacional" class="opt-entrega py-2 rounded-lg border transition">Envío nacional</button>
            </div>
            <div id="carrito-local" class="hidden mt-2">
              <button id="carrito-ubicacion" type="button" class="btn btn-claro w-full text-sm">${icono('externo', 'w-4 h-4')} Compartir mi ubicación</button>
              <p id="carrito-ubicacion-estado" class="text-xs text-slate-500 mt-1"></p>
            </div>
            <textarea id="carrito-direccion" class="campo text-sm mt-2 hidden" rows="2" maxlength="200" placeholder="Dirección de envío (ciudad, calle, referencias)"></textarea>
          </div>

          <!-- Totales -->
          <dl class="text-sm space-y-1.5 pt-1">
            <div class="flex justify-between text-slate-500"><dt>Subtotal</dt><dd id="carrito-subtotal">$0.00</dd></div>
            <div id="carrito-fila-descuento" class="flex justify-between text-emerald-600 hidden"><dt>Descuento</dt><dd id="carrito-descuento">-$0.00</dd></div>
            <div class="flex justify-between font-bold text-base text-slate-900 pt-1.5 border-t border-slate-200"><dt>Total</dt><dd id="carrito-total">$0.00</dd></div>
            <div id="carrito-fila-bs" class="flex justify-between text-slate-500 hidden"><dt>Total en Bs</dt><dd id="carrito-total-bs">Bs 0</dd></div>
          </dl>

          <div class="space-y-2">
            <button id="carrito-confirmar" class="btn w-full text-white text-sm" style="background:#25D366" disabled>
              ${icono('mensaje', 'w-5 h-5')} Finalizar compra por WhatsApp
            </button>
            <button id="carrito-seguir" class="btn btn-claro w-full text-sm">Seguir comprando</button>
          </div>
          <p class="text-[11px] text-slate-400 text-center">No pagas aquí: coordinas el pago y la entrega con la tienda.</p>
        </div>
      </footer>
    </aside>`;
  document.body.appendChild(raiz);

  document.getElementById('carrito-burbuja').addEventListener('click', abrir);
  document.getElementById('carrito-cerrar').addEventListener('click', cerrar);
  document.getElementById('carrito-seguir').addEventListener('click', cerrar);
  document.getElementById('carrito-fondo').addEventListener('click', cerrar);
  document.getElementById('carrito-aplicar').addEventListener('click', aplicarCupon);
  document.getElementById('carrito-confirmar').addEventListener('click', confirmarPedido);
  document.getElementById('carrito-ubicacion').addEventListener('click', pedirUbicacion);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  document.querySelectorAll('#carrito-entrega [data-entrega]').forEach((b) =>
    b.addEventListener('click', () => elegirEntrega(b.dataset.entrega))
  );
  elegirEntrega('recoger');
}

function abrir() {
  for (const id of items.keys()) sincronizarFila(id);
  actualizarTotales();
  document.getElementById('carrito-fondo').classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('carrito-panel').classList.remove('translate-x-full'));
}
function cerrar() {
  document.getElementById('carrito-panel').classList.add('translate-x-full');
  document.getElementById('carrito-fondo').classList.add('hidden');
}

// ------------------------------------------------------------
// Entrega
// ------------------------------------------------------------
function elegirEntrega(tipo) {
  entrega = tipo;
  document.querySelectorAll('#carrito-entrega [data-entrega]').forEach((b) => {
    const activa = b.dataset.entrega === tipo;
    b.style.background = activa ? color : '#fff';
    b.style.color = activa ? '#fff' : '#334155';
    b.style.borderColor = activa ? color : '#e2e8f0';
  });
  document.getElementById('carrito-local').classList.toggle('hidden', tipo !== 'local');
  document.getElementById('carrito-direccion').classList.toggle('hidden', tipo !== 'nacional');
}

function pedirUbicacion() {
  const estado = document.getElementById('carrito-ubicacion-estado');
  if (!navigator.geolocation) { estado.textContent = 'Tu navegador no permite compartir ubicación.'; return; }
  estado.textContent = 'Obteniendo ubicación…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      estado.textContent = '✓ Ubicación lista, se enviará con tu pedido.';
      estado.className = 'text-xs text-emerald-600 mt-1';
    },
    () => {
      ubicacion = null;
      estado.textContent = 'No se pudo obtener. Podrás enviarla por WhatsApp.';
      estado.className = 'text-xs text-amber-600 mt-1';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ------------------------------------------------------------
// Render selectivo por línea
// ------------------------------------------------------------
function sincronizarFila(id) {
  const item = items.get(id);
  const lista = document.getElementById('carrito-lineas');
  if (!lista) return;
  if (!item) { filas.get(id)?.remove(); filas.delete(id); return; }

  let fila = filas.get(id);
  if (!fila) {
    fila = document.createElement('li');
    fila.className = 'tarjeta-solida p-3 flex items-center gap-3';
    fila.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-slate-900 truncate" data-campo="nombre"></p>
        <p class="text-xs text-slate-400" data-campo="unitario"></p>
      </div>
      <div class="flex items-center gap-1">
        <button data-accion="restar" aria-label="Restar" class="w-7 h-7 rounded-full border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600">${icono('menos', 'w-3.5 h-3.5')}</button>
        <span data-campo="cantidad" class="w-7 text-center text-sm font-bold text-slate-900"></span>
        <button data-accion="sumar" aria-label="Sumar" class="w-7 h-7 rounded-full border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600">${icono('mas', 'w-3.5 h-3.5')}</button>
      </div>
      <p data-campo="subtotal" class="w-16 text-right text-sm font-bold text-slate-900"></p>
      <button data-accion="quitar" aria-label="Quitar" class="text-slate-300 hover:text-rose-500 transition p-1">${icono('basura', 'w-4 h-4')}</button>`;
    fila.querySelector('[data-accion="sumar"]').addEventListener('click', () => cambiarCantidad(id, +1));
    fila.querySelector('[data-accion="restar"]').addEventListener('click', () => cambiarCantidad(id, -1));
    fila.querySelector('[data-accion="quitar"]').addEventListener('click', () => quitar(id));
    filas.set(id, fila);
    lista.appendChild(fila);
  }
  fila.querySelector('[data-campo="nombre"]').textContent = item.nombre;
  fila.querySelector('[data-campo="unitario"]').textContent = `${usd(item.precio)} c/u`;
  fila.querySelector('[data-campo="cantidad"]').textContent = item.cantidad;
  fila.querySelector('[data-campo="subtotal"]').textContent = usd(item.precio * item.cantidad);
}

function cambiarCantidad(id, delta) {
  const item = items.get(id);
  if (!item) return;
  item.cantidad = Math.max(1, Math.min(99, item.cantidad + delta));
  persistir(); sincronizarFila(id); actualizarBurbuja(); actualizarTotales();
}
function quitar(id) { items.delete(id); persistir(); sincronizarFila(id); actualizarBurbuja(); actualizarTotales(); }
function actualizarBurbuja() {
  const c = document.getElementById('carrito-conteo');
  if (c) c.textContent = [...items.values()].reduce((s, it) => s + it.cantidad, 0);
}

// ------------------------------------------------------------
// Totales
// ------------------------------------------------------------
function calcularTotales() {
  const subtotal = [...items.values()].reduce((s, it) => s + it.precio * it.cantidad, 0);
  let descuento = 0;
  if (cupon) descuento = cupon.tipo === 'percent' ? subtotal * (cupon.valor / 100) : Math.min(cupon.valor, subtotal);
  return { subtotal, descuento, total: Math.max(0, subtotal - descuento) };
}
function actualizarTotales() {
  const { subtotal, descuento, total } = calcularTotales();
  const vacio = items.size === 0;
  document.getElementById('carrito-subtotal').textContent = usd(subtotal);
  document.getElementById('carrito-descuento').textContent = `-${usd(descuento)}`;
  document.getElementById('carrito-fila-descuento').classList.toggle('hidden', descuento === 0);
  document.getElementById('carrito-total').textContent = usd(total);
  const filaBs = document.getElementById('carrito-fila-bs');
  if (tasaBs) {
    filaBs.classList.remove('hidden');
    document.getElementById('carrito-total-bs').textContent = enBs(total);
  } else {
    filaBs.classList.add('hidden');
  }
  document.getElementById('carrito-confirmar').disabled = vacio;
  const v = document.getElementById('carrito-vacio');
  v.classList.toggle('hidden', !vacio);
  v.classList.toggle('flex', vacio);
}

// ------------------------------------------------------------
// Cupones
// ------------------------------------------------------------
async function aplicarCupon() {
  const input = document.getElementById('carrito-cupon');
  const el = document.getElementById('carrito-cupon-estado');
  const codigo = input.value.trim().toUpperCase();
  if (!codigo) return;
  el.textContent = 'Validando cupón…';
  el.className = 'text-xs h-4 -mt-2 text-slate-400';
  try {
    const { data, error } = await supabase.rpc('validar_cupon', { p_business_id: negocio.id, p_codigo: codigo });
    if (error) throw error;
    if (data.valido) {
      cupon = { codigo: data.codigo, tipo: data.tipo, valor: Number(data.valor) };
      el.textContent = data.tipo === 'percent' ? `Cupón ${data.codigo}: −${data.valor}%` : `Cupón ${data.codigo}: −${usd(data.valor)}`;
      el.className = 'text-xs h-4 -mt-2 text-emerald-600';
    } else {
      cupon = null; el.textContent = data.mensaje; el.className = 'text-xs h-4 -mt-2 text-rose-600';
    }
  } catch (err) {
    registrarError('carrito/validar-cupon', err);
    cupon = null; el.textContent = 'No se pudo validar el cupón.'; el.className = 'text-xs h-4 -mt-2 text-rose-600';
  }
  actualizarTotales();
}

// ------------------------------------------------------------
// Confirmación → pedido → WhatsApp
// ------------------------------------------------------------
async function confirmarPedido() {
  if (!negocio.whatsapp) { notificar('Esta tienda aún no configuró su WhatsApp.', 'error'); return; }
  const boton = document.getElementById('carrito-confirmar');
  boton.disabled = true;
  boton.innerHTML = `<span class="spinner"></span> Enviando…`;
  try {
    const { data: pedido, error } = await supabase.rpc('crear_pedido', {
      p_business_id: negocio.id,
      p_items: [...items.values()].map((it) => ({ id: it.id, cantidad: it.cantidad })),
      p_codigo_cupon: cupon?.codigo ?? null,
      p_nombre_cliente: document.getElementById('carrito-nombre').value.trim() || null,
    });
    if (error) throw error;

    window.location.href = `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(construirMensaje(pedido))}`;

    items.clear(); filas.forEach((f) => f.remove()); filas.clear();
    cupon = null; persistir(); actualizarBurbuja(); actualizarTotales(); cerrar();
  } catch (err) {
    registrarError('carrito/crear-pedido', err);
    const msg = err.message ?? '';
    if (msg.includes('CUPON_INVALIDO')) { cupon = null; actualizarTotales(); notificar('El cupón dejó de ser válido.', 'error'); }
    else if (msg.includes('PRODUCTO_NO_DISPONIBLE')) notificar('Un producto ya no está disponible. Actualiza la página.', 'error');
    else notificar('No se pudo registrar el pedido. Revisa tu conexión.', 'error');
  } finally {
    boton.disabled = items.size === 0;
    boton.innerHTML = `${icono('mensaje', 'w-5 h-5')} Finalizar compra por WhatsApp`;
  }
}

function construirMensaje(pedido) {
  const nombre = document.getElementById('carrito-nombre').value.trim();
  const direccion = document.getElementById('carrito-direccion').value.trim();
  const lineas = pedido.detalle.map((l) => `• ${l.cantidad} x ${l.nombre} — ${usd(l.subtotal)}`).join('\n');

  return [
    `*NUEVO PEDIDO #${pedido.numero}* — ${negocio.name}`,
    '––––––––––––––––––',
    lineas,
    '––––––––––––––––––',
    `Subtotal: ${usd(pedido.subtotal)}`,
    pedido.descuento > 0 ? `Descuento (${pedido.cupon}): -${usd(pedido.descuento)}` : null,
    `*TOTAL: ${usd(pedido.total)}*`,
    tasaBs ? `Total en Bs: ${enBs(pedido.total)} (tasa ${fmtBs.format(tasaBs)})` : null,
    '––––––––––––––––––',
    `Entrega: ${ETIQUETA_ENTREGA[entrega]}`,
    entrega === 'local' && ubicacion ? `Ubicación: https://maps.google.com/?q=${ubicacion.lat},${ubicacion.lng}` : null,
    entrega === 'nacional' && direccion ? `Dirección: ${direccion}` : null,
    nombre ? `Cliente: ${nombre}` : null,
    '',
    'Pedido enviado desde mi tienda DGP LinkShop',
  ].filter(Boolean).join('\n');
}
