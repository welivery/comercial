import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { BucketChip, SectionTitle, VAvatar } from "@/components/widgets"
import { OBJETIVOS, VENDEDORES } from "@/data/mock"
import { BUCKETS, BUCKET_COLOR } from "@/lib/buckets"
import type { Bucket, Objetivo, Vendedor } from "@/lib/types"

function ObjetivoEditor({ vendedor, objetivo }: { vendedor: Vendedor; objetivo: Objetivo }) {
  const [reuniones, setReuniones] = useState(objetivo.reuniones_efectivas)
  const [mix, setMix] = useState<Record<Bucket, number>>(objetivo.mix)
  const suma = BUCKETS.reduce((a, b) => a + mix[b], 0)
  const ok = suma === 100

  return (
    <Card className="p-[18px]">
      <div className="mb-4 flex items-center gap-3">
        <VAvatar iniciales={vendedor.iniciales} className="size-9 text-[13px]" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-ink">{vendedor.nombre}</div>
          <div className="text-[11.5px] text-slate">Vendedor · {vendedor.zona}</div>
        </div>
        <span
          className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: (ok ? "#1E9E6A" : "#E0A52F") + "1F",
            color: ok ? "#1E9E6A" : "#a5741a",
          }}
        >
          {ok ? "Al día" : `Suma ${suma}%`}
        </span>
      </div>

      <label className="mb-1.5 block text-[11.5px] font-medium text-slate">
        Reuniones efectivas objetivo (mes)
      </label>
      <div className="mb-4 flex w-[150px] items-center gap-2 rounded-lg border border-input px-3 py-2">
        <input
          type="number"
          value={reuniones}
          min={0}
          onChange={(e) => setReuniones(Number(e.target.value))}
          className="w-full bg-transparent text-[15px] font-semibold text-ink outline-none tabular-nums"
        />
        <span className="text-[12px] text-slate">reuniones</span>
      </div>

      <div className="mb-2 text-[11.5px] font-medium text-slate">
        Mezcla de tipos <span className="font-normal text-muted">— debe sumar 100%</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border border-input p-2.5">
            <BucketChip bucket={b} />
            <div className="mt-1.5 text-[22px] font-semibold text-ink tabular-nums">
              {mix[b]}
              <span className="text-[12px] text-slate">%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={mix[b]}
              onChange={(e) => setMix((m) => ({ ...m, [b]: Number(e.target.value) }))}
              className="w-full"
              style={{ accentColor: BUCKET_COLOR[b] }}
            />
            <div className="mt-1 text-[11px] text-slate tabular-nums">
              ≈ {Math.round((mix[b] / 100) * reuniones)} reuniones
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function AdminObjetivos() {
  const editores = VENDEDORES.slice(0, 2)
  const resto = VENDEDORES.slice(2)

  return (
    <>
      <PageHead
        titulo="Objetivos de agosto"
        descripcion="Cantidad de reuniones efectivas + mezcla de tipos, por vendedor"
      >
        <Button variant="outline">
          <Copy /> Copiar de julio
        </Button>
        <Button variant="blue">
          <Check /> Guardar cambios
        </Button>
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-2">
        {editores.map((v) => {
          const obj = OBJETIVOS.find((o) => o.vendedor_id === v.id)
          return obj ? <ObjetivoEditor key={v.id} vendedor={v} objetivo={obj} /> : null
        })}
      </div>

      <SectionTitle titulo="Resto del equipo" hint="Vista compacta" />
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5 font-medium">Vendedor</th>
              <th className="px-4 py-2.5 font-medium">Objetivo</th>
              <th className="px-4 py-2.5 font-medium">Estratégico</th>
              <th className="px-4 py-2.5 font-medium">Fulfillment</th>
              <th className="px-4 py-2.5 font-medium">Mediano</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {resto.map((v) => {
              const obj = OBJETIVOS.find((o) => o.vendedor_id === v.id)
              if (!obj) return null
              return (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <VAvatar iniciales={v.iniciales} />
                      <span className="text-[13px] font-medium text-ink">{v.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-semibold tabular-nums text-ink">
                    {obj.reuniones_efectivas}
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b} className="px-4 py-3">
                      <BucketChip bucket={b} />
                      <span className="ml-1.5 text-[12px] font-semibold tabular-nums text-ink">
                        {obj.mix[b]}%
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm">
                      Editar
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </>
  )
}
