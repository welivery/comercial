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
