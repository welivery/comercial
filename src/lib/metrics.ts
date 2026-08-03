// Métricas derivadas del pipeline. Todo se calcula sobre la misma oportunidad:
// el objetivo cuenta las que llegaron a "reunión efectiva" en el período; los
// cierres y el tiempo-a-cierre salen del mismo flujo.

import { BUCKETS } from "@/lib/buckets"
import {
  ESTADOS_PIPELINE,
  diasEntre,
  enPeriodo,
  tuvoReunionEfectiva,
} from "@/lib/display"
import type {
  Bucket,
  EstadoOportunidad,
  Objetivo,
  Oportunidad,
} from "@/lib/types"

export interface MixDetalle {
  bucket: Bucket
  cantidad: number
  pct: number // % del total de efectivas
  objetivoPct: number // % objetivo (0 si no hay objetivo)
}

export interface AvanceVendedor {
  efectivas: number
  objetivo: number
  pctObjetivo: number
  restantes: number
  cierres: number
  tasaCierre: number // % de efectivas que cerraron
  tiempoPromedioCierre: number | null // días desde declarada hasta cierre
  enPipeline: number // oportunidades activas (sin cerrar ni perder)
  mix: MixDetalle[]
}

// Oportunidades activas = todo lo que no cerró ni se perdió.
export function esActiva(o: Oportunidad): boolean {
  return o.estado !== "cierre_ganado" && o.estado !== "perdido"
}

export function avanceVendedor(
  ops: Oportunidad[],
  objetivo: Objetivo | undefined,
  periodo: string
): AvanceVendedor {
  // Efectivas del período: llegaron al hito y su reunión efectiva cae en el mes.
  const efectivasOps = ops.filter(
    (o) => tuvoReunionEfectiva(o.estado) && enPeriodo(o.reunion_efectiva_at, periodo)
  )
  const efectivas = efectivasOps.length

  const cierresOps = ops.filter(
    (o) => o.estado === "cierre_ganado" && enPeriodo(o.cierre_at, periodo)
  )
  const cierres = cierresOps.length

  const tiempos = cierresOps
    .filter((o) => o.cierre_at)
    .map((o) => diasEntre(o.declarada_at, new Date(o.cierre_at as string)))
  const tiempoPromedioCierre = tiempos.length
    ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
    : null

  const objetivoReuniones = objetivo?.reuniones_efectivas ?? 0

  const mix: MixDetalle[] = BUCKETS.map((bucket) => {
    const cantidad = efectivasOps.filter((o) => o.bucket === bucket).length
    return {
      bucket,
      cantidad,
      pct: efectivas ? Math.round((cantidad / efectivas) * 100) : 0,
      objetivoPct: objetivo?.mix[bucket] ?? 0,
    }
  })

  return {
    efectivas,
    objetivo: objetivoReuniones,
    pctObjetivo: objetivoReuniones ? Math.round((efectivas / objetivoReuniones) * 100) : 0,
    restantes: Math.max(0, objetivoReuniones - efectivas),
    cierres,
    tasaCierre: efectivas ? Math.round((cierres / efectivas) * 100) : 0,
    tiempoPromedioCierre,
    enPipeline: ops.filter(esActiva).length,
    mix,
  }
}

export interface EtapaEmbudo {
  estado: EstadoOportunidad
  cantidad: number
  conversion: number | null // % respecto de la etapa anterior
}

// Embudo acumulado: cada etapa cuenta las oportunidades que la alcanzaron o
// superaron. La conversión es contra la etapa previa.
export function embudo(ops: Oportunidad[]): EtapaEmbudo[] {
  const orden = ESTADOS_PIPELINE
  const alcanzo = (o: Oportunidad, idx: number): boolean => {
    const oi = orden.indexOf(o.estado)
    // cierre_ganado (última) alcanza todas; perdido no suma al embudo.
    if (o.estado === "perdido") return idx === 0 // solo cuenta como "interesado"
    return oi >= idx
  }
  let prev = 0
  return orden.map((estado, idx) => {
    const cantidad = ops.filter((o) => alcanzo(o, idx)).length
    const conversion = idx === 0 || prev === 0 ? null : Math.round((cantidad / prev) * 100)
    prev = cantidad
    return { estado, cantidad, conversion }
  })
}

// Agrega el avance de todo el equipo (para el dashboard admin).
export interface AvanceEquipo {
  efectivas: number
  objetivo: number
  pctObjetivo: number
  restantes: number
  cierres: number
  tasaCierre: number
  tiempoPromedioCierre: number | null
  activas: number
  mix: MixDetalle[]
}

export function avanceEquipo(
  ops: Oportunidad[],
  objetivos: Objetivo[],
  periodo: string
): AvanceEquipo {
  const av = avanceVendedor(ops, undefined, periodo)
  const objetivoTotal = objetivos.reduce((a, o) => a + o.reuniones_efectivas, 0)
  // Mix objetivo del equipo = promedio ponderado por reuniones objetivo.
  const mix: MixDetalle[] = av.mix.map((m) => {
    const objetivoPct = objetivoTotal
      ? Math.round(
          objetivos.reduce((a, o) => a + o.mix[m.bucket] * o.reuniones_efectivas, 0) /
            objetivoTotal
        )
      : 0
    return { ...m, objetivoPct }
  })
  return {
    efectivas: av.efectivas,
    objetivo: objetivoTotal,
    pctObjetivo: objetivoTotal ? Math.round((av.efectivas / objetivoTotal) * 100) : 0,
    restantes: Math.max(0, objetivoTotal - av.efectivas),
    cierres: av.cierres,
    tasaCierre: av.tasaCierre,
    tiempoPromedioCierre: av.tiempoPromedioCierre,
    activas: av.enPipeline,
    mix,
  }
}
