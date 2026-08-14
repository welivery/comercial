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
