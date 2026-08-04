// Disparador de la búsqueda de leads con IA (Edge Function `swift-function`).
//
// La búsqueda NUNCA corre sola: la invoca la vista solo cuando la persona
// aprieta el botón. La función busca en la web, deduplica y PERSISTE los leads
// nuevos en la tabla `leads` (la vista los lee de ahí). Acá solo mostramos el
// progreso en vivo y devolvemos un resumen (cuántos se agregaron / errores /
// límite de créditos).

import { supabase } from "@/lib/supabase"

const LEADS_FN = "swift-function"
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export interface ResultadoBusqueda {
  ok: boolean
  insertados: number
  usados?: number
  limite?: number
  limiteAlcanzado?: boolean
  error?: string
}

export async function generarLeadsIA(
  vendedorId: string,
  onStatus?: (m: string) => void
): Promise<ResultadoBusqueda> {
  const fail = (error: string, extra: Partial<ResultadoBusqueda> = {}): ResultadoBusqueda => ({
    ok: false,
    insertados: 0,
    error,
    ...extra,
  })
  if (!SUPABASE_URL || !SUPABASE_ANON) return fail("Faltan variables de entorno de Supabase.")

  try {
    const { data: sesion } = await supabase.auth.getSession()
    const token = sesion.session?.access_token
    if (!token) return fail("No hay sesión activa.")

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${LEADS_FN}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vendedorId }),
    })

    if (!resp.ok || !resp.body) {
      const b = await resp.json().catch(() => null)
      if (resp.status === 429) {
        return fail(b?.error ?? "Alcanzaste el límite de búsquedas de este mes.", {
          limiteAlcanzado: true,
          limite: b?.limite,
          usados: b?.usados,
        })
      }
      const det = b?.detalle ? ` · ${b.detalle}` : ""
      return fail(b?.error ? `${b.error}${det}` : `Error HTTP ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let done: ResultadoBusqueda | null = null
    let errMsg: string | null = null

    for (;;) {
      const { done: fin, value } = await reader.read()
      if (fin) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const s = line.trim()
        if (!s) continue
        let ev: { t?: string; m?: string; insertados?: number; usados?: number; limite?: number }
        try {
          ev = JSON.parse(s)
        } catch {
          continue
        }
        if (ev.t === "status" && ev.m) onStatus?.(ev.m)
        else if (ev.t === "done")
          done = { ok: true, insertados: ev.insertados ?? 0, usados: ev.usados, limite: ev.limite }
        else if (ev.t === "error") errMsg = ev.m ?? "Error de la IA"
      }
    }

    if (done) return done
    return fail(errMsg ?? "No se recibió respuesta de la IA.")
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Error de red")
  }
}
