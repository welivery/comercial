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

## Migraciones sueltas (correr en SQL Editor, una vez c/u)

Correr en este orden si todavía no se corrieron:

1. `segmentos.sql` — segmentos configurables + `objetivos.mix` como jsonb.
2. `leads.sql` + `leads-cupo.sql` — leads persistentes + cupo diario automático.
3. `secuencias.sql` — secuencias de email, pasos e inscripciones.
4. `email-cuentas.sql` — casilla Gmail conectada por vendedor (OAuth).
5. `clientes-contacto.sql` — **contacto/email/telefono/comuna** en `clientes`
   (+ backfill desde `nota` y a los leads ya sembrados).
6. `secuencias-auto.sql` — config de automatización + estado IA por inscripción.

## Secuencias de email — envío y respuestas (Etapas B y C)

**Etapa B — conectar la casilla (self-service por vendedor).**
- Function `gmail-oauth` deployada **SIN Verify JWT**.
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- En Google Cloud (app Interna de Workspace): habilitar Gmail API, scopes
  `gmail.send` + `gmail.readonly`, y el redirect
  `https://<ref>.supabase.co/functions/v1/gmail-oauth`.
- Cada vendedor conecta su casilla desde **Secuencias de email → “Conectar mi email”**.

**Etapa C — motor automático (`secuencias-cron`).**
1. Correr `secuencias-auto.sql`.
2. Deployar la function `secuencias-cron` **SIN Verify JWT**.
3. Secrets adicionales: `ANTHROPIC_API_KEY` (clasificación con IA) y
   `CRON_SECRET` (una clave inventada, protege la función).
4. Programar con **pg_cron** (cada 5 min). En SQL Editor:

   ```sql
   select cron.schedule(
     'secuencias-cron',
     '*/5 * * * *',
     $$ select net.http_post(
          url := 'https://<ref>.supabase.co/functions/v1/secuencias-cron',
          headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
          body := '{}'::jsonb
        ); $$
   );
   ```
   (Requiere las extensiones `pg_cron` y `pg_net` habilitadas en Database →
   Extensions.)
5. Prender **Envío automático** y, si se quiere, **IA** con su nivel de autonomía
   desde **Secuencias de email** (panel de admin). Arranca todo apagado: sin esto
   no se manda ningún mail ni se gasta IA.

El cron: manda el próximo paso de cada inscripción activa cuando llega su fecha,
detecta respuestas en el hilo de Gmail y (si la IA está activa) las clasifica una
sola vez con `claude-haiku` (modelo barato). Con autonomía **“auto en casos
clarísimos”**, un *no* seguro rechaza el lead y corta; el resto (interés o duda)
queda marcado como *respondió* para que el vendedor lo pase a oportunidad. El tope
mensual de clasificaciones acota el costo.
