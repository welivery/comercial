# Welivery Ventas — capa de datos (Chile)

Seguimiento comercial de vendedores. **App separada** de Welivery Care: mismo
stack y marca, **proyecto de Supabase independiente** (datos separados). Por eso
el esquema vive acá y **no** en `supabase/migrations/` (esas son de Care).

- `schema.sql` — enums + tablas del dominio comercial.
- `rls.sql` — Row Level Security (admin ve todo; vendedor ve lo suyo).
- `seed.sql` — datos de ejemplo mínimos para levantar la instancia.

En Etapa 1 las vistas consumen mocks (`src/ventas/data/`). Al conectar Supabase
se reemplazan los mocks por queries; el modelo de `src/ventas/lib/types.ts` es
espejo de este esquema.

## Modelo (núcleo)

- **vendedores** — perfil comercial (extiende `auth.users`), rol admin/vendedor.
- **objetivos** — meta mensual por vendedor: reuniones efectivas + mezcla de
  buckets (% que suman 100).
- **oportunidades** — la unidad central. Estados del pipeline; el bucket se
  asigna por prioridad (estratégico → fulfillment → mediano). El objetivo cuenta
  las que alcanzan `reunion_efectiva`; cierre y tiempo-a-cierre salen del mismo
  flujo (desde `declarada_at`).
- **oportunidad_eventos** — línea de tiempo (auditable).
- **clientes** — base comercial: activos, ex-clientes (con motivo de baja) y
  prospección. Materia prima del asistente de leads.
- **contexto_ia** / **contexto_vendedor** / **fuentes_ia** / **reglas_ia** —
  contexto editable por el admin que alimenta las sugerencias de IA.

Reglas de negocio (umbral de "estratégico" = 1.000 envíos/mes, mezcla objetivo,
etc.) son **configurables por el admin**, no hardcodeadas.
