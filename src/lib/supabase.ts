import { createClient } from "@supabase/supabase-js"

// Cliente Supabase de Welivery Comercial (proyecto independiente de Care).
// Las claves van en variables de entorno — nunca en el repo. Ver .env.example.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
