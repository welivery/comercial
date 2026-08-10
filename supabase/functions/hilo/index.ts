// Edge Function: hilo ─────────────────────────────────────────────────────────
// Devuelve la conversación completa (mensajes del hilo de Gmail) de una
// inscripción, para leerla en la app antes de responder. Body: { inscripcion_id }.
//
// Deployar CON "Verify JWT". Usa el JWT del vendedor para leer su inscripción
// (RLS); el refresh_token se lee con service_role. Secrets: los de Google.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? ""
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

async function accessToken(refresh: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error("no se pudo refrescar el token de Google")
  return j.access_token as string
}

function decodeB64Url(s: string): string {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return ""
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function textoDePayload(payload: any): string {
  if (!payload) return ""
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64Url(payload.body.data)
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) {
      const t = textoDePayload(p)
      if (t) return t
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeB64Url(payload.body.data).replace(/<[^>]+>/g, " ")
  }
  return ""
}
/* eslint-enable @typescript-eslint/no-explicit-any */
function limpiar(t: string): string {
  const cortes = [/\r?\nEl .*escribió:/, /\r?\nOn .*wrote:/, /\r?\n>/, /\r?\n_{5,}/, /\r?\n-{2,}\s*Mensaje/]
  let out = t
  for (const c of cortes) {
    const m = out.match(c)
    if (m && m.index !== undefined) out = out.slice(0, m.index)
  }
  return out.trim().slice(0, 5000)
}
function nombreDe(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</)
  return (m ? m[1] : from).trim()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader) return json(401, { error: "no autorizado" })

  let inscripcionId = ""
  try {
    inscripcionId = String((await req.json()).inscripcion_id ?? "")
  } catch {
    return json(400, { error: "body inválido" })
  }
  if (!inscripcionId) return json(400, { error: "falta inscripcion_id" })

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: ins } = await userClient
    .from("secuencia_inscripciones")
    .select("id, vendedor_id, gmail_thread_id")
    .eq("id", inscripcionId)
    .maybeSingle()
  if (!ins) return json(403, { error: "no encontrada o sin permiso" })
  if (!ins.gmail_thread_id) return json(200, { mensajes: [] })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: cuenta } = await admin
    .from("email_cuentas")
    .select("email, refresh_token")
    .eq("vendedor_id", ins.vendedor_id)
    .maybeSingle()
  if (!cuenta?.refresh_token) return json(400, { error: "casilla no conectada" })

  try {
    const token = await accessToken(cuenta.refresh_token)
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${ins.gmail_thread_id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const j = await r.json()
    if (!r.ok) return json(502, { error: "no se pudo leer el hilo" })
    const propio = (cuenta.email ?? "").toLowerCase()
    const msgs = Array.isArray(j.messages) ? j.messages : []
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mensajes = msgs.map((m: any) => {
      const from = (m.payload?.headers ?? []).find((x: any) => x.name === "From")?.value ?? ""
      const mine = from.toLowerCase().includes(propio) || (m.labelIds ?? []).includes("SENT")
      return {
        de: mine ? "yo" : "cliente",
        nombre: nombreDe(from),
        fecha: new Date(Number(m.internalDate) || Date.now()).toISOString(),
        texto: limpiar(textoDePayload(m.payload) || m.snippet || ""),
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return json(200, { mensajes })
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "error al leer el hilo" })
  }
})
