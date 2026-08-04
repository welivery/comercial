import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  Ban,
  Building2,
  Check,
  ChevronDown,
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
import { BucketChip, Cargando, SectionTitle } from "@/components/widgets"
import { useVentas } from "@/store"
import { useCreditosLeads, useLeads } from "@/hooks/useData"
import { convertirLead, reactivarLead, rechazarLead, sembrarLeadsBase } from "@/data/api"
import { generarLeadsIA } from "@/data/leads"
import { asignarBucket } from "@/lib/buckets"
import { MOTIVOS_RECHAZO, MOTIVO_RECHAZO_LABEL, PERIODO_ACTUAL } from "@/lib/display"
import type { FuenteLead, Lead, MotivoRechazo } from "@/lib/types"

const FUENTE_ICON: Record<FuenteLead["tipo"], React.ReactNode> = {
  maps: <MapPin size={13} />,
  web: <Globe size={13} />,
  social: <Star size={13} />,
  linkedin: <Building2 size={13} />,
  base: <Check size={13} />,
  tendencia: <TrendingUp size={13} />,
}

interface OpForm {
  ecommerce: string
  sitio: string
  envios_aprox: number
  lugar_retiro: string
  tipo_producto: string
  interes: string
  marca_reconocida: boolean
  quiere_fulfillment: boolean
}

export function VendedorLeads() {
  const { vendedor } = useVentas()
  const { data: leadsData, loading, error, reload } = useLeads(vendedor.id)
  const { data: creditos, reload: reloadCred } = useCreditosLeads(vendedor.id, PERIODO_ACTUAL)
  const leads = leadsData ?? []
  const nuevos = leads.filter((l) => l.estado === "nuevo")
  const convertidos = leads.filter((l) => l.estado === "convertido")
  const rechazados = leads.filter((l) => l.estado === "rechazado")

  const [buscando, setBuscando] = useState(false)
  const [status, setStatus] = useState("Analizando…")
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)
  const [verClasificados, setVerClasificados] = useState(false)

  // Rechazo inline
  const [rechId, setRechId] = useState<string | null>(null)
  const [rechMotivo, setRechMotivo] = useState<MotivoRechazo>("no_interesado")

  // Modal "pasar a oportunidad"
  const [convLead, setConvLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<OpForm | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  const sinVendedor = !vendedor.id
  const vivoRef = useRef(true)
  const sembrado = useRef<string | null>(null)

  const limite = creditos?.limite ?? 0
  const usados = creditos?.usados ?? 0
  const restantes = Math.max(0, limite - usados)
  const sinCreditos = limite > 0 && restantes <= 0

  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  // Sembrar ex-clientes como leads (costo cero, sin IA), una vez por vendedor.
  useEffect(() => {
    if (!vendedor.id || sembrado.current === vendedor.id) return
    sembrado.current = vendedor.id
    sembrarLeadsBase(vendedor.id)
      .then((n) => n > 0 && reload())
      .catch(() => {})
  }, [vendedor.id, reload])

  // Búsqueda con IA — SOLO al apretar el botón (consume un crédito).
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
      })
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
            Tus ex-clientes ya aparecen para reconquistar (sin costo). Con “Buscar con IA” sumo e-commerces
            reales nuevos desde la web, sin repetir los que ya tenés.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            onClick={buscar}
            disabled={buscando || sinVendedor || sinCreditos}
            className="bg-mint text-navy hover:bg-mint/90"
          >
            <RefreshCw className={buscando ? "animate-spin" : undefined} />
            {buscando ? "Buscando…" : "Buscar con IA"}
          </Button>
          {!sinVendedor && limite > 0 && (
            <span className="text-[11px] text-[#c6d0e0]">
              Búsquedas IA: <b className="text-white">{usados}/{limite}</b> este mes
            </span>
          )}
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
          className={
            "mt-3 rounded-xl border px-3.5 py-2.5 text-[12.5px] " +
            (aviso.tipo === "ok"
              ? "border-success/30 bg-[#E4F5EC] text-success"
              : "border-error/30 bg-[#FBE2E2] text-error")
          }
        >
          {aviso.texto}
        </div>
      )}

      {sinCreditos && !buscando && (
        <div className="mt-3 rounded-xl border border-warning/40 bg-[#FCF3E2] px-3.5 py-2.5 text-[12.5px] text-[#8a6416]">
          Usaste las {limite} búsquedas con IA de este mes. Podés seguir trabajando los leads que ya tenés; para
          más, pedile al admin que suba el límite.
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
            {error}. Si es la primera vez, falta correr la migración{" "}
            <code className="rounded bg-mist px-1">supabase/leads.sql</code> en el SQL Editor de Supabase.
          </p>
        </Card>
      ) : (
        <>
          <SectionTitle
            titulo="Leads para trabajar"
            hint={`${nuevos.length} sin clasificar · pasalos a oportunidad o rechazalos`}
          />

          {nuevos.length === 0 ? (
            <Card className="flex flex-col items-center p-8 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-mist">
                <Sparkles size={20} className="text-blue" />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-navy">No tenés leads sin clasificar</p>
              <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-slate">
                Apretá <b>Buscar con IA</b> para sumar potenciales nuevos desde la web (usa un crédito).
              </p>
            </Card>
          ) : (
            <div className="grid gap-3">
              {nuevos.map((l) => (
                <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-3.5">
                  <span
                    className={
                      "grid size-[42px] shrink-0 place-items-center rounded-[10px] text-[15px] font-semibold " +
                      (l.reconquista ? "bg-[#FBEFD4] text-[#a5741a]" : "bg-mist text-navy")
                    }
                  >
                    {l.iniciales}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                      {l.nombre}
                      <BucketChip bucket={l.bucket} />
                      {l.reconquista ? (
                        <span className="rounded-full bg-[#FBEFD4] px-2 py-0.5 text-[11px] font-semibold text-[#a5741a]">
                          Ex-cliente · reconquista
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#DFF2E9] px-2 py-0.5 text-[11px] font-semibold text-success">
                          {l.fit}% fit
                        </span>
                      )}
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

                  {/* Acciones / clasificar */}
                  <div className="flex shrink-0 flex-col justify-center gap-2 sm:w-[190px]">
                    {rechId === l.id ? (
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

          {/* Clasificados (convertidos + rechazados) */}
          {(convertidos.length > 0 || rechazados.length > 0) && (
            <div className="mt-5">
              <button
                onClick={() => setVerClasificados((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-mist/50 px-3.5 py-2.5 text-[12.5px] font-medium text-slate hover:bg-mist"
              >
                <ChevronDown size={15} className={verClasificados ? "rotate-180 transition-transform" : "transition-transform"} />
                Clasificados: {convertidos.length} pasados a oportunidad · {rechazados.length} rechazados
              </button>

              {verClasificados && (
                <div className="mt-2 grid gap-2">
                  {convertidos.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3.5 py-2.5">
                      <Check size={15} className="shrink-0 text-success" />
                      <span className="text-[13px] font-medium text-ink">{l.nombre}</span>
                      <BucketChip bucket={l.bucket} short />
                      <span className="text-[11.5px] text-success">Oportunidad creada</span>
                      {l.oportunidad_id && (
                        <Link to={`/pipeline/${l.oportunidad_id}`} className="ml-auto text-[12px] font-medium text-blue hover:underline">
                          Ver en pipeline
                        </Link>
                      )}
                    </div>
                  ))}
                  {rechazados.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3.5 py-2.5">
                      <Ban size={15} className="shrink-0 text-muted" />
                      <span className="text-[13px] font-medium text-ink">{l.nombre}</span>
                      <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] text-slate">
                        {l.motivo_rechazo ? MOTIVO_RECHAZO_LABEL[l.motivo_rechazo] : "Rechazado"}
                      </span>
                      <button onClick={() => deshacerRechazo(l)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-slate hover:text-blue">
                        <Undo2 size={13} /> Reactivar
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
