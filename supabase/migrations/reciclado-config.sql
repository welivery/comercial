-- Umbrales del reciclado de leads fríos, configurables por el admin (por país).
-- Antes eran constantes en el front (lib/funnel). Idempotente.

alter table config_ventas add column if not exists reciclar_min_contactos int  not null default 5;
alter table config_ventas add column if not exists reciclar_ventana_dias  int  not null default 15;
alter table config_ventas add column if not exists reciclar_meses         text not null default '1,2,3';
