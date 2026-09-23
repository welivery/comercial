import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlarmClock, Ban, CheckCircle2, Flame, HeartPulse, MessageCircle, PartyPopper, Phone, Plus, RefreshCw, Send, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { RegistrarContacto, type ContactoTarget } from "@/components/RegistrarContacto"
import { BucketChip, Cargando, ErrorMsg, VAvatar } from "@/components/widgets"
import { useToast } from "@/components/Toast"
import { useVentas } from "@/store"
import { useInscripciones, useLeads, useOportunidades, useSecuencias, useSeguimientoDiario } from "@/hooks/useData"
import { fetchConteoContactosSinRespuesta, fetchEmpresasContacto, inscribir, reciclarLead, rechazarLead } from "@/data/api"
import type { DiaSeguimiento } from "@/data/api"
import { msgError } from "@/lib/errors"
import { telHref, waHref } from "@/lib/contacto"
import { RECICLAR_MESES, RECICLAR_MIN_CONTACTOS, RECICLAR_VENTANA_DIAS } from "@/lib/funnel"
import { ESTADO_LABEL, MOTIVOS_RECHAZO, fechaChile } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { EstadoOportunidad, Lead, MotivoRechazo, Oportunidad, Secuencia, SecuenciaInscripcion, SecuenciaObjetivo } from "@/lib/types"

// ── Umbrales (defaults sensatos; configurables por el admin más adelante) ──────
const DIAS_REINTENTO = 3 // días desde el último contacto para volver a estar "pendiente"
const DIAS_ENFRIANDO = 7 // un lead sin tocar tanto tiempo ya se está enfriando
const UMBRAL_OP: Record<EstadoOportunidad, number> = {
  interesado: 4,
  reunion_coordinada: 3,
  reunion_efectiva: 7,
  propuesta_enviada: 7,
  seguimiento: 5,
  cierre_ganado: 9999,
  perdido: 9999,
}

type Tipo = "respondio" | "contactado" | "sin_tocar" | "op" | "en_curso"
type Filtro = Tipo | "todos" | "pospuesto" | "reciclar"

const TIPO_META: Record<Tipo, { label: string; color: string; bg: string }> = {
  respondio: { label: "Te respondió", color: "#1E9E6A", bg: "#DFF2E9" },
  op: { label: "Oportunidad frenada", color: "#E0A52F", bg: "#FCF3E2" },
  contactado: { label: "Contactado sin rta", color: "#a5741a", bg: "#FCF3E2" },
  sin_tocar: { label: "Sin tocar", color: "#2F5BE6", bg: "#EEF3FE" },
  en_curso: { label: "En secuencia (auto)", color: "#5A6577", bg: "#F1F3F7" },
}

type EmpresaContacto = { telefono: string | null; contacto: string | null; email: string | null }

interface Item {
  key: string
  tipo: Tipo
  prioridad: number // menor = más urgente
  origen: "lead" | "oportunidad"
  lead?: Lead
  op?: Oportunidad
  titulo: string
  detalle: string // qué falta hacer, en una línea
  dias: number
  importante: boolean
  telefono: string | null
  contacto: string | null // persona de contacto (de la empresa)
  clienteId: string | null
  pospuesto: boolean
  proximo: string | null // fecha "volver a llamar", si está pospuesto
  reciclar: boolean // sugerir reagendar/descartar (muchos contactos sin respuesta)
  recientes: number // contactos sin respuesta en la ventana
}

function dias(iso?: string | null): number {
  if (!iso) return 0
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : 0
}
function extraerTel(t?: string | null): string | null {
  const m = (t ?? "").match(/(\+?56\s?9(?:\s?\d){8}|9\d{8})/)
  return m ? m[0].trim() : null
}
function extraerEmail(t?: string | null): string | null {
  const m = (t ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return m ? m[0] : null
}
function fmtDiaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
}
// Secuencia sugerida según el tipo de seguimiento.
const OBJETIVO_POR_TIPO: Partial<Record<Tipo, SecuenciaObjetivo>> = {
  sin_tocar: "prospeccion",
  contactado: "reactivacion",
}
function haceDias(n: number): string {
  return n < 1 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`
}
function pospuestoAun(iso?: string | null): boolean {
  return !!iso && Date.parse(iso) > Date.now()
}

// ── Gamification (Etapa 3) ────────────────────────────────────────────────────
const META_DIARIA = 5
const fechaLocal = fechaChile
function calcRacha(dias: DiaSeguimiento[], meta: number): number {
  const map = new Map(dias.map((d) => [d.fecha, d.hechos]))
  const hoyStr = fechaLocal(new Date())
  let racha = 0
  const d = new Date()
  for (let i = 0; i < 90; i++) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      const s = fechaLocal(d)
      const hechos = map.get(s) ?? 0
      if (hechos >= meta) racha++
      else if (s !== hoyStr) break
    }
    d.setDate(d.getDate() - 1)
  }
  return racha
}

export function VendedorSeguimiento() {
  const { vendedor, rol, vendedores, verVendedorId, setVerVendedorId, sinPerfil } = useVentas()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: leadsData, loading, error, reload } = useLeads(vendedor.id)
  const { data: inscData, reload: reloadInsc } = useInscripciones(vendedor.id)
  const { data: opsData } = useOportunidades(vendedor.id)
  const { data: secuenciasData } = useSecuencias(vendedor.id)
  const { data: diarioData, reload: reloadDiario } = useSeguimientoDiario(vendedor.id)

  const leads = useMemo(() => leadsData ?? [], [leadsData])
  const ops = useMemo(() => opsData ?? [], [opsData])
  const seqActivas = useMemo<Secuencia[]>(() => (secuenciasData ?? []).filter((s) => s.activo), [secuenciasData])
  function sugeridaPara(tipo: Tipo): Secuencia | null {
    const obj = OBJETIVO_POR_TIPO[tipo]
    return seqActivas.find((s) => s.objetivo === obj) ?? seqActivas[0] ?? null
  }
  const inscByLead = useMemo(() => {
    const m = new Map<string, SecuenciaInscripcion>()
    for (const i of inscData ?? []) if (i.lead_id && !m.has(i.lead_id)) m.set(i.lead_id, i)
    return m
  }, [inscData])

  // Contacto (teléfono/persona) desde la EMPRESA (registro único), para leads y
  // oportunidades. Se traen solo las empresas referenciadas (consulta acotada).
  const [empresas, setEmpresas] = useState<Record<string, EmpresaContacto>>({})
  const clienteIdsKey = useMemo(() => {
    const ids = new Set<string>()
    for (const l of leads) if (l.cliente_id) ids.add(l.cliente_id)
    for (const o of ops) if (o.cliente_id) ids.add(o.cliente_id)
    return [...ids].sort().join(",")
  }, [leads, ops])
  useEffect(() => {
    const ids = clienteIdsKey ? clienteIdsKey.split(",") : []
    if (ids.length === 0) { setEmpresas({}); return }
    let vivo = true
    fetchEmpresasContacto(ids).then((m) => vivo && setEmpresas(m)).catch(() => {})
    return () => { vivo = false }
  }, [clienteIdsKey])

  // Conteo de contactos SIN respuesta por lead en la ventana de reciclado, para
  // sugerir reagendar/descartar los fríos (regla configurable en F4).
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const leadIdsKey = useMemo(
    () => leads.filter((l) => l.estado === "nuevo").map((l) => l.id).sort().join(","),
    [leads]
  )
  useEffect(() => {
    const ids = leadIdsKey ? leadIdsKey.split(",") : []
    if (ids.length === 0) { setConteo({}); return }
    const desde = new Date(Date.now() - RECICLAR_VENTANA_DIAS * 86400000).toISOString()
    let vivo = true
    fetchConteoContactosSinRespuesta(ids, desde).then((m) => vivo && setConteo(m)).catch(() => {})
    return () => { vivo = false }
  }, [leadIdsKey])

  const [filtro, setFiltro] = useState<Filtro>("todos")

  // Modal "Rechazar / descartar" el lead.
  const [rechLead, setRechLead] = useState<Lead | null>(null)
  const [rechMotivo, setRechMotivo] = useState<MotivoRechazo>("no_interesado")
  const [rechNota, setRechNota] = useState("")
  const [rechSaving, setRechSaving] = useState(false)

  // Modal "Registrar contacto" (compartido con Buscar leads).
  const [llamado, setLlamado] = useState<Item | null>(null)

  const { pendientes, pospuestos } = useMemo(() => {
    const pend: Item[] = []
    const posp: Item[] = []

    const telDeLead = (l: Lead): string | null => {
      const emp = l.cliente_id ? empresas[l.cliente_id] : undefined
      return emp?.telefono ?? l.telefono ?? extraerTel(l.motivo)
    }
    const contactoDeLead = (l: Lead): string | null => {
      const emp = l.cliente_id ? empresas[l.cliente_id] : undefined
      return emp?.contacto ?? l.contacto ?? null
    }

    // ── Leads (solo los sin clasificar) ──
    for (const l of leads) {
      if (l.estado !== "nuevo") continue
      const insc = inscByLead.get(l.id)
      const respondio = !!insc && (insc.estado === "respondio" || insc.pendiente_humano)
      const enSecViva = !!insc && (insc.estado === "activa" || insc.estado === "pausada")
      const tel = telDeLead(l)
      const contacto = contactoDeLead(l)
      const importante =
        l.bucket === "estrategico" || l.bucket === "fulfillment" || l.reconquista || l.fit >= 70
      const recientes = conteo[l.id] ?? 0
      const reciclar = recientes >= RECICLAR_MIN_CONTACTOS
      const base = { origen: "lead" as const, lead: l, titulo: l.nombre, importante, telefono: tel, contacto, clienteId: l.cliente_id, reciclar, recientes }

      // Pospuesto ("volver a llamar" a futuro): fuera de pendientes hasta la fecha.
      if (pospuestoAun(l.proximo_contacto_at)) {
        posp.push({
          ...base, key: `l-${l.id}`, tipo: respondio ? "respondio" : l.contactos_intentos > 0 ? "contactado" : "sin_tocar",
          prioridad: 0, detalle: `Volver a llamar ${fmtDiaCorto(l.proximo_contacto_at!)}`,
          dias: dias(l.ultimo_contacto_at ?? l.created_at), pospuesto: true, proximo: l.proximo_contacto_at,
        })
        continue
      }

      if (respondio) {
        pend.push({ ...base, key: `l-${l.id}`, tipo: "respondio", prioridad: 0,
          detalle: "Te contestó — clasificalo a oportunidad o descartalo.",
          dias: dias(insc?.respuesta_at ?? insc?.ultimo_envio_at), pospuesto: false, proximo: null })
      } else if (enSecViva) {
        pend.push({ ...base, key: `l-${l.id}`, tipo: "en_curso", prioridad: 8,
          detalle: "En secuencia automática, esperando respuesta.",
          dias: dias(insc?.ultimo_envio_at ?? l.created_at), pospuesto: false, proximo: null })
      } else if (l.contactos_intentos > 0) {
        const d = dias(l.ultimo_contacto_at)
        if (d < DIAS_REINTENTO) continue
        pend.push({ ...base, key: `l-${l.id}`, tipo: "contactado", prioridad: importante ? 1 : 3,
          detalle: importante ? "Importante y sin respuesta — conviene llamar." : `${l.contactos_intentos} intento(s) sin respuesta — reintentá.`,
          dias: d, pospuesto: false, proximo: null })
      } else {
        const d = dias(l.created_at)
        pend.push({ ...base, key: `l-${l.id}`, tipo: "sin_tocar", prioridad: importante ? 2 : d >= DIAS_ENFRIANDO ? 4 : 5,
          detalle: d >= DIAS_ENFRIANDO ? "Enfriándose — hacé el primer contacto ya." : "Todavía sin contactar — primer toque.",
          dias: d, pospuesto: false, proximo: null })
      }
    }

    // ── Oportunidades activas (frenadas) ──
    for (const o of ops) {
      if (o.estado === "cierre_ganado" || o.estado === "perdido") continue
      const emp = o.cliente_id ? empresas[o.cliente_id] : undefined
      const importante = o.bucket === "estrategico" || o.bucket === "fulfillment" || o.envios_aprox >= 500
      const base = { origen: "oportunidad" as const, op: o, titulo: o.ecommerce, importante,
        telefono: emp?.telefono ?? null, contacto: emp?.contacto ?? null, clienteId: o.cliente_id, reciclar: false, recientes: 0 }

      if (pospuestoAun(o.proximo_contacto_at)) {
        posp.push({ ...base, key: `o-${o.id}`, tipo: "op", prioridad: 0,
          detalle: `Volver a llamar ${fmtDiaCorto(o.proximo_contacto_at!)}`, dias: 0, pospuesto: true, proximo: o.proximo_contacto_at })
        continue
      }

      const ref = Math.max(
        Date.parse(o.declarada_at) || 0,
        o.reunion_coordinada_at ? Date.parse(o.reunion_coordinada_at) : 0,
        o.reunion_efectiva_at ? Date.parse(o.reunion_efectiva_at) : 0
      )
      const d = Math.max(0, Math.floor((Date.now() - ref) / 86400000))
      if (d < (UMBRAL_OP[o.estado] ?? 5)) continue
      const queFalta: Partial<Record<EstadoOportunidad, string>> = {
        interesado: "Sin avance — coordiná una reunión.",
        reunion_coordinada: "Reunión pendiente de concretar — reconfirmá.",
        reunion_efectiva: "Tuvo reunión — mandá la propuesta.",
        propuesta_enviada: "Propuesta sin respuesta — hacé seguimiento.",
        seguimiento: "En seguimiento hace rato — empujá al cierre.",
      }
      pend.push({ ...base, key: `o-${o.id}`, tipo: "op", prioridad: importante ? 1 : 2,
        detalle: queFalta[o.estado] ?? "Necesita un empuje.", dias: d, pospuesto: false, proximo: null })
    }

    pend.sort((a, b) => a.prioridad - b.prioridad || b.dias - a.dias)
    posp.sort((a, b) => (a.proximo ?? "").localeCompare(b.proximo ?? ""))
    return { pendientes: pend, pospuestos: posp }
  }, [leads, ops, inscByLead, empresas, conteo])

  const accionables = useMemo(() => pendientes.filter((i) => i.tipo !== "en_curso"), [pendientes])
  const paraReciclar = useMemo(() => pendientes.filter((i) => i.reciclar), [pendientes])
  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: accionables.length, pospuesto: pospuestos.length, reciclar: paraReciclar.length }
    for (const i of pendientes) c[i.tipo] = (c[i.tipo] ?? 0) + 1
    return c
  }, [pendientes, accionables, pospuestos, paraReciclar])

  const visibles = useMemo(() => {
    if (filtro === "pospuesto") return pospuestos
    if (filtro === "reciclar") return paraReciclar
    if (filtro === "todos") return accionables
    return pendientes.filter((i) => i.tipo === filtro)
  }, [filtro, accionables, pendientes, pospuestos, paraReciclar])

  // ── Gamification ──
  const diario = useMemo(() => diarioData ?? [], [diarioData])
  const hoyHechos = diario.find((d) => d.fecha === fechaLocal(new Date()))?.hechos ?? 0
  const racha = useMemo(() => calcRacha(diario, META_DIARIA), [diario])
  const cartera =
    leads.filter((l) => l.estado === "nuevo").length +
    ops.filter((o) => o.estado !== "cierre_ganado" && o.estado !== "perdido").length
  const abandonados = useMemo(() => accionables.filter((i) => i.dias >= 7).length, [accionables])
  const salud = cartera ? Math.round(((cartera - abandonados) / cartera) * 100) : 100

  function abrirRechazo(l: Lead) {
    setRechLead(l)
    setRechMotivo("no_interesado")
    setRechNota("")
  }
  async function confirmarRechazo(e: React.FormEvent) {
    e.preventDefault()
    if (!rechLead) return
    setRechSaving(true)
    try {
      await rechazarLead(rechLead.id, rechMotivo, rechNota)
      const nombre = rechLead.nombre
      setRechLead(null)
      reload()
      reloadDiario()
      toast.ok(`${nombre} descartado. Ya no aparece en seguimiento.`)
    } catch (err) {
      toast.error(msgError(err, "No se pudo rechazar"))
    } finally {
      setRechSaving(false)
    }
  }

  // ── Reciclado de leads fríos ──
  const [reciclando, setReciclando] = useState<string | null>(null)
  async function reciclar(l: Lead, meses: number) {
    setReciclando(l.id)
    try {
      await reciclarLead(l.id, meses)
      reload()
      toast.ok(`${l.nombre} reagendado ${meses} mes${meses === 1 ? "" : "es"}. Vuelve a Buscar leads en esa fecha.`)
    } catch (e) {
      toast.error(msgError(e, "No se pudo reagendar"))
    } finally {
      setReciclando(null)
    }
  }
  async function noContactar(l: Lead, recientes: number) {
    setReciclando(l.id)
    try {
      await rechazarLead(l.id, "no_contesta", `Sin respuesta tras ${recientes} contactos en ${RECICLAR_VENTANA_DIAS} días.`)
      reload()
      reloadDiario()
      toast.ok(`${l.nombre} marcado como “no contactar”.`)
    } catch (e) {
      toast.error(msgError(e, "No se pudo descartar"))
    } finally {
      setReciclando(null)
    }
  }

  const [siguiendo, setSiguiendo] = useState<string | null>(null)
  async function hacerSeguimiento(l: Lead, tipo: Tipo) {
    const seq = sugeridaPara(tipo)
    if (!seq) {
      toast.error("No tenés secuencias activas. Creá una en Secuencias de email.")
      navigate("/secuencias")
      return
    }
    const email = l.email ?? extraerEmail(l.motivo)
    if (!email) {
      navigate(`/leads?seguir=${l.id}`)
      return
    }
    setSiguiendo(l.id)
    try {
      await inscribir({
        secuencia_id: seq.id,
        vendedor_id: vendedor.id,
        lead_id: l.id,
        destinatario_nombre: l.contacto || l.nombre,
        destinatario_empresa: l.nombre,
        destinatario_email: email,
      })
      reloadInsc()
      reloadDiario()
      toast.ok(`${l.nombre} entró en “${seq.nombre}”. Sale el primer mail solo.`)
    } catch (e) {
      toast.error(msgError(e, "No se pudo poner en seguimiento"))
    } finally {
      setSiguiendo(null)
    }
  }

  // ── Registro de contacto ──
  function abrirLlamado(it: Item) {
    setLlamado(it)
  }
  // Objetivo para el modal compartido (lead u oportunidad).
  const llamadoTarget: ContactoTarget | null = llamado
    ? {
        origen: llamado.origen,
        id: llamado.lead?.id ?? llamado.op!.id,
        clienteId: llamado.clienteId,
        titulo: llamado.titulo,
        contacto: llamado.contacto,
        telefono: llamado.telefono,
        contactosPrevios: llamado.lead?.contactos_intentos ?? 0,
      }
    : null

  const CHIPS: { k: Filtro; label: string }[] = [
    { k: "todos", label: "Todo pendiente" },
    { k: "respondio", label: "🔥 Te respondió" },
    { k: "op", label: "Oportunidad frenada" },
    { k: "contactado", label: "Contactado sin rta" },
    { k: "sin_tocar", label: "Sin tocar" },
    { k: "en_curso", label: "En secuencia" },
    { k: "reciclar", label: "♻️ Para reciclar" },
    { k: "pospuesto", label: "⏰ Pospuestos" },
  ]

  if (sinPerfil) {
    return (
      <>
        <PageHead titulo="Seguimiento" descripcion="Tu día: no dejes ningún lead sin cerrar" />
        <Card className="mt-4 p-6 text-center text-[13px] text-slate">
          Tu usuario todavía no está vinculado a un vendedor. Pedile al admin que te asocie.
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead titulo="Seguimiento" descripcion="Tu día: no dejes ningún lead sin cerrar">
        {rol === "admin" && vendedores.length > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-slate">
            De
            <select
              value={verVendedorId ?? vendedor.id}
              onChange={(e) => setVerVendedorId(e.target.value)}
              className="rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          </label>
        )}
      </PageHead>

      {loading ? (
        <Cargando que="tu seguimiento" />
      ) : error ? (
        <ErrorMsg msg={error} />
      ) : (
        <>
          <GameBar racha={racha} hoy={hoyHechos} meta={META_DIARIA} salud={salud} cartera={cartera} />
          {accionables.length === 0 && pospuestos.length === 0 ? (
            <Card className="mt-4 flex flex-col items-center p-10 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#DFF2E9]">
                <PartyPopper size={26} className="text-success" />
              </span>
              <p className="mt-4 text-[16px] font-semibold text-navy">¡Bandeja en cero! 🎉</p>
              <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-slate">
                No tenés seguimientos pendientes, todo al día.{" "}
                {racha > 0 ? `Racha de ${racha} día${racha === 1 ? "" : "s"} 🔥 — no la cortes.` : "Sumá más desde"}{" "}
                <Link to="/leads" className="font-medium text-blue underline">Buscar leads</Link>.
              </p>
            </Card>
          ) : (
            <>
              {/* Resumen / game */}
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-br from-navy via-[#1d3a6b] to-[#123f52] p-4 text-white">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/20">
                  <Flame size={22} className="text-mint" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">
                    Tenés {accionables.length} seguimiento{accionables.length === 1 ? "" : "s"} para hacer
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[#c6d0e0]">
                    Llamá, marcá el resultado y pasá al siguiente. Los <b className="text-white">🔥 importantes</b> primero.
                  </p>
                </div>
                {counts["respondio"] > 0 && (
                  <div className="rounded-lg bg-white/10 px-3 py-1.5 text-center">
                    <div className="text-[18px] font-semibold text-mint">{counts["respondio"]}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[#c6d0e0]">te respondieron</div>
                  </div>
                )}
              </div>

              {/* Filtros por tipo */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {CHIPS.filter((c) => c.k === "todos" || (counts[c.k] ?? 0) > 0).map((c) => (
                  <button
                    key={c.k}
                    onClick={() => setFiltro(c.k)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      filtro === c.k ? "border-navy bg-navy text-white" : "border-border bg-white text-slate hover:text-ink"
                    )}
                  >
                    {c.label} <span className="tabular-nums opacity-70">{counts[c.k] ?? 0}</span>
                  </button>
                ))}
              </div>

              {/* Lista */}
              <div className="mt-3 flex flex-col gap-2.5">
                {visibles.map((it) => (
                  <FilaSeguimiento
                    key={it.key}
                    it={it}
                    siguiendo={siguiendo === it.lead?.id}
                    reciclando={reciclando === it.lead?.id}
                    onLlamado={() => abrirLlamado(it)}
                    onOportunidad={() => it.lead && navigate(`/leads?convertir=${it.lead.id}`)}
                    onVerCharla={() => navigate("/secuencias")}
                    onSecuencia={() => it.lead && hacerSeguimiento(it.lead, it.tipo)}
                    onRechazar={() => it.lead && abrirRechazo(it.lead)}
                    onFicha={() => it.op && navigate(`/pipeline/${it.op.id}`)}
                    onReciclar={(meses) => it.lead && reciclar(it.lead, meses)}
                    onNoContactar={() => it.lead && noContactar(it.lead, it.recientes)}
                  />
                ))}
                {visibles.length === 0 && (
                  <Card className="flex items-center gap-2 p-4 text-[13px] text-slate">
                    <CheckCircle2 size={16} className="text-success" />
                    {filtro === "en_curso"
                      ? "No hay nada corriendo en secuencia ahora."
                      : filtro === "pospuesto"
                        ? "No tenés seguimientos pospuestos."
                        : filtro === "reciclar"
                          ? "Nada para reciclar — ningún lead llegó al límite de contactos sin respuesta."
                          : "Nada en este filtro."}
                  </Card>
                )}
              </div>

              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-blue" />
                <p className="leading-relaxed">
                  El objetivo es simple: <b className="text-ink">cerrar cada lead</b> — llamalo, marcá qué pasó, y
                  avanzalo a oportunidad, ponelo en seguimiento o descartalo. Nada debería quedarse sin próximo paso.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal: registrar contacto (compartido con Buscar leads) */}
      <RegistrarContacto
        target={llamadoTarget}
        vendedorId={vendedor.id}
        onClose={() => setLlamado(null)}
        onRegistrado={() => { reload(); reloadDiario() }}
        extra={
          llamado ? (
            llamado.origen === "lead" ? (
              <>
                <Button size="sm" variant="blue" onClick={() => { const l = llamado.lead!; setLlamado(null); navigate(`/leads?convertir=${l.id}`) }}>
                  <Plus /> A oportunidad
                </Button>
                {(llamado.tipo === "sin_tocar" || llamado.tipo === "contactado") && (
                  <Button size="sm" variant="outline" disabled={siguiendo === llamado.lead?.id} onClick={() => { const l = llamado.lead!; const t = llamado.tipo; setLlamado(null); hacerSeguimiento(l, t) }}>
                    <Send /> Poner en secuencia
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-error hover:bg-[#FBE2E2] hover:text-error" onClick={() => { const l = llamado.lead!; setLlamado(null); abrirRechazo(l) }}>
                  <Ban /> No le interesa
                </Button>
              </>
            ) : (
              <Button size="sm" variant="blue" onClick={() => { const o = llamado.op!; setLlamado(null); navigate(`/pipeline/${o.id}`) }}>
                Abrir ficha
              </Button>
            )
          ) : null
        }
      />

      {/* Modal: rechazar / descartar el lead con motivo */}
      <Modal open={!!rechLead} onClose={() => setRechLead(null)} title="Rechazar lead">
        {rechLead && (
          <form onSubmit={confirmarRechazo} className="flex flex-col gap-3.5">
            <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
              Descartás a <b className="text-ink">{rechLead.nombre}</b>. Sale del seguimiento y no se vuelve a
              contactar. Queda el motivo en su historial.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Motivo del rechazo</span>
              <select
                value={rechMotivo}
                onChange={(e) => setRechMotivo(e.target.value as MotivoRechazo)}
                className="rounded-lg border border-input bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
              >
                {MOTIVOS_RECHAZO.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Comentario (opcional)</span>
              <textarea
                value={rechNota}
                onChange={(e) => setRechNota(e.target.value)}
                className="min-h-[70px] w-full resize-y rounded-lg border border-input px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
                placeholder="Ej: no contesta hace 3 llamados · dijo que ya tiene courier · pidió no contactar…"
              />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRechLead(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="blue" disabled={rechSaving}>
                {rechSaving ? "Guardando…" : "Rechazar"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

// ── Fila de un ítem de seguimiento ────────────────────────────────────────────
function FilaSeguimiento({
  it,
  siguiendo,
  reciclando,
  onLlamado,
  onOportunidad,
  onVerCharla,
  onSecuencia,
  onRechazar,
  onFicha,
  onReciclar,
  onNoContactar,
}: {
  it: Item
  siguiendo: boolean
  reciclando: boolean
  onLlamado: () => void
  onOportunidad: () => void
  onVerCharla: () => void
  onSecuencia: () => void
  onRechazar: () => void
  onFicha: () => void
  onReciclar: (meses: number) => void
  onNoContactar: () => void
}) {
  const meta = TIPO_META[it.tipo]
  return (
    <Card
      className={cn(
        "flex flex-wrap items-center gap-3 p-3.5",
        it.pospuesto && "opacity-80",
        it.reciclar && "ring-1 ring-[#E0A52F]/50",
        it.importante && it.tipo !== "en_curso" && !it.pospuesto && !it.reciclar && "ring-1 ring-coral/40"
      )}
    >
      <VAvatar iniciales={(it.titulo || "—").slice(0, 2).toUpperCase()} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">{it.titulo}</span>
          {it.lead && <BucketChip bucket={it.lead.bucket} short />}
          {it.op && <BucketChip bucket={it.op.bucket} short />}
          <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: meta.bg, color: meta.color }}>
            {it.tipo === "op" && it.op ? ESTADO_LABEL[it.op.estado] : meta.label}
          </span>
          {it.importante && it.tipo !== "en_curso" && (
            <span className="rounded-full bg-[#FDE7E1] px-1.5 py-0.5 text-[10.5px] font-semibold text-coral">🔥 Importante</span>
          )}
          {it.pospuesto && it.proximo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF3FE] px-1.5 py-0.5 text-[10.5px] font-semibold text-blue">
              <AlarmClock size={10} /> {fmtDiaCorto(it.proximo)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-slate">
          <span>{it.detalle}</span>
          {!it.pospuesto && <span className="text-muted">· {haceDias(it.dias)}</span>}
        </div>

        {/* Línea de contacto: teléfono SIEMPRE visible, con llamar + WhatsApp */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {it.telefono ? (
            <>
              <a
                href={telHref(it.telefono)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#EEF3FE] px-2 py-1 text-[12px] font-semibold text-blue hover:bg-[#e0e9fd]"
              >
                <Phone size={13} /> {it.telefono}
              </a>
              <a
                href={waHref(it.telefono)}
                target="_blank"
                rel="noreferrer"
                title="Escribir por WhatsApp"
                className="inline-flex items-center gap-1 rounded-md bg-[#E4F7EC] px-2 py-1 text-[12px] font-semibold text-[#1a7a4d] hover:bg-[#d5f0e0]"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
              {it.contacto && <span className="text-[11.5px] text-slate">· {it.contacto}</span>}
            </>
          ) : (
            <span className="text-[11.5px] text-muted">Sin teléfono cargado</span>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {it.tipo === "respondio" ? (
          <>
            <Button size="sm" variant="blue" onClick={onOportunidad}>
              <Plus /> A oportunidad
            </Button>
            <Button size="sm" variant="outline" onClick={onVerCharla}>
              Ver charla
            </Button>
          </>
        ) : it.origen === "oportunidad" ? (
          <>
            <Button size="sm" variant="outline" onClick={onLlamado}>
              <Phone /> Registré llamado
            </Button>
            <Button size="sm" variant="blue" onClick={onFicha}>
              Abrir ficha
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="blue" onClick={onLlamado}>
              <Phone /> Registré llamado
            </Button>
            {it.tipo !== "en_curso" && (
              <>
                {(it.tipo === "sin_tocar" || it.tipo === "contactado") && (
                  <Button size="sm" variant="outline" disabled={siguiendo} title="Seguimiento automático por email" onClick={onSecuencia}>
                    <Send /> {siguiendo ? "Poniendo…" : "Secuencia"}
                  </Button>
                )}
                <button
                  onClick={onRechazar}
                  title="Rechazar / descartar"
                  className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error"
                >
                  <Ban size={15} />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Sugerencia de reciclado: muchos contactos sin respuesta */}
      {it.reciclar && it.origen === "lead" && (
        <div className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-lg border border-[#E0A52F]/40 bg-[#FCF7EC] px-3 py-2">
          <RefreshCw size={14} className="shrink-0 text-[#a5741a]" />
          <span className="text-[12px] font-medium text-[#8a6416]">
            {it.recientes} contactos sin respuesta en {RECICLAR_VENTANA_DIAS} días. ¿Reagendar o dejar de contactar?
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {RECICLAR_MESES.map((m) => (
              <Button key={m} size="sm" variant="outline" disabled={reciclando} onClick={() => onReciclar(m)}>
                Reagendar {m} {m === 1 ? "mes" : "meses"}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="text-error hover:bg-[#FBE2E2] hover:text-error" disabled={reciclando} onClick={onNoContactar}>
              <Ban /> No contactar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

// Barra de "juego": racha, seguimientos de hoy y salud de la cartera.
function GameBar({
  racha,
  hoy,
  meta,
  salud,
  cartera,
}: {
  racha: number
  hoy: number
  meta: number
  salud: number
  cartera: number
}) {
  const saludColor = salud >= 80 ? "#1E9E6A" : salud >= 50 ? "#E0A52F" : "#DB3B3B"
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card className="flex items-center gap-3 p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FDE7E1]">
          <Flame size={20} className="text-coral" />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-wide text-slate">Racha</div>
          <div className="text-[18px] font-semibold text-ink">
            {racha} <span className="text-[12px] font-medium text-slate">día{racha === 1 ? "" : "s"} 🔥</span>
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-3 p-3.5">
        <Ring value={hoy} max={meta} />
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-wide text-slate">Hoy</div>
          <div className="text-[18px] font-semibold text-ink">
            {hoy}
            <span className="text-[12px] font-medium text-slate">/{meta}</span>
            {hoy >= meta && <span className="ml-1 text-[12px] font-semibold text-success">¡meta! ✓</span>}
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-3 p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: saludColor + "1F" }}>
          <HeartPulse size={20} style={{ color: saludColor }} />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-wide text-slate">Salud de cartera</div>
          <div className="text-[18px] font-semibold" style={{ color: saludColor }}>
            {cartera ? `${salud}%` : "—"}
          </div>
        </div>
      </Card>
    </div>
  )
}

// Anillo de progreso del día (SVG, sin dependencias).
function Ring({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  const r = 16
  const c = 2 * Math.PI * r
  const done = pct >= 1
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#E7EBF1" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={done ? "#1E9E6A" : "#2F5BE6"}
        strokeWidth="4"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      {done && (
        <text x="20" y="24.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1E9E6A">
          ✓
        </text>
      )}
    </svg>
  )
}
