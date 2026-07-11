// ============================================================
// DGP LinkShop — Notificaciones y registro de errores
// Estrategia de mantenimiento:
//  · Toda operación de red va dentro de try/catch.
//  · El error técnico se registra en consola con contexto
//    ([DGP][contexto]) para depurar en producción.
//  · El usuario SIEMPRE recibe feedback visual inmediato
//    (toast accesible con aria-live) — la web nunca se "congela"
//    en silencio.
// ============================================================
import { icono } from './iconos.js';

/** Log técnico estructurado (punto único para conectar Sentry/tabla de logs después) */
export function registrarError(contexto, error) {
  console.error(`[DGP][${contexto}]`, error?.message ?? error, error);
}

/** Toast autocontenido (funciona en tema claro u oscuro):
 *  tipo 'exito' | 'error' | 'info' */
export function notificar(mensaje, tipo = 'info') {
  const acentos = { exito: '#34d399', error: '#fb7185', info: '#93c5fd' };
  const iconos = { exito: 'check', error: 'alerta', info: 'destello' };

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = [
    'position:fixed', 'bottom:1.5rem', 'left:50%', 'transform:translateX(-50%)',
    'z-index:60', 'display:flex', 'align-items:center', 'gap:.5rem',
    'padding:.7rem 1.1rem', 'border-radius:9999px', 'font-size:.875rem',
    'color:#fff', 'background:rgba(15,23,42,0.94)',
    'box-shadow:0 10px 30px rgba(2,6,23,0.35)', 'max-width:90vw',
    'animation:subir .3s ease',
  ].join(';');
  toast.innerHTML = `<span style="color:${acentos[tipo]};display:inline-flex">${icono(iconos[tipo], 'w-4 h-4')}</span><span></span>`;
  toast.querySelector('span:last-child').textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

/**
 * Envuelve una operación asíncrona: registra el error técnico y
 * muestra un mensaje humano. Devuelve null si falló.
 *   const datos = await intentar(() => supabase..., {
 *     contexto: 'panel/cargar-pedidos',
 *     mensajeError: 'No se pudieron cargar los pedidos.',
 *   });
 */
export async function intentar(operacion, { contexto, mensajeError }) {
  try {
    return await operacion();
  } catch (error) {
    registrarError(contexto, error);
    notificar(mensajeError ?? 'Algo salió mal. Intenta de nuevo.', 'error');
    return null;
  }
}
