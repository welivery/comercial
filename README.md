# Welivery Comercial

Herramienta de **seguimiento de vendedores** (Chile). App separada de Welivery
Care: mismo stack y marca, datos y deploy independientes.

- **Admin:** dashboard del equipo, objetivos por vendedor (reuniones efectivas +
  mezcla de tipos), base de clientes (activos / ex-clientes con motivo de baja /
  prospección) y contexto para la IA.
- **Vendedor:** mi avance del mes, pipeline de oportunidades (Kanban) y asistente
  de leads con IA.

Todo se mide sobre la **oportunidad**: el objetivo cuenta las que llegan a
"reunión efectiva"; cierre y tiempo-a-cierre salen del mismo flujo (desde que se
declara). Los buckets (Estratégico → Fulfillment → Mediano) se asignan por
prioridad, con umbral configurable (1.000 envíos/mes).

## Stack

- Vite + React + TypeScript + Tailwind v4 + shadcn/ui.
- Supabase (Postgres + Auth + RLS) — proyecto propio (ver `supabase/`).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves de Supabase
npm run dev
```

## Estado

Etapa 1: vistas completas con **datos de prueba** (`src/data/`). Auth/rol es mock
(`src/store.tsx`). Próximo: conectar Supabase (reemplazar mocks por queries con
RLS) y login. El asistente de leads y el cotizador quedan como adaptadores para
integrar después.

## Datos

Esquema, RLS y seed en `supabase/`. El modelo de `src/lib/types.ts` es espejo de
ese esquema.

## Marca

Tokens de color y tipografía (Poppins) en `src/index.css`, tomados del Manual de
Marca de Welivery. Navy `#152A4F`, azul digital `#2F5BE6`, coral `#F2563A`,
menta `#6FE0CB`.
