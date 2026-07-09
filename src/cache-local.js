// ============================================================
// DGP LinkShop — Caché ligera en el navegador (sessionStorage)
// Para datos que cambian poco (nombre, logo, colores de la
// tienda): evita repetir la misma consulta a Supabase en cada
// navegación dentro de la sesión del visitante.
// sessionStorage (y no localStorage) a propósito: se limpia al
// cerrar la pestaña, así un cambio del negocio nunca queda
// "pegado" más allá de la sesión + TTL.
// ============================================================

/** Guarda un valor con vencimiento (TTL en minutos). */
export function guardarEnCache(clave, valor, ttlMinutos = 10) {
  try {
    sessionStorage.setItem(
      clave,
      JSON.stringify({ v: valor, exp: Date.now() + ttlMinutos * 60_000 })
    );
  } catch {
    /* almacenamiento lleno o bloqueado: la app funciona igual, solo sin caché */
  }
}

/** Devuelve el valor cacheado o null si no existe o ya venció. */
export function leerDeCache(clave) {
  try {
    const crudo = sessionStorage.getItem(clave);
    if (!crudo) return null;
    const { v, exp } = JSON.parse(crudo);
    if (Date.now() > exp) {
      sessionStorage.removeItem(clave);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** Borra todas las entradas cuya clave empiece por el prefijo. */
export function invalidarCache(prefijo = 'dgp:') {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(prefijo))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* sin acceso al almacenamiento: nada que invalidar */
  }
}
