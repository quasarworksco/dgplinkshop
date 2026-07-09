# DGP LinkShop

Plataforma SaaS multi-tenant bajo **dgp-link.com**: los dueños de negocio se
registran, configuran su tienda en un wizard de 4 pasos y obtienen su tienda
online en `sunegocio.dgp-link.com`.

| Plan | Precio | Límite de productos |
|------|--------|---------------------|
| Gratuito | $0 | 5 |
| PRO | $30 inscripción + $20/mes | 50 |

**Stack:** HTML + JavaScript Vanilla + Tailwind CSS (CDN) · Supabase (PostgreSQL + Auth) · Cloudinary (imágenes) · Diseño *Modern Glassmorphism / Liquid Glass*.

## Estructura del proyecto

```
dgplinkshop/
├── public/                  # Páginas HTML (una por vista)
│   ├── index.html           #   Landing con planes
│   ├── acceso.html          #   Login / registro
│   ├── wizard.html          #   Onboarding en 4 pasos
│   ├── panel.html           #   Panel del negocio (catálogo)
│   └── tienda.html          #   Tienda pública (multi-tenant, por subdominio)
├── src/                     # Módulos ES (JavaScript Vanilla)
│   ├── config.js            #   Claves públicas y definición de planes
│   ├── supabase-client.js   #   Cliente Supabase singleton
│   ├── auth.js              #   Registro, login, guardas de sesión
│   ├── acceso.js            #   Lógica de la página de acceso
│   ├── wizard.js            #   Wizard de onboarding + vista previa en vivo
│   ├── panel.js             #   Admin: catálogo, pedidos y cupones (render selectivo)
│   ├── tienda.js            #   Storefront con paginación y scroll infinito
│   ├── carrito.js           #   Carrito flotante + pedido por WhatsApp
│   ├── iconos.js            #   Iconografía SVG (estilo Lucide, sin emojis)
│   ├── notificaciones.js    #   Toasts + registro de errores con contexto
│   ├── subdominio.js        #   Resolución de tenant por subdominio + slugs
│   ├── cloudinary.js        #   Subida unsigned + transformaciones de imagen
│   ├── lazy-imagenes.js     #   Lazy loading con IntersectionObserver
│   └── cache-local.js       #   Caché sessionStorage con TTL
├── styles/
│   └── glass.css            # Sistema visual Liquid Glass (complementa Tailwind)
├── assets/
│   └── logo.svg             # Logo DGP LinkShop
├── supabase/migrations/
│   ├── 001-esquema-inicial.sql   # Tablas, triggers, límites por plan
│   ├── 002-politicas-rls.sql     # Row Level Security
│   └── 003-pedidos-cupones.sql   # Pedidos, cupones, destacados y descuentos
├── docs/
│   └── subdominios.md       # Cómo funciona negocio1.dgp-link.com
├── scripts/
│   └── build.js             # Minificación JS/CSS → /dist
└── package.json
```

Convenciones para mantener el repo limpio: archivos en `minusculas-con-guiones`,
un módulo por responsabilidad, credenciales privadas jamás en el repo
(solo claves públicas en `src/config.js`), `node_modules/` y `dist/` ignorados
en `.gitignore`, y las migraciones SQL numeradas y nunca editadas después de
aplicarse (los cambios van en una migración nueva: `003-...sql`).

## Puesta en marcha

1. **Clonar e instalar** (solo herramientas de desarrollo):
   ```bash
   npm install
   ```
2. **Supabase**: crea un proyecto y ejecuta en el SQL Editor, en orden,
   las migraciones de `supabase/migrations/` (001, 002 y 003).
3. **Cloudinary**: crea un *upload preset* **unsigned** llamado `dgp-linkshop`
   (Settings → Upload → Add upload preset → Signing mode: Unsigned).
4. **Configura** `src/config.js` con tu URL/anon key de Supabase y tu cloud
   name de Cloudinary. Son claves públicas: la seguridad la dan las políticas
   RLS y las reglas del preset.
5. **Desarrollo local**:
   ```bash
   npm run dev   # http://localhost:3000/public/index.html
   ```
   La tienda pública en local se prueba con `?tienda=<slug>`:
   `http://localhost:3000/public/tienda.html?tienda=mi-negocio`.
6. **Producción**: `npm run build` genera `/dist` minificado; despliega esa
   carpeta en Vercel/Netlify con los dominios `dgp-link.com` y
   `*.dgp-link.com` (ver `docs/subdominios.md`).

## Arquitectura de datos (resumen)

```
auth.users ──1:1── profiles ──1:1── businesses ──1:1── subscriptions
                                        └────────1:N── products
```

Además: `orders` (pedidos por WhatsApp con estado interno) y `coupons`
(cupones por negocio con vencimiento y usos máximos), ambos por negocio.

- Al registrarse un usuario, un trigger crea su `profile` automáticamente.
- Al crear un negocio, un trigger crea su suscripción **FREE activa**.
- El límite de productos (5 free / 50 pro) lo hace cumplir el trigger
  `enforce_product_limit` **en la base de datos** — el frontend solo lo refleja.
- Los cambios de plan los ejecuta el backend con `service_role` tras confirmar
  el pago; el cliente no tiene permisos de escritura sobre `subscriptions`.

## Seguridad (RLS)

Todas las tablas tienen Row Level Security activo (`002-politicas-rls.sql`):
un usuario autenticado solo lee/escribe **sus** datos; los visitantes anónimos
solo leen tiendas publicadas y productos activos; `subscriptions` es de solo
lectura para el dueño.

Los pedidos y cupones nunca se manipulan directamente desde el navegador del
cliente: la creación de pedidos y la validación de cupones pasan por las
funciones `crear_pedido` y `validar_cupon` (security definer), que recalculan
precios y descuentos **en el servidor**.

## Pedidos por WhatsApp

La plataforma no procesa pagos. Al confirmar el carrito, el pedido se registra
en `orders` (para el historial y control de estados del panel: pendiente,
procesado, entregado, cancelado) y el cliente es redirigido al WhatsApp del
negocio con el detalle estructurado (productos, cantidades, descuentos, total).

## Identidad de marca

Sin emojis en la interfaz: toda la iconografía es SVG (estilo Lucide) generada
por `src/iconos.js`. Todas las páginas llevan el footer institucional
"Desarrollado por DGP Global Group" con enlace a dgpglobalgroup.com.

## Rendimiento (pensado para 50+ negocios activos)

- **Lazy loading**: las imágenes cargan un placeholder borroso de ~1 KB de
  Cloudinary y la imagen real solo al acercarse al viewport
  (`src/lazy-imagenes.js`).
- **Paginación**: la tienda pública pide productos de 12 en 12 con `.range()`
  y scroll infinito — un catálogo PRO de 50 productos nunca baja completo.
- **Caché**: los datos estables del negocio (nombre, logo, colores) se cachean
  en `sessionStorage` con TTL de 10 minutos (`src/cache-local.js`).
- **Render selectivo**: el panel mantiene un mapa `producto → tarjeta DOM` y
  al crear/editar/eliminar solo toca esa tarjeta, nunca re-renderiza el grid.
- **Minificación**: `npm run build` minifica JS/CSS con esbuild hacia `/dist`;
  Tailwind y Supabase ya llegan minificados desde CDN.
