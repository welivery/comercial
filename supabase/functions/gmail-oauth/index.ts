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
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://comercial.welivery.cl"
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth`
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ")

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action")
  const code = url.searchParams.get("code")
  const errorParam = url.searchParams.get("error")

  // El vendedor canceló / Google devolvió error.
  if (errorParam) return redirect(`${APP_URL}/secuencias?email=cancelado`)

  // 1) Inicio del flujo: redirige a Google.
  if (action === "start") {
    const vid = url.searchParams.get("vid") ?? ""
    if (!vid) return new Response("Falta vid", { status: 400 })
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    auth.searchParams.set("client_id", CLIENT_ID)
    auth.searchParams.set("redirect_uri", REDIRECT_URI)
    auth.searchParams.set("response_type", "code")
    auth.searchParams.set("scope", SCOPES)
    auth.searchParams.set("access_type", "offline")
    auth.searchParams.set("prompt", "consent")
    auth.searchParams.set("state", vid)
    return redirect(auth.toString())
  }

  // 2) Callback de Google.
  if (code) {
    const vid = url.searchParams.get("state") ?? ""
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
