-- REVISIÓN / LIMPIEZA de la campaña "Entrega Domingo".
-- Objetivo: que ningún lead de campaña sea en realidad un cliente sin avisar, y
-- limpiar duplicados por variantes de nombre (ej: "Mr Click" vs "MrClick").
-- Correr por SECCIONES en el SQL Editor (seleccionar el bloque → Run). Las
-- secciones 3 y 4 son SELECT de auditoría (no cambian nada): mirá el resultado.

-- Normalizador alfanumérico (sin espacios ni símbolos) para cazar variantes.
create or replace function _alnum(txt text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(txt,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')
$$;

-- ─────────────────── 1) DEDUP de campaña por nombre alfanumérico ───────────────────
-- Entre filas de campaña con el MISMO nombre (ignorando espacios/símbolos), deja
-- la "mejor" (cliente activo > ex-cliente > prospección; con contacto; mejor
-- score) y borra las otras SOLO si son prospección sin asignar (no toca clientes
-- ni leads ya trabajados). Cubre Mr Click/MrClick, Lippi Outdoor/LippiOutdoor, etc.
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

-- ─────────────────── 2) (opcional) Requiere pg_trgm para el fuzzy de la sección 4 ───────────────────
create extension if not exists pg_trgm;

-- ─────────────────── 3) AUDITORÍA: campaña que YA es cliente ───────────────────
-- Mostrá esto y revisá que el segmento sea correcto. Si algo figura mal (ej:
-- "baja" que en realidad está activo), corregilo desde la ficha (botón editar,
-- campo Segmento). Ordena clientes/ex-clientes arriba.
select
  case c.segmento
    when 'activo'     then '✅ CLIENTE ACTIVO — ofrecer domingo como upsell (no prospección fría)'
    when 'ex_cliente' then '⚠️ EX-CLIENTE (baja) — reconquista + gancho domingo (¿el estado es correcto?)'
    else '· prospecto nuevo'
  end as estado,
  c.nombre, c.segmento, c.envios_mes, c.prioridad_score,
  v.nombre as vendedor, left(c.nota, 120) as nota
from clientes c
left join vendedores v on v.id = c.vendedor_id
where c.prioridad
order by
  case c.segmento when 'activo' then 0 when 'ex_cliente' then 1 else 2 end,
  c.nombre;

-- ─────────────────── 4) AUDITORÍA FUZZY: prospecto de campaña PARECIDO a un cliente ───────────────────
-- Caza los que entraron como prospecto nuevo pero probablemente YA existen en tu
-- base con el nombre escrito distinto (ej: "Mr Click" ≈ "Mr Clic"). Revisá cada
-- par: si son la misma empresa, borrá el prospecto duplicado y quedate con el
-- cliente (o corregí el nombre). No borra nada solo.
select
  p.nombre as prospecto_campania,
  c.nombre as cliente_en_base,
  c.segmento as segmento_cliente,
  round(similarity(p.nombre, c.nombre)::numeric, 2) as parecido
from clientes p
join clientes c
  on c.id <> p.id
  and c.segmento in ('activo','ex_cliente')
  and similarity(p.nombre, c.nombre) > 0.55
where p.prioridad and p.segmento = 'prospeccion'
order by parecido desc, p.nombre;

-- Al terminar podés limpiar el helper (opcional):
-- drop function if exists _alnum(text);
