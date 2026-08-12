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
7. `secuencias-vars.sql` — persona de contacto en el lead + empresa en la inscripción.
8. `secuencias-limites.sql` — tope diario por casilla + espaciado entre mails.
9. `clientes-deuda.sql` — marca de deuda / problema de pago en la base.
10. `leads-reasignar.sql` — permitir reasignar leads entre vendedores.
11. `secuencias-pixel.sql` — tracking de apertura (columnas abierto_at / aperturas).
12. `secuencias-responder.sql` — guardar el texto de la respuesta + responder a mano.
13. `secuencias-seguimiento.sql` — seguimiento infalible: pendiente_humano + ia_reunion.
14. `leads-rechazo-nota.sql` — comentario libre al rechazar un lead (historial).
15. `leads-contacto.sql` — intentos de contacto sin respuesta (reintentos + historial).
16. `seguridad.sql` — **endurecimiento de seguridad (auditoría), CORRER SÍ O SÍ**:
    bloquea auto-escalada a admin, oculta el refresh_token de Gmail al cliente,
    exige email confirmado para enganchar login, y arregla políticas laxas.
    Junto con esto, **redeployar las Edge Functions** `gmail-oauth`, `leads-ia` y
    `secuencias-cron` (traen los fixes de CSRF, IDOR y fail-open). `secuencias-cron`
    **necesita `CRON_SECRET` seteado** o queda cerrada (fail-closed).
17. `secuencias-apertura-rpc.sql` — incremento atómico del contador de aperturas
    (evita perder aperturas concurrentes). Redeployar la función `track`.
18. `metricas-leads-rpc.sql` — agregados de leads por vendedor para el dashboard
    admin (RPC, solo lectura, gateada a admin). Solo SQL, sin redeploy.
19. `seguimiento-auto.sql` — seguimiento automático opt-in: columnas de config
    (activo / días / secuencia por defecto). Arranca APAGADO. Junto con esto,
    **redeployar `secuencias-cron`** (trae el paso que inscribe solo los leads
    "sin tocar"). Requiere el envío automático prendido y casilla conectada.
20. `bucket-text.sql` — **arreglo**: pasa las columnas `bucket` de enum fijo a
    text (los segmentos son configurables). Sin esto falla al clasificar como
    'chico' o cualquier segmento nuevo. Solo SQL, sin redeploy.

El cron sigue vigilando el hilo aunque ya haya respondido: cualquier mensaje NUEVO
del cliente (ej. confirma un horario) frena la cadencia, queda **pendiente** (se
destaca arriba) y la IA marca `ia_reunion` si propone/acepta reunión. Se limpia
cuando el vendedor responde desde la app.

**Function `enviar-ahora`** (forzar envío para probar): deployar **CON** Verify JWT.
Manda el próximo paso de una inscripción al instante (sin cron ni toggle). Usa
los secrets de Google.

**Function `responder`** (responder desde la app): deployar **CON** Verify JWT.
Usa el JWT del vendedor para leer su inscripción (RLS) y el service_role para el
refresh_token; manda la respuesta por Gmail en el mismo hilo. Secrets: los de
Google (ya cargados). Al detectar una respuesta, el cron guarda el texto en
`respuesta_texto` para leerlo en la app.

**Function `track`** (pixel de apertura): deployar SIN Verify JWT. Sin secrets
propios (usa SUPABASE_URL / SERVICE_ROLE inyectados). El cron manda el mail en
HTML con un `<img>` 1x1 que apunta a `/functions/v1/track?i=<inscripcion>`.
Ojo: la apertura es aproximada (muchos clientes bloquean/pre-cargan imágenes).

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

**Límites de envío (reputación / anti-spam):** por casilla se respeta un **tope
diario** (default 30 mails/día) y un **espaciado mínimo** entre mails (default 3
min). Ambos son configurables en Secuencias → Automatización. Como el cron corre
cada ~5 min, en la práctica sale como mucho 1 mail por casilla por corrida, bien
espaciado; el tope diario corta cuando se alcanza.
