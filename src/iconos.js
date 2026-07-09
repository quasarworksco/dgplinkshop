// ============================================================
// DGP LinkShop — Iconografía SVG profesional (estilo Lucide)
// Regla de marca: PROHIBIDOS los emojis en toda la interfaz.
// Todos los iconos se generan aquí como SVG inline (stroke),
// heredan el color del texto (currentColor) y se dimensionan
// con clases Tailwind.
// ============================================================

const TRAZOS = {
  carrito:  '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  mas:      '<path d="M5 12h14"/><path d="M12 5v14"/>',
  menos:    '<path d="M5 12h14"/>',
  cerrar:   '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  basura:   '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  lapiz:    '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  estrella: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  paquete:  '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  tienda:   '<path d="M3 9 5 3h14l2 6"/><path d="M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 14v7h14v-7"/><path d="M9 21v-5h6v5"/>',
  ojo:      '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  check:    '<path d="M20 6 9 17l-5-5"/>',
  alerta:   '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  imagen:   '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  buscar:   '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  salir:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  cupon:    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>',
  mensaje:  '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  pedidos:  '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  enviar:   '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  izquierda:'<path d="m15 18-6-6 6-6"/>',
  derecha:  '<path d="m9 18 6-6-6-6"/>',
  destello: '<path d="M12 2 14 9l7 3-7 3-2 7-2-7-7-3 7-3Z"/>',
  porcentaje:'<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  externo:  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  subir:    '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  reloj:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  usuario:  '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

/**
 * Devuelve el SVG inline de un icono.
 * @param {keyof typeof TRAZOS} nombre
 * @param {string} clases - clases Tailwind de tamaño/estilo
 */
export function icono(nombre, clases = 'w-5 h-5') {
  const trazo = TRAZOS[nombre];
  if (!trazo) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${clases} inline-block shrink-0" aria-hidden="true">${trazo}</svg>`;
}

/** Inserta iconos en HTML estático: <span data-icono="carrito" data-clases="w-5 h-5"></span> */
export function hidratarIconos(raiz = document) {
  raiz.querySelectorAll('[data-icono]').forEach((el) => {
    el.innerHTML = icono(el.dataset.icono, el.dataset.clases ?? 'w-5 h-5');
  });
}
