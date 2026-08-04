// Adaptador del asistente de leads (IA).
//
// La generación real corre en la Edge Function `leads-ia`, que llama a la API de
// Claude cruzando la base de clientes + el contexto del admin + el objetivo y el
// pipeline del vendedor. La key vive del lado servidor, nunca en el cliente.
//
// Si la función todavía no está deployada (o falla), caemos al mock para que la
// pantalla siga siendo demostrable. `usandoMock` avisa a la UI.

import { supabase } from "@/lib/supabase"
import type { Bucket } from "@/lib/types"

export interface FuenteLead {
  tipo: "maps" | "web" | "social" | "base" | "linkedin" | "tendencia"
  detalle: string
  url?: string | null // enlace real a la fuente (cuando la IA lo trae de la web)
}

export interface LeadSugerido {
  id: string
  nombre: string
  iniciales: string
  bucket: Bucket
  fit: number // 0-100, encaje con el objetivo del vendedor
  reconquista: boolean // true = ex-cliente a recuperar
  motivo: string // por qué la IA lo sugiere
  web?: string | null // sitio real de la empresa
  telefono?: string | null // teléfono real (solo si la IA lo encontró en la web)
  email?: string | null // email real (solo si la IA lo encontró en la web)
  fuentes: FuenteLead[]
}

export interface IdeaConversacion {
  oportunidad: string
  bucket: Bucket
  contexto: string // por qué ahora
  angulos: { titulo: string; texto: string }[]
}

export interface ResultadoLeads {
  sugeridos: LeadSugerido[]
  ideas: IdeaConversacion[]
  usandoMock: boolean // true si la IA no está disponible y mostramos el demo
  error?: string // detalle del fallo (para diagnosticar sin DevTools)
}

// Nombre (slug) de la Edge Function tal como quedó deployada en Supabase.
// Ojo: al crearla desde el editor, Supabase asigna un slug random (ej.
// "swift-function") aunque el título diga otra cosa. Este valor debe coincidir
// con el que aparece en la URL .../functions/v1/<slug>.
const LEADS_FN = "swift-function"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Llama a la Edge Function en STREAMING: la función va mandando avisos de
// progreso ("Buscando en la web…") y al final el resultado. `onStatus` recibe
// cada aviso para mostrarlo en vivo. Ante cualquier fallo cae al mock.
export async function generarLeads(
  vendedorId: string,
  onStatus?: (m: string) => void
): Promise<ResultadoLeads> {
  const mock = (error?: string): ResultadoLeads => ({ ...leadsMockData(), usandoMock: true, error })
  if (!SUPABASE_URL || !SUPABASE_ANON) return mock("Faltan variables de entorno de Supabase.")

  try {
    const { data: sesion } = await supabase.auth.getSession()
    const token = sesion.session?.access_token
    if (!token) return mock("No hay sesión activa.")

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${LEADS_FN}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vendedorId }),
    })

    if (!resp.ok || !resp.body) {
      const b = await resp.json().catch(() => null)
      const det = b?.detalle ? ` · ${b.detalle}` : ""
      return mock(b?.error ? `${b.error}${det}` : `Error HTTP ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let resultado: ResultadoLeads | null = null
    let errMsg: string | null = null

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const s = line.trim()
        if (!s) continue
        let ev: { t?: string; m?: string; sugeridos?: LeadSugerido[]; ideas?: IdeaConversacion[] }
        try {
          ev = JSON.parse(s)
        } catch {
          continue
        }
        if (ev.t === "status" && ev.m) onStatus?.(ev.m)
        else if (ev.t === "done")
          resultado = { sugeridos: ev.sugeridos ?? [], ideas: ev.ideas ?? [], usandoMock: false }
        else if (ev.t === "error") errMsg = ev.m ?? "Error de la IA"
      }
    }

    if (resultado) return resultado
    return mock(errMsg ?? "No se recibió un resultado de la IA.")
  } catch (e) {
    return mock(e instanceof Error ? e.message : "Error de red")
  }
}

// ─────────────────────────── Mock (demo / fallback) ───────────────────────────
function leadsMockData(): { sugeridos: LeadSugerido[]; ideas: IdeaConversacion[] } {
  return {
    sugeridos: [
      {
        id: "lead-runa",
        nombre: "Runa Andina",
        iniciales: "RA",
        bucket: "estrategico",
        fit: 92,
        reconquista: false,
        motivo:
          "Marca de indumentaria outdoor con fuerte venta online (~1.600 envíos/mes estimados). Hoy despachan con courier propio saturado — quejas de demora en reseñas recientes. Encaja con tu cupo estratégico faltante.",
        web: "https://runaandina.cl",
        telefono: "+56 2 2345 6789",
        email: "contacto@runaandina.cl",
        fuentes: [
          { tipo: "maps", detalle: "Google Maps · Vitacura", url: null },
          { tipo: "web", detalle: "runaandina.cl", url: "https://runaandina.cl" },
          { tipo: "social", detalle: "Instagram 48k", url: null },
        ],
      },
      {
        id: "lead-huerto",
        nombre: "Huerto Bravo",
        iniciales: "HB",
        bucket: "fulfillment",
        fit: 85,
        reconquista: false,
        motivo:
          "Alimentos orgánicos con suscripción mensual. Publicaron que buscan tercerizar almacenamiento y armado de pedidos — candidato ideal para fulfillment. Volumen medio-alto y creciendo.",
        web: "https://huertobravo.cl",
        telefono: null,
        email: "hola@huertobravo.cl",
        fuentes: [
          { tipo: "maps", detalle: "Google Maps · Maipú", url: null },
          { tipo: "linkedin", detalle: 'Post LinkedIn "buscamos 3PL"', url: null },
        ],
      },
      {
        id: "lead-petmania",
        nombre: "Petmania",
        iniciales: "PM",
        bucket: "estrategico",
        fit: 88,
        reconquista: true,
        motivo:
          "Fue cliente hasta 2024 (~1.900 envíos/mes), se fue por tarifas. Reabrieron 2 sucursales y subió su volumen online. Buen momento para reconquistar — te sumaría estratégico.",
        web: null,
        telefono: null,
        email: null,
        fuentes: [
          { tipo: "base", detalle: "Tu base · ex-cliente", url: null },
          { tipo: "tendencia", detalle: "+40% tráfico web (6 meses)", url: null },
        ],
      },
    ],
    ideas: [
      {
        oportunidad: "Ruca Outdoor",
        bucket: "estrategico",
        contexto: "Reunión el miércoles 12hs",
        angulos: [
          { titulo: "Dolor detectado", texto: "Reseñas mencionan demoras en regiones. Entrá con el tiempo promedio de Welivery fuera de la RM." },
          { titulo: "Encaje", texto: "Productos voluminosos → destacá tarifa por volumen y retiro en su bodega de Ñuñoa." },
          { titulo: "Apertura sugerida", texto: "\"Vi que están creciendo fuerte en regiones — justo ahí es donde más ordenamos los tiempos de entrega.\"" },
        ],
      },
      {
        oportunidad: "Verde Limón",
        bucket: "estrategico",
        contexto: "Propuesta enviada hace 3 días · sin respuesta",
        angulos: [
          { titulo: "Timing", texto: "Reactivá hoy — el promedio de cierre cae si pasan +5 días sin follow-up." },
          { titulo: "Gancho", texto: "Ofrecé una prueba de 2 semanas en su zona de mayor volumen (Providencia) para bajar el riesgo percibido." },
          { titulo: "Mensaje listo", texto: "\"¡Hola! ¿Pudieron revisar la propuesta? Puedo dejarles una prueba acotada esta semana así lo ven en la práctica.\"" },
        ],
      },
    ],
  }
}
