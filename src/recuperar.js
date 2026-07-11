// ============================================================
// DGP LinkShop — Restablecer contraseña
// Se llega aquí desde el enlace del correo. Supabase detecta el
// token en la URL y abre una sesión temporal de recuperación
// (evento PASSWORD_RECOVERY). Con esa sesión se fija la nueva clave.
// ============================================================
import { supabase } from './supabase-client.js';
import { actualizarContrasena } from './auth.js';

const $ = (id) => document.getElementById(id);
let habilitado = false;

function mostrarFormulario() {
  if (habilitado) return;
  habilitado = true;
  $('rec-cargando').classList.add('hidden');
  $('rec-invalido').classList.add('hidden');
  $('rec-form').classList.remove('hidden');
}
function mostrarInvalido() {
  if (habilitado) return;
  $('rec-cargando').classList.add('hidden');
  $('rec-invalido').classList.remove('hidden');
}

// Supabase emite PASSWORD_RECOVERY al procesar el enlace
supabase.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'PASSWORD_RECOVERY' || sesion) mostrarFormulario();
});

// Respaldo: revisa si ya hay sesión (el enlace pudo procesarse antes)
(async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session) return mostrarFormulario();
  setTimeout(async () => {
    const { data: d2 } = await supabase.auth.getSession();
    if (d2.session) mostrarFormulario();
    else mostrarInvalido();
  }, 2500);
})();

$('rec-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('rec-msg');
  const nueva = $('rec-nueva').value;
  const confirmar = $('rec-confirmar').value;
  if (nueva !== confirmar) {
    msg.textContent = 'Las contraseñas no coinciden.';
    msg.className = 'text-sm text-center text-rose-600';
    msg.classList.remove('hidden');
    return;
  }
  const boton = $('rec-form').querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.innerHTML = '<span class="spinner"></span> Guardando…';
  try {
    await actualizarContrasena(nueva);
    msg.textContent = '¡Contraseña actualizada! Redirigiendo a tu panel…';
    msg.className = 'text-sm text-center text-emerald-600';
    msg.classList.remove('hidden');
    setTimeout(() => (window.location.href = '/public/panel.html'), 1500);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'text-sm text-center text-rose-600';
    msg.classList.remove('hidden');
    boton.disabled = false;
    boton.innerHTML = 'Guardar contraseña';
  }
});
