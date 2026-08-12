-- Bucket configurable: enum fijo → text ──────────────────────────────────────
-- Los segmentos pasaron a ser configurables por el admin (tabla `segmentos`,
-- incluye 'chico' y los que se agreguen), pero las columnas `bucket` seguían
-- siendo un enum de 3 valores ('estrategico','fulfillment','mediano'). Por eso
-- fallaba al clasificar una oportunidad/lead/cliente como 'chico' o cualquier
-- segmento nuevo:  invalid input value for enum bucket: "chico".
-- Las pasamos a text para aceptar cualquier id de segmento. Correr una vez.

alter table oportunidades alter column bucket type text using bucket::text;
alter table clientes      alter column bucket type text using bucket::text;
alter table leads         alter column bucket type text using bucket::text;

-- El tipo enum `bucket` queda sin uso; se puede dejar así (inofensivo) o, si no
-- lo referencia nada más, borrarlo:
--   drop type if exists bucket;
