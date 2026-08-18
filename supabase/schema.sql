-- Welivery Comercial — Esquema. Proyecto Supabase independiente.
-- Espejo de src/lib/types.ts. RLS y seed en archivos separados
-- (o todo junto en setup.sql).

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
create table config_ventas (
  id                   int primary key default 1,
  pais                 text not null default 'CL',
  umbral_estrategico   int  not null default 1000,   -- envíos/mes ≥ → estratégico
  updated_at           timestamptz not null default now(),
  constraint config_ventas_singleton check (id = 1)
);

-- ───────────────────────────── Vendedores ─────────────────────────────
-- Registro comercial DESACOPLADO de la cuenta de login: `user_id` (nullable)
-- enlaza con auth.users cuando la persona se registra. Así se pueden cargar
-- vendedores y su pipeline antes de que tengan login, y el enganche se hace
-- por email al registrarse (ver trigger abajo).
create table vendedores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  nombre     text not null default '',
  email      text not null,
  rol        rol_ventas not null default 'vendedor',
  zona       text not null default '',
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_vendedores_user on vendedores(user_id);

-- ───────────────────────────── Objetivos ─────────────────────────────
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
create table oportunidades (
  id                    uuid primary key default gen_random_uuid(),
  vendedor_id           uuid references vendedores(id) on delete set null,
  ecommerce             text not null,
  sitio                 text,
  envios_aprox          int  not null default 0,
  lugar_retiro          text not null default '',
  tipo_producto         text not null default '',
  interes               text,
  marca_reconocida      boolean not null default false,
  quiere_fulfillment    boolean not null default false,
  bucket                bucket not null,
  estado                estado_oportunidad not null default 'interesado',
  origen                origen_oportunidad not null default 'manual',
  declarada_at          timestamptz not null default now(),
  reunion_coordinada_at timestamptz,
  reunion_efectiva_at   timestamptz,               -- hito que cuenta al objetivo
  cierre_at             timestamptz,
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
create table clientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  segmento      segmento_cliente not null,
  envios_mes    int not null default 0,
  bucket        bucket not null,
  vendedor_id   uuid references vendedores(id) on delete set null,
  motivo_baja   motivo_baja,
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
  key    text primary key,
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

-- ─────────── Trigger: enganchar vendedor al registrarse (por email) ───────────
-- Engancha el login a una ficha pre-cargada SOLO si el email está confirmado
-- (anti-hijack A2: si no, alguien podía adelantarse al alta de un vendedor/admin
-- y heredar su rol). El enganche corre al crear el usuario y también al confirmar
-- el mail más tarde. El admin se define con un UPDATE tras registrarse.
create or replace function link_vendedor_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new; -- sin email confirmado no se engancha a ninguna ficha existente
  end if;
  update public.vendedores
     set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  if not found then
    insert into public.vendedores (user_id, email, nombre, rol)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''), 'vendedor')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ventas on auth.users;
create trigger on_auth_user_created_ventas
  after insert on auth.users
  for each row execute function link_vendedor_on_signup();

drop trigger if exists on_auth_user_confirmed_ventas on auth.users;
create trigger on_auth_user_confirmed_ventas
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function link_vendedor_on_signup();

-- ─────────── C1 · Un vendedor NO puede auto-escalar su rol ───────────
-- RLS es por fila, no por columna: la política de UPDATE de `vendedores` dejaba
-- pasar `set rol='admin'` sobre la propia fila. Este trigger lo bloquea.
create or replace function vendedores_no_selfescalate()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_ventas() then
    if new.rol     is distinct from old.rol
    or new.user_id is distinct from old.user_id
    or new.email   is distinct from old.email
    or new.activo  is distinct from old.activo then
      raise exception 'No autorizado a cambiar rol/user_id/email/activo';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vend_no_selfescalate on vendedores;
create trigger trg_vend_no_selfescalate
  before update on vendedores
  for each row execute function vendedores_no_selfescalate();
