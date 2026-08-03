-- =============================================================
-- Welivery Comercial — SETUP COMPLETO (schema + RLS + seed demo)
-- Correr UNA vez en el SQL Editor de Supabase (proyecto ventas).
-- Genera tablas, políticas RLS y datos de demo (4 vendedores + pipeline).
-- =============================================================

-- ============ 1) SCHEMA ============
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
-- Si existe un vendedor con ese email sin cuenta, lo linkea. Si no, crea uno
-- nuevo con rol 'vendedor'. El admin se define con un UPDATE tras registrarse.
create or replace function link_vendedor_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.vendedores
     set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  if not found then
    insert into public.vendedores (user_id, email, nombre, rol)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''), 'vendedor');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_ventas
  after insert on auth.users
  for each row execute function link_vendedor_on_signup();

-- ============ 2) RLS ============
-- Welivery Comercial — Row Level Security.
-- Dos roles: admin (gerencia comercial) ve y edita todo; vendedor ve/gestiona
-- SOLO sus oportunidades y objetivos, y la base/contexto en lectura.

-- ─────────────────────── Helpers (sin recursión) ───────────────────────
-- vendedor_id del usuario logueado (enlazado por user_id).
create or replace function current_vendedor_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.vendedores where user_id = auth.uid(); $$;

create or replace function current_rol_ventas()
returns rol_ventas
language sql stable security definer set search_path = public
as $$ select rol from public.vendedores where user_id = auth.uid(); $$;

create or replace function is_admin_ventas()
returns boolean language sql stable
as $$ select current_rol_ventas() = 'admin'; $$;

-- Habilitar RLS
alter table config_ventas        enable row level security;
alter table vendedores           enable row level security;
alter table objetivos            enable row level security;
alter table oportunidades        enable row level security;
alter table oportunidad_eventos  enable row level security;
alter table clientes             enable row level security;
alter table contexto_ia          enable row level security;
alter table fuentes_ia           enable row level security;
alter table reglas_ia            enable row level security;
alter table contexto_vendedor    enable row level security;

-- config_ventas: staff lee; admin edita.
create policy "config: staff lee" on config_ventas for select using (auth.uid() is not null);
create policy "config: admin edita" on config_ventas for all using (is_admin_ventas()) with check (is_admin_ventas());

-- vendedores: staff autenticado lee todos (el vendedor necesita ver el equipo en
-- algunos lugares; los datos sensibles se acotan por tabla). Admin gestiona.
create policy "vend: staff lee" on vendedores for select using (auth.uid() is not null);
create policy "vend: admin gestiona" on vendedores for all using (is_admin_ventas()) with check (is_admin_ventas());
-- El vendedor puede actualizar su propia ficha (nombre/zona), no su rol.
create policy "vend: edita propia" on vendedores for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- objetivos: el vendedor ve el suyo; admin ve/edita todos.
create policy "obj: propio o admin" on objetivos for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "obj: admin edita" on objetivos for all
  using (is_admin_ventas()) with check (is_admin_ventas());

-- oportunidades: el vendedor gestiona las suyas; admin ve/gestiona todas.
create policy "op: propias select" on oportunidades for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: propias insert" on oportunidades for insert
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: propias update" on oportunidades for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: admin delete" on oportunidades for delete using (is_admin_ventas());

-- eventos: visibles/insertables si la oportunidad es del vendedor o es admin.
create policy "evt: ver" on oportunidad_eventos for select using (
  is_admin_ventas() or exists (
    select 1 from oportunidades o
    where o.id = oportunidad_eventos.oportunidad_id and o.vendedor_id = current_vendedor_id()));
create policy "evt: agregar" on oportunidad_eventos for insert with check (
  is_admin_ventas() or exists (
    select 1 from oportunidades o
    where o.id = oportunidad_eventos.oportunidad_id and o.vendedor_id = current_vendedor_id()));

-- clientes: todo el equipo lee (insumo de leads); admin gestiona.
create policy "cli: staff lee" on clientes for select using (auth.uid() is not null);
create policy "cli: admin gestiona" on clientes for all using (is_admin_ventas()) with check (is_admin_ventas());

-- contexto IA: staff lee; admin edita.
create policy "ctx: staff lee" on contexto_ia for select using (auth.uid() is not null);
create policy "ctx: admin edita" on contexto_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "fuentes: staff lee" on fuentes_ia for select using (auth.uid() is not null);
create policy "fuentes: admin edita" on fuentes_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "reglas: staff lee" on reglas_ia for select using (auth.uid() is not null);
create policy "reglas: admin edita" on reglas_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "ctxv: staff lee" on contexto_vendedor for select using (auth.uid() is not null);
create policy "ctxv: admin edita" on contexto_vendedor for all using (is_admin_ventas()) with check (is_admin_ventas());

-- ============ 3) SEED (demo) ============
-- Welivery Comercial — Seed de demo (generado desde el mock).
-- Idempotente: usa on conflict do nothing donde hay PK fija.
begin;
insert into config_ventas (id, pais, umbral_estrategico) values (1, 'CL', 1000) on conflict (id) do nothing;
insert into contexto_ia (id, general) values (1, 'Propuesta de valor: entregas 24-48h en RM y 48-72h en regiones, tracking en tiempo real y fulfillment opcional (almacenamiento + armado de pedidos).

Diferenciales: mejor tiempo en regiones que couriers tradicionales; retiro sin costo en bodega del cliente desde 300 envíos/mes.

Zonas fuertes: RM completa, Valparaíso, Concepción. Más débil: extremo norte y sur (subcontratado).

Tarifas de referencia: última milla RM desde $2.490; fulfillment desde $390 por pedido armado.

Foco del trimestre: marcas reconocidas, e-commerce +1.000 envíos/mes y clientes que quieran fulfillment.

Competencia frecuente: Chilexpress, Blue Express, Starken y couriers propios.') on conflict (id) do nothing;
insert into fuentes_ia (key, label, activa, orden) values ('base', 'Base de clientes (activos, ex, prospección)', true, 0) on conflict (key) do nothing;
insert into fuentes_ia (key, label, activa, orden) values ('maps', 'Google Maps / negocios locales', true, 1) on conflict (key) do nothing;
insert into fuentes_ia (key, label, activa, orden) values ('web', 'Sitios web y redes sociales', true, 2) on conflict (key) do nothing;
insert into fuentes_ia (key, label, activa, orden) values ('directorios', 'Directorios de e-commerce CL', true, 3) on conflict (key) do nothing;
insert into fuentes_ia (key, label, activa, orden) values ('resenas', 'Reseñas públicas (detectar dolor)', false, 4) on conflict (key) do nothing;
insert into reglas_ia (tipo, texto, orden) values ('evitar', 'No sugerir ex-clientes dados de baja por deuda.', 0);
insert into reglas_ia (tipo, texto, orden) values ('evitar', 'No proponer clientes ya activos de otro vendedor.', 1);
insert into reglas_ia (tipo, texto, orden) values ('priorizar', 'Priorizar zonas fuertes (RM, Valparaíso, Concepción).', 2);
insert into reglas_ia (tipo, texto, orden) values ('priorizar', 'Reconquistar bajas por precio si mejoró su volumen.', 3);

insert into vendedores (id, email, nombre, rol, zona) values ('11111111-1111-1111-1111-111111111111', 'v1@demo.welivery.cl', 'Camila Rojas', 'vendedor', 'Santiago Centro') on conflict (id) do nothing;
insert into vendedores (id, email, nombre, rol, zona) values ('22222222-2222-2222-2222-222222222222', 'v2@demo.welivery.cl', 'Matías Fuentes', 'vendedor', 'Providencia') on conflict (id) do nothing;
insert into vendedores (id, email, nombre, rol, zona) values ('33333333-3333-3333-3333-333333333333', 'v3@demo.welivery.cl', 'Fernanda Soto', 'vendedor', 'Ñuñoa') on conflict (id) do nothing;
insert into vendedores (id, email, nombre, rol, zona) values ('44444444-4444-4444-4444-444444444444', 'v4@demo.welivery.cl', 'Diego Araya', 'vendedor', 'Las Condes') on conflict (id) do nothing;

insert into objetivos (vendedor_id, periodo, reuniones_efectivas, mix_estrategico, mix_fulfillment, mix_mediano) values ('11111111-1111-1111-1111-111111111111', '2026-08', 12, 40, 30, 30) on conflict (vendedor_id, periodo) do nothing;
insert into objetivos (vendedor_id, periodo, reuniones_efectivas, mix_estrategico, mix_fulfillment, mix_mediano) values ('22222222-2222-2222-2222-222222222222', '2026-08', 12, 35, 45, 20) on conflict (vendedor_id, periodo) do nothing;
insert into objetivos (vendedor_id, periodo, reuniones_efectivas, mix_estrategico, mix_fulfillment, mix_mediano) values ('33333333-3333-3333-3333-333333333333', '2026-08', 12, 45, 25, 30) on conflict (vendedor_id, periodo) do nothing;
insert into objetivos (vendedor_id, periodo, reuniones_efectivas, mix_estrategico, mix_fulfillment, mix_mediano) values ('44444444-4444-4444-4444-444444444444', '2026-08', 10, 30, 30, 40) on conflict (vendedor_id, periodo) do nothing;

insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Kütral Velas', NULL, 320, 'Ñuñoa', 'Velas y deco', NULL, false, false, 'mediano', 'interesado', 'manual', '2026-08-19', NULL, NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'Anho Deco', NULL, 180, 'Maipú', 'Deco hogar', NULL, false, false, 'mediano', 'interesado', 'manual', '2026-08-17', NULL, NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'Fresh Market', NULL, 600, 'Quilicura', 'Alimentos', NULL, false, true, 'fulfillment', 'interesado', 'ia', '2026-08-20', NULL, NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'Ruca Outdoor', NULL, 1400, 'Ñuñoa', 'Outdoor', NULL, false, false, 'estrategico', 'reunion_coordinada', 'ia', '2026-08-08', '2026-08-13', NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'Cachai Snacks', NULL, 750, 'San Joaquín', 'Snacks', NULL, false, true, 'fulfillment', 'reunion_coordinada', 'manual', '2026-08-09', '2026-08-14', NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'Prilana', 'prilana.cl', 2100, 'Quilicura', 'Textil / abrigo', 'Fulfillment + última milla RM', true, true, 'estrategico', 'reunion_efectiva', 'ia', '2026-08-12', '2026-08-15', '2026-08-19', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'Bendito Café', NULL, 410, 'Providencia', 'Café', NULL, false, false, 'mediano', 'reunion_efectiva', 'manual', '2026-08-07', '2026-08-16', '2026-08-16', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111', 'Ñam Mascotas', NULL, 980, 'La Florida', 'Petshop', NULL, false, true, 'fulfillment', 'reunion_efectiva', 'manual', '2026-08-10', '2026-08-18', '2026-08-18', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000009', '11111111-1111-1111-1111-111111111111', 'Verde Limón', NULL, 1800, 'Providencia', 'Cosmética', NULL, true, false, 'estrategico', 'propuesta_enviada', 'manual', '2026-08-04', '2026-08-12', '2026-08-12', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000010', '11111111-1111-1111-1111-111111111111', 'Mundo Bici', NULL, 340, 'Recoleta', 'Deportes', NULL, false, false, 'mediano', 'propuesta_enviada', 'manual', '2026-08-05', '2026-08-13', '2026-08-13', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000011', '11111111-1111-1111-1111-111111111111', 'Deco Norte', NULL, 720, 'Huechuraba', 'Hogar', NULL, false, true, 'fulfillment', 'propuesta_enviada', 'manual', '2026-08-06', '2026-08-14', '2026-08-14', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000012', '11111111-1111-1111-1111-111111111111', 'Bazar Aurora', NULL, 260, 'Estación Central', 'Bazar', NULL, false, false, 'mediano', 'seguimiento', 'manual', '2026-07-30', '2026-08-08', '2026-08-08', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000013', '11111111-1111-1111-1111-111111111111', 'Vitalis', NULL, 1200, 'Las Condes', 'Suplementos', NULL, false, false, 'estrategico', 'seguimiento', 'manual', '2026-07-31', '2026-08-09', '2026-08-09', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000014', '11111111-1111-1111-1111-111111111111', 'Manoseca', NULL, 890, 'Cerrillos', 'Limpieza', NULL, false, true, 'fulfillment', 'cierre_ganado', 'manual', '2026-07-24', '2026-08-05', '2026-08-05', '2026-08-05', NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000015', '11111111-1111-1111-1111-111111111111', 'Café Aroma', NULL, 900, 'Ñuñoa', 'Café de especialidad', NULL, false, true, 'fulfillment', 'cierre_ganado', 'manual', '2026-07-25', '2026-08-03', '2026-08-03', '2026-08-04', NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000016', '11111111-1111-1111-1111-111111111111', 'Tienda Rosa', NULL, 210, 'Independencia', 'Indumentaria', NULL, false, false, 'mediano', 'perdido', 'manual', '2026-08-02', NULL, NULL, NULL, 'Precio (se quedó con courier propio)') on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000017', '11111111-1111-1111-1111-111111111111', 'KioscoYa', NULL, 150, 'Quinta Normal', 'Kiosco online', NULL, false, false, 'mediano', 'perdido', 'manual', '2026-08-01', NULL, NULL, NULL, 'Sin volumen suficiente') on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000018', '22222222-2222-2222-2222-222222222222', 'Nutra Chile', NULL, 1300, 'Providencia', 'Suplementos', NULL, true, false, 'estrategico', 'reunion_efectiva', 'manual', '2026-08-03', '2026-08-12', '2026-08-12', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000019', '22222222-2222-2222-2222-222222222222', 'Sabores del Sur', NULL, 820, 'Maipú', 'Alimentos', NULL, false, true, 'fulfillment', 'propuesta_enviada', 'manual', '2026-08-02', '2026-08-10', '2026-08-10', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000020', '22222222-2222-2222-2222-222222222222', 'BioCasa', NULL, 640, 'La Reina', 'Limpieza eco', NULL, false, true, 'fulfillment', 'reunion_efectiva', 'manual', '2026-08-06', '2026-08-14', '2026-08-14', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000021', '22222222-2222-2222-2222-222222222222', 'PetGo', NULL, 700, 'Ñuñoa', 'Petshop', NULL, false, true, 'fulfillment', 'cierre_ganado', 'manual', '2026-07-28', '2026-08-07', '2026-08-07', '2026-08-08', NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000022', '22222222-2222-2222-2222-222222222222', 'Duna Store', NULL, 300, 'Santiago', 'Accesorios', NULL, false, false, 'mediano', 'seguimiento', 'manual', '2026-08-01', '2026-08-09', '2026-08-09', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000023', '22222222-2222-2222-2222-222222222222', 'Kobe Wear', NULL, 1100, 'Providencia', 'Streetwear', NULL, true, false, 'estrategico', 'propuesta_enviada', 'manual', '2026-08-04', '2026-08-11', '2026-08-11', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000024', '22222222-2222-2222-2222-222222222222', 'Lumen', NULL, 250, 'Recoleta', 'Iluminación', NULL, false, false, 'mediano', 'reunion_coordinada', 'manual', '2026-08-15', '2026-08-06', NULL, NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000025', '33333333-3333-3333-3333-333333333333', 'Andes Gear', NULL, 1600, 'Ñuñoa', 'Outdoor', NULL, true, false, 'estrategico', 'reunion_efectiva', 'manual', '2026-08-05', '2026-08-13', '2026-08-13', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000026', '33333333-3333-3333-3333-333333333333', 'Pura Vida', NULL, 1500, 'Providencia', 'Cosmética natural', NULL, true, false, 'estrategico', 'cierre_ganado', 'manual', '2026-07-27', '2026-08-06', '2026-08-06', '2026-08-09', NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000027', '33333333-3333-3333-3333-333333333333', 'Marea', NULL, 480, 'Las Condes', 'Indumentaria', NULL, false, false, 'mediano', 'reunion_efectiva', 'manual', '2026-08-07', '2026-08-15', '2026-08-15', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000028', '33333333-3333-3333-3333-333333333333', 'Aurora Kids', NULL, 900, 'La Florida', 'Infantil', NULL, false, true, 'fulfillment', 'propuesta_enviada', 'manual', '2026-08-03', '2026-08-12', '2026-08-12', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000029', '33333333-3333-3333-3333-333333333333', 'Trekco', NULL, 1200, 'Maipú', 'Camping', NULL, true, false, 'estrategico', 'reunion_efectiva', 'manual', '2026-08-08', '2026-08-16', '2026-08-16', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000030', '33333333-3333-3333-3333-333333333333', 'Bello Hogar', NULL, 350, 'Recoleta', 'Deco', NULL, false, false, 'mediano', 'seguimiento', 'manual', '2026-08-01', '2026-08-10', '2026-08-10', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000031', '44444444-4444-4444-4444-444444444444', 'Tech Nova', NULL, 800, 'Las Condes', 'Electrónica', NULL, false, true, 'fulfillment', 'reunion_efectiva', 'manual', '2026-08-06', '2026-08-14', '2026-08-14', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000032', '44444444-4444-4444-4444-444444444444', 'Casa Bonita', NULL, 300, 'Vitacura', 'Deco hogar', NULL, false, false, 'mediano', 'reunion_efectiva', 'manual', '2026-08-04', '2026-08-12', '2026-08-12', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000033', '44444444-4444-4444-4444-444444444444', 'Snack Attack', NULL, 260, 'Providencia', 'Snacks', NULL, false, false, 'mediano', 'reunion_efectiva', 'manual', '2026-08-08', '2026-08-16', '2026-08-16', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000034', '44444444-4444-4444-4444-444444444444', 'Vinos del Valle', NULL, 1400, 'Maipú', 'Vinos', NULL, true, false, 'estrategico', 'propuesta_enviada', 'manual', '2026-08-02', '2026-08-11', '2026-08-11', NULL, NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000035', '44444444-4444-4444-4444-444444444444', 'Kids Land', NULL, 520, 'La Reina', 'Juguetería', NULL, false, true, 'fulfillment', 'cierre_ganado', 'manual', '2026-07-26', '2026-08-05', '2026-08-05', '2026-08-10', NULL) on conflict (id) do nothing;
insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values ('a0000000-0000-4000-8000-000000000036', '44444444-4444-4444-4444-444444444444', 'Punto Verde', NULL, 190, 'Ñuñoa', 'Plantas', NULL, false, false, 'mediano', 'seguimiento', 'manual', '2026-08-01', '2026-08-09', '2026-08-09', NULL, NULL) on conflict (id) do nothing;

insert into oportunidad_eventos (oportunidad_id, titulo, detalle, created_at) values ('a0000000-0000-4000-8000-000000000006', 'Reunión efectiva registrada', 'Recorrido de bodega + demo de tracking. Muy interesados en fulfillment.', '2026-08-19');
insert into oportunidad_eventos (oportunidad_id, titulo, detalle, created_at) values ('a0000000-0000-4000-8000-000000000006', 'Reunión coordinada', 'Agendada por WhatsApp con Josefina (ops Prilana).', '2026-08-15');
insert into oportunidad_eventos (oportunidad_id, titulo, detalle, created_at) values ('a0000000-0000-4000-8000-000000000006', 'Bucket asignado: Estratégico', 'Marca reconocida y >1.000 envíos/mes → prioridad estratégica.', '2026-08-12');
insert into oportunidad_eventos (oportunidad_id, titulo, detalle, created_at) values ('a0000000-0000-4000-8000-000000000006', 'Oportunidad declarada', 'Origen: sugerencia de IA (Buscar leads).', '2026-08-12');

insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Manoseca', 'activo', 890, 'fulfillment', '11111111-1111-1111-1111-111111111111', NULL, 'Cliente desde ago 2026');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Café Altura', 'activo', 1500, 'estrategico', '33333333-3333-3333-3333-333333333333', NULL, 'Desde 2024 · muy conforme');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Tienda Verde', 'activo', 420, 'mediano', '22222222-2222-2222-2222-222222222222', NULL, 'Desde 2025');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Café Aroma', 'activo', 900, 'fulfillment', '11111111-1111-1111-1111-111111111111', NULL, 'Cliente nuevo · ago 2026');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Deco Sur', 'activo', 820, 'fulfillment', '22222222-2222-2222-2222-222222222222', NULL, 'Desde 2025');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Zapatería Andes', 'activo', 500, 'mediano', '44444444-4444-4444-4444-444444444444', NULL, 'Desde 2024');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Petmania', 'ex_cliente', 1900, 'estrategico', NULL, 'precio', 'Se fue a Chilexpress (2024)');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Bikeshop Sur', 'ex_cliente', 380, 'mediano', NULL, 'servicio', 'Demoras en regiones (2025)');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('La Despensa', 'ex_cliente', 640, 'fulfillment', NULL, 'cerro', 'Cerró operación online');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Runa Andina', 'prospeccion', 1600, 'estrategico', '11111111-1111-1111-1111-111111111111', NULL, 'Sugerido por IA · 92% fit');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Huerto Bravo', 'prospeccion', 700, 'fulfillment', '11111111-1111-1111-1111-111111111111', NULL, 'Busca 3PL (post LinkedIn)');
insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values ('Petmania', 'prospeccion', 1900, 'estrategico', '11111111-1111-1111-1111-111111111111', NULL, 'Reconquista sugerida por IA');

insert into contexto_vendedor (vendedor_id, foco, texto) values ('11111111-1111-1111-1111-111111111111', 'Estratégico', 'Va bajo en estratégico este mes — priorizar marcas reconocidas y +1.000 envíos en su zona. Buena para outdoor y textil. Evitar alimentos perecederos (no le cierran).') on conflict (vendedor_id) do nothing;
insert into contexto_vendedor (vendedor_id, foco, texto) values ('22222222-2222-2222-2222-222222222222', 'Fulfillment', 'Fuerte en fulfillment. Sugerir e-commerce que pidan tercerizar almacenamiento. Tiene contactos en cosmética y suplementos — aprovechar referidos.') on conflict (vendedor_id) do nothing;
commit;
