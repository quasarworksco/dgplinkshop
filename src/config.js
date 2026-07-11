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
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Ynlmbnp2dGJmaGR1aXlucWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3Mjg4NTEsImV4cCI6MjA5OTMwNDg1MX0.omAC0qUjePtQCVtTerz2bL_vh5-xX9MKJXigEIyCe7k';

// Cloudinary → Dashboard (cloud name) + preset unsigned "dgp-linkshop"
export const CLOUDINARY_CLOUD_NAME = 'gingt9vy';
export const CLOUDINARY_UPLOAD_PRESET = 'dgp-linkshop';

// Dominio raíz de la plataforma
export const ROOT_DOMAIN = 'dgpgroupusa.com';

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
    limiteProductos: 100,
    inscripcion: 0,
    mensualidad: 15,
  },
};
