-- Datos de contacto + notas en la oportunidad ────────────────────────────────
-- La ficha de la oportunidad ahora guarda su propio contacto (persona, email,
-- teléfono) y un campo de notas libre (aparte del historial de eventos), para
-- dejar asentada más información. Al pasar un lead a oportunidad se copian solos.
-- Correr una vez.

alter table oportunidades add column if not exists contacto text;
alter table oportunidades add column if not exists email    text;
alter table oportunidades add column if not exists telefono text;
alter table oportunidades add column if not exists notas    text;
