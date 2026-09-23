-- Historial de contactos de prospección (funnel: Buscar leads → Seguimiento).
-- Cada vez que el vendedor registra un contacto (llamada/WhatsApp/email/reunión)
-- se guarda una fila acá. Es la fuente de verdad del historial que "viaja" con el
-- lead entre pantallas y la base para la regla de reciclado (N contactos sin
-- respuesta en X días). Idempotente.

create table if not exists lead_contactos (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid references leads(id) on delete cascade,
  oportunidad_id uuid references oportunidades(id) on delete cascade,
  cliente_id     uuid references clientes(id) on delete set null,
  vendedor_id    uuid references vendedores(id) on delete set null,
  tipo           text not null,        -- llamada | whatsapp | email | reunion | otro
  resultado      text not null,        -- no_atendio | dejo_mensaje | hable | interesado
  nota           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_lead_contactos_lead on lead_contactos(lead_id, created_at desc);
create index if not exists idx_lead_contactos_op   on lead_contactos(oportunidad_id, created_at desc);

alter table lead_contactos enable row level security;

drop policy if exists "lc: propios select" on lead_contactos;
create policy "lc: propios select" on lead_contactos for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());

drop policy if exists "lc: propios insert" on lead_contactos;
create policy "lc: propios insert" on lead_contactos for insert
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
