# Welivery Comercial — capa de datos (Chile)

Proyecto **Supabase independiente**. Espejo de `src/lib/types.ts`.

## Puesta en marcha (una vez)

1. **Correr el esquema + datos de demo.** En el proyecto Supabase → **SQL Editor**
   → pegá el contenido de **`setup.sql`** (schema + RLS + seed) → **Run**.
   Crea las tablas, las políticas RLS y datos de demo (4 vendedores + pipeline +
   clientes + contexto IA).

2. **Crear el usuario admin.** Supabase → **Authentication → Users → Add user**
   → tu email + password (marcá *Auto Confirm*). El trigger crea su fila en
   `vendedores` con rol `vendedor`; convertilo en admin:

   ```sql
   update vendedores set rol = 'admin', nombre = 'Gerencia CL'
   where lower(email) = lower('TU_EMAIL_AQUI');
   ```

3. **Variables de entorno** (en el proveedor de deploy, ej. Cloudflare Pages):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la `anon`/`publishable` key (Settings → API Keys)

## Modelo

- **vendedores** — registro comercial, **desacoplado** de la cuenta de login:
  `user_id` (nullable) enlaza con `auth.users` al registrarse (por email, vía
  trigger). Permite cargar vendedores y pipeline antes de que tengan login.
- **objetivos** — meta mensual por vendedor (reuniones efectivas + mezcla %).
- **oportunidades** — unidad central. Bucket por prioridad (estratégico →
  fulfillment → mediano). El objetivo cuenta las que llegan a `reunion_efectiva`;
  cierre y tiempo-a-cierre salen del mismo flujo (desde `declarada_at`).
- **oportunidad_eventos** — línea de tiempo.
- **clientes** — base comercial (activos / ex con motivo de baja / prospección).
- **contexto_ia / fuentes_ia / reglas_ia / contexto_vendedor** — contexto
  editable por el admin que alimenta al asistente de leads.

## Archivos

- `setup.sql` — todo junto (lo que se corre). Generado de los 3 de abajo.
- `schema.sql` · `rls.sql` · `seed.sql` — por separado.
- `seed.sql` se regenera del mock: `npm run gen:seed` (mantiene la demo en
  sync con `src/data/mock.ts`).

RLS: admin ve/edita todo; el vendedor ve/gestiona solo lo suyo y lee la base +
contexto. El umbral de "estratégico" (1.000 envíos/mes) y la mezcla objetivo son
configurables por el admin.
