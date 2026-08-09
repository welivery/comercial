import { useEffect, useMemo, useState } from "react"
import {
  Check,
  Copy,
  Info,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { ConexionEmail } from "@/components/ConexionEmail"
import { Cargando, ErrorMsg } from "@/components/widgets"
import { useVentas } from "@/store"
import { useInscripciones, useLeads, useSecuencias } from "@/hooks/useData"
import {
  actualizarInscripcion,
  actualizarSecuencia,
  crearSecuencia,
  duplicarSecuencia,
  eliminarInscripcion,
  eliminarSecuencia,
  fetchPasos,
  guardarPasos,
  inscribir,
  type PasoInput,
} from "@/data/api"
import { cn } from "@/lib/utils"
import type { InscripcionEstado, Secuencia, SecuenciaObjetivo } from "@/lib/types"

const OBJETIVO_LABEL: Record<SecuenciaObjetivo, string> = {
  reactivacion: "Reactivación",
  prospeccion: "Prospección",
  otro: "Otro",
}
const OBJETIVO_COLOR: Record<SecuenciaObjetivo, string> = {
  reactivacion: "#F2563A",
  prospeccion: "#2F5BE6",
  otro: "#7A869C",
}
const INSC_LABEL: Record<InscripcionEstado, string> = {
  activa: "Activa",
  pausada: "Pausada",
  respondio: "Respondió",
  terminada: "Terminada",
  rebotada: "Rebotó",
}
const INSC_COLOR: Record<InscripcionEstado, string> = {
  activa: "#1E9E6A",
  pausada: "#E0A52F",
  respondio: "#2F5BE6",
  terminada: "#7A869C",
  rebotada: "#DB3B3B",
}

const PASO_VACIO: PasoInput = { orden: 1, dias_espera: 3, asunto: "", cuerpo: "", activo: true }

export function VendedorSecuencias() {
  const { vendedor } = useVentas()
  const { data: secuenciasData, loading, error, reload } = useSecuencias(vendedor.id)
  const { data: inscData, reload: reloadInsc } = useInscripciones(vendedor.id)
  const { data: leadsData } = useLeads(vendedor.id)
  const secuencias = useMemo(() => secuenciasData ?? [], [secuenciasData])
  const inscripciones = useMemo(() => inscData ?? [], [inscData])
  const leads = useMemo(() => leadsData ?? [], [leadsData])

  const [selId, setSelId] = useState<string | null>(null)
  const seleccionada = secuencias.find((s) => s.id === selId) ?? null
  const esPropia = !!seleccionada && seleccionada.vendedor_id === vendedor.id

  // Editor de pasos (borrador local de la secuencia seleccionada).
  const [pasos, setPasos] = useState<PasoInput[]>([])
  const [cargandoPasos, setCargandoPasos] = useState(false)
  const [nombre, setNombre] = useState("")
  const [objetivo, setObjetivo] = useState<SecuenciaObjetivo>("reactivacion")
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [errEditor, setErrEditor] = useState<string | null>(null)

  // Modal de inscripción.
  const [inscOpen, setInscOpen] = useState(false)

  // Al elegir una secuencia, carga sus pasos y encabezado.
  useEffect(() => {
    if (!selId) return
    setCargandoPasos(true)
    setGuardado(false)
    setErrEditor(null)
    fetchPasos(selId)
      .then((ps) => {
        setPasos(
          ps.map((p) => ({
            orden: p.orden,
            dias_espera: p.dias_espera,
            asunto: p.asunto,
            cuerpo: p.cuerpo,
            activo: p.activo,
          }))
        )
      })
      .catch((e) => setErrEditor(e instanceof Error ? e.message : "No se pudieron cargar los pasos"))
      .finally(() => setCargandoPasos(false))
    const s = secuencias.find((x) => x.id === selId)
    if (s) {
      setNombre(s.nombre)
      setObjetivo(s.objetivo)
    }
  }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  function setPaso(i: number, patch: Partial<PasoInput>) {
    setPasos((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function agregarPaso() {
    setPasos((ps) => [...ps, { ...PASO_VACIO, orden: ps.length + 1 }])
  }
  function quitarPaso(i: number) {
    setPasos((ps) => ps.filter((_, idx) => idx !== i))
  }

  async function nuevaSecuencia() {
    try {
      const id = await crearSecuencia(vendedor.id, "Nueva secuencia", "reactivacion")
      reload()
      setSelId(id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo crear")
    }
  }

  async function duplicar(s: Secuencia) {
    try {
      const id = await duplicarSecuencia(s.id, vendedor.id)
      reload()
      setSelId(id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo duplicar")
    }
  }

  async function borrar(s: Secuencia) {
    if (!window.confirm(`¿Eliminar la secuencia "${s.nombre}"?`)) return
    try {
      await eliminarSecuencia(s.id)
      if (selId === s.id) setSelId(null)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  async function guardarEditor() {
    if (!seleccionada) return
    if (!nombre.trim()) {
      setErrEditor("La secuencia necesita un nombre.")
      return
    }
    if (pasos.some((p) => !p.asunto.trim() || !p.cuerpo.trim())) {
      setErrEditor("Cada paso necesita asunto y cuerpo.")
      return
    }
    setGuardando(true)
    setErrEditor(null)
    try {
      await actualizarSecuencia(seleccionada.id, { nombre: nombre.trim(), objetivo })
      await guardarPasos(seleccionada.id, pasos)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      reload()
    } catch (e) {
      setErrEditor(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <Cargando que="tus secuencias" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Secuencias de email" descripcion="Cadencias de mails para reactivar y prospectar">
        <Button variant="outline" onClick={() => setInscOpen(true)}>
          <Send /> Inscribir contacto
        </Button>
        <Button variant="blue" onClick={nuevaSecuencia}>
          <Plus /> Nueva secuencia
        </Button>
      </PageHead>

      <ConexionEmail vendedorId={vendedor.id} />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue/25 bg-[#EEF3FE] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-blue">
        <Info size={16} className="mt-px shrink-0" />
        <span>
          Acá armás y editás tus secuencias. Conectá tu email arriba para poder enviarlas. El <b>envío automático</b>{" "}
          (y frenar cuando el cliente responde) se termina de activar en la próxima etapa; por ahora las inscripciones
          quedan agendadas.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* Lista de secuencias */}
        <div className="flex flex-col gap-2">
          {secuencias.length === 0 && (
            <Card className="p-4 text-center text-[13px] text-slate">
              Todavía no hay secuencias. Creá una o duplicá una plantilla.
            </Card>
          )}
          {secuencias.map((s) => {
            const plantilla = s.vendedor_id === null
            return (
              <Card
                key={s.id}
                className={cn(
                  "cursor-pointer p-3 transition-colors",
                  selId === s.id ? "ring-2 ring-blue" : "hover:bg-mist/60"
                )}
                onClick={() => setSelId(s.id)}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{s.nombre}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                        style={{ background: OBJETIVO_COLOR[s.objetivo] + "1F", color: OBJETIVO_COLOR[s.objetivo] }}
                      >
                        {OBJETIVO_LABEL[s.objetivo]}
                      </span>
                      {plantilla && (
                        <span className="rounded-full bg-cloud px-2 py-0.5 text-[10.5px] font-medium text-slate">
                          Plantilla
                        </span>
                      )}
                      {!s.activo && (
                        <span className="rounded-full bg-cloud px-2 py-0.5 text-[10.5px] font-medium text-muted">
                          Inactiva
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicar(s)
                    }}
                    title="Duplicar"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-mist hover:text-ink"
                  >
                    <Copy size={14} />
                  </button>
                  {!plantilla && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        borrar(s)
                      }}
                      title="Eliminar"
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-[#FBE2E2] hover:text-error"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Editor de la secuencia seleccionada */}
        {!seleccionada ? (
          <Card className="grid min-h-[240px] place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-mist">
                <Mail size={20} className="text-blue" />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-navy">Elegí una secuencia para editarla</p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-slate">
                O creá una nueva. Las plantillas se pueden duplicar para adaptarlas a tu estilo.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-[18px]">
            {!esPropia && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#FCF3E2] px-3 py-2 text-[12px] text-[#8a6416]">
                <Info size={14} className="shrink-0" />
                Esta es una plantilla compartida (solo lectura).
                <Button size="sm" variant="blue" className="ml-auto" onClick={() => duplicar(seleccionada)}>
                  <Copy /> Duplicar para editar
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[11.5px] font-medium text-slate">Nombre</span>
                <input
                  value={nombre}
                  disabled={!esPropia}
                  onChange={(e) => setNombre(e.target.value)}
                  className="rounded-lg border border-input px-3 py-2 text-[13px] font-medium text-ink outline-none focus:border-blue disabled:bg-mist/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] font-medium text-slate">Objetivo</span>
                <select
                  value={objetivo}
                  disabled={!esPropia}
                  onChange={(e) => setObjetivo(e.target.value as SecuenciaObjetivo)}
                  className="rounded-lg border border-input px-3 py-2 text-[13px] text-ink outline-none focus:border-blue disabled:bg-mist/60"
                >
                  <option value="reactivacion">Reactivación</option>
                  <option value="prospeccion">Prospección</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-navy">Pasos ({pasos.length})</h3>
              <span className="text-[11px] text-muted">Variables: {"{{nombre}}"} · {"{{empresa}}"}</span>
            </div>

            {cargandoPasos ? (
              <p className="mt-3 text-[13px] text-slate">Cargando pasos…</p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {pasos.map((p, i) => (
                  <div key={i} className="rounded-xl border border-input p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <div className="flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1">
                        <span className="text-[11px] text-slate">{i === 0 ? "a los" : "esperar"}</span>
                        <input
                          type="number"
                          min={0}
                          disabled={!esPropia}
                          value={p.dias_espera}
                          onChange={(e) => setPaso(i, { dias_espera: Number(e.target.value) })}
                          className="w-[52px] bg-transparent text-[13px] font-semibold text-ink outline-none tabular-nums disabled:opacity-70"
                        />
                        <span className="text-[11px] text-slate">{i === 0 ? "días de inscribir" : "días"}</span>
                      </div>
                      {esPropia && (
                        <button
                          onClick={() => quitarPaso(i)}
                          title="Quitar paso"
                          className="ml-auto grid size-7 place-items-center rounded-md text-muted hover:bg-[#FBE2E2] hover:text-error"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <input
                      value={p.asunto}
                      disabled={!esPropia}
                      onChange={(e) => setPaso(i, { asunto: e.target.value })}
                      placeholder="Asunto del mail"
                      className="mb-2 w-full rounded-lg border border-input px-3 py-2 text-[13px] font-medium text-ink outline-none focus:border-blue disabled:bg-mist/60"
                    />
                    <textarea
                      value={p.cuerpo}
                      disabled={!esPropia}
                      onChange={(e) => setPaso(i, { cuerpo: e.target.value })}
                      placeholder="Cuerpo del mail…"
                      className="min-h-[120px] w-full resize-y rounded-lg border border-input px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-blue disabled:bg-mist/60"
                    />
                  </div>
                ))}

                {esPropia && (
                  <Button variant="outline" className="self-start" onClick={agregarPaso}>
                    <Plus /> Agregar paso
                  </Button>
                )}
              </div>
            )}

            {errEditor && (
              <div className="mt-3 rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12px] text-error">{errEditor}</div>
            )}

            {esPropia && (
              <div className="mt-4 flex justify-end">
                <Button variant={guardado ? "outline" : "blue"} disabled={guardando} onClick={guardarEditor}>
                  <Check /> {guardando ? "Guardando…" : guardado ? "Guardado" : "Guardar secuencia"}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Inscripciones */}
      <h2 className="mb-3 mt-7 text-[15px] font-semibold text-navy">Contactos en secuencia</h2>
      {inscripciones.length === 0 ? (
        <Card className="p-6 text-center text-[13px] text-slate">
          Todavía no inscribiste a nadie. Usá “Inscribir contacto” para arrancar una cadencia.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
                <th className="px-4 py-2.5 font-medium">Contacto</th>
                <th className="px-4 py-2.5 font-medium">Secuencia</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Paso</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {inscripciones.map((ins) => {
                const seq = secuencias.find((s) => s.id === ins.secuencia_id)
                return (
                  <tr key={ins.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium text-ink">{ins.destinatario_nombre || "—"}</div>
                      <div className="text-[11.5px] text-slate">{ins.destinatario_email}</div>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate">{seq?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: INSC_COLOR[ins.estado] + "1F", color: INSC_COLOR[ins.estado] }}
                      >
                        {INSC_LABEL[ins.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] tabular-nums text-slate">{ins.paso_actual}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {ins.estado === "activa" ? (
                          <button
                            onClick={() => actualizarInscripcion(ins.id, "pausada").then(reloadInsc)}
                            title="Pausar"
                            className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                          >
                            <Pause size={15} />
                          </button>
                        ) : ins.estado === "pausada" ? (
                          <button
                            onClick={() => actualizarInscripcion(ins.id, "activa").then(reloadInsc)}
                            title="Reanudar"
                            className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                          >
                            <Play size={15} />
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            if (window.confirm("¿Sacar a este contacto de la secuencia?"))
                              eliminarInscripcion(ins.id).then(reloadInsc)
                          }}
                          title="Quitar"
                          className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <InscribirModal
        open={inscOpen}
        onClose={() => setInscOpen(false)}
        vendedorId={vendedor.id}
        secuencias={secuencias}
        leads={leads}
        onHecho={() => {
          setInscOpen(false)
          reloadInsc()
        }}
      />

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}

function InscribirModal({
  open,
  onClose,
  vendedorId,
  secuencias,
  leads,
  onHecho,
}: {
  open: boolean
  onClose: () => void
  vendedorId: string
  secuencias: Secuencia[]
  leads: { id: string; nombre: string; email: string | null }[]
  onHecho: () => void
}) {
  const [secuenciaId, setSecuenciaId] = useState("")
  const [leadId, setLeadId] = useState("")
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSecuenciaId(secuencias[0]?.id ?? "")
      setLeadId("")
      setNombre("")
      setEmail("")
      setErr(null)
    }
  }, [open, secuencias])

  function elegirLead(id: string) {
    setLeadId(id)
    const l = leads.find((x) => x.id === id)
    if (l) {
      setNombre(l.nombre)
      if (l.email) setEmail(l.email)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!secuenciaId) {
      setErr("Elegí una secuencia.")
      return
    }
    if (!email.trim()) {
      setErr("Falta el email del contacto.")
      return
    }
    setGuardando(true)
    setErr(null)
    try {
      await inscribir({
        secuencia_id: secuenciaId,
        vendedor_id: vendedorId,
        lead_id: leadId || null,
        destinatario_nombre: nombre.trim(),
        destinatario_email: email.trim(),
      })
      onHecho()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo inscribir")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Inscribir contacto a una secuencia">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-slate">Secuencia</span>
          <select value={secuenciaId} onChange={(e) => setSecuenciaId(e.target.value)} className="inp">
            {secuencias.length === 0 && <option value="">— sin secuencias —</option>}
            {secuencias.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {s.vendedor_id === null ? " (plantilla)" : ""}
              </option>
            ))}
          </select>
        </label>

        {leads.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Desde un lead (opcional)</span>
            <select value={leadId} onChange={(e) => elegirLead(e.target.value)} className="inp">
              <option value="">— cargar datos a mano —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                  {l.email ? ` · ${l.email}` : " · sin email"}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Nombre del contacto</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="inp" placeholder="Nombre" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="inp"
              placeholder="contacto@empresa.cl"
              required
            />
          </label>
        </div>

        {err && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{err}</div>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="blue" disabled={guardando || !secuenciaId}>
            {guardando ? "Inscribiendo…" : "Inscribir"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
