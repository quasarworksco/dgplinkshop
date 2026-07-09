// ============================================================
// DGP LinkShop — Build de producción (npm run build)
// Minifica JS y CSS hacia /dist manteniendo la misma estructura
// de carpetas, y copia HTML y assets tal cual. No hay bundling:
// los módulos ES conservan sus imports relativos y el import de
// Supabase desde CDN, así el deploy sigue siendo 100% estático.
// Resultado típico: ~40-50% menos bytes de JS/CSS propios.
// ============================================================
import { buildSync } from 'esbuild';
import { readdirSync, cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

// JS de /src → /dist/src (minificado, ESM intacto)
const modulos = readdirSync('src')
  .filter((f) => f.endsWith('.js'))
  .map((f) => `src/${f}`);

buildSync({
  entryPoints: modulos,
  outdir: 'dist/src',
  minify: true,
  format: 'esm',
  target: 'es2020',
});

// CSS de /styles → /dist/styles (minificado)
buildSync({
  entryPoints: ['styles/glass.css'],
  outdir: 'dist/styles',
  minify: true,
});

// HTML y assets se copian sin tocar (referencias absolutas /src, /styles…)
cpSync('public', 'dist/public', { recursive: true });
cpSync('assets', 'dist/assets', { recursive: true });

console.log('✓ Build minificado listo en /dist — despliega esa carpeta como raíz.');
