-- Comentario libre al rechazar un lead (queda en el historial del lead para
-- saber por qué se descartó y no volver a contactarlo). Correr una vez.

alter table leads add column if not exists rechazo_nota text;
