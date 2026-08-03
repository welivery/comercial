import { useState } from "react"
import { Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { BucketChip, Cargando, ErrorMsg, VAvatar } from "@/components/widgets"
import { useObjetivos, useVendedores } from "@/hooks/useData"
import { guardarObjetivo } from "@/data/api"
import { PERIODO_ACTUAL, PERIODO_LABEL } from "@/lib/display"
import { BUCKETS, BUCKET_COLOR } from "@/lib/buckets"
import type { Bucket, Objetivo, Vendedor } from "@/lib/types"

const MIX_DEFAULT: Record<Bucket, number> = { estrategico: 40, fulfillment: 30, mediano: 30 }

function ObjetivoEditor({ vendedor, objetivo }: { vendedor: Vendedor; objetivo?: Objetivo }) {
  const [reuniones, setReuniones] = useState(objetivo?.reuniones_efectivas ?? 12)
  const [mix, setMix] = useState<Record<Bucket, number>>(objetivo?.mix ?? MIX_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const suma = BUCKETS.reduce((a, b) => a + mix[b], 0)
  const ok = suma === 100

  async function guardar() {
    setGuardando(true)
    setErr(null)
    try {
      await guardarObjetivo(vendedor.id, PERIODO_ACTUAL, reuniones, mix)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="p-[18px]">
      <div className="mb-4 flex items-center gap-3">
        <VAvatar iniciales={vendedor.iniciales} className="size-9 text-[13px]" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-ink">{vendedor.nombre}</div>
          <div className="text-[11.5px] text-slate">Vendedor · {vendedor.zona || "—"}</div>
        </div>
        <span
          className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ background: (ok ? "#1E9E6A" : "#E0A52F") + "1F", color: ok ? "#1E9E6A" : "#a5741a" }}
        >
          {ok ? "Suma 100%" : `Suma ${suma}%`}
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

      {err && <div className="mt-3 rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12px] text-error">{err}</div>}

      <div className="mt-4 flex items-center justify-end gap-2">
        {!ok && <span className="mr-auto text-[11.5px] text-warning">Ajustá la mezcla a 100% para guardar.</span>}
        <Button variant={guardado ? "outline" : "blue"} disabled={!ok || guardando} onClick={guardar}>
          <Check /> {guardando ? "Guardando…" : guardado ? "Guardado" : "Guardar"}
        </Button>
      </div>
    </Card>
  )
}

export function AdminObjetivos() {
  const { data: vendedores, loading, error } = useVendedores()
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const vends = vendedores ?? []
  const objs = objetivos ?? []

  if (loading) return <Cargando que="los objetivos" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead
        titulo={`Objetivos · ${PERIODO_LABEL}`}
        descripcion="Cantidad de reuniones efectivas + mezcla de tipos, por vendedor"
      />

      {vends.length === 0 ? (
        <Card className="p-8 text-center text-[13px] text-slate">
          No hay vendedores todavía. Agregá vendedores para cargarles objetivos.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {vends.map((v) => (
            <ObjetivoEditor key={v.id} vendedor={v} objetivo={objs.find((o) => o.vendedor_id === v.id)} />
          ))}
        </div>
      )}
    </>
  )
}
