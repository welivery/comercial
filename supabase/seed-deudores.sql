-- SEED: Clientes CON DEUDA (planilla de deudores 2021-2022).
-- Marca deuda=true + deuda_nota (saldo pendiente) en los que ya están en la base
-- y crea los que faltan como ex-cliente (motivo_baja 'deuda'). Con deuda=true
-- quedan FUERA de la prospección automática y muestran el chip rojo, para no
-- contactarlos sin saber que nos deben. Idempotente por nombre normalizado.
-- Correr una vez en el SQL Editor. (Los nombres venían con prefijo "W ", ya sacado.)

create or replace function _alnum(txt text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(txt,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')
$$;

create temp table _deu (nombre text, saldo bigint, docs int, nota text) on commit drop;
insert into _deu (nombre, saldo, docs, nota) values
('Alinsa Chile S.A.', 407218, 4, '⚠ Deuda histórica: $407.218 CLP en 4 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('GStore', 327488, 4, '⚠ Deuda histórica: $327.488 CLP en 4 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Par de Patos', 1846880, 4, '⚠ Deuda histórica: $1.846.880 CLP en 4 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('VERONAMUSIC', 3175872, 4, '⚠ Deuda histórica: $3.175.872 CLP en 4 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Vitrineo', 456960, 4, '⚠ Deuda histórica: $456.960 CLP en 4 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('BLA DELIVERY', 7628852, 3, '⚠ Deuda histórica: $7.628.852 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Comercial Gabbel', 1171793, 3, '⚠ Deuda histórica: $1.171.793 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('EBOX (FLEX)', 1980642, 3, '⚠ Deuda histórica: $1.980.642 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Paty', 322772, 3, '⚠ Deuda histórica: $322.772 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('T23.cl', 3512722, 3, '⚠ Deuda histórica: $3.512.722 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Vutanmapu', 658784, 3, '⚠ Deuda histórica: $658.784 CLP en 3 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Comercializadora Campos Y Qui', 773496, 2, '⚠ Deuda histórica: $773.496 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('AUDIOTECH SPA', 1763104, 2, '⚠ Deuda histórica: $1.763.104 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('COMERCIALTRICAM.CL_', 580601, 2, '⚠ Deuda histórica: $580.601 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('CasaCopete', 1964436, 2, '⚠ Deuda histórica: $1.964.436 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('HI BEAUTY', 655316, 2, '⚠ Deuda histórica: $655.316 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Importadora Bottai Spa', 68544, 2, '⚠ Deuda histórica: $68.544 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('LAPTOPCHILE SPA', 418880, 2, '⚠ Deuda histórica: $418.880 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Mabelle', 814198, 2, '⚠ Deuda histórica: $814.198 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Machine Center Store', 2363000, 2, '⚠ Deuda histórica: $2.363.000 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Megaventa Online', 323358, 2, '⚠ Deuda histórica: $323.358 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Nubapets', 189492, 2, '⚠ Deuda histórica: $189.492 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('OKmotos Chile', 118405, 2, '⚠ Deuda histórica: $118.405 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('PAÑALES Y PAÑALES', 113288, 2, '⚠ Deuda histórica: $113.288 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('PREXARCADE', 96509, 2, '⚠ Deuda histórica: $96.509 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Perfumisimo', 568354, 2, '⚠ Deuda histórica: $568.354 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Plantasatuhogar', 1129040, 2, '⚠ Deuda histórica: $1.129.040 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Rielsa Spa', 239904, 2, '⚠ Deuda histórica: $239.904 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Teknoportatiles', 656523, 2, '⚠ Deuda histórica: $656.523 CLP en 2 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('ALPHA HERRAMIENTAS', 1329389, 1, '⚠ Deuda histórica: $1.329.389 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Comercializadora Hamelin', 679609, 1, '⚠ Deuda histórica: $679.609 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Ferloys', 1089088, 1, '⚠ Deuda histórica: $1.089.088 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Gadget-Store', 156128, 1, '⚠ Deuda histórica: $156.128 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Globifiesta', 1104320, 1, '⚠ Deuda histórica: $1.104.320 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Hfdigital', 109956, 1, '⚠ Deuda histórica: $109.956 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('JTEC CHILE SPA', 180285, 1, '⚠ Deuda histórica: $180.285 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Knatural', 148512, 1, '⚠ Deuda histórica: $148.512 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Librería ArteMery', 99841, 1, '⚠ Deuda histórica: $99.841 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Lima Limon Enterprise Spa', 102102, 1, '⚠ Deuda histórica: $102.102 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('MI Compra Online', 319872, 1, '⚠ Deuda histórica: $319.872 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Mujerísimas', 15232, 1, '⚠ Deuda histórica: $15.232 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('NELUSH SPA', 285124, 1, '⚠ Deuda histórica: $285.124 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Nintecno', 674016, 1, '⚠ Deuda histórica: $674.016 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Opitra', 21301, 1, '⚠ Deuda histórica: $21.301 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Q´Mascotas', 381990, 1, '⚠ Deuda histórica: $381.990 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('RapidTec', 64736, 1, '⚠ Deuda histórica: $64.736 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Tienda Solo Tu', 47124, 1, '⚠ Deuda histórica: $47.124 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('Tiendaferia spa', 1142043, 1, '⚠ Deuda histórica: $1.142.043 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('anka tools', 171399, 1, '⚠ Deuda histórica: $171.399 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('boost', 76160, 1, '⚠ Deuda histórica: $76.160 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('comercializadora mix', 13685, 1, '⚠ Deuda histórica: $13.685 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.'),
('www.toolpro.cl', 179245, 1, '⚠ Deuda histórica: $179.245 CLP en 1 documento(s) impago(s) (planilla deudores). Revisar estado de pago antes de contactar.');

-- 1) Marcar los que YA están en la base (match por nombre alfanumérico).
update clientes c set
  deuda = true,
  deuda_nota = t.nota
from _deu t
where _alnum(c.nombre) = _alnum(t.nombre);

-- 2) Crear los que faltan como ex-cliente con motivo de baja 'deuda'.
insert into clientes (nombre, segmento, bucket, envios_mes, vendedor_id, motivo_baja, deuda, deuda_nota, nota)
select t.nombre, 'ex_cliente', 'mediano', 0, null, 'deuda', true, t.nota, ''
from _deu t
where not exists (select 1 from clientes c where _alnum(c.nombre) = _alnum(t.nombre));

-- 3) Sacar de las bandejas los leads SIN clasificar de esos deudores, para que
--    ningún vendedor los contacte por error (los ya trabajados no se tocan).
delete from leads l
where l.estado = 'nuevo'
  and exists (select 1 from _deu t where _alnum(l.nombre) = _alnum(t.nombre));

-- 4) Resultado: todos los deudores en la base, con su saldo.
select c.nombre, c.segmento, c.deuda, c.deuda_nota
from clientes c
join _deu t on _alnum(c.nombre) = _alnum(t.nombre)
order by c.nombre;

drop function if exists _alnum(text);

