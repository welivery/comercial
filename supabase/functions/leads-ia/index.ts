// Edge Function: asistente de leads con IA (Claude) — para vendedores/admin.
//
// Cruza la base de clientes (activos, ex-clientes, prospección) + el contexto
// que carga el admin + el objetivo del vendedor y su pipeline actual, y le pide
// a Claude que sugiera nuevos potenciales (priorizando la mezcla faltante) e
// ideas de conversación para prospectos con reunión próxima o seguimiento.
//
// La API key de Anthropic vive del lado servidor (secret ANTHROPIC_API_KEY),
// nunca en el cliente. SUPABASE_URL / ANON / SERVICE_ROLE los inyecta Supabase.
//
// Deploy (una vez):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy leads-ia

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

// Período actual "YYYY-MM" (el objetivo se carga por mes).
function periodoActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const BUCKET_LABEL: Record<string, string> = {
  estrategico: "Estratégico (marca reconocida o +1.000 envíos/mes)",
  fulfillment: "Fulfillment (quiere almacenamiento + armado de pedidos)",
  mediano: "Mediano (el resto)",
}
const SEGMENTO_LABEL: Record<string, string> = {
  activo: "Cliente activo",
  ex_cliente: "Ex-cliente (baja)",
  prospeccion: "En prospección",
}
const MOTIVO_LABEL: Record<string, string> = {
  precio: "se fue por precio/tarifas",
  servicio: "se fue por calidad de servicio",
  cerro: "cerró / dejó de operar",
  deuda: "se fue por deuda",
  otro: "otro motivo",
}

// Extrae el objeto JSON de la respuesta de la IA (viene en un bloque ```json```
// al final del texto, o suelto). Devuelve null si no se puede parsear.
/* eslint-disable @typescript-eslint/no-explicit-any */
function extraerJson(texto: string): any | null {
  const fences = [...texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  const candidatos: string[] = fences.map((m) => m[1])
  // Fallback: del primer "{" al último "}".
  const i = texto.indexOf("{")
  const j = texto.lastIndexOf("}")
  if (i >= 0 && j > i) candidatos.push(texto.slice(i, j + 1))
  // Probar del último al primero (el JSON final suele ser el bueno).
  for (const c of candidatos.reverse()) {
    try {
      return JSON.parse(c)
    } catch {
      /* seguir probando */
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  const authHeader = req.headers.get("Authorization") ?? ""

  // Validar que quien llama esté autenticado (cualquier rol del equipo).
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
  } = await asUser.auth.getUser()
  if (!user) return json(401, { error: "No autenticado" })

  if (!apiKey) {
    return json(503, { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: "Body inválido" })
  }
  const vendedorId = String(body.vendedorId ?? "")
  if (!vendedorId) return json(400, { error: "Falta vendedorId" })

  const admin = createClient(url, service)
  const periodo = periodoActual()

  // Traer todo lo que alimenta el prompt en paralelo.
  const [vendRes, cliRes, objRes, opRes, ctxRes, fuentesRes, reglasRes, ctxVendRes] = await Promise.all([
    admin.from("vendedores").select("id, nombre, zona").eq("id", vendedorId).maybeSingle(),
    admin.from("clientes").select("nombre, segmento, envios_mes, bucket, motivo_baja, nota, vendedor_id"),
    admin.from("objetivos").select("*").eq("vendedor_id", vendedorId).eq("periodo", periodo).maybeSingle(),
    admin
      .from("oportunidades")
      .select("ecommerce, bucket, estado, envios_aprox, tipo_producto, interes, reunion_coordinada_at")
      .eq("vendedor_id", vendedorId),
    admin.from("contexto_ia").select("general").eq("id", 1).maybeSingle(),
    admin.from("fuentes_ia").select("label, activa").order("orden"),
    admin.from("reglas_ia").select("tipo, texto").order("orden"),
    admin.from("contexto_vendedor").select("foco, texto").eq("vendedor_id", vendedorId).maybeSingle(),
  ])

  const vend = vendRes.data
  if (!vend) return json(404, { error: "Vendedor no encontrado" })

  const clientes = (cliRes.data ?? []) as any[]
  const objetivo = objRes.data as any | null
  const oportunidades = (opRes.data ?? []) as any[]
  const ctxGeneral = (ctxRes.data?.general ?? "").trim()
  const fuentes = ((fuentesRes.data ?? []) as any[]).filter((f) => f.activa).map((f) => f.label)
  const reglas = (reglasRes.data ?? []) as any[]
  const ctxVend = ctxVendRes.data as any | null

  // Mezcla objetivo vs. mezcla actual del pipeline → dónde falta.
  const mixObjetivo = objetivo
    ? { estrategico: objetivo.mix_estrategico, fulfillment: objetivo.mix_fulfillment, mediano: objetivo.mix_mediano }
    : { estrategico: 40, fulfillment: 30, mediano: 30 }
  const conteoActual: Record<string, number> = { estrategico: 0, fulfillment: 0, mediano: 0 }
  for (const o of oportunidades) if (o.bucket in conteoActual) conteoActual[o.bucket]++

  // Recortes para no inflar el prompt.
  const activos = clientes.filter((c) => c.segmento === "activo")
  const exClientes = clientes.filter((c) => c.segmento === "ex_cliente")
  const prospeccion = clientes.filter((c) => c.segmento === "prospeccion")

  const listar = (arr: any[], max: number, conMotivo = false) =>
    arr
      .slice(0, max)
      .map((c) => {
        const extra = conMotivo && c.motivo_baja ? ` — ${MOTIVO_LABEL[c.motivo_baja] ?? c.motivo_baja}` : ""
        const nota = c.nota ? ` (${String(c.nota).slice(0, 120)})` : ""
        return `- ${c.nombre} · ${c.envios_mes} envíos/mes · ${BUCKET_LABEL[c.bucket]?.split(" ")[0] ?? c.bucket}${extra}${nota}`
      })
      .join("\n") || "(ninguno cargado)"

  const pipelineTxt =
    oportunidades
      .map((o) => {
        const cuando = o.reunion_coordinada_at ? ` · reunión coordinada ${String(o.reunion_coordinada_at).slice(0, 10)}` : ""
        const int = o.interes ? ` · busca: ${o.interes}` : ""
        return `- ${o.ecommerce} · ${o.bucket} · estado ${o.estado} · ${o.envios_aprox} env/mes · ${o.tipo_producto}${int}${cuando}`
      })
      .join("\n") || "(pipeline vacío)"

  const reglasTxt =
    reglas.map((r) => `- ${r.tipo === "evitar" ? "EVITAR" : "PRIORIZAR"}: ${r.texto}`).join("\n") || "(sin reglas)"

  const system = `Sos un asistente de prospección comercial para Welivery Chile, empresa de logística de última milla (envíos de e-commerce). Ayudás a un vendedor a encontrar NUEVOS e-commerces chilenos REALES a los que ofrecerles el servicio de Welivery, y a preparar sus conversaciones.

REGLA DE ORO — DATOS REALES:
- Las empresas que sugieras como NUEVAS (fuera de la base de datos del vendedor) tienen que ser REALES y verificables. Usá la búsqueda web (web_search) y la lectura de páginas (web_fetch) para encontrarlas: buscá tiendas online chilenas, directorios de e-commerce, Instagram de tiendas, Google, etc.
- Para cada empresa nueva, entrá a su sitio/redes y sacá datos de contacto REALES: sitio web, teléfono, email, Instagram — SOLO los que figuren en una fuente real, con su URL. NUNCA inventes un teléfono, email o dato de contacto. Si no lo encontraste, dejá el campo en null.
- Cada "fuente" debe llevar la URL real de donde sacaste el dato.
- Si estimás volumen de envíos, dejalo claro como estimación en el "motivo" (no es un dato duro).

Reglas de negocio:
- El "bucket" clasifica al prospecto por prioridad: ${Object.values(BUCKET_LABEL).join("; ")}.
- Priorizá el bucket donde MÁS le falta al vendedor para cumplir su mezcla objetivo.
- Los ex-clientes de la base que se fueron por precio o servicio son candidatos de "reconquista" (reconquista=true); para esos, verificá igual con web su situación actual.
- Español chileno, tono profesional y concreto. Nada de relleno ni promesas exageradas.`

  const fuentesTxt = fuentes.length ? fuentes.join(", ") : "Google, Google Maps, sitios web, Instagram, directorios de e-commerce chileno"

  const userMsg = `# Vendedor
${vend.nombre}${vend.zona ? ` · zona ${vend.zona}` : ""}
${ctxVend?.foco ? `Foco: ${ctxVend.foco}` : ""}
${ctxVend?.texto ? ctxVend.texto : ""}

# Objetivo del mes (${periodo})
Reuniones efectivas objetivo: ${objetivo?.reuniones_efectivas ?? "(sin cargar)"}
Mezcla objetivo (%): estratégico ${mixObjetivo.estrategico} · fulfillment ${mixObjetivo.fulfillment} · mediano ${mixObjetivo.mediano}
Oportunidades ya en pipeline por bucket: estratégico ${conteoActual.estrategico} · fulfillment ${conteoActual.fulfillment} · mediano ${conteoActual.mediano}
→ Priorizá el bucket donde más le falta contra su mezcla objetivo.

# Contexto general (cargado por el admin)
${ctxGeneral || "(sin contexto general cargado)"}

# Reglas de la IA
${reglasTxt}

# Dónde buscar (sugeridas por el admin)
${fuentesTxt}

# Base de clientes del vendedor (NO sugerir los activos; sirven de referencia del perfil)
## Activos (${activos.length})
${listar(activos, 25)}

## Ex-clientes (${exClientes.length}) — candidatos de reconquista
${listar(exClientes, 25, true)}

## En prospección (${prospeccion.length}) — ya identificados, podés priorizarlos/complementarlos
${listar(prospeccion, 25)}

# Pipeline actual del vendedor (oportunidades abiertas)
${pipelineTxt}

# Tarea
1) Buscá en la web 3 a 6 e-commerces chilenos REALES para prospectar, priorizando el bucket faltante. Para cada uno confirmá que existe y sacá datos de contacto reales de sus fuentes. Podés incluir ex-clientes de la base a reconquistar (reconquista=true).
2) Ideas de conversación para hasta 4 oportunidades del PIPELINE ACTUAL con reunión próxima o en seguimiento (2-3 ángulos accionables cada una). Si el pipeline está vacío, ideas=[].

# Formato de salida
Después de investigar, terminá tu respuesta con UN ÚNICO bloque \`\`\`json que contenga exactamente este objeto (sin texto después):
\`\`\`json
{
  "sugeridos": [
    {
      "nombre": "Nombre real de la tienda",
      "bucket": "estrategico|fulfillment|mediano",
      "fit": 0-100,
      "reconquista": false,
      "motivo": "2-3 frases: por qué encaja y por qué ahora (incluí estimación de volumen si aplica).",
      "web": "https://... o null",
      "telefono": "+56... o null (solo si es real)",
      "email": "contacto@... o null (solo si es real)",
      "fuentes": [ { "tipo": "web|maps|social|linkedin|base|tendencia", "detalle": "qué es", "url": "https://... o null" } ]
    }
  ],
  "ideas": [
    { "oportunidad": "Nombre del pipeline", "bucket": "estrategico|fulfillment|mediano", "contexto": "por qué ahora", "angulos": [ { "titulo": "Dolor detectado", "texto": "..." } ] }
  ]
}
\`\`\``

  let aiRes: Response
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 12000,
        output_config: { effort: "medium" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "CL" } },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
        ],
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    })
  } catch (e) {
    return json(502, { error: `No se pudo contactar la IA: ${e instanceof Error ? e.message : e}` })
  }

  if (!aiRes.ok) {
    const detalle = await aiRes.text()
    return json(502, { error: `Error de la IA (${aiRes.status})`, detalle: detalle.slice(0, 500) })
  }

  const data = await aiRes.json()
  // La respuesta puede traer bloques de búsqueda + varios bloques de texto; el
  // JSON final está en el texto.
  const texto = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
  const parsed = extraerJson(texto)
  if (!parsed || !Array.isArray(parsed.sugeridos)) {
    return json(502, { error: "La IA no devolvió un JSON válido.", detalle: texto.slice(0, 300) })
  }

  // Enriquecer con iniciales + id estables para la UI.
  const iniciales = (n: string) =>
    n
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  const slug = (n: string) =>
    "lead-" +
    n
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

  const limpio = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : ""
    if (!s || s.toLowerCase() === "null" || s === "-") return null
    return s
  }

  const sugeridos = (parsed.sugeridos ?? []).map((s: any) => ({
    id: slug(String(s.nombre ?? "lead")),
    nombre: s.nombre,
    iniciales: iniciales(String(s.nombre ?? "?")),
    bucket: s.bucket,
    fit: typeof s.fit === "number" ? s.fit : Number(s.fit) || 0,
    reconquista: !!s.reconquista,
    motivo: s.motivo,
    web: limpio(s.web),
    telefono: limpio(s.telefono),
    email: limpio(s.email),
    fuentes: Array.isArray(s.fuentes)
      ? s.fuentes.map((f: any) => ({ tipo: f.tipo ?? "web", detalle: f.detalle ?? "", url: limpio(f.url) }))
      : [],
  }))
  const ideas = (parsed.ideas ?? []).map((i: any) => ({
    oportunidad: i.oportunidad,
    bucket: i.bucket,
    contexto: i.contexto,
    angulos: Array.isArray(i.angulos) ? i.angulos : [],
  }))

  return json(200, { sugeridos, ideas })
})
