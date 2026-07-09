// ============================================================
// DGP LinkShop — Subida de imágenes a Cloudinary
// Usa un "unsigned upload preset" (crear en Cloudinary:
// Settings > Upload > Add upload preset > Signing mode: Unsigned,
// con nombre "dgp-linkshop" y carpeta base "dgp-linkshop").
// ============================================================
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './config.js';

const MAX_MB = 5;
const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Sube un archivo de imagen y devuelve su URL segura (https).
 * @param {File} archivo   - input[type=file].files[0]
 * @param {string} carpeta - subcarpeta lógica, ej. "logos" o "productos"
 * @param {(pct:number)=>void} [onProgreso] - callback opcional 0–100
 * @returns {Promise<string>} secure_url de Cloudinary
 */
export function subirImagen(archivo, carpeta = 'general', onProgreso) {
  return new Promise((resolve, reject) => {
    if (!archivo) return reject(new Error('Selecciona una imagen.'));
    if (!TIPOS_VALIDOS.includes(archivo.type)) {
      return reject(new Error('Formato no soportado. Usa JPG, PNG o WebP.'));
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      return reject(new Error(`La imagen supera ${MAX_MB} MB. Comprímela e intenta de nuevo.`));
    }

    const datos = new FormData();
    datos.append('file', archivo);
    datos.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    datos.append('folder', `dgp-linkshop/${carpeta}`);

    // XMLHttpRequest en lugar de fetch para poder reportar progreso
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgreso) {
        onProgreso(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText).secure_url);
      } else {
        reject(new Error('Cloudinary rechazó la imagen. Verifica el upload preset.'));
      }
    };
    xhr.onerror = () => reject(new Error('Error de red al subir la imagen.'));
    xhr.send(datos);
  });
}

/**
 * Miniatura optimizada: inserta transformaciones en la URL de Cloudinary.
 * ej. optimizada(url, 'w_400,h_400,c_fill,q_auto,f_auto')
 */
export function optimizada(url, transformacion = 'w_600,q_auto,f_auto') {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/${transformacion}/`);
}
