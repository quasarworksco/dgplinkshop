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

/** Toast Glassmorphism: tipo 'exito' | 'error' | 'info' */
export function notificar(mensaje, tipo = 'info') {
  const colores = {
    exito: 'text-emerald-300',
    error: 'text-rose-300',
    info: 'text-slate-200',
  };
  const iconos = { exito: 'check', error: 'alerta', info: 'destello' };

  const toast = document.createElement('div');
  toast.className = `toast glass px-5 py-3 text-sm flex items-center gap-2 ${colores[tipo]}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `${icono(iconos[tipo], 'w-4 h-4')}<span></span>`;
  toast.querySelector('span').textContent = mensaje;
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
