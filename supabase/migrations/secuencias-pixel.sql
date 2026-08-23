-- Tracking de apertura de los mails de secuencia (pixel 1x1).
-- La Edge Function `track` marca la apertura cuando el cliente abre el mail.
-- Correr una vez en el SQL Editor.

alter table secuencia_inscripciones add column if not exists abierto_at timestamptz;
alter table secuencia_inscripciones add column if not exists aperturas int not null default 0;
