import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ListFilter, MapPin, Package, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { Modal } from "@/components/Modal"
import { BucketChip, Cargando, ErrorMsg } from "@/components/widgets"
import { useVentas } from "@/store"
import { useOportunidades } from "@/hooks/useData"
import { crearOportunidad, moverOportunidad } from "@/data/api"
import { useToast } from "@/components/Toast"
import { msgError } from "@/lib/errors"
import { asignarBucket } from "@/lib/buckets"
import { esActiva } from "@/lib/metrics"
import {
  ESTADOS_PIPELINE,
  ESTADO_COLOR,
  ESTADO_LABEL,
  fmtEnvios,
  haceTexto,
  tuvoReunionEfectiva,
} from "@/lib/display"
import { cn } from "@/lib/utils"
import type { EstadoOportunidad, Oportunidad } from "@/lib/types"

function footTexto(o: Oportunidad): { texto: string; color?: string } {
  switch (o.estado) {
    case "reunion_coordinada":
      return { texto: `reunión ${haceTexto(o.reunion_coordinada_at ?? o.declarada_at)}`, color: "#2F5BE6" }
    case "reunion_efectiva":
      return { texto: "✓ cuenta al objetivo", color: "#1E9E6A" }
    case "propuesta_enviada":
      return { texto: `enviada ${haceTexto(o.reunion_efectiva_at ?? o.declarada_at)}`, color: "#a5741a" }
    case "seguimiento":
      return { texto: "recontactar pronto", color: "#F2563A" }
    case "cierre_ganado":
      return { texto: `cerrado`, color: "#1E9E6A" }
    default:
      return { texto: haceTexto(o.declarada_at) }
  }
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
const VACIO: OpForm = {
  ecommerce: "",
  sitio: "",
  envios_aprox: 0,
  lugar_retiro: "",
  tipo_producto: "",
  interes: "",
  marca_reconocida: false,
  quiere_fulfillment: false,
}

export function VendedorPipeline() {
  const { vendedor } = useVentas()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: oportunidades, loading, error, reload } = useOportunidades(vendedor.id)
  const ops = useMemo(() => oportunidades ?? [], [oportunidades])
  const activas = ops.filter(esActiva).length
  const perdidas = ops.filter((o) => o.estado === "perdido").length

  const [drag, setDrag] = useState<Oportunidad | null>(null)
  const [over, setOver] = useState<EstadoOportunidad | null>(null)

  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<OpForm>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  async function onDrop(estado: EstadoOportunidad) {
    const o = drag
    setDrag(null)
    setOver(null)
    if (!o || o.estado === estado) return
    try {
      await moverOportunidad(o, estado)
      reload()
    } catch (err) {
      toast.error(msgError(err, "No se pudo mover"))
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!vendedor.id) {
      setErrForm("Elegí un vendedor primero (arriba, 'Ver como').")
      return
    }
    setGuardando(true)
    setErrForm(null)
    try {
      await crearOportunidad({
        vendedor_id: vendedor.id,
        ecommerce: form.ecommerce,
        sitio: form.sitio || null,
        envios_aprox: form.envios_aprox,
        lugar_retiro: form.lugar_retiro,
        tipo_producto: form.tipo_producto,
        interes: form.interes || null,
        marca_reconocida: form.marca_reconocida,
        quiere_fulfillment: form.quiere_fulfillment,
        origen: "manual",
      })
      setAbierto(false)
      setForm(VACIO)
      reload()
    } catch (err) {
      setErrForm(msgError(err, "No se pudo crear"))
    } finally {
      setGuardando(false)
    }
  }

  const bucketPreview = asignarBucket({
    marca_reconocida: form.marca_reconocida,
    envios_aprox: form.envios_aprox,
    quiere_fulfillment: form.quiere_fulfillment,
  })

  if (loading) return <Cargando que="tu pipeline" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Mis oportunidades" descripcion={`${activas} activas · arrastrá las tarjetas entre columnas`}>
        <Button variant="outline">
          <ListFilter /> Filtros
        </Button>
        <Button variant="blue" onClick={() => { setForm(VACIO); setErrForm(null); setAbierto(true) }}>
          <Plus /> Nueva oportunidad
        </Button>
      </PageHead>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {ESTADOS_PIPELINE.map((estado) => {
          const cards = ops.filter((o) => o.estado === estado)
          const activo = over === estado && drag && drag.estado !== estado
          return (
            <div
              key={estado}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(estado)
              }}
              onDragLeave={() => setOver((o) => (o === estado ? null : o))}
              onDrop={() => onDrop(estado)}
              className={cn(
                "flex w-[230px] shrink-0 flex-col rounded-xl border bg-mist/50 transition-colors",
                activo ? "border-blue bg-[#EEF3FE]" : "border-border"
              )}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span className="size-2 rounded-sm" style={{ background: ESTADO_COLOR[estado] }} />
                <span className="text-[12.5px] font-semibold text-navy">{ESTADO_LABEL[estado]}</span>
                <span className="ml-auto rounded-full bg-cloud px-1.5 text-[11px] font-semibold text-slate tabular-nums">
                  {cards.length}
                </span>
              </div>
              <div className="flex min-h-[60px] flex-col gap-2.5 p-2.5">
                {cards.map((o) => {
                  const foot = footTexto(o)
                  return (
                    <div
                      key={o.id}
                      draggable
                      onDragStart={() => setDrag(o)}
                      onDragEnd={() => {
                        setDrag(null)
                        setOver(null)
                      }}
                      onClick={() => navigate(`/pipeline/${o.id}`)}
                      className={cn(
                        "cursor-grab rounded-lg border border-input bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-blue hover:shadow-[var(--shadow-card)] active:cursor-grabbing",
                        drag?.id === o.id && "opacity-40"
                      )}
                      style={o.estado === "cierre_ganado" ? { borderColor: "#1E9E6A" } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{o.ecommerce}</span>
                        <BucketChip bucket={o.bucket} short />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate">
                        <span className="inline-flex items-center gap-1">
                          <Package size={12} className="text-muted" />
                          {fmtEnvios(o.envios_aprox)}/mes
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-muted" />
                          {o.lugar_retiro}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[10.5px] font-medium" style={{ color: foot.color ?? "#8b94a3" }}>
                          {foot.texto}
                        </span>
                        {tuvoReunionEfectiva(o.estado) && (
                          <span
                            className="grid size-[22px] place-items-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: o.estado === "cierre_ganado" ? "#1E9E6A" : "#152A4F" }}
                          >
                            {o.estado === "cierre_ganado" ? "✓" : vendedor.iniciales}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {cards.length === 0 && <div className="py-3 text-center text-[11px] text-muted">—</div>}
                {estado === "cierre_ganado" && perdidas > 0 && (
                  <div className="py-1 text-center text-[11px] text-slate">+ Perdido ({perdidas})</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <BucketChip bucket="estrategico" />
        <p className="leading-relaxed">
          Arrastrá una tarjeta a otra columna para cambiar su estado. El bucket (Estr / Full / Med) se asigna
          solo por prioridad. Al entrar a <b className="font-semibold text-ink">Reunión efectiva</b> suma al
          objetivo del mes y a la mezcla de tipos.
        </p>
      </div>

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Nueva oportunidad">
        <form onSubmit={crear} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">E-commerce</span>
            <input value={form.ecommerce} onChange={(e) => setForm({ ...form, ecommerce: e.target.value })} className="inp" placeholder="Nombre de la tienda" required />
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
            <input value={form.interes} onChange={(e) => setForm({ ...form, interes: e.target.value })} className="inp" placeholder="Fulfillment, última milla…" />
          </label>
          <div className="flex flex-wrap gap-4 rounded-lg bg-mist/70 p-3">
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
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="blue" disabled={guardando}>
              {guardando ? "Creando…" : "Crear oportunidad"}
            </Button>
          </div>
        </form>
      </Modal>

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}
