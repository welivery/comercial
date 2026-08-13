-- Racha diaria de seguimientos (gamification, Etapa 3) ───────────────────────
-- Cuenta cuántos "seguimientos" hizo cada vendedor por día (registrar contacto,
-- poner en secuencia, pasar a oportunidad, rechazar, mover oportunidad). Sirve
-- para la racha 🔥 y el anillo "hoy X/meta". Correr una vez.

create table if not exists seguimiento_diario (
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  fecha       date not null,
  hechos      int  not null default 0,
  primary key (vendedor_id, fecha)
);

alter table seguimiento_diario enable row level security;

-- El vendedor ve lo suyo; el admin, todo. La escritura va por la función de
-- abajo (security definer), así que no hace falta política de insert/update.
drop policy if exists "segdia: propio" on seguimiento_diario;
create policy "segdia: propio" on seguimiento_diario for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());

-- Suma 1 al día de hoy (zona Chile) del vendedor que llama. Sin parámetros: el
-- vendedor sale del token, así nadie puede inflar la racha de otro.
create or replace function sumar_seguimiento()
returns void
language plpgsql
security definer set search_path = public
as $$
declare v uuid;
begin
  v := current_vendedor_id();
  if v is null then return; end if;
  insert into seguimiento_diario (vendedor_id, fecha, hechos)
  values (v, (now() at time zone 'America/Santiago')::date, 1)
  on conflict (vendedor_id, fecha) do update set hechos = seguimiento_diario.hechos + 1;
end;
$$;

revoke execute on function sumar_seguimiento() from public, anon;
grant execute on function sumar_seguimiento() to authenticated;
