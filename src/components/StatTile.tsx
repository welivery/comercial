// Tile de métrica (KPI) del módulo Ventas: ícono, número grande en acento,
// label y una barra/delta opcional. Neutros cargan el peso (60/30/10).

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface StatTileProps {
  label: string
  valor: React.ReactNode
  icon?: React.ReactNode
  color?: string // acento (hex)
  sub?: React.ReactNode
  subTono?: "up" | "down" | "flat"
  track?: { value: number; max?: number }
}

const SUB_COLOR: Record<"up" | "down" | "flat", string> = {
  up: "text-success",
  down: "text-error",
  flat: "text-slate",
}

export function StatTile({ label, valor, icon, color = "#152A4F", sub, subTono = "flat", track }: StatTileProps) {
  const pct = track ? Math.min(100, Math.round((track.value / (track.max ?? 100)) * 100)) : null
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-2 text-[12px] text-slate">
        {icon && (
          <span className="grid size-6 place-items-center rounded-md" style={{ background: color + "16", color }}>
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none" style={{ color }}>
        {valor}
      </div>
      {sub && <div className={cn("mt-1.5 text-[11.5px] font-medium", SUB_COLOR[subTono])}>{sub}</div>}
      {pct != null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cloud">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </Card>
  )
}
