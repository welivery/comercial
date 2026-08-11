// Edge Function: track ───────────────────────────────────────────────────────
// Pixel de apertura de los mails de secuencia. El mail lleva un <img> 1x1 que
// apunta acá: /functions/v1/track?i=<inscripcion_id>. Cuando el cliente abre el
// mail, el cliente de correo pide la imagen y registramos la apertura.
//
// Deployar SIN "Verify JWT" (lo pide el cliente de correo, sin auth). No lleva
// secret: el id es un UUID no adivinable y solo incrementa un contador.
//
// Nota: el tracking de apertura es aproximado — muchos clientes bloquean o
// pre-cargan imágenes (Gmail las cachea vía proxy, Apple Mail las pre-carga).
// Sirve como señal, no como dato exacto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

// GIF transparente de 1x1.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
])

function pixel(): Response {
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("i")
  if (id) {
    try {
      // Incremento atómico (una sola sentencia) para no perder aperturas casi
      // simultáneas. La RPC vive en secuencias-apertura-rpc.sql.
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
      await admin.rpc("registrar_apertura", { p_id: id })
    } catch {
      /* nunca fallar el pixel: si no se pudo registrar, igual devolvemos la imagen */
    }
  }
  return pixel()
})
