-- "Volver a llamar en X días" (snooze) en Seguimiento: al registrar un llamado
-- el vendedor puede posponer el ítem hasta una fecha; mientras tanto no aparece
-- en la bandeja de pendientes. Aplica a leads y oportunidades.
-- Idempotente.

alter table leads         add column if not exists proximo_contacto_at timestamptz;
alter table oportunidades add column if not exists proximo_contacto_at timestamptz;

-- Índices chicos para filtrar "pendientes ahora" (proximo_contacto_at nulo o vencido).
create index if not exists idx_leads_proximo         on leads(proximo_contacto_at);
create index if not exists idx_oportunidades_proximo on oportunidades(proximo_contacto_at);
