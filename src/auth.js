// ============================================================
// DGP LinkShop — Autenticación (registro, login, sesión)
// ============================================================
import { supabase } from './supabase-client.js';
import { invalidarCache } from './cache-local.js';

/** Registro con email + contraseña. Los datos extra van a los metadatos
 *  de la cuenta; el trigger handle_new_user crea el perfil. */
export async function registrar({ email, password, nombre, apellido, tienda, cedulaRif, telefono }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: nombre,
        last_name: apellido || null,
        store_name: tienda || null,
        cedula_rif: cedulaRif || null,
        phone: telefono || null,
      },
    },
  });
  if (error) throw traducirError(error);
  return data;
}

export async function iniciarSesion({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw traducirError(error);
  return data;
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  invalidarCache(); // limpia la caché de sesión (datos de tienda, etc.)
  window.location.href = '/public/index.html';
}

/** Devuelve el usuario actual o null */
export async function usuarioActual() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Protege páginas privadas (panel, wizard): si no hay sesión,
 * redirige a acceso.html. Devuelve el usuario si existe.
 */
export async function requerirSesion() {
  const user = await usuarioActual();
  if (!user) {
    window.location.href = '/public/acceso.html';
    return null;
  }
  return user;
}

/** Envía el correo con el enlace para restablecer la contraseña */
export async function enviarRecuperacion(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/public/recuperar.html`,
  });
  if (error) throw traducirError(error);
}

/** Fija la nueva contraseña (usando la sesión de recuperación del enlace) */
export async function actualizarContrasena(nueva) {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) throw traducirError(error);
}

/** Mensajes de error amigables en español */
function traducirError(error) {
  const mapa = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'User already registered': 'Este correo ya tiene una cuenta. Inicia sesión.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja).',
  };
  return new Error(mapa[error.message] ?? error.message);
}
