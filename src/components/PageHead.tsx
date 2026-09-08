import { Calendar } from "lucide-react"
import { PERIODO_ACTUAL, PERIODO_LABEL, mesLabelDe, mesesRecientes } from "@/lib/display"

// Chip de período fijo (mes actual) — para pantallas sin segmentación por mes.
export function MonthPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-slate">
      <Calendar size={14} className="text-blue" />
      {PERIODO_LABEL}
    </span>
  )
}

// Selector de mes ("YYYY-MM"). Muestra los últimos `meses` (incluye el actual);
// si el valor elegido es más viejo que ese rango, se agrega igual para no perderlo.
// `todosLabel` agrega una opción "sin filtro" (value "") al principio.
export function MonthPicker({
  value,
  onChange,
  meses = 12,
  todosLabel,
}: {
  value: string
  onChange: (periodo: string) => void
  meses?: number
  todosLabel?: string
}) {
  const opts = mesesRecientes(meses)
  if (todosLabel) opts.unshift({ value: "", label: todosLabel })
  if (value && !opts.some((o) => o.value === value)) {
    opts.push({ value, label: mesLabelDe(value) })
  }
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate focus-within:border-blue">
      <Calendar size={14} className="shrink-0 text-blue" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Mes"
        className="bg-transparent pr-1 text-ink outline-none"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.value === PERIODO_ACTUAL ? " (actual)" : ""}
          </option>
        ))}
      </select>
    </label>
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
