-- Welivery Ventas — Esquema (Etapa 1). Proyecto Supabase independiente de Care.
-- Espejo de src/ventas/lib/types.ts. RLS y seed en archivos separados.

-- ───────────────────────────── Enums ─────────────────────────────
create type rol_ventas         as enum ('admin', 'vendedor');
create type bucket             as enum ('estrategico', 'fulfillment', 'mediano');
create type estado_oportunidad as enum (
  'interesado', 'reunion_coordinada', 'reunion_efectiva',
  'propuesta_enviada', 'seguimiento', 'cierre_ganado', 'perdido'
);
create type origen_oportunidad as enum ('manual', 'ia', 'referido');
create type segmento_cliente   as enum ('activo', 'ex_cliente', 'prospeccion');
create type motivo_baja        as enum ('precio', 'servicio', 'cerro', 'deuda', 'otro');

-- ───────────────────── Config de instancia (país) ─────────────────────
-- Umbral de "estratégico" y demás reglas configurables por el admin.
create table config_ventas (
  id                   int primary key default 1,
  pais                 text not null default 'CL',
  umbral_estrategico   int  not null default 1000,   -- envíos/mes ≥ → estratégico
  updated_at           timestamptz not null default now(),
  constraint config_ventas_singleton check (id = 1)
);

-- ───────────────────────────── Vendedores ─────────────────────────────
-- Extiende auth.users (fila creada por trigger al registrarse).
create table vendedores (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  email      text not null,
  rol        rol_ventas not null default 'vendedor',
  zona       text not null default '',
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Objetivos ─────────────────────────────
-- Meta mensual por vendedor. La mezcla se guarda como % por bucket (suma 100).
create table objetivos (
  id                  uuid primary key default gen_random_uuid(),
  vendedor_id         uuid not null references vendedores(id) on delete cascade,
  periodo             text not null,               -- 'YYYY-MM'
  reuniones_efectivas int  not null default 0,
  mix_estrategico     int  not null default 40,
  mix_fulfillment     int  not null default 30,
  mix_mediano         int  not null default 30,
  created_at          timestamptz not null default now(),
  unique (vendedor_id, periodo),
  constraint mix_suma_100 check (mix_estrategico + mix_fulfillment + mix_mediano = 100)
);

-- ───────────────────────────── Oportunidades ─────────────────────────────
-- Unidad central. El bucket se calcula por prioridad al cargar los datos
-- (ver src/ventas/lib/buckets.ts) y se persiste para consultas rápidas.
create table oportunidades (
  id                    uuid primary key default gen_random_uuid(),
  vendedor_id           uuid not null references vendedores(id) on delete set null,
  ecommerce             text not null,
  sitio                 text,
  envios_aprox          int  not null default 0,   -- envíos/mes estimados
  lugar_retiro          text not null default '',
  tipo_producto         text not null default '',
  interes               text,
  -- Insumos de clasificación (por qué cayó en su bucket)
  marca_reconocida      boolean not null default false,
  quiere_fulfillment    boolean not null default false,
  bucket                bucket not null,
  estado                estado_oportunidad not null default 'interesado',
  origen                origen_oportunidad not null default 'manual',
  -- Timestamps del flujo (alimentan objetivo, cierre y tiempo-a-cierre)
  declarada_at          timestamptz not null default now(),
  reunion_coordinada_at timestamptz,
  reunion_efectiva_at   timestamptz,               -- hito que cuenta al objetivo
  cierre_at             timestamptz,               -- solo si estado = cierre_ganado
  perdida_motivo        text,
  created_at            timestamptz not null default now()
);

create table oportunidad_eventos (
  id              uuid primary key default gen_random_uuid(),
  oportunidad_id  uuid not null references oportunidades(id) on delete cascade,
  titulo          text not null,
  detalle         text,
  created_at      timestamptz not null default now()
);

-- ───────────────────────── Base de clientes ─────────────────────────
-- Activos, ex-clientes (con motivo de baja) y prospección. Materia prima IA.
create table clientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  segmento      segmento_cliente not null,
  envios_mes    int not null default 0,
  bucket        bucket not null,
  vendedor_id   uuid references vendedores(id) on delete set null,
  motivo_baja   motivo_baja,                        -- solo ex_cliente
  nota          text not null default '',
  created_at    timestamptz not null default now()
);

-- ───────────────────── Contexto para la IA (editable) ─────────────────────
create table contexto_ia (
  id             int primary key default 1,
  general        text not null default '',
  updated_at     timestamptz not null default now(),
  constraint contexto_ia_singleton check (id = 1)
);

create table fuentes_ia (
  key    text primary key,                          -- maps|web|base|...
  label  text not null,
  activa boolean not null default true,
  orden  int not null default 0
);

create table reglas_ia (
  id     uuid primary key default gen_random_uuid(),
  tipo   text not null check (tipo in ('evitar', 'priorizar')),
  texto  text not null,
  orden  int not null default 0
);

create table contexto_vendedor (
  vendedor_id uuid primary key references vendedores(id) on delete cascade,
  foco        text not null default '',
  texto       text not null default ''
);

-- ───────────────────────────── Índices ─────────────────────────────
create index idx_op_vendedor    on oportunidades(vendedor_id);
create index idx_op_estado      on oportunidades(estado);
create index idx_op_efectiva    on oportunidades(reunion_efectiva_at);
create index idx_objetivos_vp   on objetivos(vendedor_id, periodo);
create index idx_clientes_seg   on clientes(segmento);
create index idx_evt_op         on oportunidad_eventos(oportunidad_id, created_at);

-- ─────────── Trigger: crear fila de vendedor al registrarse ───────────
create or replace function handle_new_vendedor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.vendedores (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''));
  return new;
end;
$$;

create trigger on_auth_vendedor_created
  after insert on auth.users
  for each row execute function handle_new_vendedor();
