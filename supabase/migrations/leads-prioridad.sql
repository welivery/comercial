-- Leads de CAMPAÑA con PRIORIDAD de contacto.
-- Algunas empresas son objetivo de una campaña puntual (ej: "Entrega Domingo",
-- el servicio nuevo que queremos promocionar) y tienen que contactarse PRIMERO.
-- Marca sobre la EMPRESA (registro único): `prioridad` + `campania`. Los leads
-- que salen de esas empresas heredan la marca y la siembra los reparte primero,
-- respetando las mismas reglas de dedup (no repetir entre vendedores ni dentro).
-- `prioridad_score` ordena DENTRO de la campaña (mayor = se contacta antes).
-- Correr UNA vez en el SQL Editor de Supabase (después del schema base + leads).

-- ── Empresa (clientes): marca de campaña/prioridad ──────────────────────────
alter table clientes add column if not exists prioridad       boolean not null default false;
alter table clientes add column if not exists campania        text;
alter table clientes add column if not exists prioridad_score int not null default 0;

-- ── Lead: hereda la marca (para verla y ordenar sin joinear la empresa) ──────
alter table leads add column if not exists prioridad boolean not null default false;
alter table leads add column if not exists campania  text;

-- Índices para que la siembra priorice barato (prioridad primero, mejor score).
create index if not exists idx_clientes_prioridad
  on clientes (prioridad, prioridad_score desc)
  where prioridad;
create index if not exists idx_leads_prioridad
  on leads (vendedor_id, prioridad)
  where prioridad;
