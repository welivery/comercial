// Edge Function: responder ────────────────────────────────────────────────────
// El vendedor responde, desde la app, un mail de secuencia — el mail sale desde
// SU casilla de Gmail, en el mismo hilo. Body: { inscripcion_id, texto }.
//
// Deployar CON "Verify JWT" (solo usuarios logueados). Se usa el JWT del que
// llama para leer la inscripción con RLS (así solo puede responder las suyas);
// el refresh_token de la casilla se lee con service_role (server-only).
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (ya cargados para gmail-oauth).

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
  let texto = ""
  try {
    const b = await req.json()
    inscripcionId = String(b.inscripcion_id ?? "")
    texto = String(b.texto ?? "").trim()
  } catch {
    return json(400, { error: "body inválido" })
  }
  if (!inscripcionId || !texto) return json(400, { error: "faltan inscripcion_id o texto" })

  // Cliente con el JWT del usuario → RLS: solo puede leer SUS inscripciones.
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: ins, error: insErr } = await userClient
    .from("secuencia_inscripciones")
    .select("id, vendedor_id, destinatario_email, gmail_thread_id")
    .eq("id", inscripcionId)
    .maybeSingle()
  if (insErr || !ins) return json(403, { error: "no encontrada o sin permiso" })
  if (!ins.gmail_thread_id) return json(400, { error: "esta inscripción todavía no tiene un hilo de email" })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: cuenta } = await admin
    .from("email_cuentas")
    .select("email, refresh_token")
    .eq("vendedor_id", ins.vendedor_id)
    .maybeSingle()
  if (!cuenta?.refresh_token) return json(400, { error: "el vendedor no tiene la casilla conectada" })

  try {
    const token = await accessToken(cuenta.refresh_token)

    // Asunto + Message-ID del último mensaje del hilo (para responder en hilo).
    const thr = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${ins.gmail_thread_id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const tj = await thr.json()
    const msgs = Array.isArray(tj.messages) ? tj.messages : []
    const last = msgs[msgs.length - 1]
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const hdr = (m: any, n: string) =>
      (m?.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ""
    /* eslint-enable @typescript-eslint/no-explicit-any */
    let asunto = hdr(msgs[0], "Subject") || "Seguimiento"
    if (!/^re:/i.test(asunto)) asunto = `Re: ${asunto}`
    const inReplyTo = hdr(last, "Message-ID")

    const h = [
      `From: ${cuenta.email}`,
      `To: ${ins.destinatario_email}`,
      `Subject: ${encHeader(asunto)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ]
    if (inReplyTo) {
      h.push(`In-Reply-To: ${inReplyTo}`)
      h.push(`References: ${inReplyTo}`)
    }
    const raw = b64urlUtf8(h.join("\r\n") + "\r\n\r\n" + b64Utf8(texto))

    const send = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw, threadId: ins.gmail_thread_id }),
    })
    const sj = await send.json()
    if (!send.ok) {
      console.error("gmail send rechazado:", JSON.stringify(sj).slice(0, 500))
      return json(502, { error: "Gmail rechazó el envío. Revisá la conexión de tu casilla e intentá de nuevo." })
    }

    // El vendedor respondió → deja de estar pendiente (hasta que el cliente
    // vuelva a escribir, que lo re-marca pendiente).
    await admin
      .from("secuencia_inscripciones")
      .update({ ultima_respuesta_manual_at: new Date().toISOString(), pendiente_humano: false })
      .eq("id", ins.id)

    return json(200, { ok: true })
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "error al enviar" })
  }
})
