# Cómo trabajar en este repo

## Puesta en marcha

```bash
nvm use            # Node 22 (ver .nvmrc)
npm install
cp .env.example .env.local   # completar con las claves de Supabase
npm run dev
```

## Etapas, no todo de una

El producto se construye por etapas; antes de avanzar de etapa se propone el plan
y se espera el OK. Commits **chicos y descriptivos**.

## Ramas y commits

- `main` es la rama de deploy (Cloudflare Pages despliega desde ahí).
- Trabajar en ramas cortas por feature/fix y abrir PR contra `main`.
- Mensajes de commit con prefijo tipo Conventional Commits:
  `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `chore: …`.
- Escribir en español rioplatense, igual que el producto.

## Antes de pushear (gate obligatorio)

```bash
npm run build   # tsc -b + vite build: NO pushear si esto falla
npm run lint    # ESLint sobre src/
```

## Reglas no negociables

- **Nunca** secrets en el repo ni en el cliente. Van en Supabase secrets /
  variables de entorno del proveedor de deploy. `.env.local` está gitignored;
  `.env.example` documenta las claves sin valores.
- La API key de Anthropic y el `refresh_token` de Gmail viven **solo del lado
  servidor** (Edge Functions), nunca en el cliente.
- Las reglas de negocio (autonomía de IA, tonos, prioridades, umbrales) son
  **configurables por el admin**, no hardcodeadas.
- El modelo de `src/lib/types.ts` es espejo del esquema de Supabase: si cambia uno,
  cambia el otro.

## Base de datos

El SQL se corre a mano en el SQL Editor de Supabase. Cada cambio de esquema es una
migración nueva en `supabase/migrations/` (nombre descriptivo). Ver
[`supabase/README.md`](supabase/README.md) para el orden y el detalle.

## Estilo

- TypeScript estricto; evitar `any` salvo en los bordes de datos externos.
- Componentes con Tailwind + tokens de marca de `src/index.css` (no hardcodear
  colores fuera de la paleta).
- Reutilizar helpers existentes (`display.ts`, `widgets`, `TablaScroll`,
  `usePersistedState`) antes de duplicar.
