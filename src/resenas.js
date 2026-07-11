// ============================================================
// DGP LinkShop — Reseñas del landing (estrellas + opinión)
// Cualquiera puede dejar una reseña; se muestran las aprobadas.
// ============================================================
import { supabase } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
let calificacion = 0;

function escapar(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }

function svgEstrella(llena, clase = 'w-4 h-4') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${llena ? '#f59e0b' : 'none'}" stroke="${llena ? '#f59e0b' : '#cbd5e1'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${clase}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}
function estrellas(n, clase) { let o = ''; for (let i = 1; i <= 5; i++) o += svgEstrella(i <= n, clase); return o; }

// Estrellas interactivas del formulario
function pintarSelector() {
  const cont = $('resena-estrellas');
  cont.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'transition hover:scale-110';
    b.setAttribute('aria-label', `${i} estrellas`);
    b.innerHTML = svgEstrella(i <= calificacion, 'w-7 h-7');
    b.addEventListener('click', () => { calificacion = i; pintarSelector(); });
    cont.appendChild(b);
  }
}

async function cargarResenas() {
  const { data, error } = await supabase
    .from('reviews')
    .select('name, rating, comment, created_at')
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(9);
  if (error) return;
  const lista = data ?? [];
  $('resenas-vacio').classList.toggle('hidden', lista.length > 0);
  $('resenas-lista').innerHTML = lista
    .map((r) => `
      <article class="tarjeta-solida p-6">
        <div class="flex gap-0.5 mb-3">${estrellas(r.rating)}</div>
        ${r.comment ? `<p class="text-slate-600 text-sm leading-relaxed">"${escapar(r.comment)}"</p>` : ''}
        <p class="text-sm font-semibold text-slate-900 mt-4">${escapar(r.name)}</p>
      </article>`)
    .join('');
}

function msg(texto, ok = false) {
  const el = $('resena-msg');
  el.textContent = texto;
  el.className = `text-sm mb-3 ${ok ? 'text-emerald-600' : 'text-rose-600'}`;
  el.classList.remove('hidden');
}

$('resena-enviar').addEventListener('click', async () => {
  const name = $('resena-nombre').value.trim();
  const comment = $('resena-comentario').value.trim();
  if (calificacion < 1) return msg('Elige una calificación con las estrellas.');
  if (name.length < 2) return msg('Escribe tu nombre.');

  const boton = $('resena-enviar');
  boton.disabled = true;
  boton.innerHTML = '<span class="spinner"></span> Enviando…';
  const { error } = await supabase.from('reviews').insert({ name, rating: calificacion, comment: comment || null });
  boton.disabled = false;
  boton.innerHTML = 'Enviar reseña';
  if (error) return msg('No se pudo enviar tu reseña. Intenta de nuevo.');

  msg('¡Gracias por tu reseña!', true);
  $('resena-nombre').value = '';
  $('resena-comentario').value = '';
  calificacion = 0;
  pintarSelector();
  cargarResenas();
});

pintarSelector();
cargarResenas();
