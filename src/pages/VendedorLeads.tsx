import { useMemo, useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  Ban,
  Building2,
  Check,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { BucketChip, Cargando } from "@/components/widgets"
import { useVentas } from "@/store"
import { useCreditosLeads, useInscripciones, useLeads, useObjetivos, useSecuencias } from "@/hooks/useData"
import { asignarLeads, convertirLead, inscribir, reactivarLead, rechazarLead, sembrarLeadsBase } from "@/data/api"
import { generarLeadsIA } from "@/data/leads"
import { asignarBucket } from "@/lib/buckets"
import { MOTIVOS_RECHAZO, MOTIVO_RECHAZO_LABEL, PERIODO_ACTUAL } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { Lead, LeadEstado, MotivoRechazo, SecuenciaInscripcion } from "@/lib/types"

const ESTADOS_FILTRO: { k: LeadEstado | "todos"; label: string }[] = [
  { k: "nuevo", label: "Sin clasificar" },
  { k: "convertido", label: "A oportunidad" },
  { k: "rechazado", label: "Rechazados" },
  { k: "todos", label: "Todos" },
]
const PERIODOS: { k: string; label: string }[] = [
  { k: "todo", label: "Todo el tiempo" },
  { k: "7d", label: "Últimos 7 días" },
  { k: "30d", label: "Últimos 30 días" },
  { k: "mes", label: "Este mes" },
]
function cutoff(k: string): number {
  const now = new Date()
  if (k === "7d") return now.getTime() - 7 * 864e5
  if (k === "30d") return now.getTime() - 30 * 864e5
  if (k === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return 0
}

// Fallback: si el email/teléfono no quedó en su campo (leads viejos), lo sacamos
// del texto del motivo para mostrarlo y poder usarlo igual.
function extraerEmail(t?: string | null): string | null {
  const m = (t ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return m ? m[0] : null
}
function extraerTel(t?: string | null): string | null {
  const m = (t ?? "").match(/(\+?56\s?9(?:\s?\d){8}|9\d{8})/)
  return m ? m[0].trim() : null
}
function extraerContacto(t?: string | null): string | null {
  const m = (t ?? "").match(/contacto:\s*([^·|]+)/i)
  return m ? m[1].trim() : null
}
// Motivo sin la cola de contacto (ya vive en columnas propias).
function motivoCorto(t?: string | null): string {
  return (t ?? "").split(/·\s*contacto:/i)[0].trim()
}

interface OpForm {
  ecommerce: string
  sitio: string
  envios_aprox: number
  lugar_retiro: string
  tipo_producto: string
  interes: string
  nota: string
  marca_reconocida: boolean
  quiere_fulfillment: boolean
}

export function VendedorLeads() {
  const { vendedor, rol, vendedores, verVendedorId, setVerVendedorId } = useVentas()
  const { data: leadsData, loading, error, reload } = useLeads(vendedor.id)
  const { data: creditos, reload: reloadCred } = useCreditosLeads(vendedor.id, PERIODO_ACTUAL)
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const { data: secuencias } = useSecuencias(vendedor.id)
  const { data: inscripciones, reload: reloadInsc } = useInscripciones(vendedor.id)
  const leads = useMemo(() => leadsData ?? [], [leadsData])

  const seqActivas = useMemo(() => (secuencias ?? []).filter((s) => s.activo), [secuencias])
  const inscByLead = useMemo(() => {
    const m = new Map<string, SecuenciaInscripcion>()
    for (const i of inscripciones ?? []) {
      if (i.lead_id && !m.has(i.lead_id)) m.set(i.lead_id, i)
    }
    return m
  }, [inscripciones])

  const emailDe = (l: Lead) => l.email ?? extraerEmail(l.motivo)
  const telDe = (l: Lead) => l.telefono ?? extraerTel(l.motivo)
  const contactoDe = (l: Lead) => l.contacto ?? extraerContacto(l.motivo)

  const cupoDiario = objetivos?.find((o) => o.vendedor_id === vendedor.id)?.leads_cupo_diario ?? 0

  const autoRef = useRef(false)
  useEffect(() => {
    if (rol !== "vendedor" || !vendedor.id || cupoDiario <= 0 || loading) return
    if (autoRef.current) return
    autoRef.current = true
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const recibioHoy = leads.some((l) => new Date(l.created_at).getTime() >= hoy.getTime())
    if (recibioHoy) return
    sembrarLeadsBase(vendedor.id, cupoDiario)
      .then((n) => {
        if (n > 0 && vivoRef.current) reload()
      })
      .catch(() => {})
  }, [rol, vendedor.id, cupoDiario, loading, leads, reload])

  const [buscando, setBuscando] = useState(false)
  const [trayendo, setTrayendo] = useState(false)
  const [status, setStatus] = useState("Analizando…")
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null)

  const [estadoFiltro, setEstadoFiltro] = useState<LeadEstado | "todos">("nuevo")
  const [periodo, setPeriodo] = useState("todo")
  const [secFiltro, setSecFiltro] = useState<"todos" | "en_sec" | "sin_sec">("todos")

  // Un lead está "en secuencia" si tiene una inscripción viva (no terminada/rebotada).
  const enSecuencia = (id: string) => {
    const i = inscByLead.get(id)
    return !!i && i.estado !== "terminada" && i.estado !== "rebotada"
  }

  // Selección múltiple (para inscribir en lote / reasignar).
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [asignarA, setAsignarA] = useState("")
  const [asignando, setAsignando] = useState(false)
  useEffect(() => setSel(new Set()), [estadoFiltro, periodo, secFiltro])

  const [rechId, setRechId] = useState<string | null>(null)
  const [rechMotivo, setRechMotivo] = useState<MotivoRechazo>("no_interesado")

  const [convLead, setConvLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<OpForm | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  // Modal "Poner en secuencia" (individual).
  const [seqLead, setSeqLead] = useState<Lead | null>(null)
  const [seqId, setSeqId] = useState("")
  const [seqEmail, setSeqEmail] = useState("")
  const [seqSaving, setSeqSaving] = useState(false)
  const [seqErr, setSeqErr] = useState<string | null>(null)

  // Modal "Poner en secuencia" (lote).
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSeqId, setBulkSeqId] = useState("")
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkErr, setBulkErr] = useState<string | null>(null)

  const sinVendedor = !vendedor.id
  const vivoRef = useRef(true)

  const limite = creditos?.limite ?? 0
  const usados = creditos?.usados ?? 0
  const restantes = Math.max(0, limite - usados)
  const sinCreditos = limite > 0 && restantes <= 0

  const { kpi, visibles } = useMemo(() => {
    const desde = cutoff(periodo)
    const enRango = leads.filter((l) => !desde || new Date(l.created_at).getTime() >= desde)
    const nuevos = enRango.filter((l) => l.estado === "nuevo").length
    const conv = enRango.filter((l) => l.estado === "convertido").length
    const rech = enRango.filter((l) => l.estado === "rechazado").length
    const lista = enRango
      .filter((l) => estadoFiltro === "todos" || l.estado === estadoFiltro)
      .filter((l) => secFiltro === "todos" || (secFiltro === "en_sec" ? enSecuencia(l.id) : !enSecuencia(l.id)))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    return {
      kpi: { traidos: enRango.length, nuevos, conv, rech, pct: enRango.length ? Math.round((conv / enRango.length) * 100) : 0 },
      visibles: lista,
    }
  }, [leads, periodo, estadoFiltro, secFiltro, inscByLead]) // eslint-disable-line react-hooks/exhaustive-deps

  // Solo los "nuevo" son seleccionables (son los que se pueden inscribir).
  const seleccionables = useMemo(() => visibles.filter((l) => l.estado === "nuevo"), [visibles])
  const allSel = seleccionables.length > 0 && seleccionables.every((l) => sel.has(l.id))
  function toggleAll() {
    setSel(allSel ? new Set() : new Set(seleccionables.map((l) => l.id)))
  }
  function toggleOne(id: string) {
    setSel((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  const convParam = searchParams.get("convertir")
  useEffect(() => {
    if (!convParam || loading) return
    const l = leads.find((x) => x.id === convParam)
    if (l && l.estado === "nuevo") abrirConvertir(l)
    searchParams.delete("convertir")
    setSearchParams(searchParams, { replace: true })
  }, [convParam, loading, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar() {
    if (!vendedor.id || buscando) return
    setBuscando(true)
    setStatus("Analizando…")
    setAviso(null)
    try {
      const r = await generarLeadsIA(vendedor.id, (m) => vivoRef.current && setStatus(m))
      if (!vivoRef.current) return
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto:
            r.insertados > 0
              ? `Se agregaron ${r.insertados} lead${r.insertados === 1 ? "" : "s"} nuevo${r.insertados === 1 ? "" : "s"}.`
              : "No se encontraron leads nuevos esta vez (sin repetir los que ya tenías).",
        })
        setEstadoFiltro("nuevo")
        reload()
        reloadCred()
      } else {
        setAviso({ tipo: "error", texto: r.error ?? "No se pudo buscar." })
        if (r.limiteAlcanzado) reloadCred()
      }
    } finally {
      if (vivoRef.current) setBuscando(false)
    }
  }

  async function traerDeBase() {
    if (!vendedor.id || trayendo) return
    setTrayendo(true)
    setAviso(null)
    try {
      const n = await sembrarLeadsBase(vendedor.id)
      if (n > 0) {
        setAviso({ tipo: "ok", texto: `Se sumaron ${n} lead${n === 1 ? "" : "s"} de tu base para trabajar.` })
        setEstadoFiltro("nuevo")
        reload()
      } else {
        setAviso({
          tipo: "info",
          texto:
            "Ya trajiste todos los ex-clientes y prospectos de tu base. Cargá más en Base de clientes o usá “Buscar con IA”.",
        })
      }
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo traer de la base" })
    } finally {
      setTrayendo(false)
    }
  }

  async function confirmarRechazo() {
    if (!rechId) return
    try {
      await rechazarLead(rechId, rechMotivo)
      setRechId(null)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo rechazar")
    }
  }

  async function deshacerRechazo(l: Lead) {
    try {
      await reactivarLead(l.id)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo reactivar")
    }
  }

  function abrirSecuencia(l: Lead) {
    setSeqLead(l)
    setSeqId(seqActivas[0]?.id ?? "")
    setSeqEmail(emailDe(l) ?? "")
    setSeqErr(null)
  }

  async function confirmarSecuencia(e: React.FormEvent) {
    e.preventDefault()
    if (!seqLead) return
    if (!seqId) {
      setSeqErr("Elegí una secuencia.")
      return
    }
    if (!seqEmail.trim()) {
      setSeqErr("Falta el email del destinatario.")
      return
    }
    setSeqSaving(true)
    setSeqErr(null)
    try {
      await inscribir({
        secuencia_id: seqId,
        vendedor_id: vendedor.id,
        lead_id: seqLead.id,
        destinatario_nombre: contactoDe(seqLead) || seqLead.nombre,
        destinatario_empresa: seqLead.nombre,
        destinatario_email: seqEmail.trim(),
      })
      const nombre = seqLead.nombre
      setSeqLead(null)
      reloadInsc()
      setAviso({ tipo: "ok", texto: `${nombre} quedó en la secuencia. Podés seguirlo en Secuencias de email.` })
    } catch (err) {
      setSeqErr(err instanceof Error ? err.message : "No se pudo poner en la secuencia")
    } finally {
      setSeqSaving(false)
    }
  }

  function abrirBulk() {
    setBulkSeqId(seqActivas[0]?.id ?? "")
    setBulkErr(null)
    setBulkOpen(true)
  }

  async function confirmarBulk(e: React.FormEvent) {
    e.preventDefault()
    if (!bulkSeqId) {
      setBulkErr("Elegí una secuencia.")
      return
    }
    const elegidos = visibles.filter((l) => sel.has(l.id) && l.estado === "nuevo")
    const conEmail = elegidos.filter((l) => !!emailDe(l) && !inscByLead.get(l.id))
    const afuera = elegidos.length - conEmail.length
    if (conEmail.length === 0) {
      setBulkErr("Ninguno de los seleccionados tiene email (o ya están en una secuencia).")
      return
    }
    setBulkSaving(true)
    setBulkErr(null)
    let ok = 0
    for (const l of conEmail) {
      try {
        await inscribir({
          secuencia_id: bulkSeqId,
          vendedor_id: vendedor.id,
          lead_id: l.id,
          destinatario_nombre: contactoDe(l) || l.nombre,
          destinatario_empresa: l.nombre,
          destinatario_email: emailDe(l)!,
        })
        ok++
      } catch {
        /* seguimos con el resto */
      }
    }
    setBulkSaving(false)
    setBulkOpen(false)
    setSel(new Set())
    reloadInsc()
    setAviso({
      tipo: ok > 0 ? "ok" : "error",
      texto:
        `${ok} lead${ok === 1 ? "" : "s"} puesto${ok === 1 ? "" : "s"} en la secuencia` +
        (afuera > 0 ? ` · ${afuera} sin email quedaron afuera` : "") +
        ".",
    })
  }

  async function asignarSeleccion() {
    if (!asignarA || sel.size === 0 || asignando) return
    setAsignando(true)
    try {
      const r = await asignarLeads([...sel], asignarA)
      const nom = vendedores.find((v) => v.id === asignarA)?.nombre ?? "el vendedor"
      setSel(new Set())
      setAsignarA("")
      reload()
      setAviso({
        tipo: r.movidos > 0 ? "ok" : "info",
        texto:
          `${r.movidos} lead${r.movidos === 1 ? "" : "s"} asignado${r.movidos === 1 ? "" : "s"} a ${nom}` +
          (r.omitidos ? ` · ${r.omitidos} ya los tenía o eran suyos` : "") +
          ".",
      })
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo asignar" })
    } finally {
      setAsignando(false)
    }
  }

  function abrirConvertir(l: Lead) {
    setConvLead(l)
    setErrForm(null)
    setForm({
      ecommerce: l.nombre,
      sitio: l.web ?? "",
      envios_aprox: 0,
      lugar_retiro: "",
      tipo_producto: "",
      interes: motivoCorto(l.motivo).slice(0, 140),
      nota: "",
      marca_reconocida: l.bucket === "estrategico",
      quiere_fulfillment: l.bucket === "fulfillment",
    })
  }

  async function submitConvertir(e: React.FormEvent) {
    e.preventDefault()
    if (!convLead || !form) return
    setGuardando(true)
    setErrForm(null)
    try {
      await convertirLead(
        convLead.id,
        {
          vendedor_id: vendedor.id,
          ecommerce: form.ecommerce,
          sitio: form.sitio || null,
          envios_aprox: form.envios_aprox,
          lugar_retiro: form.lugar_retiro,
          tipo_producto: form.tipo_producto,
          interes: form.interes || null,
          marca_reconocida: form.marca_reconocida,
          quiere_fulfillment: form.quiere_fulfillment,
          origen: "ia",
        },
        form.nota
      )
      setConvLead(null)
      reload()
    } catch (err) {
      setErrForm(err instanceof Error ? err.message : "No se pudo crear la oportunidad")
    } finally {
      setGuardando(false)
    }
  }

  const bucketPreview = form
    ? asignarBucket({
        marca_reconocida: form.marca_reconocida,
        envios_aprox: form.envios_aprox,
        quiere_fulfillment: form.quiere_fulfillment,
      })
    : "mediano"

  return (
    <>
      <PageHead titulo="Buscar leads" descripcion="Potenciales clientes para prospectar y clasificar">
        {rol === "admin" && vendedores.length > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-slate">
            Leads de
            <select
              value={verVendedorId ?? vendedor.id}
              onChange={(e) => setVerVendedorId(e.target.value)}
              className="rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHead>

      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-gradient-to-br from-navy via-[#1d3a6b] to-[#123f52] p-5 text-white">
        <span className="grid size-[44px] shrink-0 place-items-center rounded-xl bg-mint/20">
          <Sparkles size={22} className="text-mint" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-white">Asistente de leads</h2>
          <p className="mt-0.5 max-w-[64ch] text-[12.5px] text-[#c6d0e0]">
            “Traer de mi base” suma ~20 leads del día (gratis, sin repetir con otros vendedores). “Buscar con IA”
            encuentra e-commerces nuevos en la web. Los leads quedan acá hasta que los clasifiques.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={traerDeBase} disabled={trayendo || sinVendedor} className="border border-white/25 bg-white/10 text-white hover:bg-white/20">
              <Building2 className={trayendo ? "animate-pulse" : undefined} />
              {trayendo ? "Trayendo…" : "Traer de mi base"}
            </Button>
            <Button onClick={buscar} disabled={buscando || sinVendedor || sinCreditos} className="bg-mint text-navy hover:bg-mint/90">
              <RefreshCw className={buscando ? "animate-spin" : undefined} />
              {buscando ? "Buscando…" : "Buscar con IA"}
            </Button>
          </div>
          <span className="text-[11px] text-[#c6d0e0]">
            “Traer de mi base” es gratis.{" "}
            {!sinVendedor && limite > 0 && (
              <>Búsquedas IA: <b className="text-white">{usados}/{limite}</b> este mes</>
            )}
          </span>
        </div>
      </div>

      {buscando && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-blue/25 bg-[#EEF3FE] px-3.5 py-2.5 text-[12.5px] text-blue">
          <RefreshCw size={15} className="shrink-0 animate-spin" />
          <span className="font-medium">{status}</span>
          <span className="text-[11.5px] text-slate">— busca en la web en tiempo real, puede tardar hasta ~1 min.</span>
        </div>
      )}

      {aviso && !buscando && (
        <div
          className={cn(
            "mt-3 rounded-xl border px-3.5 py-2.5 text-[12.5px]",
            aviso.tipo === "ok" && "border-success/30 bg-[#E4F5EC] text-success",
            aviso.tipo === "info" && "border-blue/25 bg-[#EEF3FE] text-blue",
            aviso.tipo === "error" && "border-error/30 bg-[#FBE2E2] text-error"
          )}
        >
          {aviso.texto}
        </div>
      )}

      {sinCreditos && !buscando && (
        <div className="mt-3 rounded-xl border border-warning/40 bg-[#FCF3E2] px-3.5 py-2.5 text-[12.5px] text-[#8a6416]">
          Usaste las {limite} búsquedas con IA de este mes. Podés seguir con tu base y clasificar lo que tenés.
        </div>
      )}

      {sinVendedor ? (
        <Card className="mt-4 p-6 text-center">
          <p className="text-[14px] font-semibold text-navy">Elegí o cargá un vendedor</p>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-slate">
            Los leads son por vendedor. Agregá uno en{" "}
            <Link to="/vendedores" className="font-medium text-blue underline">
              Vendedores
            </Link>{" "}
            y volvé.
          </p>
        </Card>
      ) : loading ? (
        <Cargando que="tus leads" />
      ) : error ? (
        <Card className="mt-4 p-6 text-center">
          <p className="text-[14px] font-semibold text-error">No se pudieron cargar los leads</p>
          <p className="mx-auto mt-1.5 max-w-[56ch] text-[13px] text-slate">
            {error}. Si es la primera vez, falta correr <code className="rounded bg-mist px-1">supabase/leads.sql</code>{" "}
            en Supabase.
          </p>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Traídos" valor={kpi.traidos} color="#152A4F" />
            <Kpi label="Sin clasificar" valor={kpi.nuevos} color="#2F5BE6" />
            <Kpi label="A oportunidad" valor={kpi.conv} extra={`${kpi.pct}%`} color="#1E9E6A" />
            <Kpi label="Rechazados" valor={kpi.rech} color="#7A869C" />
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-mist/40 p-1">
              {ESTADOS_FILTRO.map((e) => (
                <button
                  key={e.k}
                  onClick={() => setEstadoFiltro(e.k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    estadoFiltro === e.k ? "bg-white text-navy shadow-[var(--shadow-card)]" : "text-slate hover:text-ink"
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <select
              value={secFiltro}
              onChange={(ev) => setSecFiltro(ev.target.value as typeof secFiltro)}
              className="ml-auto rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              <option value="todos">Secuencia: todos</option>
              <option value="en_sec">En secuencia</option>
              <option value="sin_sec">Sin secuencia</option>
            </select>
            <select
              value={periodo}
              onChange={(ev) => setPeriodo(ev.target.value)}
              className="rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              {PERIODOS.map((p) => (
                <option key={p.k} value={p.k}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Barra de selección múltiple */}
          {sel.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-blue/25 bg-[#EEF3FE] px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold text-blue">
                {sel.size} seleccionado{sel.size === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="blue" onClick={abrirBulk}>
                <Send /> Poner en secuencia
              </Button>
              {vendedores.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={asignarA}
                    onChange={(e) => setAsignarA(e.target.value)}
                    className="rounded-lg border border-input bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-blue"
                  >
                    <option value="">Asignar a…</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nombre}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={!asignarA || asignando} onClick={asignarSeleccion}>
                    {asignando ? "Asignando…" : "Asignar"}
                  </Button>
                </div>
              )}
              <button onClick={() => setSel(new Set())} className="text-[12px] font-medium text-slate hover:text-ink">
                Limpiar
              </button>
            </div>
          )}

          {/* Tabla */}
          {visibles.length === 0 ? (
            <Card className="mt-3 flex flex-col items-center p-8 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-mist">
                <Sparkles size={20} className="text-blue" />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-navy">
                {estadoFiltro === "nuevo" ? "No tenés leads sin clasificar" : "Nada en este filtro"}
              </p>
              <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-slate">
                {estadoFiltro === "nuevo"
                  ? "Usá “Traer de mi base” (gratis) o “Buscar con IA” para sumar potenciales."
                  : "Probá cambiar el estado o el período del filtro."}
              </p>
            </Card>
          ) : (
            <Card className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
                    <th className="w-10 px-4 py-2.5">
                      {seleccionables.length > 0 && (
                        <input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Seleccionar todos" />
                      )}
                    </th>
                    <th className="px-2 py-2.5 font-medium">Empresa</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Teléfono</th>
                    <th className="px-4 py-2.5 font-medium">Origen</th>
                    <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((l) => {
                    const insc = inscByLead.get(l.id)
                    const email = emailDe(l)
                    const tel = telDe(l)
                    return (
                      <tr key={l.id} className={cn("border-t border-border hover:bg-mist/40", sel.has(l.id) && "bg-[#EEF3FE]/60")}>
                        <td className="px-4 py-3 align-top">
                          {l.estado === "nuevo" && (
                            <input
                              type="checkbox"
                              checked={sel.has(l.id)}
                              onChange={() => toggleOne(l.id)}
                              aria-label={`Seleccionar ${l.nombre}`}
                            />
                          )}
                        </td>
                        <td className="px-2 py-3 align-top">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={cn(
                                "grid size-8 shrink-0 place-items-center rounded-[8px] text-[12px] font-semibold",
                                l.estado === "rechazado"
                                  ? "bg-mist text-muted"
                                  : l.reconquista
                                    ? "bg-[#FBEFD4] text-[#a5741a]"
                                    : "bg-mist text-navy"
                              )}
                            >
                              {l.iniciales}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "text-[13px] font-semibold text-ink",
                                    l.estado === "rechazado" && "text-slate line-through"
                                  )}
                                >
                                  {l.nombre}
                                </span>
                                <BucketChip bucket={l.bucket} short />
                                {l.estado === "nuevo" &&
                                  (l.reconquista ? (
                                    <span className="rounded-full bg-[#FBEFD4] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#a5741a]">
                                      Reconquista
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-[#DFF2E9] px-1.5 py-0.5 text-[10.5px] font-semibold text-success">
                                      {l.fit}% fit
                                    </span>
                                  ))}
                                {l.estado === "rechazado" && l.motivo_rechazo && (
                                  <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10.5px] font-semibold text-slate">
                                    {MOTIVO_RECHAZO_LABEL[l.motivo_rechazo]}
                                  </span>
                                )}
                                {insc &&
                                  insc.estado !== "terminada" &&
                                  insc.estado !== "rebotada" &&
                                  (insc.estado === "respondio" ? (
                                    <span className="rounded-full bg-[#DFF2E9] px-1.5 py-0.5 text-[10.5px] font-semibold text-success">
                                      Respondió 🎯
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF3FE] px-1.5 py-0.5 text-[10.5px] font-semibold text-blue">
                                      <Send size={10} />
                                      {insc.estado === "pausada" ? "Pausada" : "En secuencia"}
                                    </span>
                                  ))}
                              </div>
                              {motivoCorto(l.motivo) && (
                                <div className="mt-0.5 max-w-[380px] truncate text-[11.5px] text-slate">
                                  {motivoCorto(l.motivo)}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-[12.5px]">
                          {email ? (
                            <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-blue hover:underline">
                              <Mail size={13} className="shrink-0" /> {email}
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-[12.5px]">
                          {tel ? (
                            <a href={`tel:${tel.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-ink hover:underline">
                              <Phone size={13} className="shrink-0" /> {tel}
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-[12px] text-slate">
                          {l.fuentes[0]?.detalle ?? (l.origen === "ia" ? "IA" : "Base")}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-end gap-1">
                            {l.estado === "convertido" ? (
                              l.oportunidad_id ? (
                                <Link
                                  to={`/pipeline/${l.oportunidad_id}`}
                                  title="Ver en pipeline"
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-success hover:bg-mist"
                                >
                                  <Check size={15} /> Pipeline
                                </Link>
                              ) : (
                                <span className="text-[12px] text-success">En pipeline</span>
                              )
                            ) : l.estado === "rechazado" ? (
                              <IconBtn title="Reactivar" onClick={() => deshacerRechazo(l)}>
                                <Undo2 size={15} />
                              </IconBtn>
                            ) : (
                              <>
                                <IconBtn title="Pasar a oportunidad" tone="blue" onClick={() => abrirConvertir(l)}>
                                  <Plus size={15} />
                                </IconBtn>
                                {insc ? (
                                  <Link
                                    to="/secuencias"
                                    title="Ver en secuencias"
                                    className="grid size-8 place-items-center rounded-md text-blue hover:bg-mist"
                                  >
                                    <Send size={15} />
                                  </Link>
                                ) : (
                                  <IconBtn title="Poner en secuencia" onClick={() => abrirSecuencia(l)}>
                                    <Send size={15} />
                                  </IconBtn>
                                )}
                                <IconBtn
                                  title="Rechazar"
                                  tone="error"
                                  onClick={() => {
                                    setRechId(l.id)
                                    setRechMotivo("no_interesado")
                                  }}
                                >
                                  <Ban size={15} />
                                </IconBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* Modal: pasar a oportunidad */}
      <Modal open={!!convLead} onClose={() => setConvLead(null)} title="Pasar lead a oportunidad">
        {form && (
          <form onSubmit={submitConvertir} className="flex flex-col gap-3.5">
            <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
              Completá los datos que falten. Al crear, el lead <b>{convLead?.nombre}</b> queda marcado como pasado
              a oportunidad.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">E-commerce</span>
              <input value={form.ecommerce} onChange={(e) => setForm({ ...form, ecommerce: e.target.value })} className="inp" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Sitio (opcional)</span>
                <input value={form.sitio} onChange={(e) => setForm({ ...form, sitio: e.target.value })} className="inp" placeholder="tienda.cl" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Envíos aprox./mes</span>
                <input type="number" min={0} value={form.envios_aprox} onChange={(e) => setForm({ ...form, envios_aprox: Number(e.target.value) })} className="inp" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Lugar de retiro</span>
                <input value={form.lugar_retiro} onChange={(e) => setForm({ ...form, lugar_retiro: e.target.value })} className="inp" placeholder="Comuna / bodega" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Tipo de producto</span>
                <input value={form.tipo_producto} onChange={(e) => setForm({ ...form, tipo_producto: e.target.value })} className="inp" placeholder="Textil, alimentos…" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Interés (opcional)</span>
              <input value={form.interes} onChange={(e) => setForm({ ...form, interes: e.target.value })} className="inp" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Nota (opcional)</span>
              <textarea
                value={form.nota}
                onChange={(e) => setForm({ ...form, nota: e.target.value })}
                className="inp min-h-[64px] resize-y"
                placeholder="Info útil del contacto, próxima acción, etc. Queda en el historial de la oportunidad."
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-mist/70 p-3">
              <label className="flex items-center gap-2 text-[12.5px] text-ink">
                <input type="checkbox" checked={form.marca_reconocida} onChange={(e) => setForm({ ...form, marca_reconocida: e.target.checked })} />
                Marca reconocida
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-ink">
                <input type="checkbox" checked={form.quiere_fulfillment} onChange={(e) => setForm({ ...form, quiere_fulfillment: e.target.checked })} />
                Quiere fulfillment
              </label>
              <span className="ml-auto flex items-center gap-1.5 text-[12px] text-slate">
                Bucket: <BucketChip bucket={bucketPreview} />
              </span>
            </div>

            {errForm && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{errForm}</div>}

            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConvLead(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="blue" disabled={guardando}>
                {guardando ? "Creando…" : "Crear oportunidad"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: rechazar */}
      <Modal open={!!rechId} onClose={() => setRechId(null)} title="Rechazar lead">
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Motivo del rechazo</span>
            <select
              value={rechMotivo}
              onChange={(e) => setRechMotivo(e.target.value as MotivoRechazo)}
              className="inp"
            >
              {MOTIVOS_RECHAZO.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRechId(null)}>
              Cancelar
            </Button>
            <Button variant="blue" onClick={confirmarRechazo}>
              Rechazar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: poner en secuencia (individual) */}
      <Modal open={!!seqLead} onClose={() => setSeqLead(null)} title="Poner lead en una secuencia">
        {seqLead && (
          <form onSubmit={confirmarSecuencia} className="flex flex-col gap-3.5">
            {seqActivas.length === 0 ? (
              <div className="rounded-lg bg-mist/70 px-3 py-3 text-[12.5px] text-slate">
                Todavía no tenés secuencias activas. Creá una en{" "}
                <Link to="/secuencias" className="font-medium text-blue underline">
                  Secuencias de email
                </Link>{" "}
                y volvé.
              </div>
            ) : (
              <>
                <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
                  <b className="text-ink">{seqLead.nombre}</b> va a entrar en la secuencia elegida. Los mails salen
                  desde tu casilla conectada según los tiempos de cada paso.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-slate">Secuencia</span>
                  <select value={seqId} onChange={(e) => setSeqId(e.target.value)} className="inp" required>
                    {seqActivas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-slate">Email del destinatario</span>
                  <input
                    type="email"
                    value={seqEmail}
                    onChange={(e) => setSeqEmail(e.target.value)}
                    className="inp"
                    placeholder="contacto@empresa.cl"
                    required
                  />
                  {!emailDe(seqLead) && (
                    <span className="text-[11.5px] text-warning">
                      Este lead no tenía email cargado. Completalo para poder enviarle.
                    </span>
                  )}
                </label>
                {seqErr && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{seqErr}</div>}
              </>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSeqLead(null)}>
                {seqActivas.length === 0 ? "Cerrar" : "Cancelar"}
              </Button>
              {seqActivas.length > 0 && (
                <Button type="submit" variant="blue" disabled={seqSaving}>
                  {seqSaving ? "Poniendo…" : "Poner en secuencia"}
                </Button>
              )}
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: poner en secuencia (lote) */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Poner ${sel.size} lead${sel.size === 1 ? "" : "s"} en una secuencia`}>
        <form onSubmit={confirmarBulk} className="flex flex-col gap-3.5">
          {seqActivas.length === 0 ? (
            <div className="rounded-lg bg-mist/70 px-3 py-3 text-[12.5px] text-slate">
              Todavía no tenés secuencias activas. Creá una en{" "}
              <Link to="/secuencias" className="font-medium text-blue underline">
                Secuencias de email
              </Link>{" "}
              y volvé.
            </div>
          ) : (
            <>
              <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
                Se inscriben los seleccionados que tengan email y no estén ya en una secuencia. Se usa el email de cada
                lead.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-slate">Secuencia</span>
                <select value={bulkSeqId} onChange={(e) => setBulkSeqId(e.target.value)} className="inp" required>
                  {seqActivas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {bulkErr && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{bulkErr}</div>}
            </>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              {seqActivas.length === 0 ? "Cerrar" : "Cancelar"}
            </Button>
            {seqActivas.length > 0 && (
              <Button type="submit" variant="blue" disabled={bulkSaving}>
                {bulkSaving ? "Poniendo…" : "Poner en secuencia"}
              </Button>
            )}
          </div>
        </form>
      </Modal>

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}

function IconBtn({
  title,
  onClick,
  tone,
  children,
}: {
  title: string
  onClick: () => void
  tone?: "blue" | "error"
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md text-slate hover:bg-mist",
        tone === "blue" && "text-blue hover:bg-[#EEF3FE]",
        tone === "error" && "hover:bg-[#FBE2E2] hover:text-error"
      )}
    >
      {children}
    </button>
  )
}

function Kpi({ label, valor, extra, color }: { label: string; valor: number; extra?: string; color: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-[11.5px] font-medium text-slate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[24px] font-semibold tabular-nums" style={{ color }}>
          {valor}
        </span>
        {extra && <span className="text-[12px] font-medium text-slate">{extra}</span>}
      </div>
    </Card>
  )
}
