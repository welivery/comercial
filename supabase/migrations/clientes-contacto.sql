-- Campos de contacto estructurados para la base de clientes.
-- Antes el contacto (nombre / email / teléfono / comuna) se cargaba dentro de la
-- `nota` libre; ahora son columnas propias para poder USARLOS (secuencias de
-- email, mailto en la tarjeta de lead, etc.). Correr una sola vez en Supabase.

alter table clientes add column if not exists contacto text;
alter table clientes add column if not exists email    text;
alter table clientes add column if not exists telefono text;
alter table clientes add column if not exists comuna   text;

-- ── Backfill best-effort desde la nota ya cargada ─────────────────────────────
-- Email: primer patrón x@y.z que aparezca en la nota.
update clientes
set email = (regexp_match(nota, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'))[1]
where email is null and nota ~ '@';

-- Teléfono chileno: +56 9 XXXX XXXX (con o sin +56 / espacios) o 9 + 8 dígitos.
update clientes
set telefono = trim((regexp_match(nota, '(\+?56[[:space:]]?9[[:space:]]?[0-9[:space:]]{8,}|9[0-9]{8})'))[1])
where telefono is null and nota ~ '[0-9]{8}';

-- Nombre de contacto: patrón "contacto: NOMBRE" hasta el próximo separador ·.
update clientes
set contacto = trim((regexp_match(nota, 'contacto:[[:space:]]*([^·|]+)'))[1])
where contacto is null and nota ~* 'contacto:';

-- ── Backfill de leads YA sembrados desde la base ──────────────────────────────
-- Los leads de origen 'base' se identifican con `clave` = nombre normalizado del
-- cliente (minúsculas, sin acentos, no-alfanum → '-'). Igualamos esa clave para
-- copiar el email/teléfono a los leads que ya existían antes de esta migración.
-- Nota: lower() ANTES de translate para que las mayúsculas con tilde (ej. "CAFÉ")
-- se normalicen igual que en el front (claveLead).
update leads l
set email    = coalesce(l.email, c.email),
    telefono = coalesce(l.telefono, c.telefono)
from clientes c
where l.origen = 'base'
  and (l.email is null or l.telefono is null)
  and (c.email is not null or c.telefono is not null)
  and l.clave = regexp_replace(
        regexp_replace(translate(lower(c.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)', '', 'g');
