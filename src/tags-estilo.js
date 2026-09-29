// ============================================================
// DGP LinkShop — Estilo de etiquetas (tags): color + icono SVG
// Los tags se guardan como texto libre; aquí les damos identidad
// visual. Los conocidos tienen color e icono propios; los demás
// reciben un color estable (según su texto) y el icono genérico.
// ============================================================
import { icono } from './iconos.js';

// tag (en minúsculas) -> { ic: clave de iconos.js, color: hex }
const MAPA = {
  // --- Perfumería / aromas ---
  floral: { ic: 'flor', color: '#ec4899' },
  especiado: { ic: 'llama', color: '#f97316' },
  dulce: { ic: 'gota', color: '#db2777' },
  amaderado: { ic: 'arbol', color: '#b45309' },
  'cítrico': { ic: 'citrico', color: '#ca8a04' },
  citrico: { ic: 'citrico', color: '#ca8a04' },
  frutal: { ic: 'fruta', color: '#ef4444' },
  fresco: { ic: 'copo', color: '#06b6d4' },
  oriental: { ic: 'luna', color: '#7c3aed' },
  almizclado: { ic: 'destello', color: '#64748b' },
  vainilla: { ic: 'gota', color: '#d97706' },
  intenso: { ic: 'llama', color: '#dc2626' },
  suave: { ic: 'pluma', color: '#38bdf8' },
  'acuático': { ic: 'gota', color: '#3b82f6' },
  acuatico: { ic: 'gota', color: '#3b82f6' },
  amaderoso: { ic: 'arbol', color: '#b45309' },
  gourmand: { ic: 'gota', color: '#b45309' },
  // --- Comida ---
  salado: { ic: 'gota', color: '#0ea5e9' },
  picante: { ic: 'llama', color: '#dc2626' },
  vegano: { ic: 'hoja', color: '#22c55e' },
  saludable: { ic: 'hoja', color: '#16a34a' },
  'sin gluten': { ic: 'trigo', color: '#d97706' },
  artesanal: { ic: 'mano', color: '#b45309' },
  'hecho a mano': { ic: 'mano', color: '#b45309' },
  casero: { ic: 'hogar', color: '#f59e0b' },
  // --- Moda / general ---
  nuevo: { ic: 'destello', color: '#2563eb' },
  oferta: { ic: 'porcentaje', color: '#e11d48' },
  popular: { ic: 'estrella', color: '#f59e0b' },
  elegante: { ic: 'destello', color: '#475569' },
  casual: { ic: 'etiqueta', color: '#0d9488' },
  deportivo: { ic: 'llama', color: '#16a34a' },
  unisex: { ic: 'usuario', color: '#6366f1' },
  verano: { ic: 'sol', color: '#f59e0b' },
  invierno: { ic: 'copo', color: '#06b6d4' },
  premium: { ic: 'corona', color: '#d97706' },
  'a domicilio': { ic: 'camion', color: '#2563eb' },
  express: { ic: 'reloj', color: '#2563eb' },
  'edición limitada': { ic: 'estrella', color: '#7c3aed' },
  'edicion limitada': { ic: 'estrella', color: '#7c3aed' },
};

// Paleta estable para tags no mapeados (mismo texto → mismo color)
const PALETA = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626', '#4f46e5', '#ca8a04', '#0d9488'];

function hashTexto(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function escapar(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }

function tinte(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Devuelve { color, ic } para un tag. */
export function estiloTag(tag) {
  const clave = (tag || '').toLowerCase().trim();
  const m = MAPA[clave];
  if (m) return { color: m.color, ic: m.ic };
  return { color: PALETA[hashTexto(clave) % PALETA.length], ic: 'etiqueta' };
}

/**
 * HTML de un chip de etiqueta con su color e icono.
 * @param {string} tag
 * @param {{boton?: boolean, tam?: string}} opciones
 *   boton: si true, es <button data-tag> (para filtrar en la tienda).
 */
export function chipTag(tag, { boton = false } = {}) {
  const { color, ic } = estiloTag(tag);
  const t = escapar(tag);
  const clases = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap';
  const estilo = `background:${tinte(color, 0.12)};color:${color}`;
  const contenido = `${icono(ic, 'w-3 h-3')}${t}`;
  return boton
    ? `<button type="button" data-tag="${t}" class="${clases} transition hover:brightness-95" style="${estilo}">${contenido}</button>`
    : `<span class="${clases}" style="${estilo}">${contenido}</span>`;
}
