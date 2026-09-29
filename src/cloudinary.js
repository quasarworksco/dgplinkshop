// ============================================================
// DGP LinkShop — Subida de imágenes a Cloudinary
// Usa un "unsigned upload preset" (crear en Cloudinary:
// Settings > Upload > Add upload preset > Signing mode: Unsigned,
// con nombre "dgp-linkshop" y carpeta base "dgp-linkshop").
// ============================================================
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './config.js';

const MAX_MB = 15;               // límite de la imagen ORIGINAL que elige el usuario
const MAX_LADO = 1600;           // px del lado más largo tras comprimir
const CALIDAD = 0.82;            // calidad de recompresión (0–1)
const UMBRAL_COMPRIMIR = 900 * 1024; // si ya pesa menos y no hay que escalar, se deja igual
const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Comprime y redimensiona una imagen en el navegador (antes de subir).
 * Reduce fotos pesadas del celular a ~200–500 KB manteniendo buena
 * calidad. Usa WebP (conserva transparencia); si el navegador no lo
 * soporta, cae a JPEG. Si algo falla o no mejora, devuelve el original.
 * @param {File} archivo
 * @returns {Promise<File>}
 */
async function comprimirImagen(archivo) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return archivo;
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return archivo; // formato no decodificable en canvas → subir original
  }
  const { width, height } = bitmap;
  const escala = Math.min(1, MAX_LADO / Math.max(width, height));
  // Ya es pequeña y no hay que escalar: no vale la pena recomprimir.
  if (escala === 1 && archivo.size <= UMBRAL_COMPRIMIR) { bitmap.close?.(); return archivo; }

  const w = Math.max(1, Math.round(width * escala));
  const h = Math.max(1, Math.round(height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  let blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', CALIDAD));
  if (!blob) blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', CALIDAD));
  if (!blob || blob.size >= archivo.size) return archivo; // no mejoró → original

  const base = archivo.name.replace(/\.[^.]+$/, '') || 'imagen';
  const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
  return new File([blob], base + ext, { type: blob.type });
}

/**
 * Sube un archivo de imagen y devuelve su URL segura (https).
 * Antes de subir, la comprime/redimensiona automáticamente.
 * @param {File} archivo   - input[type=file].files[0]
 * @param {string} carpeta - subcarpeta lógica, ej. "logos" o "productos"
 * @param {(pct:number)=>void} [onProgreso] - callback opcional 0–100
 * @returns {Promise<string>} secure_url de Cloudinary
 */
export async function subirImagen(archivo, carpeta = 'general', onProgreso) {
  if (!archivo) throw new Error('Selecciona una imagen.');
  if (!TIPOS_VALIDOS.includes(archivo.type)) {
    throw new Error('Formato no soportado. Usa JPG, PNG o WebP.');
  }
  if (archivo.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen supera ${MAX_MB} MB. Elige una un poco más liviana.`);
  }

  // Optimización local antes de subir (ahorra datos y almacenamiento).
  const optimizado = await comprimirImagen(archivo);

  return new Promise((resolve, reject) => {
    const datos = new FormData();
    datos.append('file', optimizado);
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
