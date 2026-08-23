-- Welivery Comercial — Migración: LEADS persistentes + créditos de IA.
-- Correr UNA vez en el SQL Editor de Supabase (después del schema base).
-- Idempotente en lo posible (usa IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ──────────────────────────── Enums ────────────────────────────
do $$ begin
  create type lead_estado as enum ('nuevo', 'convertido', 'rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_origen as enum ('ia', 'base');
exception when duplicate_object then null; end $$;

-- ────────────────────── Créditos de IA (por mes) ──────────────────────
-- Límite mensual de búsquedas con IA por vendedor (configurable por el admin).
alter table config_ventas
  add column if not exists leads_limite_mensual int not null default 15;

-- Consumo por vendedor y período ('YYYY-MM').
create table if not exists leads_uso (
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  periodo     text not null,
  usados      int  not null default 0,
  primary key (vendedor_id, periodo)
);

-- ──────────────────────────── Leads ────────────────────────────
create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  vendedor_id    uuid not null references vendedores(id) on delete cascade,
  nombre         text not null,
  clave          text not null,                      -- normalizado, para dedup
  bucket         bucket not null,
  fit            int not null default 0,
  reconquista    boolean not null default false,
  motivo         text not null default '',
  web            text,
  telefono       text,
  email          text,
  fuentes        jsonb not null default '[]'::jsonb,
  origen         lead_origen not null default 'ia',
  estado         lead_estado not null default 'nuevo',
  motivo_rechazo text,
  oportunidad_id uuid references oportunidades(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (vendedor_id, clave)                          -- sin repetir por vendedor
);
create index if not exists idx_leads_vend on leads(vendedor_id, estado);

-- ──────────────────────────── RLS ─────────────────────────────
alter table leads     enable row level security;
alter table leads_uso enable row level security;

-- leads: el vendedor ve/gestiona los suyos; admin ve/gestiona todos.
drop policy if exists "leads: propias select" on leads;
create policy "leads: propias select" on leads for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());

drop policy if exists "leads: propias insert" on leads;
create policy "leads: propias insert" on leads for insert
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());

drop policy if exists "leads: propias update" on leads;
create policy "leads: propias update" on leads for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());

drop policy if exists "leads: admin delete" on leads;
create policy "leads: admin delete" on leads for delete using (is_admin_ventas());

-- leads_uso: lectura del propio o admin. La escritura la hace la Edge Function
-- con service_role (que saltea RLS), así el contador no se puede falsear.
drop policy if exists "uso: propio select" on leads_uso;
create policy "uso: propio select" on leads_uso for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());

-- Reclamo de clientes: cuando un vendedor trae de su base un cliente SIN asignar,
-- se lo asigna a sí mismo para que no aparezca como lead de otro vendedor
-- (evita que se crucen). Solo puede tomar los que están libres (vendedor_id null).
drop policy if exists "cli: vendedor reclama" on clientes;
create policy "cli: vendedor reclama" on clientes for update
  using (vendedor_id is null)
  with check (vendedor_id = current_vendedor_id());
