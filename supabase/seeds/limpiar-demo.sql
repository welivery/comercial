-- Welivery Comercial — Limpieza de datos de DEMO.
-- Corré esto UNA vez en el SQL Editor de Supabase para arrancar en limpio: el
-- dashboard y el pipeline pasan a alimentarse solo de lo que carguen los
-- vendedores reales. No toca tus vendedores/usuarios ni la config.

begin;

-- ── A) Oportunidades de demo (lo que infla el dashboard) ──────────────────
-- Las 36 del seed tienen id que empieza con 'a0000000-'. Borrarlas también
-- borra sus eventos (cascade). Deja intactas las que carguen los vendedores.
delete from oportunidades where id::text like 'a0000000-%';

-- ── B) Vendedores de demo que hayan quedado (v1..v4 @demo.welivery.cl) ─────
-- Borrarlos limpia sus objetivos y contexto (cascade). Si ya no existen, no pasa nada.
delete from vendedores where email like '%@demo.welivery.cl';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- OPCIONAL — Base de clientes y leads de demo.
-- Corré esto SOLO si querés también vaciar los clientes/leads de prueba.
-- (Si ya importaste clientes reales, revisá que ninguno se llame igual a estos.)

-- begin;
-- delete from clientes where nombre in (
--   'Manoseca','Café Altura','Tienda Verde','Café Aroma','Deco Sur',
--   'Zapatería Andes','Petmania','Bikeshop Sur','La Despensa',
--   'Runa Andina','Huerto Bravo'
-- );
-- -- Reset de leads (arrancan a generarse de nuevo desde la base real / IA):
-- delete from leads;
-- delete from leads_uso;
-- commit;
