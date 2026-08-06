import { useMemo, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  Ban,
  Building2,
  Check,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  Undo2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { BucketChip, Cargando } from "@/components/widgets"
import { useVentas } from "@/store"
import { useCreditosLeads, useLeads } from "@/hooks/useData"
import { convertirLead, reactivarLead, rechazarLead, sembrarLeadsBase } from "@/data/api"
import { generarLeadsIA } from "@/data/leads"
import { asignarBucket } from "@/lib/buckets"
import { MOTIVOS_RECHAZO, MOTIVO_RECHAZO_LABEL, PERIODO_ACTUAL } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { FuenteLead, Lead, LeadEstado, MotivoRechazo } from "@/lib/types"

const FUENTE_ICON: Record<FuenteLead["tipo"], React.ReactNode> = {
  maps: <MapPin size={13} />,
  web: <Globe size={13} />,
  social: <Star size={13} />,
  linkedin: <Building2 size={13} />,
  base: <Check size={13} />,
  tendencia: <TrendingUp size={13} />,
}

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
  const { vendedor } = useVentas()
  const { data: leadsData, loading, error, reload } = useLeads(vendedor.id)
  const { data: creditos, reload: reloadCred } = useCreditosLeads(vendedor.id, PERIODO_ACTUAL)
  const leads = useMemo(() => leadsData ?? [], [leadsData])

  const [buscando, setBuscando] = useState(false)
  const [trayendo, setTrayendo] = useState(false)
  const [status, setStatus] = useState("Analizando…")
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null)

  const [estadoFiltro, setEstadoFiltro] = useState<LeadEstado | "todos">("nuevo")
  const [periodo, setPeriodo] = useState("todo")

  const [rechId, setRechId] = useState<string | null>(null)
  const [rechMotivo, setRechMotivo] = useState<MotivoRechazo>("no_interesado")

  const [convLead, setConvLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<OpForm | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  const sinVendedor = !vendedor.id
  const vivoRef = useRef(true)

  const limite = creditos?.limite ?? 0
  const usados = creditos?.usados ?? 0
  const restantes = Math.max(0, limite - usados)
  const sinCreditos = limite > 0 && restantes <= 0

  // KPIs + lista filtrados por período y estado.
  const { kpi, visibles } = useMemo(() => {
    const desde = cutoff(periodo)
    const enRango = leads.filter((l) => !desde || new Date(l.created_at).getTime() >= desde)
    const nuevos = enRango.filter((l) => l.estado === "nuevo").length
    const conv = enRango.filter((l) => l.estado === "convertido").length
    const rech = enRango.filter((l) => l.estado === "rechazado").length
    const lista = enRango
      .filter((l) => estadoFiltro === "todos" || l.estado === estadoFiltro)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    return {
      kpi: { traidos: enRango.length, nuevos, conv, rech, pct: enRango.length ? Math.round((conv / enRango.length) * 100) : 0 },
      visibles: lista,
    }
  }, [leads, periodo, estadoFiltro])

  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

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

  async function confirmarRechazo(l: Lead) {
    try {
      await rechazarLead(l.id, rechMotivo)
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

  function abrirConvertir(l: Lead) {
    setConvLead(l)
    setErrForm(null)
    setForm({
      ecommerce: l.nombre,
      sitio: l.web ?? "",
      envios_aprox: 0,
      lugar_retiro: "",
      tipo_producto: "",
      interes: (l.motivo ?? "").slice(0, 140),
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
      await convertirLead(convLead.id, {
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
      }, form.nota)
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
      <PageHead titulo="Buscar leads" descripcion="Potenciales clientes para prospectar y clasificar" />

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
              value={periodo}
              onChange={(ev) => setPeriodo(ev.target.value)}
              className="ml-auto rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              {PERIODOS.map((p) => (
                <option key={p.k} value={p.k}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Lista */}
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
            <div className="mt-3 grid gap-3">
              {visibles.map((l) => (
                <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-3.5">
                  <span
                    className={cn(
                      "grid size-[42px] shrink-0 place-items-center rounded-[10px] text-[15px] font-semibold",
                      l.estado === "rechazado"
                        ? "bg-mist text-muted"
                        : l.reconquista
                          ? "bg-[#FBEFD4] text-[#a5741a]"
                          : "bg-mist text-navy"
                    )}
                  >
                    {l.iniciales}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                      <span className={l.estado === "rechazado" ? "text-slate line-through" : undefined}>{l.nombre}</span>
                      <BucketChip bucket={l.bucket} />
                      {l.estado === "convertido" && (
                        <span className="rounded-full bg-[#DFF2E9] px-2 py-0.5 text-[11px] font-semibold text-success">
                          A oportunidad
                        </span>
                      )}
                      {l.estado === "rechazado" && (
                        <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-slate">
                          Rechazado{l.motivo_rechazo ? ` · ${MOTIVO_RECHAZO_LABEL[l.motivo_rechazo]}` : ""}
                        </span>
                      )}
                      {l.estado === "nuevo" &&
                        (l.reconquista ? (
                          <span className="rounded-full bg-[#FBEFD4] px-2 py-0.5 text-[11px] font-semibold text-[#a5741a]">
                            Ex-cliente · reconquista
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#DFF2E9] px-2 py-0.5 text-[11px] font-semibold text-success">
                            {l.fit}% fit
                          </span>
                        ))}
                    </h4>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate">{l.motivo}</p>

                    {(l.web || l.telefono || l.email) && (
                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
                        {l.web && (
                          <a href={l.web} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-blue hover:underline">
                            <Globe size={13} /> {l.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                          </a>
                        )}
                        {l.telefono && (
                          <a href={`tel:${l.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
                            <Phone size={13} /> {l.telefono}
                          </a>
                        )}
                        {l.email && (
                          <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
                            <Mail size={13} /> {l.email}
                          </a>
                        )}
                      </div>
                    )}

                    {l.fuentes.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted">
                        {l.fuentes.map((f, i) =>
                          f.url ? (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-blue hover:underline">
                              {FUENTE_ICON[f.tipo]}
                              {f.detalle}
                            </a>
                          ) : (
                            <span key={i} className="inline-flex items-center gap-1.5">
                              {FUENTE_ICON[f.tipo]}
                              {f.detalle}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {/* Acciones según estado */}
                  <div className="flex shrink-0 flex-col justify-center gap-2 sm:w-[190px]">
                    {l.estado === "convertido" ? (
                      l.oportunidad_id ? (
                        <Button asChild variant="outline" size="sm" className="text-success">
                          <Link to={`/pipeline/${l.oportunidad_id}`}>
                            <Check /> Ver en pipeline
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-center text-[12px] text-success">En pipeline</span>
                      )
                    ) : l.estado === "rechazado" ? (
                      <Button variant="outline" size="sm" onClick={() => deshacerRechazo(l)}>
                        <Undo2 /> Reactivar
                      </Button>
                    ) : rechId === l.id ? (
                      <div className="rounded-lg border border-input p-2.5">
                        <label className="mb-1 block text-[11px] font-medium text-slate">Motivo del rechazo</label>
                        <select
                          value={rechMotivo}
                          onChange={(e) => setRechMotivo(e.target.value as MotivoRechazo)}
                          className="mb-2 w-full rounded-md border border-input bg-white px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-blue"
                        >
                          {MOTIVOS_RECHAZO.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <Button size="sm" variant="blue" className="flex-1" onClick={() => confirmarRechazo(l)}>
                            Confirmar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRechId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button variant="blue" size="sm" onClick={() => abrirConvertir(l)}>
                          <Plus /> Pasar a oportunidad
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRechId(l.id)
                            setRechMotivo("no_interesado")
                          }}
                        >
                          <Ban /> Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
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

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
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
