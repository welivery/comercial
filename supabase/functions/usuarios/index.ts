// Edge Function: gestión de CUENTAS de acceso (auth) — solo admin.
// Usa service_role (nunca expuesto al cliente) para crear/eliminar usuarios de
// auth.users. Valida que quien llama sea un admin (rol en la tabla vendedores).
//
// Deploy:  supabase functions deploy usuarios
// (No requiere secrets manuales: SUPABASE_URL / ANON / SERVICE_ROLE los inyecta
//  Supabase automáticamente en el entorno de Functions.)

import { createClient } from "jsr:@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const authHeader = req.headers.get("Authorization") ?? ""

  // Cliente con el JWT del que llama, para validar identidad y rol.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
  } = await asUser.auth.getUser()
  if (!user) return json(401, { error: "No autenticado" })

  const { data: perfil } = await asUser
    .from("vendedores")
    .select("rol")
    .eq("user_id", user.id)
    .maybeSingle()
  if (perfil?.rol !== "admin") return json(403, { error: "Solo un admin puede gestionar cuentas" })

  const admin = createClient(url, service)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: "Body inválido" })
  }

  // Crear cuenta de acceso + enganchar/actualizar la ficha del vendedor.
  if (body.action === "crear") {
    const { email, password, nombre, zona, rol } = body as Record<string, string>
    if (!email || !password) return json(400, { error: "Falta email o contraseña" })
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !created.user) return json(400, { error: error?.message ?? "No se pudo crear" })
    // El trigger ya creó/linkeó la fila en vendedores; la completamos.
    await admin
      .from("vendedores")
      .update({ nombre: nombre ?? "", zona: zona ?? "", rol: rol === "admin" ? "admin" : "vendedor" })
      .eq("user_id", created.user.id)
    return json(200, { ok: true, user_id: created.user.id })
  }

  // Eliminar cuenta de acceso (y opcionalmente la ficha).
  if (body.action === "eliminar") {
    const { user_id, vendedor_id } = body as Record<string, string>
    if (user_id) {
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json(400, { error: error.message })
    }
    if (vendedor_id) await admin.from("vendedores").delete().eq("id", vendedor_id)
    return json(200, { ok: true })
  }

  // Setear/resetear contraseña de una cuenta existente.
  if (body.action === "password") {
    const { user_id, password } = body as Record<string, string>
    if (!user_id || !password) return json(400, { error: "Falta user_id o contraseña" })
    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return json(400, { error: error.message })
    return json(200, { ok: true })
  }

  return json(400, { error: "Acción desconocida" })
})
