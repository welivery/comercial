-- Permitir reasignar un lead a otro vendedor.
-- El USING sigue limitando a "los míos o admin" (un vendedor solo puede tocar
-- SUS leads), pero el WITH CHECK se afloja para que el nuevo dueño pueda ser
-- cualquier vendedor del equipo (reasignación / handoff). El admin ya podía.
-- Correr una vez en el SQL Editor.

drop policy if exists "leads: propias update" on leads;
create policy "leads: propias update" on leads for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (auth.uid() is not null);
