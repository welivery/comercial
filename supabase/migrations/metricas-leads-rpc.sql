-- Agregados de leads por vendedor para el dashboard admin ─────────────────────
-- Cuenta en Postgres (no trae la tabla al cliente) cuántos leads tiene y trabaja
-- cada vendedor. "Sin trabajar" = lead nuevo, sin intentos de contacto y sin
-- secuencia viva (la pila real pendiente). Correr una vez en el SQL Editor.

create or replace function metricas_leads_por_vendedor()
returns table (
  vendedor_id   uuid,
  total         bigint,
  nuevos        bigint,
  sin_trabajar  bigint,
  en_secuencia  bigint,
  contactados   bigint,
  a_oportunidad bigint,
  rechazados    bigint
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.is_admin_ventas() then
    raise exception 'solo admin';
  end if;
  return query
  select
    l.vendedor_id,
    count(*)::bigint,
    count(*) filter (where l.estado = 'nuevo')::bigint,
    count(*) filter (
      where l.estado = 'nuevo'
        and coalesce(l.contactos_intentos, 0) = 0
        and not exists (
          select 1 from secuencia_inscripciones si
          where si.lead_id = l.id and si.estado not in ('terminada', 'rebotada')
        )
    )::bigint,
    count(*) filter (
      where exists (
        select 1 from secuencia_inscripciones si
        where si.lead_id = l.id and si.estado not in ('terminada', 'rebotada')
      )
    )::bigint,
    count(*) filter (where coalesce(l.contactos_intentos, 0) > 0)::bigint,
    count(*) filter (where l.estado = 'convertido')::bigint,
    count(*) filter (where l.estado = 'rechazado')::bigint
  from leads l
  group by l.vendedor_id;
end;
$$;

-- Solo usuarios logueados la ejecutan; adentro igual se exige admin.
revoke execute on function metricas_leads_por_vendedor() from public, anon;
grant execute on function metricas_leads_por_vendedor() to authenticated;
