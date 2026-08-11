// Edge Function: asistente de leads con IA (Claude) — para vendedores/admin.
//
// Cruza la base de clientes + el contexto del admin + el objetivo del vendedor
// y BUSCA EN LA WEB e-commerces chilenos reales nuevos (priorizando el bucket
// faltante, sin repetir los que ya tiene). Deduplica y PERSISTE los leads en la
// tabla `leads`. Respeta un límite mensual de búsquedas por vendedor (créditos).
//
// Streaming (NDJSON): manda avisos de progreso y al final {t:"done", insertados}.
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

// Clave para deduplicar: dominio del sitio, o nombre normalizado.
const claveLead = (nombre: string, web?: string | null): string => {
  const dom = (web ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim()
  if (dom) return dom
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const limpio = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s || s.toLowerCase() === "null" || s === "-") return null
  return s
}

function normalizarSugeridos(arr: any[]): any[] {
  return (arr ?? []).map((s: any) => ({
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

  // Autorización: el que llama solo puede generar leads para SU propia ficha
  // (o ser admin). Sin esto, cualquier vendedor podría quemar los créditos de
  // otro, escribirle leads y volcar su pipeline en el prompt (IDOR).
  const { data: quienLlama } = await asUser
    .from("vendedores")
    .select("id, rol")
    .eq("user_id", user.id)
    .maybeSingle()
  const esAdmin = quienLlama?.rol === "admin"
  if (!esAdmin && quienLlama?.id !== vendedorId) {
    return json(403, { error: "No autorizado a generar leads para otro vendedor" })
  }

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

  // Créditos de IA: límite mensual por vendedor + leads ya existentes (dedup).
  const [cfgRes, usoRes, leadsRes] = await Promise.all([
    admin.from("config_ventas").select("leads_limite_mensual").eq("id", 1).maybeSingle(),
    admin.from("leads_uso").select("usados").eq("vendedor_id", vendedorId).eq("periodo", periodo).maybeSingle(),
    admin.from("leads").select("nombre, clave, vendedor_id"),
  ])
  const limite = (cfgRes.data as any)?.leads_limite_mensual ?? 15
  const usados = (usoRes.data as any)?.usados ?? 0
  if (usados >= limite) {
    return json(429, {
      error: `Alcanzaste el límite de ${limite} búsquedas con IA este mes. Pedile al admin que lo suba si necesitás más.`,
      limite,
      usados,
    })
  }
  const leadsExistentes = (leadsRes.data ?? []) as any[]
  const clavesGlobales = new Set(leadsExistentes.map((l) => l.clave)) // dedup entre todos los vendedores
  const nombresPropios = leadsExistentes
    .filter((l) => l.vendedor_id === vendedorId)
    .map((l) => l.nombre)
    .slice(0, 60)

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

  // Rotación de rubros: cada búsqueda enfoca una mezcla distinta para no repetir
  // siempre los mismos e-commerces conocidos y agotar menos el pool.
  const RUBROS = [
    "moda y ropa", "calzado", "belleza y cosmética", "deco y hogar", "muebles",
    "alimentos y gourmet", "mascotas", "deportes y outdoor", "electrónica y accesorios",
    "juguetería", "librería y papelería", "ferretería y herramientas", "vinos y bebidas",
    "productos naturales y suplementos", "bijou y accesorios", "bebés y maternidad",
    "arte y manualidades", "tecnología y gaming", "marroquinería", "plantas y jardín",
  ]
  const focoRubros = [...RUBROS].sort(() => Math.random() - 0.5).slice(0, 4).join(", ")

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

# NO repitas estas empresas (ya están en su lista de leads)
${nombresPropios.length ? nombresPropios.map((n) => `- ${n}`).join("\n") : "(ninguna todavía)"}

# Tarea
Buscá en la web **8 a 12** e-commerces chilenos REALES y NUEVOS para prospectar, priorizando el bucket que le falta al vendedor. Para cada uno confirmá que existe y sacá datos de contacto reales de sus fuentes (sitio y, si figuran, teléfono/email). No repitas ninguna de las empresas listadas arriba ni sus clientes activos.

IMPORTANTE para traer variedad (no vengas siempre con las mismas):
- Enfocá ESTA búsqueda en rubros como: ${focoRubros}. Podés sumar otros, pero cubrí varios rubros distintos.
- Evitá los e-commerces más famosos y obvios (los grandes ya están todos tomados). Priorizá tiendas **medianas, de nicho o emergentes** que probablemente NO estén en ninguna lista.
- Variá las búsquedas: probá directorios, Instagram de tiendas, "tienda online [rubro] chile", marcas que venden por Shopify/Jumpseller/WooCommerce, etc.
- Es mejor traer 8-12 aunque algunas sean chicas, que traer 2-3 obvias.

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
        // Modelo económico (Haiku) para acotar costo. Solo web_search (los
        // snippets son chicos); NO usamos web_fetch porque leer páginas enteras
        // dispara el consumo de tokens. Alcanza para traer empresas reales +
        // sitio; el resto de datos se completa entrando al sitio a mano.
        model: "claude-haiku-4-5",
        max_tokens: 6000,
        stream: true,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "CL" } },
        ],
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    })
  } catch (e) {
    return json(502, { error: `No se pudo contactar la IA: ${e instanceof Error ? e.message : e}` })
  }

  if (!aiRes.ok || !aiRes.body) {
    const detalle = await aiRes.text().catch(() => "")
    console.error(`anthropic error ${aiRes.status}:`, detalle.slice(0, 800))
    return json(502, { error: `No se pudo generar leads con IA (${aiRes.status}). Probá de nuevo en un rato.` })
  }

  // Reenvío en streaming (NDJSON): mandamos avisos de progreso a medida que la
  // IA busca en la web, y al final el resultado ya parseado. Así la app muestra
  // el avance en vivo y no parece colgada.
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"))
      let finalText = ""
      try {
        send({ t: "status", m: "Analizando tu base y tu objetivo…" })
        const reader = aiRes.body!.getReader()
        const dec = new TextDecoder()
        let buf = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            const s = line.trim()
            if (!s.startsWith("data:")) continue
            const payload = s.slice(5).trim()
            if (!payload || payload === "[DONE]") continue
            let ev: any
            try {
              ev = JSON.parse(payload)
            } catch {
              continue
            }
            if (ev.type === "content_block_start") {
              const b = ev.content_block
              if (b?.type === "server_tool_use" && b?.name === "web_search")
                send({ t: "status", m: "Buscando e-commerces en la web…" })
              else if (b?.type === "server_tool_use" && b?.name === "web_fetch")
                send({ t: "status", m: "Leyendo un sitio para sacar datos reales…" })
              else if (b?.type === "web_search_tool_result")
                send({ t: "status", m: "Revisando resultados de búsqueda…" })
              else if (b?.type === "text") send({ t: "status", m: "Armando y priorizando las sugerencias…" })
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              finalText += ev.delta.text
            } else if (ev.type === "error") {
              send({ t: "error", m: ev.error?.message ?? "Error de la IA" })
            }
          }
        }
        const parsed = extraerJson(finalText)
        if (!parsed || !Array.isArray(parsed.sugeridos)) {
          send({ t: "error", m: "La IA no devolvió un JSON válido." })
        } else {
          send({ t: "status", m: "Guardando leads nuevos…" })
          const norm = normalizarSugeridos(parsed.sugeridos)
          // Dedup: descartar los que ya existan (por clave) en cualquier vendedor,
          // y los repetidos dentro de esta misma tanda.
          const vistos = new Set<string>()
          const nuevos = norm
            .map((s: any) => ({ ...s, clave: claveLead(s.nombre, s.web) }))
            .filter((s: any) => {
              if (!s.nombre || clavesGlobales.has(s.clave) || vistos.has(s.clave)) return false
              vistos.add(s.clave)
              return true
            })

          let insertados = 0
          if (nuevos.length) {
            const filas = nuevos.map((s: any) => ({
              vendedor_id: vendedorId,
              nombre: s.nombre,
              clave: s.clave,
              bucket: s.bucket,
              fit: s.fit,
              reconquista: !!s.reconquista,
              motivo: s.motivo ?? "",
              web: s.web,
              telefono: s.telefono,
              email: s.email,
              fuentes: s.fuentes ?? [],
              origen: "ia",
              estado: "nuevo",
            }))
            const { error: insErr } = await admin
              .from("leads")
              .upsert(filas, { onConflict: "vendedor_id,clave", ignoreDuplicates: true })
            if (insErr) {
              send({ t: "error", m: `No se pudieron guardar los leads: ${insErr.message}` })
              controller.close()
              return
            }
            insertados = filas.length
          }

          // Sumar 1 al consumo del mes (cuenta la búsqueda, no los leads).
          await admin
            .from("leads_uso")
            .upsert({ vendedor_id: vendedorId, periodo, usados: usados + 1 }, { onConflict: "vendedor_id,periodo" })

          send({ t: "done", insertados, usados: usados + 1, limite })
        }
      } catch (e) {
        send({ t: "error", m: e instanceof Error ? e.message : "Error de streaming" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { ...cors, "Content-Type": "application/x-ndjson" } })
})
