-- Endurecimiento de seguridad (auditoría) ────────────────────────────────────
-- Corre una vez, en el SQL Editor. Es idempotente. No crea tablas (no dispara el
-- warning de RLS). Cubre:
--   C1  escalada de privilegios: un vendedor se hacía admin con UPDATE a su fila.
--   A1  el refresh_token de Gmail era legible desde el cliente (anon/authenticated).
--   A2  hijack de cuenta: el enganche por email no exigía email confirmado.
--   M1  is_admin_ventas() sin search_path fijo.
--   M2  with check demasiado laxo en el UPDATE de leads.
--   B2  segmentos legibles por usuarios sin login.

-- ── C1 · Un vendedor NO puede cambiarse el rol/user_id/email/activo ────────────
-- RLS es por fila, no por columna: la política de UPDATE de `vendedores` deja
-- pasar cualquier cambio de columna con tal de que siga siendo su fila. Un
-- trigger BEFORE UPDATE bloquea que un no-admin toque columnas sensibles.
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

-- ── A1 · El refresh_token de Gmail queda ilegible desde el cliente ─────────────
-- Los privilegios de columna se evalúan aparte de RLS: el vendedor sigue viendo
-- su fila (email/provider/conectado_at) pero NO la columna del secreto. Solo la
-- Edge Function con service_role (que saltea esto) lo lee/escribe.
revoke select (refresh_token) on email_cuentas from authenticated, anon;

-- ── A2 · Enganche de login a ficha solo con email confirmado ──────────────────
-- Antes: al registrarse, se linkeaba a una ficha pre-cargada por sola coincidencia
-- de email → alguien podía adelantarse al alta de un vendedor (o del admin) y
-- heredar su ficha/rol. Ahora solo engancha si el email está confirmado, y el
-- enganche también corre cuando se confirma el mail (no solo en el insert).
create or replace function link_vendedor_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Sin email confirmado no se engancha a ninguna ficha existente (anti-hijack).
  if new.email_confirmed_at is null then
    return new;
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

-- Corre al crear el usuario (por si ya viene confirmado, p.ej. alta por admin) y
-- también cuando se confirma el email más tarde (signup normal con confirmación).
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

-- ── M1 · is_admin_ventas() con search_path fijo ───────────────────────────────
-- Es la función que gatea TODAS las políticas de admin; la endurecemos igual que
-- current_vendedor_id()/current_rol_ventas().
create or replace function is_admin_ventas()
returns boolean
language sql stable
security definer set search_path = public
as $$ select public.current_rol_ventas() = 'admin'; $$;

-- ── M2 · UPDATE de leads: check acotado (no "cualquier cosa") ──────────────────
-- Permite editar los propios y hacer handoff SOLO a un vendedor activo.
drop policy if exists "leads: propias update" on leads;
create policy "leads: propias update" on leads for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (
    is_admin_ventas()
    or vendedor_id = current_vendedor_id()
    or exists (select 1 from vendedores v where v.id = leads.vendedor_id and v.activo)
  );

-- ── B2 · segmentos solo para usuarios logueados ───────────────────────────────
drop policy if exists "seg: lectura" on segmentos;
create policy "seg: lectura" on segmentos for select
  using (auth.uid() is not null);
