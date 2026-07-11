// ============================================================
// DGP LinkShop — Configuración global
// Estas claves son PÚBLICAS por diseño (anon key de Supabase y
// preset unsigned de Cloudinary); la seguridad real la dan las
// políticas RLS y las reglas del preset. Las claves PRIVADAS
// (service_role, api_secret) jamás van en el frontend.
// ============================================================

// Supabase → Dashboard > Settings > API
// (Estas claves son PÚBLICAS: se envían a cada navegador. La
//  seguridad la dan las políticas RLS, no el secreto de la clave.)
export const SUPABASE_URL = 'https://oubyfnzvtbfhduiynqia.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uEdzJpKC1p55rT4MkWlPwQ_d5R8J5E1';

// Cloudinary → Dashboard (cloud name) + preset unsigned "dgp-linkshop"
export const CLOUDINARY_CLOUD_NAME = 'TU_CLOUD_NAME';
export const CLOUDINARY_UPLOAD_PRESET = 'dgp-linkshop';

// Dominio raíz de la plataforma
export const ROOT_DOMAIN = 'dgp-link.com';

// Planes de DGP LinkShop (los límites reales los hace cumplir la
// base de datos — trigger enforce_product_limit; esto es solo UI)
export const PLANES = {
  free: {
    nombre: 'Gratuito',
    limiteProductos: 5,
    inscripcion: 0,
    mensualidad: 0,
  },
  pro: {
    nombre: 'PRO',
    limiteProductos: 50,
    inscripcion: 30,
    mensualidad: 20,
  },
};
