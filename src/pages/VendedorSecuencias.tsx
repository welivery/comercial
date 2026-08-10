import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Bot,
  Check,
  Copy,
  Eye,
  Info,
  Mail,
  Pause,
  Play,
  Plus,
  Reply,
  Send,
  Zap,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { ConexionEmail } from "@/components/ConexionEmail"
import { ConfigAutomatizacion } from "@/components/ConfigAutomatizacion"
import { Cargando, ErrorMsg } from "@/components/widgets"
import { useVentas } from "@/store"
import { useInscripciones, useInscripcionesEquipo, useLeads, useSecuencias } from "@/hooks/useData"
import {
  actualizarInscripcion,
  actualizarSecuencia,
  crearSecuencia,
  duplicarSecuencia,
  eliminarInscripcion,
  eliminarSecuencia,
  fetchPasos,
  guardarPasos,
  enviarAhoraInscripcion,
  fetchHilo,
  inscribir,
  pasarContactoAOportunidad,
  rechazarLead,
  responderInscripcion,
  type HiloMensaje,
  type PasoInput,
} from "@/data/api"
import { renderPlantilla } from "@/lib/plantillas"
import { cn } from "@/lib/utils"
import type { InscripcionEstado, Secuencia, SecuenciaInscripcion, SecuenciaObjetivo } from "@/lib/types"

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
const SENT_LABEL: Record<string, string> = { positivo: "Interés", negativo: "No interesado", duda: "Duda" }
const SENT_COLOR: Record<string, string> = { positivo: "#1E9E6A", negativo: "#DB3B3B", duda: "#E0A52F" }

const PASO_VACIO: PasoInput = { orden: 1, dias_espera: 3, asunto: "", cuerpo: "", activo: true }

// KPIs de secuencias a partir de una lista de inscripciones.
function kpiSec(insc: { estado: InscripcionEstado; paso_actual: number; abierto: boolean }[]) {
  const enSecuencia = insc.filter((i) => i.estado === "activa" || i.estado === "pausada").length
  const respondieron = insc.filter((i) => i.estado === "respondio").length
  const abrieron = insc.filter((i) => i.abierto).length
  const mails = insc.reduce((a, i) => a + (i.paso_actual || 0), 0)
  const contactados = insc.filter((i) => (i.paso_actual || 0) > 0 || i.estado === "respondio").length
  const tasa = contactados ? Math.round((respondieron / contactados) * 100) : 0
  const tasaApertura = contactados ? Math.round((abrieron / contactados) * 100) : 0
  return { total: insc.length, enSecuencia, respondieron, abrieron, mails, contactados, tasa, tasaApertura }
}

function KpiFila({ k }: { k: ReturnType<typeof kpiSec> }) {
  const cards = [
    { label: "En secuencia", valor: String(k.enSecuencia), sub: "", color: "#2F5BE6" },
    { label: "Mails enviados", valor: String(k.mails), sub: "", color: "#152A4F" },
    { label: "Abrieron", valor: String(k.abrieron), sub: k.contactados ? `${k.tasaApertura}%` : "", color: "#6FE0CB" },
    { label: "Respondieron", valor: String(k.respondieron), sub: k.contactados ? `${k.tasa}%` : "", color: "#1E9E6A" },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-3.5">
          <div className="text-[11.5px] font-medium text-slate">{c.label}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tabular-nums" style={{ color: c.color }}>
              {c.valor}
            </span>
            {c.sub && <span className="text-[12px] font-medium text-slate">{c.sub}</span>}
          </div>
        </Card>
      ))}
    </div>
  )
}

export function VendedorSecuencias() {
  const { vendedor, modo, vendedores } = useVentas()
  // Dos vistas en la misma ruta, sin duplicar:
  //  · Admin  → general: automatización + plantillas del equipo (aplican a todos).
  //  · Vendedor → personal: conectar email + mis secuencias + contactos/respuestas.
  const esAdmin = modo === "admin"
  const { data: secuenciasData, loading, error, reload } = useSecuencias(vendedor.id)
  const { data: inscData, reload: reloadInsc } = useInscripciones(vendedor.id)
  const { data: leadsData } = useLeads(vendedor.id)
  const secuenciasTodas = useMemo(() => secuenciasData ?? [], [secuenciasData])
  // En admin solo se listan las plantillas del equipo (vendedor_id null).
  const secuencias = useMemo(
    () => (esAdmin ? secuenciasTodas.filter((s) => s.vendedor_id === null) : secuenciasTodas),
    [secuenciasTodas, esAdmin]
  )
  const inscripciones = useMemo(() => inscData ?? [], [inscData])
  const leads = useMemo(() => leadsData ?? [], [leadsData])

  // KPIs: del vendedor (sus inscripciones) y del equipo (para admin).
  const { data: inscEquipoData } = useInscripcionesEquipo()
  const kpiVend = useMemo(() => kpiSec(inscripciones), [inscripciones])
  const inscEquipo = useMemo(() => inscEquipoData ?? [], [inscEquipoData])
  const kpiEquipo = useMemo(() => kpiSec(inscEquipo), [inscEquipo])
  // Desglose por vendedor (admin).
  const porVendedor = useMemo(() => {
    const m = new Map<string, typeof inscEquipo>()
    for (const i of inscEquipo) {
      const arr = m.get(i.vendedor_id) ?? []
      arr.push(i)
      m.set(i.vendedor_id, arr)
    }
    return [...m.entries()]
      .map(([vid, arr]) => ({
        vendedor_id: vid,
        nombre: vendedores.find((v) => v.id === vid)?.nombre ?? "—",
        k: kpiSec(arr),
      }))
      .sort((a, b) => b.k.mails - a.k.mails)
  }, [inscEquipo, vendedores])

  const [selId, setSelId] = useState<string | null>(null)
  const seleccionada = secuencias.find((s) => s.id === selId) ?? null
  const esPlantilla = !!seleccionada && seleccionada.vendedor_id === null
  // Admin edita las plantillas del equipo; el vendedor solo las suyas (para las
  // compartidas usa "Duplicar para editar").
  const esPropia =
    !!seleccionada && (esAdmin ? seleccionada.vendedor_id === null : seleccionada.vendedor_id === vendedor.id)

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

  // Vista previa de la plantilla (con o sin persona de contacto).
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewConNombre, setPreviewConNombre] = useState(true)

  const navigate = useNavigate()

  // Pasar contacto a oportunidad.
  const [oppIns, setOppIns] = useState<SecuenciaInscripcion | null>(null)
  const [oppEmpresa, setOppEmpresa] = useState("")
  const [oppEstado, setOppEstado] = useState<"interesado" | "reunion_coordinada">("interesado")
  const [oppEnvios, setOppEnvios] = useState(0)
  const [oppInteres, setOppInteres] = useState("")
  const [oppMarca, setOppMarca] = useState(false)
  const [oppFull, setOppFull] = useState(false)
  const [oppSaving, setOppSaving] = useState(false)
  const [oppErr, setOppErr] = useState<string | null>(null)

  // Responder desde la app (con la conversación completa cargada).
  const [respIns, setRespIns] = useState<SecuenciaInscripcion | null>(null)
  const [respTexto, setRespTexto] = useState("")
  const [respSaving, setRespSaving] = useState(false)
  const [respErr, setRespErr] = useState<string | null>(null)
  const [respOk, setRespOk] = useState(false)
  const [hilo, setHilo] = useState<HiloMensaje[]>([])
  const [hiloLoading, setHiloLoading] = useState(false)

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
      // Admin crea plantillas del equipo (vendedor_id null); el vendedor, propias.
      const id = await crearSecuencia(
        esAdmin ? null : vendedor.id,
        esAdmin ? "Nueva plantilla" : "Nueva secuencia",
        "reactivacion"
      )
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

  // ── Cierre del círculo desde la respuesta ──────────────────────────────────
  // Las que respondieron van primero (esperan acción del vendedor).
  const pendientes = useMemo(() => inscripciones.filter((i) => i.pendiente_humano).length, [inscripciones])
  const inscOrdenadas = useMemo(() => {
    // Los pendientes (mensaje del cliente sin responder) van SIEMPRE primero.
    const rank = (i: SecuenciaInscripcion) =>
      i.pendiente_humano ? 0 : i.estado === "respondio" ? 1 : i.estado === "activa" ? 2 : i.estado === "pausada" ? 3 : 4
    return [...inscripciones].sort((a, b) => rank(a) - rank(b))
  }, [inscripciones])
  async function noInteresado(ins: SecuenciaInscripcion) {
    if (
      !window.confirm(
        "¿Marcar como no interesado? Se corta la secuencia" + (ins.lead_id ? " y se rechaza el lead." : ".")
      )
    )
      return
    try {
      if (ins.lead_id) await rechazarLead(ins.lead_id, "no_interesado")
      await actualizarInscripcion(ins.id, "terminada")
      reloadInsc()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo actualizar")
    }
  }

  const [enviando, setEnviando] = useState<string | null>(null)
  async function enviarAhora(ins: SecuenciaInscripcion) {
    if (!window.confirm(`¿Enviar ya el próximo paso a ${ins.destinatario_email}?`)) return
    setEnviando(ins.id)
    try {
      await enviarAhoraInscripcion(ins.id)
      reloadInsc()
      window.alert("Mail enviado. Revisá la casilla del destinatario.")
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo enviar")
    } finally {
      setEnviando(null)
    }
  }

  function abrirOportunidad(ins: SecuenciaInscripcion) {
    setOppIns(ins)
    setOppEmpresa(ins.destinatario_empresa || ins.destinatario_nombre || "")
    setOppEstado(ins.ia_reunion ? "reunion_coordinada" : "interesado")
    setOppEnvios(0)
    setOppInteres(ins.ia_resumen || (ins.respuesta_texto ?? "").slice(0, 160))
    setOppMarca(false)
    setOppFull(false)
    setOppErr(null)
  }
  async function crearOportunidad(e: React.FormEvent) {
    e.preventDefault()
    if (!oppIns || !oppEmpresa.trim()) return
    setOppSaving(true)
    setOppErr(null)
    try {
      const opId = await pasarContactoAOportunidad({
        inscripcion_id: oppIns.id,
        lead_id: oppIns.lead_id,
        vendedor_id: vendedor.id,
        empresa: oppEmpresa.trim(),
        interes: oppInteres.trim() || null,
        envios_aprox: oppEnvios,
        marca_reconocida: oppMarca,
        quiere_fulfillment: oppFull,
        estado: oppEstado,
      })
      setOppIns(null)
      reloadInsc()
      navigate(`/pipeline/${opId}`)
    } catch (err) {
      setOppErr(err instanceof Error ? err.message : "No se pudo crear la oportunidad")
    } finally {
      setOppSaving(false)
    }
  }

  function abrirResponder(ins: SecuenciaInscripcion) {
    setRespIns(ins)
    setRespTexto("")
    setRespErr(null)
    setRespOk(false)
    setHilo([])
    setHiloLoading(true)
    fetchHilo(ins.id)
      .then(setHilo)
      .catch(() => setHilo([]))
      .finally(() => setHiloLoading(false))
  }
  async function enviarRespuesta(e: React.FormEvent) {
    e.preventDefault()
    if (!respIns || !respTexto.trim()) return
    setRespSaving(true)
    setRespErr(null)
    try {
      await responderInscripcion(respIns.id, respTexto.trim())
      setRespOk(true)
      setTimeout(() => setRespIns(null), 1200)
    } catch (err) {
      setRespErr(err instanceof Error ? err.message : "No se pudo enviar")
    } finally {
      setRespSaving(false)
    }
  }

  if (loading) return <Cargando que="tus secuencias" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead
        titulo={esAdmin ? "Secuencias del equipo" : "Secuencias de email"}
        descripcion={
          esAdmin
            ? "Plantillas que usan todos los vendedores + automatización"
            : "Cadencias de mails para reactivar y prospectar"
        }
      >
        {!esAdmin && (
          <Button variant="outline" onClick={() => setInscOpen(true)}>
            <Send /> Inscribir contacto
          </Button>
        )}
        <Button variant="blue" onClick={nuevaSecuencia}>
          <Plus /> {esAdmin ? "Nueva plantilla" : "Nueva secuencia"}
        </Button>
      </PageHead>

      <div className="flex flex-col">
      {esAdmin ? (
        <>
          <ConfigAutomatizacion />
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue/25 bg-[#EEF3FE] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-blue">
            <Info size={16} className="mt-px shrink-0" />
            <span>
              Estas son las <b>plantillas del equipo</b>: las edita el admin y las usan todos los vendedores. Cada
              vendedor conecta su propio email y las envía desde su casilla (eso lo hace cada uno en su vista). Prendé el{" "}
              <b>envío automático</b> arriba para que salgan solas.
            </span>
          </div>

          <div className="mb-5">
            <h2 className="mb-2 text-[14px] font-semibold text-navy">Envíos del equipo</h2>
            <KpiFila k={kpiEquipo} />
            {porVendedor.length > 0 && (
              <Card className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
                      <th className="px-4 py-2.5 font-medium">Vendedor</th>
                      <th className="px-4 py-2.5 font-medium">En secuencia</th>
                      <th className="px-4 py-2.5 font-medium">Mails enviados</th>
                      <th className="px-4 py-2.5 font-medium">Abrieron</th>
                      <th className="px-4 py-2.5 font-medium">Respondieron</th>
                      <th className="px-4 py-2.5 font-medium">Tasa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porVendedor.map((r) => (
                      <tr key={r.vendedor_id} className="border-t border-border">
                        <td className="px-4 py-2.5 text-[13px] font-medium text-ink">{r.nombre}</td>
                        <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate">{r.k.enSecuencia}</td>
                        <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate">{r.k.mails}</td>
                        <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate">{r.k.abrieron}</td>
                        <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate">{r.k.respondieron}</td>
                        <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate">{r.k.tasa}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </>
      ) : (
        <ConexionEmail
          vendedorId={vendedor.id}
          onEditar={() => document.getElementById("editor-secuencias")?.scrollIntoView({ behavior: "smooth" })}
        />
      )}

      {!esAdmin && (
        <div id="editor-secuencias" className="order-3 mt-6">
          <h2 className="text-[15px] font-semibold text-navy">Armar y editar secuencias</h2>
          <div className="mb-3 mt-1 flex items-start gap-2 rounded-lg bg-mist/60 px-3 py-2 text-[11.5px] leading-relaxed text-slate">
            <Info size={13} className="mt-px shrink-0 text-blue" />
            <span>
              Creá o editá tus cadencias, o duplicá una plantilla del equipo. Si el <b>envío automático</b> está prendido
              (lo configura el admin), los mails salen solos según los tiempos de cada paso y frenan cuando el contacto
              responde.
            </span>
          </div>
        </div>
      )}

      <div className={cn("grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start", !esAdmin && "order-3")}>
        {/* Lista de secuencias */}
        <div className="flex flex-col gap-2">
          {secuencias.length === 0 && (
            <Card className="p-4 text-center text-[13px] text-slate">
              {esAdmin ? "Todavía no hay plantillas. Creá una." : "Todavía no hay secuencias. Creá una o duplicá una plantilla."}
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
                  {!esAdmin && (
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
                  )}
                  {(esAdmin || !plantilla) && (
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
                Esta es una plantilla compartida (solo lectura). Para adaptarla a tu estilo, duplicala.
                <Button size="sm" variant="blue" className="ml-auto" onClick={() => duplicar(seleccionada)}>
                  <Copy /> Duplicar para editar
                </Button>
              </div>
            )}
            {esPropia && esPlantilla && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#EEF3FE] px-3 py-2 text-[12px] text-blue">
                <Info size={14} className="shrink-0" />
                Plantilla del equipo: lo que edites acá lo ven todos los vendedores.
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-navy">Pasos ({pasos.length})</h3>
              <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye /> Vista previa
              </Button>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-mist/60 px-3 py-2 text-[11.5px] leading-relaxed text-slate">
              <Info size={13} className="mt-px shrink-0 text-blue" />
              <span>
                Variables: <code className="rounded bg-white px-1 text-blue">{"{{empresa}}"}</code> (nombre del
                cliente, siempre lo tenemos) y <code className="rounded bg-white px-1 text-blue">{"{{nombre}}"}</code>{" "}
                (persona de contacto). Si un lead no tiene persona, <b>{"{{nombre}}"}</b> usa el nombre de la empresa;
                nunca se envía un <code className="rounded bg-white px-1">{"{{…}}"}</code> sin completar. Mirá cómo queda
                con <b>Vista previa</b>.
              </span>
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

      {/* Envíos + contactos (vista vendedor). order-2 → antes del editor. */}
      {!esAdmin && (
      <div className="order-2">
      <div className="mb-3">
        <h2 className="mb-2 text-[15px] font-semibold text-navy">Mis envíos</h2>
        <KpiFila k={kpiVend} />
      </div>
      <div className="mb-3 mt-5 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-navy">Contactos en secuencia</h2>
        {pendientes > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBE2E2] px-2.5 py-1 text-[11.5px] font-semibold text-error">
            <ThumbsUp size={12} />
            {pendientes} sin responder · esperan tu respuesta
          </span>
        )}
      </div>
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
                <th className="px-4 py-2.5 font-medium">Abrió</th>
                <th className="px-4 py-2.5 font-medium">Paso</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {inscOrdenadas.map((ins) => {
                const seq = secuencias.find((s) => s.id === ins.secuencia_id)
                const respondio = ins.estado === "respondio"
                const enCurso = ins.estado === "activa" || ins.estado === "pausada"
                return (
                  <tr
                    key={ins.id}
                    className={cn(
                      "border-t border-border",
                      ins.pendiente_humano && (ins.ia_reunion ? "bg-[#FDECE9]" : "bg-[#EEF3FE]")
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium text-ink">{ins.destinatario_nombre || "—"}</div>
                      <div className="text-[11.5px] text-slate">{ins.destinatario_email}</div>
                      {ins.ia_sentimiento && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-slate">
                          <Bot size={12} className="mt-px shrink-0 text-blue" />
                          <span>
                            <b style={{ color: SENT_COLOR[ins.ia_sentimiento] }}>
                              IA: {SENT_LABEL[ins.ia_sentimiento] ?? ins.ia_sentimiento}
                            </b>
                            {ins.ia_resumen ? ` · ${ins.ia_resumen}` : ""}
                          </span>
                        </div>
                      )}
                      {ins.respuesta_texto && (
                        <div className="mt-1.5 max-w-[380px] whitespace-pre-line rounded-lg border-l-2 border-blue/40 bg-mist/60 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink">
                          <span className="line-clamp-4">{ins.respuesta_texto}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate">{seq?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: INSC_COLOR[ins.estado] + "1F", color: INSC_COLOR[ins.estado] }}
                        >
                          {INSC_LABEL[ins.estado]}
                        </span>
                        {ins.ia_reunion && (
                          <span className="rounded-md bg-[#FBE2E2] px-2 py-0.5 text-[11px] font-semibold text-error">
                            📅 Confirmó reunión
                          </span>
                        )}
                        {ins.pendiente_humano && !ins.ia_reunion && (
                          <span className="rounded-md bg-[#EEF3FE] px-2 py-0.5 text-[11px] font-semibold text-blue">
                            Sin responder
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ins.abierto ? (
                        <span
                          title={ins.aperturas > 1 ? `Abrió ${ins.aperturas} veces` : "Abrió el mail"}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#12806c]"
                        >
                          <Eye size={14} /> Sí{ins.aperturas > 1 ? ` ·${ins.aperturas}` : ""}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] tabular-nums text-slate">{ins.paso_actual}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Respondió → decidir qué hacer con la respuesta */}
                        {respondio && (
                          <>
                            <Button size="sm" variant="outline" className="text-blue" onClick={() => abrirResponder(ins)}>
                              <Reply /> Responder
                            </Button>
                            <Button size="sm" variant="blue" onClick={() => abrirOportunidad(ins)}>
                              <Plus /> Oportunidad
                            </Button>
                            <button
                              onClick={() => noInteresado(ins)}
                              title="No sirvió — corta la secuencia y rechaza el lead"
                              className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error"
                            >
                              <ThumbsDown size={15} />
                            </button>
                          </>
                        )}
                        {/* En curso → acciones compactas (la respuesta se detecta sola) */}
                        {enCurso && (
                          <>
                            <button
                              onClick={() => enviarAhora(ins)}
                              disabled={enviando === ins.id}
                              title="Enviar ahora el próximo paso (para probar)"
                              className="grid size-8 place-items-center rounded-md text-blue hover:bg-[#EEF3FE] disabled:opacity-50"
                            >
                              <Zap size={15} />
                            </button>
                            {ins.estado === "activa" ? (
                              <button
                                onClick={() => actualizarInscripcion(ins.id, "pausada").then(reloadInsc)}
                                title="Pausar"
                                className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                              >
                                <Pause size={15} />
                              </button>
                            ) : (
                              <button
                                onClick={() => actualizarInscripcion(ins.id, "activa").then(reloadInsc)}
                                title="Reanudar"
                                className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                              >
                                <Play size={15} />
                              </button>
                            )}
                          </>
                        )}
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
      </div>
      )}
      </div>

      {/* Pasar contacto a oportunidad */}
      <Modal open={!!oppIns} onClose={() => setOppIns(null)} title="Pasar a oportunidad">
        {oppIns && (
          <form onSubmit={crearOportunidad} className="flex flex-col gap-3.5">
            <div className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
              Crea la oportunidad en el pipeline y saca al contacto de la secuencia. Después completás el resto de los
              datos en la oportunidad.
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Empresa</span>
              <input value={oppEmpresa} onChange={(e) => setOppEmpresa(e.target.value)} className="inp" required />
            </label>
            <div>
              <span className="text-[12px] font-medium text-slate">Etapa inicial</span>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setOppEstado("interesado")}
                  className={cn(
                    "flex-1 rounded-lg border p-2.5 text-left text-[12.5px]",
                    oppEstado === "interesado" ? "border-blue bg-white ring-1 ring-blue" : "border-input bg-white hover:bg-mist/60"
                  )}
                >
                  <b className="text-ink">Interesado</b>
                  <div className="text-[11.5px] text-slate">Mostró interés; todavía sin reunión.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOppEstado("reunion_coordinada")}
                  className={cn(
                    "flex-1 rounded-lg border p-2.5 text-left text-[12.5px]",
                    oppEstado === "reunion_coordinada" ? "border-blue bg-white ring-1 ring-blue" : "border-input bg-white hover:bg-mist/60"
                  )}
                >
                  <b className="text-ink">Reunión coordinada</b>
                  <div className="text-[11.5px] text-slate">Ya aceptó una reunión.</div>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Envíos aprox./mes</span>
                <input type="number" min={0} value={oppEnvios} onChange={(e) => setOppEnvios(Number(e.target.value))} className="inp" />
              </label>
              <div className="flex flex-col justify-center gap-1.5 pt-4">
                <label className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={oppMarca} onChange={(e) => setOppMarca(e.target.checked)} /> Marca reconocida
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={oppFull} onChange={(e) => setOppFull(e.target.checked)} /> Quiere fulfillment
                </label>
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Qué busca (opcional)</span>
              <textarea value={oppInteres} onChange={(e) => setOppInteres(e.target.value)} className="inp min-h-[60px] resize-y" />
            </label>
            {oppErr && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{oppErr}</div>}
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOppIns(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="blue" disabled={oppSaving}>
                {oppSaving ? "Creando…" : "Crear oportunidad"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Conversación completa + responder */}
      <Modal open={!!respIns} onClose={() => setRespIns(null)} title="Conversación">
        {respIns && (
          <form onSubmit={enviarRespuesta} className="flex flex-col gap-3.5">
            <div className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
              Con <b className="text-ink">{respIns.destinatario_nombre || respIns.destinatario_email}</b> ·{" "}
              {respIns.destinatario_email}
            </div>

            {/* Hilo completo — el último mensaje queda abajo, a la vista */}
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border bg-mist/30 p-2.5">
              {hiloLoading ? (
                <p className="p-2 text-[12.5px] text-slate">Cargando la conversación…</p>
              ) : hilo.length === 0 ? (
                <p className="p-2 text-[12.5px] text-slate">
                  {respIns.respuesta_texto || "Todavía no hay mensajes en el hilo."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {hilo.map((m, i) => {
                    const ultimoCliente = m.de === "cliente" && i === hilo.length - 1
                    return (
                      <div key={i} className={cn("flex", m.de === "yo" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] whitespace-pre-line rounded-xl px-3 py-2 text-[12.5px] leading-relaxed",
                            m.de === "yo"
                              ? "bg-blue text-white"
                              : ultimoCliente
                                ? "bg-white text-ink ring-2 ring-error/50"
                                : "bg-white text-ink"
                          )}
                        >
                          <div
                            className={cn(
                              "mb-0.5 text-[10.5px] font-semibold",
                              m.de === "yo" ? "text-white/80" : "text-slate"
                            )}
                          >
                            {m.de === "yo" ? "Vos" : m.nombre}
                            {ultimoCliente && <span className="text-error"> · última respuesta</span>}
                          </div>
                          {m.texto || "(sin texto)"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <textarea
              value={respTexto}
              onChange={(e) => setRespTexto(e.target.value)}
              className="inp min-h-[110px] resize-y"
              placeholder="Escribí tu respuesta… (sale desde tu casilla, en este hilo)"
              required
              autoFocus
            />
            {respErr && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{respErr}</div>}
            {respOk && (
              <div className="rounded-lg bg-[#E4F5EC] px-3 py-2 text-[12.5px] text-success">¡Respuesta enviada!</div>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRespIns(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="blue" disabled={respSaving || respOk}>
                <Send /> {respSaving ? "Enviando…" : "Enviar respuesta"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Vista previa de la plantilla con datos de ejemplo */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Vista previa del mail">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-slate">
            Ejemplo:
            <div className="flex gap-1 rounded-lg border border-border bg-mist/40 p-1">
              <button
                onClick={() => setPreviewConNombre(true)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  previewConNombre ? "bg-white text-navy shadow-[var(--shadow-card)]" : "text-slate hover:text-ink"
                )}
              >
                Con contacto
              </button>
              <button
                onClick={() => setPreviewConNombre(false)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  !previewConNombre ? "bg-white text-navy shadow-[var(--shadow-card)]" : "text-slate hover:text-ink"
                )}
              >
                Sin persona (solo empresa)
              </button>
            </div>
          </div>
          <p className="text-[11.5px] text-muted">
            Datos de ejemplo: empresa <b>Bicicosas</b>
            {previewConNombre ? (
              <>
                {" "}· contacto <b>Camila</b>
              </>
            ) : (
              <> · sin persona de contacto → se usa la empresa</>
            )}
            .
          </p>
          {pasos.length === 0 && <p className="text-[13px] text-slate">Esta secuencia no tiene pasos.</p>}
          {pasos.map((p, i) => {
            const vars = { nombre: previewConNombre ? "Camila" : "", empresa: "Bicicosas" }
            return (
              <div key={i} className="rounded-xl border border-input">
                <div className="flex items-center gap-2 border-b border-border bg-mist/40 px-3 py-2">
                  <span className="grid size-5 place-items-center rounded-full bg-navy text-[10px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-slate">
                    {i === 0 ? `a los ${p.dias_espera} días de inscribir` : `esperar ${p.dias_espera} días`}
                  </span>
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-semibold text-ink">{renderPlantilla(p.asunto, vars)}</div>
                  <div className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate">
                    {renderPlantilla(p.cuerpo, vars)}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

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
  leads: { id: string; nombre: string; email: string | null; contacto?: string | null }[]
  onHecho: () => void
}) {
  const [secuenciaId, setSecuenciaId] = useState("")
  const [leadId, setLeadId] = useState("")
  const [nombre, setNombre] = useState("")
  const [empresa, setEmpresa] = useState("")
  const [email, setEmail] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSecuenciaId(secuencias[0]?.id ?? "")
      setLeadId("")
      setNombre("")
      setEmpresa("")
      setEmail("")
      setErr(null)
    }
  }, [open, secuencias])

  function elegirLead(id: string) {
    setLeadId(id)
    const l = leads.find((x) => x.id === id)
    if (l) {
      setEmpresa(l.nombre) // el nombre del lead es la empresa (e-commerce)
      setNombre(l.contacto ?? "") // persona de contacto (si la hay)
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
        destinatario_nombre: nombre.trim() || empresa.trim(),
        destinatario_empresa: empresa.trim() || null,
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
            <span className="text-[12px] font-medium text-slate">Empresa {"{{empresa}}"}</span>
            <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="inp" placeholder="E-commerce" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Persona de contacto {"{{nombre}}"}</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="inp" placeholder="Opcional" />
          </label>
        </div>
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
