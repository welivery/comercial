-- Verificación de endurecimiento de seguridad. Corré esto en CADA instancia
-- (AR/CL/CO/ES) para confirmar que el hardening está aplicado. Todas las filas
-- deben decir OK. Si alguna dice FALTA, corré migraciones-pendientes.sql (o
-- seguridad.sql) en esa instancia.

select 'C1 · trigger anti auto-escalada de rol' as chequeo,
  case when exists (select 1 from pg_trigger where tgname = 'trg_vend_no_selfescalate')
       then 'OK' else 'FALTA' end as estado
union all
select 'A1 · refresh_token de Gmail no legible por authenticated',
  case when not has_column_privilege('authenticated', 'public.email_cuentas', 'refresh_token', 'SELECT')
       then 'OK' else 'FALTA' end
union all
select 'A2 · signup exige email confirmado',
  case when exists (
    select 1 from pg_proc
    where proname = 'link_vendedor_on_signup'
      and pg_get_functiondef(oid) ilike '%email_confirmed_at is null%'
  ) then 'OK' else 'FALTA' end
union all
select 'A2 · trigger de confirmación de email',
  case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_confirmed_ventas')
       then 'OK' else 'FALTA' end
union all
select 'M2 · guard de columnas comerciales en clientes',
  case when exists (select 1 from pg_trigger where tgname = 'trg_clientes_vendedor_guard')
       then 'OK' else 'FALTA' end;
