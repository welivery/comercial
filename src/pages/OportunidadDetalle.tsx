import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, FileText, Pencil, Receipt } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { BucketChip, Cargando, EstadoBadge } from "@/components/widgets"
import { useEventos, useOportunidad } from "@/hooks/useData"
import { moverOportunidad } from "@/data/api"
import { useToast } from "@/components/Toast"
import { msgError } from "@/lib/errors"
import { motivoBucket } from "@/lib/buckets"
import type { EstadoOportunidad } from "@/lib/types"
import {
  ESTADOS_PIPELINE,
  ESTADO_LABEL,
  diasEntre,
  fmtEnvios,
  haceTexto,
} from "@/lib/display"
import { cn } from "@/lib/utils"

const PASO_CORTO: Record<string, string> = {
  interesado: "Interesado",
  reunion_coordinada: "R. coord.",
  reunion_efectiva: "R. efectiva",
  propuesta_enviada: "Propuesta",
  seguimiento: "Seguimiento",
  cierre_ganado: "Cierre",
}

export function OportunidadDetalle() {
  const { id } = useParams()
  const { data: o, loading, reload } = useOportunidad(id)
  const { data: eventosData } = useEventos(id)
  const toast = useToast()
  const [perdOpen, setPerdOpen] = useState(false)
  const [perdMotivo, setPerdMotivo] = useState("")
  const [perdSaving, setPerdSaving] = useState(false)

  async function mover(nuevo: EstadoOportunidad) {
    if (!o || nuevo === o.estado) return
    // "No interesado / perdido": pedimos el motivo antes de mover.
    if (nuevo === "perdido") {
      setPerdMotivo("")
      setPerdOpen(true)
      return
    }
    try {
      await moverOportunidad(o, nuevo)
      reload()
    } catch (err) {
      toast.error(msgError(err, "No se pudo actualizar"))
    }
  }

  async function confirmarPerder(e: React.FormEvent) {
    e.preventDefault()
    if (!o) return
    setPerdSaving(true)
    try {
      await moverOportunidad(o, "perdido", perdMotivo)
      setPerdOpen(false)
      reload()
    } catch (err) {
      toast.error(msgError(err, "No se pudo marcar"))
    } finally {
      setPerdSaving(false)
    }
  }

  if (loading) return <Cargando que="la oportunidad" />

  if (!o) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-slate">
        Oportunidad no encontrada.{" "}
        <Link to="/pipeline" className="ml-1 text-blue underline">
          Volver
        </Link>
      </div>
    )
  }

  const eventos = eventosData ?? []
  const idxActual = ESTADOS_PIPELINE.indexOf(o.estado)

  const kv: [string, React.ReactNode][] = [
    ["Ecommerce", o.sitio ? `${o.ecommerce} · ${o.sitio}` : o.ecommerce],
    ["Envíos aprox.", `${fmtEnvios(o.envios_aprox)} / mes`],
    ["Lugar de retiro", o.lugar_retiro],
    ["Tipo de producto", o.tipo_producto],
    [
      "Bucket",
      <span className="inline-flex items-center gap-2">
        <BucketChip bucket={o.bucket} />
        <span className="text-[12px] text-slate">{motivoBucket(o.clasificacion)}</span>
      </span>,
    ],
    ["Interés", o.interes ?? "—"],
    ["Declarada", `${haceTexto(o.declarada_at)} · ${o.declarada_at}`],
  ]

  return (
    <>
      <Button asChild variant="outline" className="mb-4">
        <Link to="/pipeline">
          <ArrowLeft /> Volver al pipeline
        </Link>
      </Button>

      <div className="grid gap-[18px] lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* Datos + flujo */}
        <Card className="p-[18px]">
          <div className="mb-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[19px] font-semibold text-navy">{o.ecommerce}</h1>
            <BucketChip bucket={o.bucket} />
            <EstadoBadge estado={o.estado} className="ml-auto" />
          </div>
          <p className="mb-[18px] text-[12.5px] text-slate">{o.tipo_producto}</p>

          {/* Flujo de estados */}
          <div className="mb-5 flex flex-wrap items-center gap-y-2">
            {ESTADOS_PIPELINE.map((e, i) => {
              const estado = i < idxActual ? "done" : i === idxActual ? "cur" : "todo"
              return (
                <div key={e} className="flex items-center">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-[11px] font-semibold",
                        estado === "done" && "bg-success text-white",
                        estado === "cur" && "bg-blue text-white ring-4 ring-[#E7EDFC]",
                        estado === "todo" && "bg-cloud text-slate"
                      )}
                    >
                      {estado === "done" ? "✓" : i + 1}
                    </span>
                    <span className={cn("text-[11.5px]", estado === "cur" ? "font-semibold text-blue" : "text-slate")}>
                      {PASO_CORTO[e]}
                    </span>
                  </div>
                  {i < ESTADOS_PIPELINE.length - 1 && (
                    <span className={cn("mx-1.5 h-0.5 w-4", i < idxActual ? "bg-success" : "bg-cloud")} />
                  )}
                </div>
              )
            })}
          </div>

          <h4 className="mb-3 text-[13px] font-semibold text-navy">Datos del prospecto</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
            {kv.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-slate">{k}</dt>
                <dd className="font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {o.estado !== "propuesta_enviada" && o.estado !== "cierre_ganado" && o.estado !== "perdido" && (
              <Button variant="blue" onClick={() => mover("propuesta_enviada")}>
                <FileText /> Enviar propuesta
              </Button>
            )}
            <label className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-[13px] text-slate">
              <Pencil size={14} /> Estado:
              <select
                value={o.estado}
                onChange={(e) => mover(e.target.value as EstadoOportunidad)}
                className="bg-transparent font-medium text-ink outline-none"
              >
                {[...ESTADOS_PIPELINE, "perdido" as EstadoOportunidad].map((es) => (
                  <option key={es} value={es}>
                    {ESTADO_LABEL[es]}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" disabled className="opacity-70">
              <Receipt /> Cotizar
              <span className="text-[10px] text-muted">(pronto)</span>
            </Button>
          </div>
        </Card>

        {/* Historial */}
        <Card className="p-[18px]">
          <h4 className="mb-4 text-[13px] font-semibold text-navy">Historial</h4>
          <div className="flex flex-col">
            {(eventos.length
              ? eventos
              : [{ id: "d", oportunidad_id: o.id, titulo: `Oportunidad en ${ESTADO_LABEL[o.estado]}`, detalle: null, at: o.declarada_at }]
            ).map((e, i, arr) => (
              <div key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < arr.length - 1 && <span className="absolute left-[10px] top-[22px] bottom-0 w-0.5 bg-border" />}
                <span className="z-10 grid size-[22px] shrink-0 place-items-center rounded-full border-2 border-blue bg-white">
                  <span className="size-[7px] rounded-full bg-blue" />
                </span>
                <div>
                  <h5 className="text-[12.5px] font-semibold text-ink">{e.titulo}</h5>
                  {e.detalle && <p className="mt-0.5 text-[12px] leading-snug text-slate">{e.detalle}</p>}
                  <time className="text-[11px] text-muted">{haceTexto(e.at)} · {e.at}</time>
                </div>
              </div>
            ))}
          </div>

          {o.estado === "cierre_ganado" && o.cierre_at && (
            <div className="mt-3 rounded-lg bg-[#DFF2E9] px-3 py-2 text-[12px] font-medium text-success">
              Cerrado en {diasEntre(o.declarada_at, new Date(o.cierre_at))} días desde que se declaró.
            </div>
          )}
          {o.estado === "perdido" && (
            <div className="mt-3 rounded-lg border-l-2 border-error/40 bg-[#FBE2E2]/50 px-3 py-2 text-[12px] text-[#8a2f2f]">
              <b>No interesado.</b> {o.perdida_motivo || "Sin motivo cargado."}
            </div>
          )}
        </Card>
      </div>

      {/* Modal: motivo de No interesado */}
      <Modal open={perdOpen} onClose={() => setPerdOpen(false)} title="Marcar como no interesado">
        <form onSubmit={confirmarPerder} className="flex flex-col gap-3.5">
          <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
            <b className="text-ink">{o.ecommerce}</b> sale del pipeline activo. Contá qué pasó — queda en el
            historial para saber por qué no prosperó.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Motivo / nota</span>
            <textarea
              value={perdMotivo}
              onChange={(e) => setPerdMotivo(e.target.value)}
              className="min-h-[90px] w-full resize-y rounded-lg border border-input px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
              placeholder="Ej: no cerró por precio · se quedó con otro courier · no respondió tras la reunión…"
              autoFocus
            />
          </label>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPerdOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="blue" disabled={perdSaving}>
              {perdSaving ? "Guardando…" : "Marcar no interesado"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
