import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Building2, FileText, Mail, Pencil, Phone, Receipt } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { BucketChip, Cargando, EstadoBadge } from "@/components/widgets"
import { useCliente, useEventos, useOportunidad } from "@/hooks/useData"
import {
  actualizarOportunidad,
  guardarContactoEmpresa,
  moverOportunidad,
  type OportunidadPatch,
} from "@/data/api"
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

// Contacto + notas de la ficha. Viven en la EMPRESA (registro único), no en la
// oportunidad: se comparten con leads, otras oportunidades y campañas.
interface ContactoForm {
  contacto: string
  email: string
  telefono: string
  nota: string
}

export function OportunidadDetalle() {
  const { id } = useParams()
  const { data: o, loading, reload } = useOportunidad(id)
  const { data: empresa, reload: reloadEmpresa } = useCliente(o?.cliente_id)
  const { data: eventosData } = useEventos(id)
  const toast = useToast()
  const [perdOpen, setPerdOpen] = useState(false)
  const [perdMotivo, setPerdMotivo] = useState("")
  const [perdSaving, setPerdSaving] = useState(false)

  // Modal "Editar ficha": datos del prospecto (oportunidad) + contacto/notas (empresa).
  const [editOpen, setEditOpen] = useState(false)
  const [ef, setEf] = useState<OportunidadPatch>({})
  const [cf, setCf] = useState<ContactoForm>({ contacto: "", email: "", telefono: "", nota: "" })
  const [efSaving, setEfSaving] = useState(false)
  function abrirEditar() {
    if (!o) return
    setEf({
      ecommerce: o.ecommerce,
      sitio: o.sitio ?? "",
      envios_aprox: o.envios_aprox,
      lugar_retiro: o.lugar_retiro,
      tipo_producto: o.tipo_producto,
      interes: o.interes ?? "",
    })
    setCf({
      contacto: empresa?.contacto ?? "",
      email: empresa?.email ?? "",
      telefono: empresa?.telefono ?? "",
      nota: empresa?.nota ?? "",
    })
    setEditOpen(true)
  }
  async function guardarEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!o) return
    setEfSaving(true)
    try {
      // Prospecto → oportunidad; contacto + notas → empresa (registro único).
      await actualizarOportunidad(o, ef)
      await guardarContactoEmpresa(o, cf)
      setEditOpen(false)
      reload()
      reloadEmpresa()
    } catch (err) {
      toast.error(msgError(err, "No se pudo guardar"))
    } finally {
      setEfSaving(false)
    }
  }

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
    ["Contacto", empresa?.contacto || "—"],
    [
      "Email",
      empresa?.email ? (
        <a href={`mailto:${empresa.email}`} className="inline-flex items-center gap-1.5 text-blue hover:underline">
          <Mail size={13} /> {empresa.email}
        </a>
      ) : (
        "—"
      ),
    ],
    [
      "Teléfono",
      empresa?.telefono ? (
        <a href={`tel:${empresa.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-blue hover:underline">
          <Phone size={13} /> {empresa.telefono}
        </a>
      ) : (
        "—"
      ),
    ],
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

          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-[13px] font-semibold text-navy">Datos del prospecto</h4>
            <button
              onClick={abrirEditar}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-blue hover:bg-[#EEF3FE]"
            >
              <Pencil size={13} /> Editar
            </button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
            {kv.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-slate">{k}</dt>
                <dd className="font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Contacto/notas viven en la empresa: aviso de que es compartido */}
          <div className="mt-3 flex items-center gap-1.5 rounded-md bg-mist/60 px-2.5 py-1.5 text-[11.5px] text-slate">
            <Building2 size={13} className="shrink-0 text-slate" />
            <span>
              Contacto y notas de la empresa{empresa ? <b className="font-medium text-ink"> {empresa.nombre}</b> : ""} —
              se comparten con sus leads, oportunidades y campañas.
            </span>
            <Link to="/clientes" className="ml-auto shrink-0 font-medium text-blue hover:underline">
              Ver ficha
            </Link>
          </div>

          {/* Notas libres (de la empresa) */}
          <div className="mt-3 rounded-lg border border-border bg-mist/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate">Notas de la empresa</span>
              <button onClick={abrirEditar} className="text-[11.5px] font-medium text-blue hover:underline">
                {empresa?.nota ? "Editar" : "Agregar"}
              </button>
            </div>
            {empresa?.nota ? (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">{empresa.nota}</p>
            ) : (
              <p className="text-[12.5px] italic text-muted">Sin notas. Dejá acá info útil de la empresa.</p>
            )}
          </div>

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

      {/* Modal: editar ficha (prospecto + contacto/notas de la empresa) */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ficha de la oportunidad">
        <form onSubmit={guardarEdit} className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate">
            <Building2 size={13} /> Contacto de la empresa
          </div>
          <p className="-mt-1.5 text-[11.5px] text-muted">
            Se guarda en la empresa y queda disponible en sus leads, oportunidades y campañas.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Persona de contacto</span>
            <input value={cf.contacto} onChange={(e) => setCf({ ...cf, contacto: e.target.value })} className="ipt" placeholder="Nombre y apellido" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Email</span>
              <input type="email" value={cf.email} onChange={(e) => setCf({ ...cf, email: e.target.value })} className="ipt" placeholder="contacto@empresa.cl" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Teléfono</span>
              <input value={cf.telefono} onChange={(e) => setCf({ ...cf, telefono: e.target.value })} className="ipt" placeholder="+56 9 1234 5678" />
            </label>
          </div>

          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate">Datos del prospecto</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">E-commerce</span>
              <input value={ef.ecommerce ?? ""} onChange={(e) => setEf({ ...ef, ecommerce: e.target.value })} className="ipt" required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Sitio</span>
              <input value={ef.sitio ?? ""} onChange={(e) => setEf({ ...ef, sitio: e.target.value })} className="ipt" placeholder="tienda.cl" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Envíos aprox./mes</span>
              <input type="number" min={0} value={ef.envios_aprox ?? 0} onChange={(e) => setEf({ ...ef, envios_aprox: Number(e.target.value) })} className="ipt" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Lugar de retiro</span>
              <input value={ef.lugar_retiro ?? ""} onChange={(e) => setEf({ ...ef, lugar_retiro: e.target.value })} className="ipt" placeholder="Comuna / bodega" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Tipo de producto</span>
            <input value={ef.tipo_producto ?? ""} onChange={(e) => setEf({ ...ef, tipo_producto: e.target.value })} className="ipt" placeholder="Textil, alimentos…" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Interés</span>
            <input value={ef.interes ?? ""} onChange={(e) => setEf({ ...ef, interes: e.target.value })} className="ipt" placeholder="Fulfillment, última milla…" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate">
              <Building2 size={12} /> Notas de la empresa
            </span>
            <textarea
              value={cf.nota}
              onChange={(e) => setCf({ ...cf, nota: e.target.value })}
              className="ipt min-h-[90px] resize-y"
              placeholder="Todo lo que quieras dejar asentado de la empresa: quién decide, presupuesto, próxima acción…"
            />
          </label>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="blue" disabled={efSaving}>{efSaving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </Modal>

      <style>{`.ipt{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.ipt:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}
