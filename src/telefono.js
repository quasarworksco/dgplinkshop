// ============================================================
// DGP LinkShop — Normalización de WhatsApp
// Convierte lo que escriba el dueño a formato internacional (solo
// dígitos, sin "+"), que es lo que exige el link wa.me. Para Venezuela
// completa el código 58 automáticamente:
//   0412 100 2090  -> 584121002090
//   412-100-2090   -> 584121002090
//   +58 412 1002090-> 584121002090
// Otros países (ej. +1…) se respetan tal cual.
// ============================================================

/** Devuelve el número en formato internacional (solo dígitos) o '' si está vacío. */
export function normalizarWhatsapp(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);                 // 00 + país -> país
  if (d.length === 11 && d[0] === '0') d = '58' + d.slice(1); // 0XXXXXXXXXX (VE con 0)
  else if (d.length === 10 && d[0] === '4') d = '58' + d;     // 4XXXXXXXXX (VE sin 0)
  return d;
}

/** ¿El número (ya normalizado) sirve para wa.me? (código de país + número). */
export function whatsappValido(valor) {
  return /^\d{10,15}$/.test(normalizarWhatsapp(valor));
}
