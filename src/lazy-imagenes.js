// ============================================================
// DGP LinkShop — Carga diferida de imágenes (lazy loading)
// Estrategia: se pinta primero un placeholder minúsculo y
// borroso de Cloudinary (~1 KB) y la imagen real solo se
// descarga cuando la tarjeta se acerca al viewport
// (IntersectionObserver con margen de 300px).
// Ahorro típico: en un catálogo de 50 productos solo se
// descargan las ~6 imágenes visibles al abrir la página.
// ============================================================
import { optimizada } from './cloudinary.js';

const observador = new IntersectionObserver(
  (entradas, obs) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const img = entrada.target;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      obs.unobserve(img);
    }
  },
  { rootMargin: '300px' } // empieza a descargar un poco antes de que sea visible
);

/**
 * Devuelve el HTML de una <img> con carga diferida.
 * @param {string} url            - secure_url de Cloudinary
 * @param {string} transformacion - ej. 'w_500,h_500,c_fill,q_auto,f_auto'
 * @param {string} alt            - texto alternativo (ya escapado)
 * @param {string} clases         - clases Tailwind
 */
export function imgLazy(url, transformacion, alt, clases = 'w-full h-full object-cover') {
  const placeholder = optimizada(url, 'w_40,e_blur:800,q_10,f_auto');
  const real = optimizada(url, transformacion);
  return `<img src="${placeholder}" data-src="${real}" alt="${alt}" class="${clases}" decoding="async" loading="lazy" />`;
}

/** Activa el observador sobre las imágenes recién insertadas en el DOM */
export function observarImagenesLazy(raiz = document) {
  raiz.querySelectorAll('img[data-src]').forEach((img) => observador.observe(img));
}
