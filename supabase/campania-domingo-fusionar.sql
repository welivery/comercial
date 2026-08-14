-- FUSIÓN de duplicados detectados en la campaña "Entrega Domingo".
-- Estas empresas ya existían en la base como EX-CLIENTES, y el seed las cargó de
-- nuevo como prospecto porque el nombre estaba escrito distinto. Este script le
-- pasa la marca de campaña al ex-cliente (conserva su historia) y borra el
-- prospecto duplicado. Pegá TODO y Run una vez.
--
-- ⚠️ La lista de abajo son los pares CONFIRMADOS. Si querés sumar/quitar un par,
--    editá la lista (izquierda = prospecto a borrar, derecha = cliente que queda).
--    Usá los nombres EXACTOS como figuran en la base.

create temp table _pares (prospecto text, cliente text) on commit drop;
insert into _pares (prospecto, cliente) values
  ('Xclusive',       'xclusive.cl'),
  ('WILD FOODS',     'The Wild Foods'),
  ('FarmaLoop',      'Farmaloop SpA'),
  ('Avinari',        'Avinari Chile'),
  ('Kitchen Center', 'Enviame MKP Kitchen Center');

-- 1) Marcar el cliente que QUEDA como campaña (para que entre priorizado, con su
--    historia de ex-cliente → sale como reconquista + gancho domingo).
update clientes c set
  prioridad = true,
  campania  = 'Entrega Domingo',
  prioridad_score = greatest(
    c.prioridad_score,
    coalesce((select max(p.prioridad_score) from clientes p, _pares x
              where p.nombre = x.prospecto and x.cliente = c.nombre), 0)
  )
where c.nombre in (select cliente from _pares);

-- 2) Borrar el prospecto duplicado (solo si sigue como prospección sin asignar).
delete from clientes c
using _pares x
where c.nombre = x.prospecto
  and c.segmento = 'prospeccion'
  and c.vendedor_id is null;

-- 3) Resultado: confirmá que quedó uno solo por empresa.
select nombre, segmento, prioridad, campania, prioridad_score
from clientes
where nombre in (select cliente from _pares) or nombre in (select prospecto from _pares)
order by nombre;
