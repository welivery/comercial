# Capa de datos — Welivery Comercial

Proyecto **Supabase independiente** (uno por país: AR, CL, CO, ES). El esquema es
espejo de `src/lib/types.ts`. Todo el SQL se corre a mano en **SQL Editor** del
proyecto Supabase (no usamos migraciones automáticas de la CLI todavía).

## Estructura de esta carpeta

```
supabase/
├── setup.sql          Instalación base: schema + RLS + seed de demo (todo junto)
├── schema.sql         └─ las 3 partes por separado (setup.sql es la suma)
├── rls.sql
├── seed.sql              (generado del mock: `npm run gen:seed`)
├── migrations/        Cambios incrementales de esquema/RLS/RPC — una vez c/u, EN ORDEN
├── seeds/             Cargas de datos y scripts puntuales (opcionales, por país)
└── functions/         Edge Functions (deploy + secrets) → ver functions/README.md
```

- **`migrations/`** = cambios que van *después* de la instalación base. Cada uno
  se corre **una sola vez** por proyecto. El orden importa (unos dependen de otros).
- **`seeds/`** = datos concretos (campañas, deudores, enriquecimiento) y arreglos
  puntuales. No son parte del esquema; se corren cuando hacen falta.

## Puesta en marcha de un proyecto nuevo (por país)

1. **Esquema base.** SQL Editor → pegar **`setup.sql`** → *Run*. Crea tablas,
   políticas RLS y datos de demo (4 vendedores + pipeline + clientes + contexto IA).

2. **Migraciones.** Correr las de **`migrations/`** en el orden de abajo. Para un
   proyecto que ya venía de antes y quedó atrasado, `migrations/migraciones-pendientes.sql`
   junta las pendientes en el orden correcto (correlo en vez de una por una).

3. **Usuario admin.** Authentication → Users → *Add user* (email + password,
   *Auto Confirm*). El trigger crea su fila en `vendedores` con rol `vendedor`;
   convertilo en admin:

   ```sql
   update vendedores set rol = 'admin', nombre = 'Gerencia CL'
   where lower(email) = lower('TU_EMAIL_AQUI');
   ```

4. **Variables de entorno** (en el proveedor de deploy, ej. Cloudflare Pages):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la `anon` / `publishable` key (Settings → API Keys)

5. **Edge Functions + cron + email.** Ver [`functions/README.md`](functions/README.md)
   y la sección *Funciones y automatización* más abajo.

6. **Datos reales (opcional).** Correr lo que aplique de `seeds/`.

## Orden de migraciones (`migrations/`)

Correr en este orden si todavía no se corrieron. Salvo aviso, son **solo SQL**
(no requieren redeploy de funciones).

1. `segmentos.sql` — segmentos configurables + `objetivos.mix` como jsonb.
2. `leads.sql` + `leads-cupo.sql` — leads persistentes + cupo diario automático.
3. `secuencias.sql` — secuencias de email, pasos e inscripciones.
4. `email-cuentas.sql` — casilla Gmail conectada por vendedor (OAuth).
5. `clientes-contacto.sql` — contacto/email/teléfono/comuna en `clientes` (+ backfill).
6. `secuencias-auto.sql` — config de automatización + estado IA por inscripción.
7. `secuencias-vars.sql` — persona de contacto en el lead + empresa en la inscripción.
8. `secuencias-limites.sql` — tope diario por casilla + espaciado entre mails.
9. `clientes-deuda.sql` — marca de deuda / problema de pago en la base.
10. `leads-reasignar.sql` — reasignar leads entre vendedores.
11. `secuencias-pixel.sql` — tracking de apertura (abierto_at / aperturas).
12. `secuencias-responder.sql` — guardar texto de respuesta + responder a mano.
13. `secuencias-seguimiento.sql` — pendiente_humano + ia_reunion.
14. `leads-rechazo-nota.sql` — comentario libre al rechazar un lead.
15. `leads-contacto.sql` — intentos de contacto sin respuesta (reintentos).
16. `seguridad.sql` — **endurecimiento de seguridad, CORRER SÍ O SÍ.** Bloquea
    auto-escalada a admin, oculta el refresh_token de Gmail al cliente, exige
    email confirmado para enganchar login y arregla políticas laxas. Junto con
    esto, **redeployar** `gmail-oauth`, `leads-ia` y `secuencias-cron` (fixes de
    CSRF, IDOR y fail-open). `secuencias-cron` **necesita `CRON_SECRET`** o queda
    cerrada (fail-closed). Verificar después con `verificar-seguridad.sql`.
17. `secuencias-apertura-rpc.sql` — incremento atómico de aperturas. Redeploy `track`.
18. `metricas-leads-rpc.sql` — agregados de leads por vendedor (RPC, admin).
19. `seguimiento-auto.sql` — seguimiento automático opt-in (arranca APAGADO).
    Redeployar `secuencias-cron`.
20. `bucket-text.sql` — pasa `bucket` de enum a text (segmentos configurables).
21. `seguimiento-diario.sql` — racha diaria: tabla `seguimiento_diario` + RPC
    `sumar_seguimiento()`.

**Registro único + prioridad (posteriores):**

22. `empresa-registro-unico.sql` — la empresa (`clientes`) es fuente única de
    contacto/notas; leads y oportunidades la referencian por `cliente_id`.
23. `clientes-rls-vendedor.sql` — RLS: el vendedor puede crear/editar contacto de
    empresas (no deuda/segmento/envíos).
24. `leads-prioridad.sql` — marca de prioridad/campaña en leads y clientes.
25. `seguimiento-por-vendedor.sql` — RPC `sumar_seguimiento_para(v)` (el admin
    acredita la racha del vendedor que está viendo, no la suya).
26. `oportunidades-delete-vendedor.sql` — RLS: el vendedor puede eliminar SUS
    propias oportunidades (habilita el botón "Eliminar" del detalle). Solo SQL.
27. `seguimiento-proximo-contacto.sql` — columna `proximo_contacto_at` en leads y
    oportunidades para "volver a llamar en X días" (posponer) en Seguimiento. Solo SQL.
28. `lead-contactos.sql` — tabla `lead_contactos` (historial de contactos:
    tipo/resultado/nota) + RLS. Base del funnel Buscar leads → Seguimiento. Solo SQL.
29. `leads-reciclado.sql` — columna `reciclado_at` en leads (marca de reintento
    para el reciclado de leads fríos: 5 contactos sin respuesta en 15 días). Solo SQL.
30. `reciclado-config.sql` — umbrales del reciclado en `config_ventas`
    (min contactos / ventana días / meses de reagenda), editables por el admin en
    Objetivos → "Reglas del embudo". Solo SQL.

**Verificación:** `verificar-seguridad.sql` — consulta de solo lectura para
confirmar que el endurecimiento de `seguridad.sql` quedó aplicado. Correr por país.

## Seeds y datos (`seeds/`)

Se corren cuando hacen falta; ninguno es obligatorio para que la app funcione.

- `seed-campania-domingo.sql` — leads de la campaña "Entrega Domingo" (prioridad).
- `seed-secuencia-domingo.sql` — secuencia de email de esa campaña.
- `campania-domingo-revision.sql` — auditoría: marca cuáles ya son clientes activos.
- `campania-domingo-fusionar.sql` — fusiona variantes de nombre duplicadas.
- `seed-deudores.sql` — marca clientes con deuda (de `CLIENTES_CON_DEUDA.xlsx`).
- `seed-hubspot-enriquecimiento.sql` — enriquece email/teléfono desde el export de
  HubSpot y agrega prospectos nuevos no repetidos.
- `backfill-web-campania.sql` — completa el sitio web de leads de campaña.
- `limpiar-demo.sql` — borra los datos de demo del `seed` base (para arrancar limpio
  en producción).

## Modelo

- **vendedores** — registro comercial, **desacoplado** del login: `user_id`
  (nullable) enlaza con `auth.users` al registrarse (por email, vía trigger).
  Permite cargar vendedores y pipeline antes de que tengan acceso.
- **objetivos** — meta mensual por vendedor (reuniones efectivas + mezcla %).
- **oportunidades** — unidad central. Bucket por prioridad (estratégico →
  fulfillment → mediano). El objetivo cuenta las que **realizaron reunión efectiva**
  (`reunion_efectiva_at`, aunque después se pierdan); cierre y tiempo-a-cierre
  salen del mismo flujo (desde `declarada_at`).
- **oportunidad_eventos** — línea de tiempo.
- **clientes** — base comercial y **registro único** de contacto (activos / ex con
  motivo de baja / prospección; marca de deuda; prioridad/campaña).
- **leads** — pila de prospección por vendedor (referencia a `clientes` vía
  `cliente_id`); `leads_uso` cuenta el límite mensual de búsquedas IA.
- **secuencias / secuencia_pasos / inscripciones** — email saliente + seguimiento.
- **email_cuentas** — casilla Gmail por vendedor (OAuth; refresh_token server-side).
- **seguimiento_diario** — racha diaria por vendedor.
- **contexto_ia / fuentes_ia / reglas_ia / contexto_vendedor** — contexto editable
  por el admin que alimenta al asistente de leads.

RLS: el admin ve/edita todo; el vendedor ve/gestiona solo lo suyo y lee la base +
contexto. Umbrales (ej. "estratégico" = 1.000 envíos/mes) y mezcla objetivo son
configurables por el admin.

El `seed.sql` se regenera del mock para que la demo coincida con la app:
`npm run gen:seed` (lee `src/data/mock.ts`).

## Funciones y automatización (resumen)

Detalle de cada función y su deploy en [`functions/README.md`](functions/README.md).

- **`usuarios`** (CON Verify JWT) — alta/baja de cuentas de acceso desde la app
  (solo admin). Sin secrets propios.
- **`leads-ia`** (SIN Verify JWT) — asistente de prospección con IA. Secret:
  `ANTHROPIC_API_KEY`. Requiere `migrations/leads.sql`.
- **`gmail-oauth`** (SIN Verify JWT) — conectar la casilla Gmail (self-service).
  Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **`enviar-ahora`** / **`responder`** (CON Verify JWT) — enviar el próximo paso o
  responder a mano, por Gmail, en el mismo hilo.
- **`track`** (SIN Verify JWT) — pixel de apertura (aproximado).
- **`secuencias-cron`** (SIN Verify JWT) — motor automático. Secrets:
  `ANTHROPIC_API_KEY` y `CRON_SECRET`. Programar con **pg_cron** cada 5 min:

  ```sql
  select cron.schedule('secuencias-cron', '*/5 * * * *',
    $$ select net.http_post(
         url := 'https://<ref>.supabase.co/functions/v1/secuencias-cron',
         headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
         body := '{}'::jsonb ); $$);
  ```

  (Requiere las extensiones `pg_cron` y `pg_net` en Database → Extensions.)

El envío automático y la IA **arrancan apagados** y se prenden desde
**Secuencias de email** (panel de admin): sin eso no se manda ningún mail ni se
gasta IA. Por casilla se respeta un **tope diario** (default 30/día) y un
**espaciado mínimo** entre mails (default 3 min), configurables ahí mismo.
