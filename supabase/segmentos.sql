-- Segmentos de cliente configurables ────────────────────────────────────────
-- Reemplaza los "buckets" fijos (estrategico/fulfillment/mediano) por una tabla
-- editable por el admin: nombre, umbral de envíos, color, orden, activo.
--   tipo 'volumen'  → banda por envíos/mes (campo envios_min).
--   tipo 'especial' → se asigna por una regla (hoy: 'fulfillment').
-- Idempotente: se puede correr más de una vez sin romper nada.

create table if not exists segmentos (
  id          text primary key,
  nombre      text        not null,
  tipo        text        not null default 'volumen' check (tipo in ('volumen','especial')),
  envios_min  int,                       -- solo 'volumen': mínimo de envíos/mes
  regla       text,                      -- solo 'especial': p.ej. 'fulfillment'
  color       text        not null default '#7A869C',
  orden       int         not null default 0,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table segmentos enable row level security;

-- Lectura para cualquier usuario autenticado (es config, no dato sensible);
-- escritura solo para el admin comercial.
drop policy if exists "seg: lectura" on segmentos;
create policy "seg: lectura" on segmentos for select using (true);
drop policy if exists "seg: admin edita" on segmentos;
create policy "seg: admin edita" on segmentos for all
  using (is_admin_ventas()) with check (is_admin_ventas());

-- Semilla base (las 4 clasificaciones). No pisa lo que ya haya editado el admin.
insert into segmentos (id, nombre, tipo, envios_min, regla, color, orden) values
  ('estrategico', 'Estratégico', 'volumen',  1000, null,          '#2F5BE6', 1),
  ('fulfillment', 'Fulfillment', 'especial', null, 'fulfillment', '#0F9D8F', 2),
  ('mediano',     'Mediano',     'volumen',  400,  null,          '#7A869C', 3),
  ('chico',       'Chico',       'volumen',  0,    null,          '#A6AEBC', 4)
on conflict (id) do nothing;

-- objetivos.mix: pasar de 3 columnas fijas a un jsonb por segmento
-- ({ "estrategico": 40, "fulfillment": 30, ... }). La suma = 100 la valida la app
-- (los segmentos activos son dinámicos, no se puede con un check estático).
alter table objetivos add column if not exists mix jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'objetivos' and column_name = 'mix_estrategico'
  ) then
    update objetivos set mix = jsonb_build_object(
      'estrategico', mix_estrategico,
      'fulfillment', mix_fulfillment,
      'mediano',     mix_mediano
    )
    where mix = '{}'::jsonb;

    alter table objetivos drop constraint if exists mix_suma_100;
    alter table objetivos drop column if exists mix_estrategico;
    alter table objetivos drop column if exists mix_fulfillment;
    alter table objetivos drop column if exists mix_mediano;
  end if;
end $$;
