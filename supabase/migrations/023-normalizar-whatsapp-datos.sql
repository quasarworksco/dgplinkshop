-- ============================================================
-- DGP LinkShop — Migración 023: Normalizar WhatsApp existentes
-- Corrige de una vez los números guardados en formato local (0412…,
-- 0424…) a formato internacional (58…), que es el que exige wa.me.
-- De aquí en adelante la normalización la hace el frontend (telefono.js)
-- al crear/guardar la tienda. Fix de datos puntual. (Aplicada vía MCP.)
-- ============================================================
with limpio as (
  select id, regexp_replace(whatsapp, '\D', '', 'g') as d
  from businesses
  where whatsapp is not null and btrim(whatsapp) <> ''
)
update businesses b
set whatsapp = case
  when length(l.d) = 11 and left(l.d,1) = '0' then '58' || substr(l.d, 2)
  when length(l.d) = 10 and left(l.d,1) = '4' then '58' || l.d
  else l.d
end
from limpio l
where b.id = l.id;
