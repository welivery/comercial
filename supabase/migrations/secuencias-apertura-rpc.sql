-- Registro atómico de apertura del pixel de tracking ─────────────────────────
-- Antes la Edge Function `track` hacía read-modify-write (select aperturas →
-- update aperturas+1): bajo concurrencia (varias aperturas casi simultáneas) se
-- perdían incrementos. Este UPDATE atómico en una sola sentencia lo evita.
-- Correr una vez en el SQL Editor.

create or replace function registrar_apertura(p_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update secuencia_inscripciones
     set aperturas  = coalesce(aperturas, 0) + 1,
         abierto_at = coalesce(abierto_at, now())
   where id = p_id;
$$;

-- Solo la Edge Function (service_role) puede llamarla. Sin este revoke, Postgres
-- deja EXECUTE a PUBLIC por defecto y cualquiera podría inflar aperturas ajenas.
revoke execute on function registrar_apertura(uuid) from public, anon, authenticated;
