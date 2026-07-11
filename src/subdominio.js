// ============================================================
// DGP LinkShop — Resolución de tenant por subdominio
// negocio1.dgp-link.com → slug "negocio1"
// Ver docs/subdominios.md para el diagrama completo.
// ============================================================
import { ROOT_DOMAIN } from './config.js';

// Subdominios reservados que ningún cliente puede tomar como tienda.
// Incluye subdominios del sistema y los que ya usas en GoDaddy para
// otras páginas (su CNAME propio le gana al comodín, así que esos
// hosts nunca llegan a esta app; los reservamos para que nadie los
// registre como slug de tienda). La base de datos también los bloquea
// (tabla reserved_slugs, migración 005) como fuente de verdad.
const RESERVADOS = [
  // sistema
  'www', 'app', 'api', 'admin', 'panel', 'dashboard', 'mail', 'soporte', 'dgp',
  // subdominios ya usados en GoDaddy
  'novastore', 'orangeultrasound', 'bossafashion', 'cleaningroup', 'leidyluniow', 'pezdorado',
];

/** ¿El slug está reservado y no puede usarse como tienda? */
export function esSlugReservado(slug) {
  return RESERVADOS.includes((slug || '').toLowerCase());
}

/**
 * Devuelve el slug de la tienda según el hostname actual,
 * o null si estamos en la aplicación principal.
 * En localhost acepta el fallback ?tienda=<slug> para desarrollo.
 */
export function obtenerSlugDeTienda() {
  const host = window.location.hostname;

  // Desarrollo local: tienda.html?tienda=negocio1
  if (host === 'localhost' || host === '127.0.0.1') {
    return new URLSearchParams(window.location.search).get('tienda');
  }

  // ¿Es un subdominio de dgp-link.com?
  if (host.endsWith('.' + ROOT_DOMAIN)) {
    const slug = host.slice(0, -(ROOT_DOMAIN.length + 1));
    if (slug && !slug.includes('.') && !RESERVADOS.includes(slug)) {
      return slug;
    }
  }

  return null; // dominio raíz o subdominio del sistema → app principal
}

/** URL pública de una tienda bajo la marca DGP LinkShop */
export function urlDeTienda(slug) {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/** Normaliza un nombre de negocio a slug válido (minúsculas y guiones) */
export function normalizarSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
