-- Cupo diario de leads por vendedor ─────────────────────────────────────────
-- Cuántos leads nuevos (de la base, gratis) se le cargan automáticamente cada
-- día a cada vendedor. Se configura en Objetivos, por vendedor. Idempotente.

alter table objetivos add column if not exists leads_cupo_diario int not null default 10;
