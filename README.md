# Welivery Comercial

Herramienta de **seguimiento comercial de vendedores** (CRM liviano). App separada
de Welivery Care: mismo stack y marca, con **datos y deploy independientes por
país** (AR, CL, CO, ES) — mismo código, un proyecto de Supabase y un subdominio
por país.

- **Admin:** dashboard del equipo, objetivos por vendedor (reuniones efectivas +
  mezcla de tipos), base de clientes (activos / ex-clientes con motivo de baja /
  prospección), usuarios y contexto para la IA.
- **Vendedor:** mi avance del mes, pipeline de oportunidades (Kanban), asistente
  de leads con IA y secuencias de email.

Todo se mide sobre la **oportunidad**: el objetivo cuenta las que **realizaron
reunión efectiva** en el mes (aunque después se pierdan); cierre y tiempo-a-cierre
salen del mismo flujo (desde que se declara). Los buckets (Estratégico →
Fulfillment → Mediano) se asignan por prioridad, con umbral configurable
(1.000 envíos/mes por defecto).

## Stack

- **Front:** Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui.
- **Backend/datos:** Supabase (Postgres + Auth + RLS + Edge Functions + pg_cron) —
  un proyecto propio por país (ver [`supabase/`](supabase/)).
- **IA:** API de Claude (Anthropic), llamada desde Edge Functions (key del lado
  servidor, **nunca** en el cliente).
- **Email:** Gmail por vendedor vía OAuth (envío + lectura de respuestas).
- **Deploy:** GitHub + Cloudflare Pages, una instancia por país.

## Requisitos

- Node **22+** (ver `.nvmrc`).
- Una cuenta de Supabase para levantar la base (o usar el mock local sin backend).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves de Supabase
npm run dev                  # http://localhost:5173
```

Scripts:

| Script            | Qué hace                                             |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo (Vite).                       |
| `npm run build`   | Type-check (`tsc -b`) + build de producción.         |
| `npm run preview` | Sirve el build para probarlo local.                  |
| `npm run lint`    | ESLint sobre `src/`.                                 |
| `npm run gen:seed`| Regenera `supabase/seed.sql` desde el mock de demo.  |

## Estructura del proyecto

```
src/
├── pages/         Pantallas (Admin* y Vendedor*) — una por ruta
├── components/    UI reutilizable (Modal, TablaScroll, widgets, ui/ shadcn)
├── hooks/         useData (queries), usePersistedState, etc.
├── data/          api.ts (capa de datos Supabase) · mock.ts (demo) · leads.ts
├── lib/           types, display, metrics, buckets, sla, csv, integraciones/
├── store.tsx      Sesión/rol y "ver como" (admin)
└── index.css      Tokens de marca (color + Poppins) y overrides de tema
supabase/          Esquema, migraciones, seeds y Edge Functions (ver su README)
scripts/           gen-seed.mts (genera el seed de demo desde el mock)
public/            favicon + _redirects (SPA en Cloudflare Pages)
```

La capa de datos vive en `src/data/api.ts` y el modelo de `src/lib/types.ts` es
espejo del esquema de Supabase.

## Datos y despliegue

Todo el SQL (instalación base, migraciones en orden, seeds) y el deploy de las
Edge Functions están documentados en **[`supabase/README.md`](supabase/README.md)**
y **[`supabase/functions/README.md`](supabase/functions/README.md)**.

Para una instancia nueva de un país: crear el proyecto de Supabase, correr
`setup.sql` + las migraciones, cargar las variables de entorno en Cloudflare Pages
y apuntar el subdominio (ej. `comercial.welivery.com.ar`).

## Seguridad

- **Nunca** hay secrets en el repo ni en el cliente. Van en Supabase secrets /
  variables de entorno del proveedor de deploy. `.env.local` está gitignored;
  `.env.example` documenta las claves sin valores.
- La API key de Anthropic y el `refresh_token` de Gmail viven **solo del lado
  servidor** (Edge Functions).
- RLS activo: el vendedor solo ve/gestiona lo suyo. El endurecimiento de seguridad
  (`supabase/migrations/seguridad.sql`) es obligatorio — ver su README.
- Reglas de negocio (autonomía de IA, tonos, prioridades, umbrales) son
  **configurables por el admin**, no hardcodeadas.

## Marca

Tokens de color y tipografía (Poppins) en `src/index.css`, del Manual de Marca de
Welivery: Navy `#152A4F`, azul digital `#2F5BE6`, coral `#F2563A`, menta `#6FE0CB`.
Proporción 60/30/10 (neutros / navy / acentos).

## Contribuir

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md): convenciones de ramas, commits y el gate
de build antes de pushear.

---

Software propietario de Welivery. Uso interno; todos los derechos reservados.
