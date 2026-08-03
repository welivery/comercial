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
}

export interface LeadSugerido {
  id: string
  nombre: string
  iniciales: string
  bucket: Bucket
  fit: number // 0-100, encaje con el objetivo del vendedor
  reconquista: boolean // true = ex-cliente a recuperar
  motivo: string // por qué la IA lo sugiere
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
}

// Llama a la Edge Function; ante cualquier fallo cae al mock (con aviso).
export async function generarLeads(vendedorId: string): Promise<ResultadoLeads> {
  try {
    const { data, error } = await supabase.functions.invoke("leads-ia", {
      body: { vendedorId },
    })
    if (error) throw error
    if (!data || !Array.isArray(data.sugeridos)) throw new Error("Respuesta inesperada")
    return {
      sugeridos: data.sugeridos as LeadSugerido[],
      ideas: (data.ideas ?? []) as IdeaConversacion[],
      usandoMock: false,
    }
  } catch {
    return { ...leadsMockData(), usandoMock: true }
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
        fuentes: [
          { tipo: "maps", detalle: "Google Maps · Vitacura" },
          { tipo: "web", detalle: "runaandina.cl" },
          { tipo: "social", detalle: "Instagram 48k" },
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
        fuentes: [
          { tipo: "maps", detalle: "Google Maps · Maipú" },
          { tipo: "linkedin", detalle: 'Post LinkedIn "buscamos 3PL"' },
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
        fuentes: [
          { tipo: "base", detalle: "Tu base · ex-cliente" },
          { tipo: "tendencia", detalle: "+40% tráfico web (6 meses)" },
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
