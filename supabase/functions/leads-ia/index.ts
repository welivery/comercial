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

// Esquema de salida estructurada (structured outputs de la Messages API).
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sugeridos: {
      type: "array",
      description: "Nuevos e-commerces potenciales a prospectar (3 a 6).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombre: { type: "string", description: "Nombre del e-commerce/empresa." },
          bucket: { type: "string", enum: ["estrategico", "fulfillment", "mediano"] },
          fit: { type: "integer", minimum: 0, maximum: 100, description: "Encaje 0-100 con el objetivo del vendedor." },
          reconquista: { type: "boolean", description: "true si es un ex-cliente a recuperar." },
          motivo: { type: "string", description: "2-3 frases: por qué encaja y por qué ahora (rioplatense/chileno, concreto)." },
          fuentes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                tipo: { type: "string", enum: ["maps", "web", "social", "base", "linkedin", "tendencia"] },
                detalle: { type: "string" },
              },
              required: ["tipo", "detalle"],
            },
          },
        },
        required: ["nombre", "bucket", "fit", "reconquista", "motivo", "fuentes"],
      },
    },
    ideas: {
      type: "array",
      description: "Ideas de conversación para prospectos del pipeline con reunión próxima o seguimiento activo (0 a 4).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          oportunidad: { type: "string", description: "Nombre del e-commerce (debe coincidir con uno del pipeline)." },
          bucket: { type: "string", enum: ["estrategico", "fulfillment", "mediano"] },
          contexto: { type: "string", description: "Por qué ahora (estado + timing)." },
          angulos: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                titulo: { type: "string", description: "Ej: Dolor detectado, Encaje, Apertura sugerida, Timing." },
                texto: { type: "string" },
              },
              required: ["titulo", "texto"],
            },
          },
        },
        required: ["oportunidad", "bucket", "contexto", "angulos"],
      },
    },
  },
  required: ["sugeridos", "ideas"],
}

/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const system = `Sos un asistente de prospección comercial para Welivery Chile, empresa de logística de última milla (envíos de e-commerce). Ayudás a un vendedor a encontrar nuevos e-commerces chilenos a los que ofrecerles el servicio de Welivery, y a preparar sus conversaciones.

Reglas de negocio:
- El "bucket" clasifica al prospecto por prioridad: ${Object.values(BUCKET_LABEL).join("; ")}.
- El vendedor tiene un objetivo mensual con una mezcla de buckets. Priorizá sugerir prospectos del bucket donde MÁS le falta para cumplir su mezcla.
- Los ex-clientes con buen volumen que se fueron por precio o servicio son candidatos de "reconquista" (reconquista=true).
- Español chileno, tono profesional y concreto. Nada de relleno ni promesas exageradas.
- Sé realista: basá las sugerencias en el tipo de e-commerce chileno que encaja con este perfil de cliente. No inventes datos duros (facturación exacta, teléfonos); si estimás volumen, aclaralo como estimación.
- Devolvé SOLO datos que respeten el esquema pedido.`

  const fuentesTxt = fuentes.length ? fuentes.join(", ") : "Google Maps, sitios web, redes sociales, tu base de clientes"

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

# Fuentes disponibles para prospectar
${fuentesTxt}

# Base de clientes del vendedor
## Activos (${activos.length}) — no sugerir, sirven de referencia del perfil que funciona
${listar(activos, 25)}

## Ex-clientes (${exClientes.length}) — candidatos de reconquista
${listar(exClientes, 25, true)}

## En prospección (${prospeccion.length}) — ya identificados, podés priorizarlos o complementarlos
${listar(prospeccion, 25)}

# Pipeline actual del vendedor (oportunidades abiertas)
${pipelineTxt}

# Tarea
1) "sugeridos": 3 a 6 e-commerces chilenos potenciales para prospectar, priorizando el bucket faltante. Podés incluir ex-clientes a reconquistar (reconquista=true) y/o prospectos de la lista. Para cada uno: por qué encaja, por qué ahora, y fuentes plausibles (tipo + detalle).
2) "ideas": para hasta 4 oportunidades del PIPELINE ACTUAL con reunión coordinada próxima o en seguimiento, 2-3 ángulos de conversación accionables (dolor detectado, encaje, apertura/mensaje sugerido). Si el pipeline está vacío, devolvé ideas=[].`

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
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
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
  // Con structured outputs, la respuesta viene como un bloque de texto con el JSON.
  const texto = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
  let parsed: { sugeridos?: any[]; ideas?: any[] }
  try {
    parsed = JSON.parse(texto)
  } catch {
    return json(502, { error: "La IA no devolvió un JSON válido." })
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

  const sugeridos = (parsed.sugeridos ?? []).map((s) => ({
    id: slug(s.nombre),
    nombre: s.nombre,
    iniciales: iniciales(s.nombre),
    bucket: s.bucket,
    fit: s.fit,
    reconquista: !!s.reconquista,
    motivo: s.motivo,
    fuentes: s.fuentes ?? [],
  }))
  const ideas = (parsed.ideas ?? []).map((i) => ({
    oportunidad: i.oportunidad,
    bucket: i.bucket,
    contexto: i.contexto,
    angulos: i.angulos ?? [],
  }))

  return json(200, { sugeridos, ideas })
})
