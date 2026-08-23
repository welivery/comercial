-- Seguimiento automático de leads (opt-in, org-wide) ─────────────────────────
-- Cuando está ACTIVO, el cron inscribe solo en una secuencia por defecto a los
-- leads "sin tocar" (nuevo, 0 contactos, sin secuencia) que pasaron N días, así
-- se garantiza al menos un primer seguimiento sin depender del vendedor.
-- Arranca APAGADO. Correr una vez en el SQL Editor.

alter table config_ventas add column if not exists seguimiento_auto_activo boolean not null default false;
alter table config_ventas add column if not exists seguimiento_auto_dias int not null default 3;
alter table config_ventas
  add column if not exists seguimiento_auto_secuencia_id uuid references secuencias(id) on delete set null;
