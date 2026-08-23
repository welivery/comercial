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
