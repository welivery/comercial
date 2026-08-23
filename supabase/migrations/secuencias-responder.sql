-- Guardar el texto de la respuesta del cliente para leerlo/responderlo desde la
-- app. Lo completa el cron al detectar la respuesta. Correr una vez.

alter table secuencia_inscripciones add column if not exists respuesta_texto text;
alter table secuencia_inscripciones add column if not exists respuesta_at    timestamptz;
alter table secuencia_inscripciones add column if not exists ultima_respuesta_manual_at timestamptz;
