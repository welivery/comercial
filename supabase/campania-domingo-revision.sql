-- REVISIÓN / LIMPIEZA de la campaña "Entrega Domingo".
-- USO SIMPLE: pegá TODO este archivo en el SQL Editor de Supabase y apretá Run
-- una sola vez. Primero limpia duplicados y al final te MUESTRA una tabla para
-- revisar (cuáles ya son clientes y cuáles podrían ser un cliente repetido).
-- No borra clientes ni leads ya trabajados: solo prospectos de campaña sin asignar.

-- Normalizador alfanumérico (sin espacios ni símbolos) para cazar variantes.
create or replace function _alnum(txt text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(txt,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')
$$;

-- Necesario para el "parecido" de nombres (fuzzy) de la tabla final.
create extension if not exists pg_trgm;

-- ── Limpieza: fusiona filas de campaña con el MISMO nombre (ignorando espacios/
--    símbolos): deja la mejor (cliente activo > ex-cliente > prospección; con
--    contacto; mejor score) y borra las otras SOLO si son prospección sin asignar.
--    Cubre Mr Click/MrClick, Lippi Outdoor/LippiOutdoor, etc.
with ranked as (
  select id, segmento, vendedor_id,
    row_number() over (
      partition by _alnum(nombre)
      order by
        case segmento when 'activo' then 0 when 'ex_cliente' then 1 else 2 end,
        (contacto is not null or email is not null or telefono is not null) desc,
        prioridad_score desc, created_at
    ) as rn
  from clientes
  where prioridad
)
delete from clientes c
using ranked r
where c.id = r.id
  and r.rn > 1
  and c.segmento = 'prospeccion'
  and c.vendedor_id is null;

-- ── Resultado final: la tabla para REVISAR. Los que ya son clientes van arriba.
--    Si un prospecto tiene un "posible_cliente_existente", probablemente es la
--    misma empresa escrita distinto (ej: "Mr Click" ≈ "Mr Clic") → unificá.
--    Si un estado está mal (una baja que sigue activa), corregí el segmento desde
--    la ficha (botón editar de la fila).
select
  case c.segmento
    when 'activo'     then '✅ YA ES CLIENTE ACTIVO'
    when 'ex_cliente' then '⚠️ EX-CLIENTE (baja)'
    else                   'prospecto nuevo'
  end as estado,
  c.nombre,
  c.segmento,
  (
    select c2.nombre || ' (' || c2.segmento || ')'
    from clientes c2
    where c2.id <> c.id
      and c2.segmento in ('activo','ex_cliente')
      and similarity(c2.nombre, c.nombre) > 0.55
    order by similarity(c2.nombre, c.nombre) desc
    limit 1
  ) as posible_cliente_existente,
  c.envios_mes,
  c.prioridad_score
from clientes c
where c.prioridad
order by
  case c.segmento when 'activo' then 0 when 'ex_cliente' then 1 else 2 end,
  c.nombre;
