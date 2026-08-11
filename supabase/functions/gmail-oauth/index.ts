// Edge Function: gmail-oauth ─────────────────────────────────────────────────
// Conecta la casilla de Gmail del vendedor por OAuth (Google Workspace).
//   ?action=start&vid=<vendedor_id>  → redirige a la pantalla de consentimiento.
//   callback de Google (?code=&state=) → intercambia el code, guarda el
//   refresh_token del vendedor (service_role) y vuelve a la app.
//
// IMPORTANTE: deployar esta función SIN "Verify JWT" — la llama el navegador
// (redirect de Google), sin header Authorization.
//
// Secrets necesarios: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.)
// Opcional: APP_URL (default https://comercial.welivery.cl).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? ""
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://comercial.welivery.cl"
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth`
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ")
const STATE_TTL_MS = 10 * 60_000 // el state firmado vale 10 minutos

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } })
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

// ── State firmado (HMAC) ──────────────────────────────────────────────────────
// Ata el flujo OAuth al vendedor autenticado que lo inició, sin poder falsificar
// el vínculo desde afuera. Clave = GOOGLE_CLIENT_SECRET (secreto de servidor).
function b64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return b64url(new Uint8Array(sig))
}
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
async function firmarState(vid: string): Promise<string> {
  const payload = `${vid}.${Date.now() + STATE_TTL_MS}`
  return `${payload}.${await hmac(payload)}`
}
async function verificarState(state: string): Promise<string | null> {
  const parts = state.split(".")
  if (parts.length !== 3) return null
  const [vid, exp, sig] = parts
  if (!iguales(sig, await hmac(`${vid}.${exp}`))) return null
  if (!Number(exp) || Number(exp) < Date.now()) return null
  return vid
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const errorParam = url.searchParams.get("error")

  // 0) POST autenticado: el vendedor logueado pide iniciar la conexión. El
  //    vendedor se deriva de SU token (no de un parámetro), y se le entrega la
  //    URL de Google con un state firmado. Así nadie puede enganchar la casilla
  //    de otro (antes el `vid` venía por query, sin validar).
  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization") ?? ""
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const {
      data: { user },
    } = await asUser.auth.getUser()
    if (!user) return json(401, { error: "No autenticado" })
    const { data: perfil } = await asUser.from("vendedores").select("id").eq("user_id", user.id).maybeSingle()
    if (!perfil?.id) return json(403, { error: "Tu usuario no está vinculado a un vendedor" })

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    auth.searchParams.set("client_id", CLIENT_ID)
    auth.searchParams.set("redirect_uri", REDIRECT_URI)
    auth.searchParams.set("response_type", "code")
    auth.searchParams.set("scope", SCOPES)
    auth.searchParams.set("access_type", "offline")
    auth.searchParams.set("prompt", "consent")
    auth.searchParams.set("state", await firmarState(perfil.id))
    return json(200, { url: auth.toString() })
  }

  // El vendedor canceló / Google devolvió error.
  if (errorParam) return redirect(`${APP_URL}/secuencias?email=cancelado`)

  // 2) Callback de Google.
  if (code) {
    const vid = await verificarState(url.searchParams.get("state") ?? "")
    if (!vid) return redirect(`${APP_URL}/secuencias?email=error`)
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      })
      const tok = await tokenRes.json()
      if (!tokenRes.ok || !tok.refresh_token) {
        return redirect(`${APP_URL}/secuencias?email=error`)
      }
      // Email de la casilla conectada (usa el scope gmail.readonly).
      let email = ""
      try {
        const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        })
        const pj = await prof.json()
        email = pj.emailAddress ?? ""
      } catch {
        /* si falla, guardamos igual sin email */
      }

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
      const { error } = await admin.from("email_cuentas").upsert(
        {
          vendedor_id: vid,
          email,
          refresh_token: tok.refresh_token,
          provider: "google",
          conectado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vendedor_id" }
      )
      if (error) return redirect(`${APP_URL}/secuencias?email=error`)
      return redirect(`${APP_URL}/secuencias?email=ok`)
    } catch {
      return redirect(`${APP_URL}/secuencias?email=error`)
    }
  }

  return new Response("gmail-oauth: falta ?action=start o ?code", { status: 400 })
})
