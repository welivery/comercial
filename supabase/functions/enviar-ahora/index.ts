// Edge Function: enviar-ahora ─────────────────────────────────────────────────
// Fuerza el envío del PRÓXIMO paso de una inscripción, al instante (para probar).
// No depende del cron ni del toggle de envío automático. Body: { inscripcion_id }.
//
// Deployar CON "Verify JWT" (lo llama el vendedor logueado). Usa su JWT para leer
// la inscripción con RLS (solo las suyas); el refresh_token se lee con service_role.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (ya cargados).

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

function b64Utf8(str: string): string {
  let s = ""
  const bytes = new TextEncoder().encode(str)
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function b64urlUtf8(str: string): string {
  return b64Utf8(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function encHeader(s: string): string {
  return /[^ -~]/.test(s) ? `=?UTF-8?B?${b64Utf8(s)}?=` : s
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
function render(txt: string, nombre: string, empresa: string): string {
  const emp = (empresa || "").trim() || (nombre || "").trim() || "tu empresa"
  const nom = (nombre || "").trim() || (empresa || "").trim() || "equipo"
  return (txt || "")
    .replaceAll("{{empresa}}", emp)
    .replaceAll("{{nombre}}", nom)
    .replace(/\{\{\s*[\w.]+\s*\}\}/g, "")
}

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
  const { data: ins, error: insErr } = await userClient
    .from("secuencia_inscripciones")
    .select("id, vendedor_id, secuencia_id, destinatario_nombre, destinatario_empresa, destinatario_email, paso_actual, gmail_thread_id, gmail_message_id")
    .eq("id", inscripcionId)
    .maybeSingle()
  if (insErr || !ins) return json(403, { error: "no encontrada o sin permiso" })
  if (!ins.destinatario_email) return json(400, { error: "la inscripción no tiene email" })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: cuenta } = await admin
    .from("email_cuentas")
    .select("email, refresh_token")
    .eq("vendedor_id", ins.vendedor_id)
    .maybeSingle()
  if (!cuenta?.refresh_token) return json(400, { error: "el vendedor no tiene la casilla conectada" })

  const { data: pasos } = await admin
    .from("secuencia_pasos")
    .select("*")
    .eq("secuencia_id", ins.secuencia_id)
    .eq("activo", true)
    .order("orden")
  const lista = pasos ?? []
  const idx = ins.paso_actual ?? 0
  if (idx >= lista.length) return json(400, { error: "no quedan pasos por enviar en esta secuencia" })
  const paso = lista[idx]

  try {
    const token = await accessToken(cuenta.refresh_token)
    const nombre = ins.destinatario_nombre || ""
    const empresa = ins.destinatario_empresa || ""
    const messageId = `<${crypto.randomUUID()}@comercial.welivery.cl>`
    const pixelUrl = `${SUPABASE_URL}/functions/v1/track?i=${ins.id}`
    const h = [
      `From: ${cuenta.email}`,
      `To: ${ins.destinatario_email}`,
      `Subject: ${encHeader(render(paso.asunto, nombre, empresa))}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ]
    if (idx > 0 && ins.gmail_message_id) {
      h.push(`In-Reply-To: ${ins.gmail_message_id}`)
      h.push(`References: ${ins.gmail_message_id}`)
    }
    const cuerpo =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">${esc(
        render(paso.cuerpo, nombre, empresa)
      ).replace(/\n/g, "<br>")}</div>` + `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0" />`
    const raw = b64urlUtf8(h.join("\r\n") + "\r\n\r\n" + b64Utf8(cuerpo))

    const body: Record<string, unknown> = { raw }
    if (ins.gmail_thread_id) body.threadId = ins.gmail_thread_id
    const send = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const sj = await send.json()
    if (!send.ok) return json(502, { error: `Gmail rechazó el envío: ${JSON.stringify(sj).slice(0, 200)}` })

    const sig = lista[idx + 1]
    const proximo = sig ? new Date(Date.now() + (sig.dias_espera ?? 0) * 864e5).toISOString() : null
    await admin
      .from("secuencia_inscripciones")
      .update({
        paso_actual: idx + 1,
        ultimo_envio_at: new Date().toISOString(),
        proximo_envio_at: proximo,
        gmail_thread_id: ins.gmail_thread_id ?? sj.threadId,
        gmail_message_id: ins.gmail_message_id ?? messageId,
      })
      .eq("id", ins.id)

    return json(200, { ok: true, paso: idx + 1 })
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "error al enviar" })
  }
})
