import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ListFilter, MapPin, Package, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { BucketChip } from "@/components/widgets"
import { useVentas } from "@/store"
import { OPORTUNIDADES } from "@/data/mock"
import { esActiva } from "@/lib/metrics"
import {
  ESTADOS_PIPELINE,
  ESTADO_COLOR,
  ESTADO_LABEL,
  fmtEnvios,
  haceTexto,
  tuvoReunionEfectiva,
} from "@/lib/display"
import type { Oportunidad } from "@/lib/types"

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

export function VendedorPipeline() {
  const { vendedor } = useVentas()
  const ops = useMemo(() => OPORTUNIDADES.filter((o) => o.vendedor_id === vendedor.id), [vendedor.id])
  const activas = ops.filter(esActiva).length
  const perdidas = ops.filter((o) => o.estado === "perdido").length

  return (
    <>
      <PageHead titulo="Mis oportunidades" descripcion={`${activas} activas · tu pipeline del mes`}>
        <Button variant="outline">
          <ListFilter /> Filtros
        </Button>
        <Button variant="blue">
          <Plus /> Nueva oportunidad
        </Button>
      </PageHead>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {ESTADOS_PIPELINE.map((estado) => {
          const cards = ops.filter((o) => o.estado === estado)
          return (
            <div key={estado} className="flex w-[230px] shrink-0 flex-col rounded-xl border border-border bg-mist/50">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span className="size-2 rounded-sm" style={{ background: ESTADO_COLOR[estado] }} />
                <span className="text-[12.5px] font-semibold text-navy">{ESTADO_LABEL[estado]}</span>
                <span className="ml-auto rounded-full bg-cloud px-1.5 text-[11px] font-semibold text-slate tabular-nums">
                  {cards.length}
                </span>
              </div>
              <div className="flex flex-col gap-2.5 p-2.5">
                {cards.map((o) => {
                  const foot = footTexto(o)
                  return (
                    <Link
                      key={o.id}
                      to={`/pipeline/${o.id}`}
                      className="block rounded-lg border border-input bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-blue hover:shadow-[var(--shadow-card)]"
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
                    </Link>
                  )
                })}
                {cards.length === 0 && (
                  <div className="py-3 text-center text-[11px] text-muted">—</div>
                )}
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
          El bucket (Estr / Full / Med) se asigna solo al cargar los datos de la oportunidad, por prioridad.
          Cuando una tarjeta entra a <b className="font-semibold text-ink">Reunión efectiva</b> suma al objetivo
          del mes y a tu mezcla de tipos.
        </p>
      </div>
    </>
  )
}
