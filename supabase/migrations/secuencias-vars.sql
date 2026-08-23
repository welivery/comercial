-- Variables de plantillas más robustas: separar PERSONA (contacto) de EMPRESA.
-- {{empresa}} = nombre del e-commerce (siempre lo tenemos).
-- {{nombre}}  = persona de contacto (no siempre) → se completa con fallback.
-- Correr una vez en el SQL Editor.

-- Persona de contacto a nivel lead (se arrastra desde clientes.contacto).
alter table leads add column if not exists contacto text;

update leads l
set contacto = c.contacto
from clientes c
where l.contacto is null
  and c.contacto is not null
  and l.origen = 'base'
  and l.clave = regexp_replace(
        regexp_replace(translate(lower(c.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)', '', 'g');

-- Empresa del destinatario en la inscripción (para {{empresa}} al enviar).
alter table secuencia_inscripciones add column if not exists destinatario_empresa text;

-- Backfill: en las inscripciones que vienen de un lead, la empresa es el lead.
update secuencia_inscripciones i
set destinatario_empresa = l.nombre
from leads l
where i.destinatario_empresa is null and i.lead_id = l.id;
