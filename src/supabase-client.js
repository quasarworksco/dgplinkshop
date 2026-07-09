// ============================================================
// DGP LinkShop — Cliente único de Supabase (singleton)
// Se importa desde CDN para mantener el stack en Vanilla JS
// sin bundler. Todos los módulos usan esta misma instancia.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
