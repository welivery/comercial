import { useEffect, useMemo, useState } from "react"
import { Check, GripVertical, Info, Plus, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { Cargando, ErrorMsg, VAvatar } from "@/components/widgets"
import { useObjetivos, useVendedores } from "@/hooks/useData"
import {
  eliminarSegmento,
  fetchSegmentos,
  guardarObjetivo,
  guardarSegmento,
} from "@/data/api"
import { PERIODO_ACTUAL, PERIODO_LABEL } from "@/lib/display"
import { msgError } from "@/lib/errors"
import { segmentosActivos, setSegmentosRegistry, useSegmentos } from "@/lib/buckets"
import type { Objetivo, Segmento, Vendedor } from "@/lib/types"

// Reparte 100% en partes iguales entre los segmentos activos (default de un mix
// nuevo). El remanente va a los primeros para que sume exacto 100.
function mixParejo(ids: string[]): Record<string, number> {
  const n = ids.length
  if (!n) return {}
  const base = Math.floor(100 / n)
  let resto = 100 - base * n
  const out: Record<string, number> = {}
  for (const id of ids) {
    out[id] = base + (resto > 0 ? 1 : 0)
    if (resto > 0) resto--
  }
  return out
}

// ─────────────────────────── Editor de segmentos ───────────────────────────
function SegmentosEditor({ onCambio }: { onCambio: () => void }) {
  const segsReg = useSegmentos()
  const [draft, setDraft] = useState<Segmento[]>(segsReg)
  const [removed, setRemoved] = useState<string[]>([])
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Al abrir, sincroniza el borrador con lo que hay en el registro.
  useEffect(() => {
    if (abierto) {
      setDraft(segsReg)
      setRemoved([])
      setGuardado(false)
      setErr(null)
    }
  }, [abierto, segsReg])

  function set(i: number, patch: Partial<Segmento>) {
    setDraft((d) => d.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function mover(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.length) return d
      const copia = [...d]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }
  function agregar() {
    const id = `seg-${crypto.randomUUID().slice(0, 8)}`
    setDraft((d) => [
      ...d,
      { id, nombre: "", tipo: "volumen", envios_min: 0, regla: null, color: "#6FE0CB", orden: d.length + 1, activo: true },
    ])
  }
  function quitar(i: number) {
    setDraft((d) => {
      const s = d[i]
      // Si ya existía (estaba en el registro), lo marcamos para borrar en la base.
      if (segsReg.some((r) => r.id === s.id)) setRemoved((rm) => [...rm, s.id])
      return d.filter((_, idx) => idx !== i)
    })
  }

  async function guardar() {
    // Validaciones simples.
    if (draft.some((s) => !s.nombre.trim())) {
      setErr("Todos los segmentos necesitan un nombre.")
      return
    }
    if (!draft.some((s) => s.activo)) {
      setErr("Tiene que quedar al menos un segmento activo.")
      return
    }
    setGuardando(true)
    setErr(null)
    try {
      // El orden se normaliza según la posición en la lista.
      await Promise.all(draft.map((s, i) => guardarSegmento({ ...s, orden: i + 1 })))
      await Promise.all(removed.map((id) => eliminarSegmento(id)))
      const frescos = await fetchSegmentos()
      setSegmentosRegistry(frescos)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      onCambio()
    } catch (e) {
      setErr(msgError(e, "No se pudieron guardar los segmentos"))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="mb-4 p-[18px]">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-navy">Segmentos de cliente</h2>
          <p className="mt-0.5 text-[12px] text-slate">
            Cómo se clasifica cada cliente por volumen de envíos. Editá nombres, umbrales, agregá o quitá.
          </p>
        </div>
        <Button variant="outline" className="ml-auto shrink-0" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cerrar" : "Configurar"}
        </Button>
      </div>

      {abierto && (
        <div className="mt-4">
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#EEF3FE] p-2.5 text-[11.5px] leading-relaxed text-navy">
            <Info size={15} className="mt-px shrink-0 text-blue" />
            <span>
              Un cliente cae en la banda de <b>mayor umbral</b> que su volumen alcanza (marca reconocida = banda tope).
              El de <b>menor umbral es el que menos queremos sumar</b>. “Fulfillment” es un tipo especial: se asigna a
              quienes piden ese servicio, sin importar el volumen.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {draft.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-input p-2.5">
                {/* Orden */}
                <div className="flex flex-col text-muted">
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="leading-none hover:text-ink disabled:opacity-30">▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === draft.length - 1} className="leading-none hover:text-ink disabled:opacity-30">▼</button>
                </div>
                <GripVertical size={15} className="text-muted" />

                {/* Color */}
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => set(i, { color: e.target.value })}
                  className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent"
                  title="Color"
                />

                {/* Nombre */}
                <input
                  value={s.nombre}
                  onChange={(e) => set(i, { nombre: e.target.value })}
                  placeholder="Nombre del segmento"
                  className="min-w-[130px] flex-1 rounded-lg border border-input px-2.5 py-1.5 text-[13px] font-medium text-ink outline-none"
                />

                {/* Tipo */}
                <select
                  value={s.tipo}
                  onChange={(e) => set(i, { tipo: e.target.value as Segmento["tipo"] })}
                  className="rounded-lg border border-input px-2 py-1.5 text-[12.5px] text-ink outline-none"
                >
                  <option value="volumen">Por volumen</option>
                  <option value="especial">Especial (fulfillment)</option>
                </select>

                {/* Umbral o nota */}
                {s.tipo === "volumen" ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1.5">
                    <span className="text-[11.5px] text-slate">desde</span>
                    <input
                      type="number"
                      min={0}
                      value={s.envios_min ?? 0}
                      onChange={(e) => set(i, { envios_min: Number(e.target.value) })}
                      className="w-[72px] bg-transparent text-[13px] font-semibold text-ink outline-none tabular-nums"
                    />
                    <span className="text-[11.5px] text-slate">env/mes</span>
                  </div>
                ) : (
                  <span className="rounded-lg bg-cloud px-2.5 py-1.5 text-[11.5px] text-slate">
                    quiere fulfillment
                  </span>
                )}

                {/* Activo */}
                <label className="flex items-center gap-1.5 text-[11.5px] text-slate">
                  <input type="checkbox" checked={s.activo} onChange={(e) => set(i, { activo: e.target.checked })} />
                  Activo
                </label>

                <button
                  onClick={() => quitar(i)}
                  className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-[#FBE2E2] hover:text-error"
                  title="Quitar segmento"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {err && <div className="mt-3 rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12px] text-error">{err}</div>}

          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" onClick={agregar}>
              <Plus /> Agregar segmento
            </Button>
            <Button variant={guardado ? "outline" : "blue"} className="ml-auto" disabled={guardando} onClick={guardar}>
              <Check /> {guardando ? "Guardando…" : guardado ? "Guardado" : "Guardar segmentos"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Al cambiar umbrales, las oportunidades ya cargadas conservan su segmento; los nuevos se clasifican con estos valores.
          </p>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────── Objetivo por vendedor ───────────────────────────
function ObjetivoEditor({
  vendedor,
  objetivo,
  segmentos,
  onGuardado,
}: {
  vendedor: Vendedor
  objetivo?: Objetivo
  segmentos: Segmento[]
  onGuardado?: () => void
}) {
  const ids = segmentos.map((s) => s.id)
  const inicial = useMemo(() => {
    const base = mixParejo(ids)
    if (!objetivo) return base
    // Toma lo guardado para los segmentos que existen; completa faltantes en 0.
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = objetivo.mix[id] ?? 0
    // Si el guardado no cubría ningún segmento activo, usá el parejo.
    return Object.values(out).some((v) => v > 0) ? out : base
  }, [objetivo, ids.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const [reuniones, setReuniones] = useState(objetivo?.reuniones_efectivas ?? 12)
  const [cupo, setCupo] = useState(objetivo?.leads_cupo_diario ?? 10)
  const [mix, setMix] = useState<Record<string, number>>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const suma = ids.reduce((a, id) => a + (mix[id] ?? 0), 0)
  const ok = suma === 100

  async function guardar() {
    setGuardando(true)
    setErr(null)
    try {
      await guardarObjetivo(vendedor.id, PERIODO_ACTUAL, reuniones, mix, cupo)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      onGuardado?.()
    } catch (e) {
      setErr(msgError(e, "No se pudo guardar"))
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

      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-slate">
            Reuniones efectivas objetivo (mes)
          </label>
          <div className="flex w-[160px] items-center gap-2 rounded-lg border border-input px-3 py-2">
            <input
              type="number"
              value={reuniones}
              min={0}
              onChange={(e) => setReuniones(Number(e.target.value))}
              className="w-full bg-transparent text-[15px] font-semibold text-ink outline-none tabular-nums"
            />
            <span className="text-[12px] text-slate">reuniones</span>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-slate">
            Leads nuevos por día (automático)
          </label>
          <div className="flex w-[150px] items-center gap-2 rounded-lg border border-input px-3 py-2">
            <input
              type="number"
              value={cupo}
              min={0}
              onChange={(e) => setCupo(Number(e.target.value))}
              className="w-full bg-transparent text-[15px] font-semibold text-ink outline-none tabular-nums"
            />
            <span className="text-[12px] text-slate">leads/día</span>
          </div>
        </div>
      </div>

      <div className="mb-2 text-[11.5px] font-medium text-slate">
        Mezcla de tipos <span className="font-normal text-muted">— debe sumar 100%</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {segmentos.map((s) => (
          <div key={s.id} className="rounded-lg border border-input p-2.5">
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: s.color + "1F", color: s.color }}
            >
              {s.nombre}
            </span>
            <div className="mt-1.5 text-[22px] font-semibold text-ink tabular-nums">
              {mix[s.id] ?? 0}
              <span className="text-[12px] text-slate">%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={mix[s.id] ?? 0}
              onChange={(e) => setMix((m) => ({ ...m, [s.id]: Number(e.target.value) }))}
              className="w-full"
              style={{ accentColor: s.color }}
            />
            <div className="mt-1 text-[11px] text-slate tabular-nums">
              ≈ {Math.round(((mix[s.id] ?? 0) / 100) * reuniones)} reuniones
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
  const { data: objetivos, loading: loadingObj, reload: reloadObj } = useObjetivos(PERIODO_ACTUAL)
  const segs = useSegmentos()
  const activos = segmentosActivos(segs)
  const vends = vendedores ?? []
  const objs = objetivos ?? []

  // Esperar TAMBIÉN a los objetivos: si no, los editores se montan con los
  // valores por defecto antes de que lleguen los guardados y no se actualizan.
  if (loading || loadingObj) return <Cargando que="los objetivos" />
  if (error) return <ErrorMsg msg={error} />

  const firma = activos.map((s) => s.id).join(",")

  return (
    <>
      <PageHead
        titulo={`Objetivos · ${PERIODO_LABEL}`}
        descripcion="Segmentos de cliente + reuniones efectivas y mezcla por vendedor"
      />

      <SegmentosEditor onCambio={reloadObj} />

      {vends.length === 0 ? (
        <Card className="p-8 text-center text-[13px] text-slate">
          No hay vendedores todavía. Agregá vendedores para cargarles objetivos.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {vends.map((v) => {
            const obj = objs.find((o) => o.vendedor_id === v.id)
            // key incluye id del objetivo y la firma de segmentos activos: si
            // cambian, el editor se re-monta con los valores correctos.
            return (
              <ObjetivoEditor
                key={`${v.id}:${obj?.id ?? "n"}:${firma}`}
                vendedor={v}
                objetivo={obj}
                segmentos={activos}
                onGuardado={reloadObj}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
