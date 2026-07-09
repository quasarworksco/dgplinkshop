// ============================================================
// DGP LinkShop — Wizard de onboarding (4 pasos)
//   1) Datos del negocio  2) Logo → Cloudinary
//   3) Personalización    4) Revisión + guardado en Supabase
// La columna derecha renderiza la vista previa Glassmorphism
// en vivo con cada cambio.
// ============================================================
import { supabase } from './supabase-client.js';
import { requerirSesion } from './auth.js';
import { subirImagen, optimizada } from './cloudinary.js';
import { normalizarSlug, urlDeTienda } from './subdominio.js';

const TOTAL_PASOS = 4;

const estado = {
  paso: 1,
  nombre: '',
  slug: '',
  slugDisponible: null,
  descripcion: '',
  categoria: 'comida',
  logoUrl: null,
  colorPrimario: '#818cf8',
  whatsapp: '',
};

const $ = (id) => document.getElementById(id);
let usuario = null;

// ------------------------------------------------------------
// Navegación entre pasos
// ------------------------------------------------------------
function renderPaso() {
  document.querySelectorAll('[data-panel]').forEach((p) => {
    p.classList.toggle('hidden', Number(p.dataset.panel) !== estado.paso);
  });
  document.querySelectorAll('.paso-punto').forEach((p) => {
    const n = Number(p.dataset.paso);
    p.classList.toggle('activo', n === estado.paso);
    p.classList.toggle('completado', n < estado.paso);
    p.textContent = n < estado.paso ? '✓' : n;
  });
  $('btn-atras').classList.toggle('invisible', estado.paso === 1);
  $('btn-siguiente').textContent = estado.paso === TOTAL_PASOS ? '🚀 Publicar mi tienda' : 'Siguiente →';
  ocultarError();
  if (estado.paso === TOTAL_PASOS) renderResumen();
}

function mostrarError(texto) {
  const el = $('wizard-error');
  el.textContent = texto;
  el.classList.remove('hidden');
}

function ocultarError() {
  $('wizard-error').classList.add('hidden');
}

// ------------------------------------------------------------
// Validación por paso antes de avanzar
// ------------------------------------------------------------
async function validarPasoActual() {
  if (estado.paso === 1) {
    if (estado.nombre.trim().length < 2) return 'Escribe el nombre de tu negocio.';
    if (!/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/.test(estado.slug)) {
      return 'La dirección web debe tener entre 3 y 50 caracteres (letras, números y guiones).';
    }
    if (estado.slugDisponible === false) return 'Esa dirección ya está ocupada. Prueba otra.';
    if (estado.slugDisponible === null) await verificarSlug();
    if (estado.slugDisponible === false) return 'Esa dirección ya está ocupada. Prueba otra.';
  }
  if (estado.paso === 3 && estado.whatsapp && !/^\d{8,15}$/.test(estado.whatsapp)) {
    return 'El WhatsApp debe tener solo números, con código de país (8 a 15 dígitos).';
  }
  return null;
}

$('btn-siguiente').addEventListener('click', async () => {
  const error = await validarPasoActual();
  if (error) return mostrarError(error);
  if (estado.paso < TOTAL_PASOS) {
    estado.paso += 1;
    renderPaso();
  } else {
    await publicarTienda();
  }
});

$('btn-atras').addEventListener('click', () => {
  if (estado.paso > 1) {
    estado.paso -= 1;
    renderPaso();
  }
});

$('btn-salir').addEventListener('click', () => (window.location.href = '/public/panel.html'));

// ------------------------------------------------------------
// Paso 1: datos + verificación de slug en Supabase
// ------------------------------------------------------------
$('negocio-nombre').addEventListener('input', (e) => {
  estado.nombre = e.target.value;
  // Sugerir slug solo si el usuario no lo ha personalizado
  if (!$('negocio-slug').dataset.tocado) {
    estado.slug = normalizarSlug(estado.nombre);
    $('negocio-slug').value = estado.slug;
    estado.slugDisponible = null;
    programarVerificacionSlug();
  }
  renderPreview();
});

$('negocio-slug').addEventListener('input', (e) => {
  e.target.dataset.tocado = '1';
  estado.slug = normalizarSlug(e.target.value);
  estado.slugDisponible = null;
  programarVerificacionSlug();
  renderPreview();
});

let timerSlug = null;
function programarVerificacionSlug() {
  clearTimeout(timerSlug);
  const el = $('slug-estado');
  el.textContent = '';
  if (!estado.slug) return;
  el.textContent = 'Comprobando disponibilidad…';
  el.className = 'text-xs mt-1 h-4 text-slate-400';
  timerSlug = setTimeout(verificarSlug, 450);
}

async function verificarSlug() {
  if (!estado.slug) return;
  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', estado.slug)
    .maybeSingle();
  const el = $('slug-estado');
  if (error) {
    el.textContent = 'No se pudo comprobar. Se validará al publicar.';
    el.className = 'text-xs mt-1 h-4 text-amber-400';
    return;
  }
  estado.slugDisponible = !data;
  el.textContent = estado.slugDisponible
    ? `✓ ${estado.slug}.dgp-link.com está disponible`
    : '✗ Esa dirección ya está ocupada';
  el.className = `text-xs mt-1 h-4 ${estado.slugDisponible ? 'text-emerald-400' : 'text-rose-400'}`;
}

$('negocio-descripcion').addEventListener('input', (e) => {
  estado.descripcion = e.target.value;
  renderPreview();
});

$('negocio-categoria').addEventListener('change', (e) => {
  estado.categoria = e.target.value;
});

// ------------------------------------------------------------
// Paso 2: subir logo a Cloudinary
// ------------------------------------------------------------
$('input-logo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const wrap = $('progreso-wrap');
  const barra = $('progreso-barra');
  const texto = $('progreso-texto');
  wrap.classList.remove('hidden');
  ocultarError();
  try {
    estado.logoUrl = await subirImagen(archivo, 'logos', (pct) => {
      barra.style.width = pct + '%';
      texto.textContent = `Subiendo… ${pct}%`;
    });
    texto.textContent = '✓ Logo subido correctamente';
    renderPreview();
  } catch (err) {
    wrap.classList.add('hidden');
    mostrarError(err.message);
  }
});

// ------------------------------------------------------------
// Paso 3: personalización
// ------------------------------------------------------------
document.querySelectorAll('#paleta-colores button').forEach((btn) => {
  btn.addEventListener('click', () => {
    estado.colorPrimario = btn.dataset.color;
    document.querySelectorAll('#paleta-colores button').forEach((b) => (b.style.outline = 'none'));
    btn.style.outline = '3px solid rgba(255,255,255,0.6)';
    btn.style.outlineOffset = '2px';
    renderPreview();
  });
});

$('negocio-whatsapp').addEventListener('input', (e) => {
  estado.whatsapp = e.target.value.replace(/\D/g, '');
  e.target.value = estado.whatsapp;
});

// ------------------------------------------------------------
// Vista previa Glassmorphism en vivo
// ------------------------------------------------------------
function renderPreview() {
  $('preview-nombre').textContent = estado.nombre || 'Tu negocio';
  $('preview-descripcion').textContent = estado.descripcion || 'Tu descripción aparecerá aquí';
  $('preview-url').textContent = `${estado.slug || 'tunegocio'}.dgp-link.com`;
  $('preview-boton').style.background = estado.colorPrimario;
  $('preview-precio-1').style.color = estado.colorPrimario;
  $('preview-precio-2').style.color = estado.colorPrimario;
  const logo = $('preview-logo');
  if (estado.logoUrl) {
    logo.innerHTML = `<img src="${optimizada(estado.logoUrl, 'w_160,h_160,c_fill,q_auto,f_auto')}" alt="Logo" class="w-full h-full object-cover" />`;
  }
}

function renderResumen() {
  $('resumen-nombre').textContent = estado.nombre;
  $('resumen-url').textContent = urlDeTienda(estado.slug);
}

// ------------------------------------------------------------
// Paso 4: guardar el negocio en Supabase y publicar
// ------------------------------------------------------------
async function publicarTienda() {
  const boton = $('btn-siguiente');
  boton.disabled = true;
  boton.textContent = 'Publicando…';
  try {
    const { error } = await supabase.from('businesses').insert({
      owner_id: usuario.id,
      name: estado.nombre.trim(),
      slug: estado.slug,
      description: estado.descripcion.trim() || null,
      category: estado.categoria,
      logo_url: estado.logoUrl,
      whatsapp: estado.whatsapp || null,
      theme: { color_primario: estado.colorPrimario, color_acento: '#22d3ee' },
      is_published: true,
    });
    if (error) {
      if (error.code === '23505') throw new Error('Esa dirección web ya está ocupada. Vuelve al paso 1 y elige otra.');
      throw new Error('No se pudo publicar la tienda: ' + error.message);
    }
    // El trigger handle_new_business ya creó la suscripción FREE
    window.location.href = '/public/panel.html?bienvenida=1';
  } catch (err) {
    mostrarError(err.message);
    boton.disabled = false;
    boton.textContent = '🚀 Publicar mi tienda';
  }
}

// ------------------------------------------------------------
// Arranque: exigir sesión y, si ya tiene tienda, ir al panel
// ------------------------------------------------------------
(async function iniciar() {
  usuario = await requerirSesion();
  if (!usuario) return;
  const { data: existente } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', usuario.id)
    .maybeSingle();
  if (existente) {
    window.location.href = '/public/panel.html';
    return;
  }
  renderPaso();
  renderPreview();
})();
