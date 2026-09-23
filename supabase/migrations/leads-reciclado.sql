-- Reciclado de leads fríos: cuando un lead acumula varios contactos sin respuesta,
-- se reagenda a futuro (proximo_contacto_at) y se reinicia el ciclo
-- (contactos_intentos = 0) para que vuelva a "Buscar leads" como intento nuevo.
-- `reciclado_at` marca que ya se trabajó antes (chip "Reintento"). El historial
-- completo queda en lead_contactos. Idempotente.

alter table leads add column if not exists reciclado_at timestamptz;
