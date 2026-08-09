-- Etapa C: envío automático de secuencias + detección y clasificación de
-- respuestas con IA. Correr UNA vez en el SQL Editor de Supabase.
-- El procesamiento lo hace la Edge Function `secuencias-cron` (service_role),
-- disparada por pg_cron. Todo arranca APAGADO: no se envía ni se gasta IA hasta
-- que el admin lo prende en Secuencias de email.

-- ── Config de automatización (org-wide, en config_ventas id=1) ────────────────
alter table config_ventas add column if not exists secuencias_envio_activo   boolean not null default false;
alter table config_ventas add column if not exists secuencias_ia_activa      boolean not null default false;
alter table config_ventas add column if not exists secuencias_ia_autonomia   text    not null default 'auto_claros';
alter table config_ventas add column if not exists secuencias_ia_limite_mensual int  not null default 200;

do $$ begin
  alter table config_ventas
    add constraint secuencias_ia_autonomia_chk check (secuencias_ia_autonomia in ('sugiere', 'auto_claros'));
exception when duplicate_object then null; end $$;

-- ── Estado de envío / IA por inscripción ──────────────────────────────────────
alter table secuencia_inscripciones add column if not exists ultimo_envio_at  timestamptz;
alter table secuencia_inscripciones add column if not exists gmail_thread_id  text;
alter table secuencia_inscripciones add column if not exists gmail_message_id text;
alter table secuencia_inscripciones add column if not exists ia_sentimiento   text;   -- positivo | negativo | duda
alter table secuencia_inscripciones add column if not exists ia_confianza     numeric; -- 0..1
alter table secuencia_inscripciones add column if not exists ia_resumen       text;
alter table secuencia_inscripciones add column if not exists ia_clasificado_at timestamptz;

-- Índice para que el cron encuentre rápido lo que toca enviar.
create index if not exists idx_insc_envio
  on secuencia_inscripciones (estado, proximo_envio_at)
  where estado = 'activa';

-- ── Tope mensual de clasificaciones con IA (control de costo) ─────────────────
create table if not exists secuencias_ia_uso (
  periodo text primary key,       -- "YYYY-MM"
  usados  int not null default 0
);
alter table secuencias_ia_uso enable row level security;
drop policy if exists "ia_uso: staff lee" on secuencias_ia_uso;
create policy "ia_uso: staff lee" on secuencias_ia_uso for select using (auth.uid() is not null);
-- La escritura la hace la Edge Function con service_role (bypassa RLS).
