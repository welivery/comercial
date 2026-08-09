-- Conexión de email por vendedor (OAuth Google) ──────────────────────────────
-- Guarda la casilla conectada + el refresh_token para enviar secuencias desde
-- el correo real del vendedor. El token lo escribe la Edge Function gmail-oauth
-- con service_role; el front nunca lo lee. Idempotente.

create table if not exists email_cuentas (
  vendedor_id   uuid primary key references vendedores(id) on delete cascade,
  email         text not null default '',
  refresh_token text not null,
  provider      text not null default 'google',
  conectado_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table email_cuentas enable row level security;

-- El vendedor ve/borra su propia conexión; el admin todas. La escritura del
-- token la hace la Edge Function (service_role, saltea RLS).
drop policy if exists "email: propio ver" on email_cuentas;
create policy "email: propio ver" on email_cuentas for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
drop policy if exists "email: propio borra" on email_cuentas;
create policy "email: propio borra" on email_cuentas for delete
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
