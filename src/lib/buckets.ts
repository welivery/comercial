// Segmentos de cliente: registro reactivo + clasificación + helpers de UI.
// Los segmentos son configurables por el admin (tabla `segmentos`). Se cargan
// una vez al entrar (ver VentasLayout → setSegmentosRegistry) y los componentes
// se suscriben con useSegmentos(); antes de cargar se usan los defaults, que
// coinciden con la semilla de supabase/segmentos.sql.

import { useSyncExternalStore } from "react"
import type { Bucket, DatosClasificacion, Segmento } from "@/lib/types"

// Defaults = semilla (fallback antes de cargar y para ids huérfanos).
export const SEGMENTOS_DEFAULT: Segmento[] = [
  { id: "estrategico", nombre: "Estratégico", tipo: "volumen", envios_min: 1000, regla: null, color: "#2F5BE6", orden: 1, activo: true },
  { id: "fulfillment", nombre: "Fulfillment", tipo: "especial", envios_min: null, regla: "fulfillment", color: "#0F9D8F", orden: 2, activo: true },
  { id: "mediano", nombre: "Mediano", tipo: "volumen", envios_min: 400, regla: null, color: "#7A869C", orden: 3, activo: true },
  { id: "chico", nombre: "Chico", tipo: "volumen", envios_min: 0, regla: null, color: "#A6AEBC", orden: 4, activo: true },
]

// ── Registro reactivo ──────────────────────────────────────────────────
let _segmentos: Segmento[] = SEGMENTOS_DEFAULT
const _listeners = new Set<() => void>()

export function setSegmentosRegistry(list: Segmento[]): void {
  _segmentos = list.length ? [...list].sort((a, b) => a.orden - b.orden) : SEGMENTOS_DEFAULT
  _listeners.forEach((l) => l())
}
export function getSegmentosRegistry(): Segmento[] {
  return _segmentos
}
function subscribe(cb: () => void): () => void {
  _listeners.add(cb)
  return () => {
    _listeners.delete(cb)
  }
}
// Hook: lista reactiva (todos los segmentos, ordenados). Se re-renderiza al cargar.
export function useSegmentos(): Segmento[] {
  return useSyncExternalStore(subscribe, getSegmentosRegistry, getSegmentosRegistry)
}
// Solo los activos, ordenados (para clasificación y editores de mezcla).
export function segmentosActivos(segs: Segmento[] = _segmentos): Segmento[] {
  return segs.filter((s) => s.activo).sort((a, b) => a.orden - b.orden)
}

// ── Lookups por id (fallback a defaults / genérico) ─────────────────────────
function buscar(id: Bucket, segs: Segmento[] = _segmentos): Segmento | undefined {
  return segs.find((s) => s.id === id) ?? SEGMENTOS_DEFAULT.find((s) => s.id === id)
}
export function segLabel(id: Bucket, segs?: Segmento[]): string {
  return buscar(id, segs)?.nombre ?? id
}
export function segColor(id: Bucket, segs?: Segmento[]): string {
  return buscar(id, segs)?.color ?? "#7A869C"
}
export function segShort(id: Bucket, segs?: Segmento[]): string {
  const n = buscar(id, segs)?.nombre ?? id
  return n.length <= 4 ? n : n.slice(0, 4)
}

// ── Clasificación ──────────────────────────────────────────────────────
// Bandas de volumen: el cliente cae en la de MAYOR umbral que su volumen alcanza
// (marca reconocida = ∞ → banda tope). Especiales ('fulfillment'): por regla.
// El `orden` decide la prioridad entre una especial y las bandas (p.ej. si un
// cliente de 600 envíos quiere fulfillment, gana Fulfillment por ir antes).
export function asignarSegmento(d: DatosClasificacion, segs: Segmento[] = _segmentos): Bucket {
  const activos = segmentosActivos(segs)
  const env = d.marca_reconocida ? Number.POSITIVE_INFINITY : d.envios_aprox

  // Banda natural = la de volumen con el mayor umbral <= env.
  let banda: Segmento | undefined
  for (const s of activos) {
    if (s.tipo !== "volumen") continue
    const min = s.envios_min ?? 0
    if (env >= min && (!banda || min > (banda.envios_min ?? 0))) banda = s
  }

  for (const s of activos) {
    if (s.tipo === "especial") {
      if (s.regla === "fulfillment" && d.quiere_fulfillment) return s.id
    } else if (banda && s.id === banda.id) {
      return s.id
    }
  }
  return banda?.id ?? activos[0]?.id ?? "mediano"
}

// Por qué cayó en su segmento (texto para el detalle de la oportunidad).
export function motivoSegmento(d: DatosClasificacion, segs: Segmento[] = _segmentos): string {
  const id = asignarSegmento(d, segs)
  const s = buscar(id, segs)
  if (s?.tipo === "especial") return `quiere ${s.regla ?? "servicio especial"}`
  if (d.marca_reconocida) return "marca reconocida"
  const min = s?.envios_min ?? 0
  return min > 0 ? `≥ ${min.toLocaleString("es-CL")} envíos/mes` : "menor volumen"
}

// ── Aliases de compatibilidad (código que todavía llama a los nombres viejos) ──
export const asignarBucket = asignarSegmento
export const motivoBucket = motivoSegmento
