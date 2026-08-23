-- Intentos de contacto sin respuesta (llamada / WhatsApp / mail directo que no
-- tuvo respuesta). Sirve para reintentar más tarde y que quede en el historial
-- del lead: el lead sigue "nuevo" (sin clasificar) hasta que al final se pase a
-- oportunidad o se rechace. Correr una vez.

alter table leads add column if not exists contactos_intentos int not null default 0;
alter table leads add column if not exists ultimo_contacto_at timestamptz;
