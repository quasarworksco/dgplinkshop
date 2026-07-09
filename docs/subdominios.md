# Enrutamiento por subdominios — `negocio1.dgp-link.com`

## Cómo funciona

Cada negocio tiene un `slug` único en la tabla `businesses` (migración 001).
Ese slug **es** su subdominio. El flujo completo:

```
Visitante → negocio1.dgp-link.com
              │
              ▼  (1) DNS wildcard: *.dgp-link.com apunta al mismo hosting
        Hosting estático (Vercel / Netlify / Cloudflare Pages)
              │
              ▼  (2) Todas las peticiones de subdominios sirven public/tienda.html
        tienda.html + src/tienda.js
              │
              ▼  (3) JS lee window.location.hostname → extrae "negocio1"
        Supabase (clave anon)
              │
              ▼  (4) select * from storefront where slug = 'negocio1'
        Render de la tienda con los datos y productos del negocio
```

**Clave del diseño:** no hay un servidor por tienda. Es *una sola* aplicación
estática que se comporta como multi-tenant: el subdominio actúa como parámetro
y RLS garantiza que solo se exponen tiendas publicadas (`is_published = true`).

## Paso 1 — DNS (una sola vez)

En el panel DNS de `dgp-link.com`:

| Tipo  | Nombre | Valor                     |
|-------|--------|---------------------------|
| A / CNAME | `@`    | Hosting (app principal)   |
| CNAME | `*`    | Hosting (mismo proyecto)  |

- En **Vercel**: añadir los dominios `dgp-link.com` y `*.dgp-link.com` al
  proyecto. Vercel emite certificados SSL wildcard automáticamente.
- En **Netlify / Cloudflare Pages** el proceso es equivalente (dominio
  wildcard + SSL automático).

## Paso 2 — Resolución en el frontend

`src/subdominio.js` centraliza la lógica:

- `app.dgp-link.com`, `www.dgp-link.com` o `dgp-link.com` → aplicación
  principal (landing, panel, wizard).
- `<cualquier-otro>.dgp-link.com` → es una tienda; el slug es la primera
  etiqueta del hostname.
- En desarrollo local (`localhost`) no hay subdominios, así que se acepta el
  fallback `tienda.html?tienda=negocio1`.

## Paso 3 — Consulta a Supabase

`src/tienda.js` consulta la vista `storefront` (solo tiendas publicadas) con la
clave `anon`. Si el slug no existe o la tienda no está publicada, se muestra la
pantalla "Tienda no encontrada" con enlace a dgp-link.com.

## Slugs reservados

La migración 001 bloquea a nivel de base de datos los slugs `www`, `app`,
`api`, `admin`, `panel`, `dashboard`, `mail`, `soporte` y `dgp` para que
ningún negocio pueda ocupar subdominios del sistema.

## URL generada para el usuario

Al terminar el wizard, el negocio ve y puede copiar su URL con la identidad de
marca: `https://<slug>.dgp-link.com` — generada por `urlDeTienda()` en
`src/subdominio.js`.
