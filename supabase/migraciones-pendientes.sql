-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIONES PENDIENTES — Welivery Comercial (tanda registro único + campañas)
-- Pegá TODO este archivo en el SQL Editor de Supabase y apretá Run una sola vez.
-- Todo es idempotente: si alguna ya la corriste, no rompe (usa IF NOT EXISTS /
-- CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- REQUISITO PREVIO: tienen que estar corridas las migraciones base del proyecto,
-- incluida `seguimiento-diario.sql` (tabla seguimiento_diario + sumar_seguimiento).
--
-- APARTE (cargas de datos puntuales — corré cada una cuando la necesites, NO están
-- acá porque son datos, no esquema):
--   • seed-campania-domingo.sql     — 219 leads de la campaña Entrega Domingo
--   • campania-domingo-revision.sql — dedup + auditoría de la campaña
--   • campania-domingo-fusionar.sql — fusiona duplicados confirmados
--   • seed-secuencia-domingo.sql    — secuencia de email "Entrega Domingo"
--   • seed-deudores.sql             — clientes con deuda (planilla)
--   • backfill-web-campania.sql     — copia el sitio web a los leads de campaña
-- ════════════════════════════════════════════════════════════════════════════



-- ┌──────────────────────────────────────────────────────────────────────────
-- │ 1) REGISTRO ÚNICO — la empresa (clientes) es la fuente de verdad del contacto/notas
-- │ (fuente: supabase/empresa-registro-unico.sql)
-- └──────────────────────────────────────────────────────────────────────────

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


-- ┌──────────────────────────────────────────────────────────────────────────
-- │ 2) RLS — el vendedor puede crear/editar su empresa (evita el error al crear oportunidad)
-- │ (fuente: supabase/clientes-rls-vendedor.sql)
-- └──────────────────────────────────────────────────────────────────────────

-- RLS de `clientes` para el REGISTRO ÚNICO.
-- Con registro único, crear/editar una oportunidad o un lead puede crear o
-- actualizar la EMPRESA (tabla clientes). Antes solo el admin podía escribir en
-- clientes, así que al vendedor le saltaba:
--   "new row violates row-level security policy for table clientes"
-- Esto habilita al vendedor a:
--   • CREAR su propia empresa de prospección (vendedor_id = él, segmento prospección).
--   • EDITAR una empresa que es suya o que está sin asignar (contacto/notas, o reclamarla).
-- El admin sigue con acceso total (política "cli: admin gestiona"). Correr una vez.

-- INSERT: el vendedor puede crear un prospecto propio (no clientes activos/ex).
drop policy if exists "cli: vendedor crea prospecto" on clientes;
create policy "cli: vendedor crea prospecto" on clientes for insert
  with check (
    is_admin_ventas()
    or (vendedor_id = current_vendedor_id() and segmento = 'prospeccion')
  );

-- UPDATE: reemplaza la vieja "cli: vendedor reclama" (que solo permitía tomar
-- las libres). Ahora puede editar las suyas o las libres, y el resultado debe
-- quedar suyo o libre (no puede pasársela a otro).
drop policy if exists "cli: vendedor reclama" on clientes;
drop policy if exists "cli: vendedor edita propio o libre" on clientes;
create policy "cli: vendedor edita propio o libre" on clientes for update
  using (vendedor_id = current_vendedor_id() or vendedor_id is null)
  with check (vendedor_id = current_vendedor_id() or vendedor_id is null);


-- ┌──────────────────────────────────────────────────────────────────────────
-- │ 3) PRIORIDAD / CAMPAÑA — leads de campaña con prioridad de contacto
-- │ (fuente: supabase/leads-prioridad.sql)
-- └──────────────────────────────────────────────────────────────────────────

-- Leads de CAMPAÑA con PRIORIDAD de contacto.
-- Algunas empresas son objetivo de una campaña puntual (ej: "Entrega Domingo",
-- el servicio nuevo que queremos promocionar) y tienen que contactarse PRIMERO.
-- Marca sobre la EMPRESA (registro único): `prioridad` + `campania`. Los leads
-- que salen de esas empresas heredan la marca y la siembra los reparte primero,
-- respetando las mismas reglas de dedup (no repetir entre vendedores ni dentro).
-- `prioridad_score` ordena DENTRO de la campaña (mayor = se contacta antes).
-- Correr UNA vez en el SQL Editor de Supabase (después del schema base + leads).

-- ── Empresa (clientes): marca de campaña/prioridad ──────────────────────────
alter table clientes add column if not exists prioridad       boolean not null default false;
alter table clientes add column if not exists campania        text;
alter table clientes add column if not exists prioridad_score int not null default 0;

-- ── Lead: hereda la marca (para verla y ordenar sin joinear la empresa) ──────
alter table leads add column if not exists prioridad boolean not null default false;
alter table leads add column if not exists campania  text;

-- Índices para que la siembra priorice barato (prioridad primero, mejor score).
create index if not exists idx_clientes_prioridad
  on clientes (prioridad, prioridad_score desc)
  where prioridad;
create index if not exists idx_leads_prioridad
  on leads (vendedor_id, prioridad)
  where prioridad;


-- ┌──────────────────────────────────────────────────────────────────────────
-- │ 4) RACHA POR VENDEDOR — se acredita al vendedor de la acción (no al admin)
-- │ (fuente: supabase/seguimiento-por-vendedor.sql)
-- └──────────────────────────────────────────────────────────────────────────

-- Racha por vendedor DUEÑO de la acción (no por el del token).
-- Cuando el admin trabaja "como" un vendedor (Vista Vendedor), el lead/oportunidad
-- ya se crea a nombre de ESE vendedor; esto hace que la racha también se le
-- acredite a él, y no al admin. Un vendedor normal solo puede acreditarse a sí
-- mismo (no puede inflar la racha de otro). Correr una vez, después de
-- seguimiento-diario.sql.

create or replace function sumar_seguimiento_para(v uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if v is null then return; end if;
  -- Solo el admin puede acreditar a otro vendedor; el vendedor, solo a sí mismo.
  if not is_admin_ventas() and v <> current_vendedor_id() then
    return;
  end if;
  insert into seguimiento_diario (vendedor_id, fecha, hechos)
  values (v, (now() at time zone 'America/Santiago')::date, 1)
  on conflict (vendedor_id, fecha) do update set hechos = seguimiento_diario.hechos + 1;
end;
$$;

revoke execute on function sumar_seguimiento_para(uuid) from public, anon;
grant execute on function sumar_seguimiento_para(uuid) to authenticated;

