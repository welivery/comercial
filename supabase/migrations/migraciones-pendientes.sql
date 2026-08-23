-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIONES PENDIENTES — Welivery Comercial (tanda registro único + campañas + seguridad)
-- Pegá TODO este archivo en el SQL Editor de Supabase y apretá Run una sola vez.
-- Todo es idempotente. La sección 5 (SEGURIDAD) es CRÍTICA: corrila sí o sí en
-- TODAS las instancias (AR/CL/CO/ES) — arregla escalada de privilegios, exposición
-- del refresh_token de Gmail y secuestro de cuenta en el signup.
--
-- REQUISITO PREVIO: migraciones base del proyecto (incl. seguimiento-diario.sql,
-- clientes-deuda.sql). Verificá el endurecimiento con supabase/verificar-seguridad.sql.
--
-- APARTE (cargas de datos puntuales — corré cada una cuando la necesites):
--   • seed-campania-domingo.sql / campania-domingo-revision.sql / -fusionar.sql
--   • seed-secuencia-domingo.sql · seed-deudores.sql · backfill-web-campania.sql
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
-- │ 2) RLS clientes — el vendedor crea/edita su empresa (solo contacto/notas) + guard M2
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

-- M2 · La policy deja editar empresas "libres", pero RLS es por fila: un vendedor
-- podía cambiar columnas comerciales de una empresa que no es suya (ej: deuda=false
-- para colar un deudor a la prospección, o segmento/envíos). Este trigger limita
-- al no-admin a tocar SOLO contacto/email/teléfono/comuna/nota (+ reclamar la
-- empresa: vendedor_id null → él mismo). El admin no tiene restricción.
create or replace function clientes_vendedor_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare yo uuid;
begin
  if public.is_admin_ventas() then
    return new;
  end if;
  yo := public.current_vendedor_id();
  -- vendedor_id: solo puede quedar igual o pasar de NULL a uno mismo (reclamar).
  if new.vendedor_id is distinct from old.vendedor_id
     and not (old.vendedor_id is null and new.vendedor_id = yo) then
    raise exception 'No autorizado a reasignar la empresa';
  end if;
  -- Columnas comerciales: intactas para un vendedor (las gestiona el admin).
  if new.deuda       is distinct from old.deuda
  or new.deuda_nota  is distinct from old.deuda_nota
  or new.segmento    is distinct from old.segmento
  or new.envios_mes  is distinct from old.envios_mes
  or new.motivo_baja is distinct from old.motivo_baja
  or new.bucket      is distinct from old.bucket then
    raise exception 'No autorizado a cambiar los datos comerciales de la empresa';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_vendedor_guard on clientes;
create trigger trg_clientes_vendedor_guard
  before update on clientes
  for each row execute function clientes_vendedor_guard();


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


-- ┌──────────────────────────────────────────────────────────────────────────
-- │ 5) SEGURIDAD (CRÍTICO) — auto-escalada, refresh_token, hijack de signup, etc.
-- │ (fuente: supabase/seguridad.sql)
-- └──────────────────────────────────────────────────────────────────────────

-- Endurecimiento de seguridad (auditoría) ────────────────────────────────────
-- Corre una vez, en el SQL Editor. Es idempotente. No crea tablas (no dispara el
-- warning de RLS). Cubre:
--   C1  escalada de privilegios: un vendedor se hacía admin con UPDATE a su fila.
--   A1  el refresh_token de Gmail era legible desde el cliente (anon/authenticated).
--   A2  hijack de cuenta: el enganche por email no exigía email confirmado.
--   M1  is_admin_ventas() sin search_path fijo.
--   M2  with check demasiado laxo en el UPDATE de leads.
--   B2  segmentos legibles por usuarios sin login.

-- ── C1 · Un vendedor NO puede cambiarse el rol/user_id/email/activo ────────────
-- RLS es por fila, no por columna: la política de UPDATE de `vendedores` deja
-- pasar cualquier cambio de columna con tal de que siga siendo su fila. Un
-- trigger BEFORE UPDATE bloquea que un no-admin toque columnas sensibles.
create or replace function vendedores_no_selfescalate()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_ventas() then
    if new.rol     is distinct from old.rol
    or new.user_id is distinct from old.user_id
    or new.email   is distinct from old.email
    or new.activo  is distinct from old.activo then
      raise exception 'No autorizado a cambiar rol/user_id/email/activo';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vend_no_selfescalate on vendedores;
create trigger trg_vend_no_selfescalate
  before update on vendedores
  for each row execute function vendedores_no_selfescalate();

-- ── A1 · El refresh_token de Gmail queda ilegible desde el cliente ─────────────
-- Los privilegios de columna se evalúan aparte de RLS: el vendedor sigue viendo
-- su fila (email/provider/conectado_at) pero NO la columna del secreto. Solo la
-- Edge Function con service_role (que saltea esto) lo lee/escribe.
revoke select (refresh_token) on email_cuentas from authenticated, anon;

-- ── A2 · Enganche de login a ficha solo con email confirmado ──────────────────
-- Antes: al registrarse, se linkeaba a una ficha pre-cargada por sola coincidencia
-- de email → alguien podía adelantarse al alta de un vendedor (o del admin) y
-- heredar su ficha/rol. Ahora solo engancha si el email está confirmado, y el
-- enganche también corre cuando se confirma el mail (no solo en el insert).
create or replace function link_vendedor_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Sin email confirmado no se engancha a ninguna ficha existente (anti-hijack).
  if new.email_confirmed_at is null then
    return new;
  end if;
  update public.vendedores
     set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  if not found then
    insert into public.vendedores (user_id, email, nombre, rol)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''), 'vendedor')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Corre al crear el usuario (por si ya viene confirmado, p.ej. alta por admin) y
-- también cuando se confirma el email más tarde (signup normal con confirmación).
drop trigger if exists on_auth_user_created_ventas on auth.users;
create trigger on_auth_user_created_ventas
  after insert on auth.users
  for each row execute function link_vendedor_on_signup();

drop trigger if exists on_auth_user_confirmed_ventas on auth.users;
create trigger on_auth_user_confirmed_ventas
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function link_vendedor_on_signup();

-- ── M1 · is_admin_ventas() con search_path fijo ───────────────────────────────
-- Es la función que gatea TODAS las políticas de admin; la endurecemos igual que
-- current_vendedor_id()/current_rol_ventas().
create or replace function is_admin_ventas()
returns boolean
language sql stable
security definer set search_path = public
as $$ select public.current_rol_ventas() = 'admin'; $$;

-- ── M2 · UPDATE de leads: check acotado (no "cualquier cosa") ──────────────────
-- Permite editar los propios y hacer handoff SOLO a un vendedor activo.
drop policy if exists "leads: propias update" on leads;
create policy "leads: propias update" on leads for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (
    is_admin_ventas()
    or vendedor_id = current_vendedor_id()
    or exists (select 1 from vendedores v where v.id = leads.vendedor_id and v.activo)
  );

-- ── B2 · segmentos solo para usuarios logueados ───────────────────────────────
drop policy if exists "seg: lectura" on segmentos;
create policy "seg: lectura" on segmentos for select
  using (auth.uid() is not null);

