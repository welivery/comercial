// Componentes visuales chicos del módulo Ventas. Reusan tokens de marca.

import { cn } from "@/lib/utils"
import { BUCKET_COLOR, BUCKET_LABEL, BUCKET_SHORT } from "@/lib/buckets"
import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  SEGMENTO_COLOR,
  SEGMENTO_LABEL,
} from "@/lib/display"
import type { MixDetalle } from "@/lib/metrics"
import type { Bucket, EstadoOportunidad, SegmentoCliente } from "@/lib/types"

// Avatar de iniciales.
export function VAvatar({ iniciales, className }: { iniciales: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E7EDFC] text-[11px] font-semibold text-blue",
        className
      )}
    >
      {iniciales}
    </span>
  )
}

// Chip de bucket (Estratégico / Fulfillment / Mediano). `short` para tarjetas.
export function BucketChip({ bucket, short }: { bucket: Bucket; short?: boolean }) {
  const color = BUCKET_COLOR[bucket]
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: color + "1F", color }}
    >
      {short ? BUCKET_SHORT[bucket] : BUCKET_LABEL[bucket]}
    </span>
  )
}

// Pill de estado del pipeline.
export function EstadoBadge({ estado, className }: { estado: EstadoOportunidad; className?: string }) {
  const color = ESTADO_COLOR[estado]
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ background: color + "1F", color }}
    >
      {ESTADO_LABEL[estado]}
    </span>
  )
}

const SEG_TONE: Record<"success" | "coral" | "blue", string> = {
  success: "#1E9E6A",
  coral: "#F2563A",
  blue: "#2F5BE6",
}
export function SegmentoBadge({ segmento }: { segmento: SegmentoCliente }) {
  const color = SEG_TONE[SEGMENTO_COLOR[segmento]]
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: color + "1F", color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {SEGMENTO_LABEL[segmento]}
    </span>
  )
}

// Barra de progreso simple con marca de objetivo opcional.
export function Progress({
  value,
  max = 100,
  color = "#2F5BE6",
  objetivo,
  className,
}: {
  value: number
  max?: number
  color?: string
  objetivo?: number // posición del objetivo en la misma escala que value/max
  className?: string
}) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const tgt = objetivo != null && max ? Math.min(100, (objetivo / max) * 100) : null
  return (
    <div className={cn("relative h-2 min-w-[70px] overflow-hidden rounded-full bg-cloud", className)}>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      {tgt != null && (
        <span
          className="absolute -top-0.5 bottom-[-2px] w-0.5 bg-ink/60"
          style={{ left: `${tgt}%` }}
          aria-hidden
        />
      )}
    </div>
  )
}

// Barra segmentada de mezcla de tipos.
export function MixBar({ mix, className }: { mix: MixDetalle[]; className?: string }) {
  const total = mix.reduce((a, m) => a + m.cantidad, 0)
  return (
    <div className={cn("flex h-3 overflow-hidden rounded-full bg-cloud", className)}>
      {total === 0
        ? null
        : mix.map((m) => (
            <span
              key={m.bucket}
              className="block h-full"
              style={{ width: `${(m.cantidad / total) * 100}%`, background: BUCKET_COLOR[m.bucket] }}
              title={`${BUCKET_LABEL[m.bucket]}: ${m.cantidad}`}
            />
          ))}
    </div>
  )
}

// Estado de carga a pantalla (mientras llegan los datos de Supabase).
export function Cargando({ que = "datos" }: { que?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-[13px] text-slate">
      Cargando {que}…
    </div>
  )
}

// Estado de error simple.
export function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="mt-4 rounded-xl border border-error/30 bg-[#FBE2E2] p-4 text-[13px] text-error">
      No se pudieron cargar los datos: {msg}
    </div>
  )
}

// Título de sección con hint y acciones a la derecha.
export function SectionTitle({
  titulo,
  hint,
  children,
  className,
}: {
  titulo: string
  hint?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-3 mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 first:mt-0", className)}>
      <h2 className="text-[15px] font-semibold text-navy">{titulo}</h2>
      {hint && <span className="text-xs text-slate">{hint}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
