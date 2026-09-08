-- Permitir que el VENDEDOR elimine SUS propias oportunidades (antes solo admin).
-- El botón "Eliminar" del detalle de la oportunidad depende de esta política.
-- El historial (oportunidad_eventos) se borra por cascade; los leads ligados
-- quedan con oportunidad_id = null (FK on delete set null) y la app los reactiva.
--
-- Idempotente: se puede correr varias veces.

drop policy if exists "op: admin delete" on oportunidades;
drop policy if exists "op: propias delete" on oportunidades;
create policy "op: propias delete" on oportunidades for delete
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
