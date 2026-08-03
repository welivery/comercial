import { createClient } from "@supabase/supabase-js"

// Cliente Supabase de Welivery Comercial (proyecto independiente de Care).
// Las claves van en variables de entorno — nunca en el repo. Ver .env.example.
//
// IMPORTANTE: no hacer `throw` en el top-level. Si el build corre sin las env,
// un throw incondicional acá hace que el bundler (rolldown) marque como código
// muerto TODA la app que importa este módulo → bundle en blanco sin error.
// En su lugar avisamos por consola y seguimos: la UI renderiza y las llamadas
// fallan con un mensaje claro si la config falta.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigurado) {
  console.error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Configuralas en el proveedor de deploy (o .env.local)."
  )
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
)
