// Clasificación de oportunidades en buckets por PRIORIDAD y etiquetas visuales.
// Regla de negocio (configurable a futuro, hoy fija): el umbral de "estratégico"
// por volumen es 1.000 envíos/mes.

import type { Bucket, DatosClasificacion } from "@/lib/types"

export const UMBRAL_ESTRATEGICO = 1000

// Prioridad: Estratégico (marca reconocida O +1.000 envíos) → Fulfillment
// (quiere fulfillment) → Mediano (el resto). Cada oportunidad cae en UNO.
export function asignarBucket(d: DatosClasificacion): Bucket {
  if (d.marca_reconocida || d.envios_aprox >= UMBRAL_ESTRATEGICO) return "estrategico"
  if (d.quiere_fulfillment) return "fulfillment"
  return "mediano"
}

export const BUCKETS: Bucket[] = ["estrategico", "fulfillment", "mediano"]

export const BUCKET_LABEL: Record<Bucket, string> = {
  estrategico: "Estratégico",
  fulfillment: "Fulfillment",
  mediano: "Mediano",
}

// Abreviatura para tarjetas compactas del pipeline.
export const BUCKET_SHORT: Record<Bucket, string> = {
  estrategico: "Estr",
  fulfillment: "Full",
  mediano: "Med",
}

// Color de acento por bucket (para barras/leyendas). Deriva de tokens de marca.
export const BUCKET_COLOR: Record<Bucket, string> = {
  estrategico: "#2F5BE6", // azul digital
  fulfillment: "#0F9D8F", // menta oscura accesible
  mediano: "#7A869C", // pizarra
}

// Por qué una oportunidad cayó en su bucket (texto para el detalle).
export function motivoBucket(d: DatosClasificacion): string {
  if (d.marca_reconocida && d.envios_aprox >= UMBRAL_ESTRATEGICO)
    return "marca reconocida + >1.000 envíos"
  if (d.marca_reconocida) return "marca reconocida"
  if (d.envios_aprox >= UMBRAL_ESTRATEGICO) return ">1.000 envíos/mes"
  if (d.quiere_fulfillment) return "quiere fulfillment"
  return "cliente mediano"
}
