-- Límites de envío para cuidar la reputación de la casilla y el dominio.
-- - Tope diario de mails por casilla (vendedor).
-- - Espaciado mínimo entre mails de una misma casilla (anti-spam).
-- Correr una vez en el SQL Editor.

-- Config org-wide (configurable por el admin en Secuencias → Automatización).
alter table config_ventas add column if not exists secuencias_max_dia_casilla int not null default 30;
alter table config_ventas add column if not exists secuencias_min_minutos     int not null default 3;

-- Contadores por casilla (los maneja la Edge Function con service_role).
alter table email_cuentas add column if not exists ultimo_envio_at timestamptz;
alter table email_cuentas add column if not exists enviados_hoy    int not null default 0;
alter table email_cuentas add column if not exists enviados_fecha  date;
