-- Backfill del SITIO WEB en los leads de campaña.
-- La planilla de Entrega Domingo vino casi sin email/teléfono (3 y 4 de 223),
-- pero 112 traían sitio web. Ese web quedó guardado dentro de la NOTA de la
-- empresa; esto lo copia al campo `web` del lead para que el vendedor lo tenga a
-- un click (la tarjeta muestra "buscar en su sitio" cuando no hay email).
-- Correr una vez en el SQL Editor.

create or replace function _alnum(txt text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(txt,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')
$$;

update leads l
set web = m.url,
    updated_at = now()
from (
  select c.id, c.nombre,
         (regexp_match(c.nota, 'Web:\s*(https?://[^ ]+)'))[1] as url
  from clientes c
  where c.prioridad and c.nota ~ 'Web:\s*https?://'
) m
where (l.cliente_id = m.id or _alnum(l.nombre) = _alnum(m.nombre))
  and (l.web is null or l.web = '')
  and m.url is not null;

-- Resultado: cuántos leads de campaña quedaron con web / sin web.
select
  count(*) filter (where web is not null and web <> '') as con_web,
  count(*) filter (where web is null or web = '')        as sin_web
from leads
where campania = 'Entrega Domingo';

drop function if exists _alnum(text);
