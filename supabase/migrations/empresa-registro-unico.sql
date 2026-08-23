-- Registro único: la EMPRESA (tabla `clientes`) es la ÚNICA fuente de verdad del
-- contacto (persona / email / teléfono) y de las notas. Oportunidades y leads
-- apuntan a la empresa por `cliente_id`. Antes el contacto/notas se guardaban
-- COPIADOS dentro de la oportunidad; ahora viven en la empresa y se editan en un
-- solo lugar → reutilizables por leads, oportunidades y campañas.
-- Correr UNA vez en el SQL Editor de Supabase (después del schema base + leads).
-- Idempotente y tolerante: si la oportunidad nunca tuvo columnas de contacto
-- (no se corrió `oportunidades-contacto.sql`), esos pasos se saltean solos.

-- ─────────────────── 0) Normalizador de nombre (= claveLead del front) ───────────────────
-- lower → sin acentos → no-alfanum a '-'. Sirve para machear empresas por nombre.
create or replace function _clave_nombre(txt text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(translate(lower(coalesce(txt, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'),
           '(^-|-$)', '', 'g')
$$;

-- ─────────────────── 1) Link a la empresa ───────────────────
alter table oportunidades add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table leads         add column if not exists cliente_id uuid references clientes(id) on delete set null;
create index if not exists idx_op_cliente    on oportunidades(cliente_id);
create index if not exists idx_leads_cliente on leads(cliente_id);

-- ─────────────────── 2) Linkear lo existente por nombre normalizado ───────────────────
update oportunidades o set cliente_id = c.id
from clientes c
where o.cliente_id is null and _clave_nombre(o.ecommerce) = _clave_nombre(c.nombre);

update leads l set cliente_id = c.id
from clientes c
where l.cliente_id is null and l.clave = _clave_nombre(c.nombre);

-- ─────────────────── 3 y 4) Migrar contacto/notas + crear empresas faltantes ───────────────────
-- Se hace en un bloque que detecta si la oportunidad tiene columnas de contacto:
--   • Si LAS TIENE: sube el contacto/notas a la empresa (rellena lo vacío, anexa
--     notas) y crea la empresa faltante COPIANDO su contacto.
--   • Si NO LAS TIENE: solo crea la empresa faltante (sin contacto que copiar).
-- Los leads sin match NO crean empresa: se crea recién cuando el lead se
-- trabaja/convierte, para no ensuciar la base con prospectos crudos.
do $mig$
declare
  tiene_contacto boolean;
begin
  select count(*) = 4 into tiene_contacto
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'oportunidades'
    and column_name in ('contacto', 'email', 'telefono', 'notas');

  if tiene_contacto then
    -- 3) Subir el contacto/notas de la oportunidad a la empresa vinculada.
    execute $q$
      update clientes c set
        contacto = coalesce(c.contacto, o.contacto),
        email    = coalesce(c.email,    o.email),
        telefono = coalesce(c.telefono, o.telefono),
        nota     = case
                     when coalesce(o.notas, '') = '' then c.nota
                     when coalesce(c.nota, '')  = '' then o.notas
                     when position(o.notas in c.nota) > 0 then c.nota
                     else c.nota || E'\n' || o.notas
                   end
      from oportunidades o
      where o.cliente_id = c.id
        and (o.contacto is not null or o.email is not null or o.telefono is not null or coalesce(o.notas, '') <> '')
    $q$;

    -- 4a) Crear empresa (prospección) para oportunidades sin match, con contacto.
    execute $q$
      insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, contacto, email, telefono, nota)
      select distinct on (_clave_nombre(o.ecommerce))
             o.ecommerce, 'prospeccion', o.envios_aprox, o.bucket, o.vendedor_id,
             o.contacto, o.email, o.telefono, coalesce(o.notas, '')
      from oportunidades o
      where o.cliente_id is null
      order by _clave_nombre(o.ecommerce), o.declarada_at
    $q$;
  else
    -- 4b) Crear empresa (prospección) para oportunidades sin match, sin contacto
    -- (la oportunidad nunca tuvo esas columnas).
    insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, nota)
    select distinct on (_clave_nombre(o.ecommerce))
           o.ecommerce, 'prospeccion', o.envios_aprox, o.bucket, o.vendedor_id, ''
    from oportunidades o
    where o.cliente_id is null
    order by _clave_nombre(o.ecommerce), o.declarada_at;
  end if;
end
$mig$;

-- Linkear las oportunidades sin match a la empresa recién creada.
update oportunidades o set cliente_id = c.id
from clientes c
where o.cliente_id is null and _clave_nombre(o.ecommerce) = _clave_nombre(c.nombre);

-- ─────────────────── 5) Sacar las columnas de contacto/notas de la oportunidad ───────────────────
-- Ya no viven acá: la fuente de verdad es la empresa. (No-op si nunca existieron.)
alter table oportunidades drop column if exists contacto;
alter table oportunidades drop column if exists email;
alter table oportunidades drop column if exists telefono;
alter table oportunidades drop column if exists notas;

drop function if exists _clave_nombre(text);
