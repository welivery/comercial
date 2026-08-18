import { Calendar } from "lucide-react"
import { PERIODO_LABEL } from "@/lib/display"

// Chip de período (mock: fijo en el mes de demo).
export function MonthPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-slate">
      <Calendar size={14} className="text-blue" />
      {PERIODO_LABEL}
    </span>
  )
}

export function PageHead({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue">
          Welivery Comercial · Chile
        </div>
        <h1 className="text-xl font-semibold leading-tight text-navy">{titulo}</h1>
        {descripcion && <p className="mt-1 text-[13px] text-slate">{descripcion}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
