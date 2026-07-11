// ============================================================
// DGP LinkShop — Tutorial de primera vez (guía paso a paso)
// Se muestra solo la primera vez (marca en localStorage). Va
// explicando cada sección con "Siguiente/Siguiente" y, si se le
// pasa un callback, navega el panel a la sección de cada paso.
// ============================================================
import { icono } from './iconos.js';

const CLAVE = 'dgp-tutorial-visto';

/**
 * @param {Array<{tab?:string, icono:string, titulo:string, texto:string}>} pasos
 * @param {{alIr?:(tab:string)=>void, forzar?:boolean}} opciones
 */
export function iniciarTutorial(pasos, { alIr, forzar = false } = {}) {
  try { if (!forzar && localStorage.getItem(CLAVE)) return; } catch {}

  let i = 0;

  const fondo = document.createElement('div');
  fondo.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:1rem;';
  fondo.innerHTML = `
    <div class="tarjeta-solida" style="max-width:26rem;width:100%;padding:1.75rem;animation:subir .3s ease">
      <div id="tut-ico" class="icono-circulo" style="margin-bottom:1rem"></div>
      <h3 id="tut-titulo" class="text-slate-900" style="font-size:1.25rem;font-weight:800"></h3>
      <p id="tut-texto" class="text-slate-600" style="margin-top:.5rem;font-size:.925rem;line-height:1.5"></p>
      <div id="tut-puntos" style="display:flex;gap:.35rem;margin-top:1.25rem"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1.25rem;gap:.75rem">
        <button id="tut-saltar" class="text-slate-400" style="font-size:.8rem">Saltar</button>
        <div style="display:flex;gap:.5rem">
          <button id="tut-prev" class="btn btn-claro text-sm" style="padding:.5rem 1rem">Anterior</button>
          <button id="tut-next" class="btn btn-primario text-sm" style="padding:.5rem 1.25rem">Siguiente</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const $ = (id) => fondo.querySelector('#' + id);

  function cerrar() {
    try { localStorage.setItem(CLAVE, '1'); } catch {}
    fondo.remove();
  }

  function pintar() {
    const p = pasos[i];
    if (p.tab && alIr) alIr(p.tab);
    $('tut-ico').innerHTML = icono(p.icono, 'w-5 h-5');
    $('tut-titulo').textContent = p.titulo;
    $('tut-texto').textContent = p.texto;
    $('tut-puntos').innerHTML = pasos
      .map((_, n) => `<span style="width:${n === i ? '1.5rem' : '.5rem'};height:.5rem;border-radius:9999px;background:${n === i ? 'var(--azul-600)' : 'var(--linea)'};transition:all .2s"></span>`)
      .join('');
    $('tut-prev').style.visibility = i === 0 ? 'hidden' : 'visible';
    $('tut-next').textContent = i === pasos.length - 1 ? '¡Entendido!' : 'Siguiente';
  }

  $('tut-next').addEventListener('click', () => {
    if (i === pasos.length - 1) return cerrar();
    i++; pintar();
  });
  $('tut-prev').addEventListener('click', () => { if (i > 0) { i--; pintar(); } });
  $('tut-saltar').addEventListener('click', cerrar);

  pintar();
}
