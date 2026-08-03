# Edge Functions — Welivery Comercial

## `usuarios`

Gestión de **cuentas de acceso** (auth) desde la app, solo para admins. Usa
`service_role` del lado servidor (nunca en el cliente) para crear/eliminar
usuarios de `auth.users`, validando que quien llama sea admin.

Acciones (POST, body JSON):
- `{ action: "crear", email, password, nombre, zona, rol }` → crea la cuenta
  (email confirmado) y completa su ficha en `vendedores`.
- `{ action: "eliminar", user_id, vendedor_id }` → borra la cuenta y la ficha.
- `{ action: "password", user_id, password }` → resetea la contraseña.

### Deploy (una vez, con Supabase CLI)

```bash
# instalar CLI si no la tenés: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref ykqathdxfpdweftoceke
supabase functions deploy usuarios
```

No hace falta cargar secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en el entorno
de Functions.

> Mientras la función no esté deployada, la app igual funciona: crear un usuario
> **sin contraseña** (solo ficha) y el **auto-registro** desde el login andan sin
> la función. La función habilita crear usuarios **con acceso directo** y borrar
> cuentas desde la app.
