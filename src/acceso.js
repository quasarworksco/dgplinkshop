// ============================================================
// DGP LinkShop — Página de acceso (login / registro)
// ============================================================
import { registrar, iniciarSesion, usuarioActual } from './auth.js';
import { supabase } from './supabase-client.js';

const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const mensaje = document.getElementById('mensaje');

function mostrarTab(cual) {
  const esLogin = cual === 'login';
  formLogin.classList.toggle('hidden', !esLogin);
  formRegistro.classList.toggle('hidden', esLogin);
  tabLogin.classList.toggle('activa', esLogin);
  tabRegistro.classList.toggle('activa', !esLogin);
  mensaje.classList.add('hidden');
}

tabLogin.addEventListener('click', () => mostrarTab('login'));
tabRegistro.addEventListener('click', () => mostrarTab('registro'));
mostrarTab(window.location.hash === '#registro' ? 'registro' : 'login');

function avisar(texto, esError = true) {
  mensaje.textContent = texto;
  mensaje.className = `mt-4 text-sm text-center ${esError ? 'text-rose-600' : 'text-emerald-600'}`;
}

/** Pone un spinner + texto en un botón y lo deshabilita */
function iniciarCarga(boton, texto) {
  boton.dataset.original = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `<span class="spinner"></span> ${texto}`;
}
/** Restaura el botón a su estado original (tras un error) */
function terminarCarga(boton) {
  boton.disabled = false;
  if (boton.dataset.original) boton.innerHTML = boton.dataset.original;
}

/** Tras iniciar sesión: si ya tiene negocio → panel; si no → wizard */
async function redirigirSegunEstado() {
  const user = await usuarioActual();
  const { data: negocio } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  window.location.href = negocio ? '/public/panel.html' : '/public/wizard.html';
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = formLogin.querySelector('button[type="submit"]');
  iniciarCarga(boton, 'Entrando…');
  try {
    await iniciarSesion({
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    });
    // redirige (la página se recarga; el spinner sigue hasta salir)
    await redirigirSegunEstado();
  } catch (err) {
    avisar(err.message);
    terminarCarga(boton);
  }
});

formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = formRegistro.querySelector('button[type="submit"]');
  iniciarCarga(boton, 'Creando tu cuenta…');
  try {
    const { session } = await registrar({
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      nombreCompleto: document.getElementById('reg-nombre').value.trim(),
    });
    if (session) {
      await redirigirSegunEstado(); // confirmación de email desactivada
    } else {
      avisar('¡Cuenta creada! Revisa tu correo para confirmarla y luego inicia sesión.', false);
      mostrarTab('login');
      terminarCarga(boton);
    }
  } catch (err) {
    avisar(err.message);
    terminarCarga(boton);
  }
});
