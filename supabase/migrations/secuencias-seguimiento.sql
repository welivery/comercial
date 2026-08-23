-- Seguimiento infalible de respuestas: la IA sigue vigilando el hilo aunque ya
-- haya respondido una vez, y cualquier mensaje NUEVO del cliente queda marcado
-- como "pendiente" hasta que el humano lo responde. Correr una vez.

-- Hay un mensaje del cliente sin responder (primera respuesta o una posterior).
alter table secuencia_inscripciones add column if not exists pendiente_humano boolean not null default false;

-- La IA detectó que el cliente propone/acepta una reunión u horario.
alter table secuencia_inscripciones add column if not exists ia_reunion boolean not null default false;

-- Marcar como pendiente las que ya están en "respondió" (para no perder las viejas).
update secuencia_inscripciones set pendiente_humano = true where estado = 'respondio';
