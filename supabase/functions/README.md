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

## `leads-ia`

Asistente de **prospección con IA** de la vista Vendedor (pantalla "Buscar
leads"). Cruza la base de clientes (activos, ex-clientes, prospección), el
contexto que carga el admin en Configuración, y el objetivo + pipeline del
vendedor, y le pide a la **API de Claude** que sugiera nuevos e-commerces a
prospectar (priorizando el bucket que le falta) e ideas de conversación.

Usa las herramientas **`web_search` + `web_fetch`** de Claude para que las
empresas sugeridas sean **reales y verificables** (nombre, sitio, teléfono,
email extraídos de fuentes reales con su URL — nunca inventados). Esto agrega
latencia (la IA sale a buscar, ~30-60s) y un costo extra de búsqueda web por
llamada, acotado con `max_uses`. Si querés bajar costo/latencia, reducí
`max_uses` en el `index.ts`.

La **API key de Anthropic vive del lado servidor** (secret `ANTHROPIC_API_KEY`),
nunca en el cliente.

Request (POST, body JSON): `{ vendedorId }`.
Response: `{ sugeridos: LeadSugerido[], ideas: IdeaConversacion[] }`.

### Deploy (una vez)

```bash
supabase link --project-ref ykqathdxfpdweftoceke
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # tu key de Anthropic
supabase functions deploy leads-ia
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta
Supabase automáticamente.

> Mientras la función no esté deployada (o falte la key), la pantalla "Buscar
> leads" muestra **sugerencias de demostración** con un aviso, así sigue siendo
> demostrable. Al deployar la función + cargar la key, pasa a leads reales sin
> tocar nada más en el cliente.
