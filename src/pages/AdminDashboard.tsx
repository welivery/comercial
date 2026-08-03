import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Clock, Plus, TrendingUp, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead, MonthPill } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { BucketChip, MixBar, Progress, VAvatar } from "@/components/widgets"
import { OBJETIVOS, OPORTUNIDADES, VENDEDORES } from "@/data/mock"
import { avanceEquipo, avanceVendedor, embudo } from "@/lib/metrics"
import { BUCKET_COLOR, BUCKET_LABEL, UMBRAL_ESTRATEGICO } from "@/lib/buckets"
import { ESTADO_COLOR, ESTADO_LABEL, PERIODO_ACTUAL } from "@/lib/display"

export function AdminDashboard() {
  const eq = useMemo(() => avanceEquipo(OPORTUNIDADES, OBJETIVOS, PERIODO_ACTUAL), [])
  const fun = useMemo(() => embudo(OPORTUNIDADES), [])
  const base = fun[0]?.cantidad || 1

  const filas = useMemo(
    () =>
      VENDEDORES.map((v) => {
        const ops = OPORTUNIDADES.filter((o) => o.vendedor_id === v.id)
        const obj = OBJETIVOS.find((o) => o.vendedor_id === v.id)
        return { v, av: avanceVendedor(ops, obj, PERIODO_ACTUAL) }
      }),
    []
  )

  return (
    <>
      <PageHead titulo="Dashboard del equipo" descripcion="Seguimiento comercial · Chile">
        <MonthPill />
        <Button asChild variant="default">
          <Link to="/objetivos">
            <Plus /> Nuevo objetivo
          </Link>
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Reuniones efectivas"
          valor={
            <>
              {eq.efectivas} <span className="text-[14px] font-medium text-slate">/ {eq.objetivo}</span>
            </>
          }
          icon={<Users size={14} />}
          color="#2F5BE6"
          sub={`${eq.pctObjetivo}% del objetivo · faltan ${eq.restantes}`}
          subTono="up"
          track={{ value: eq.efectivas, max: eq.objetivo }}
        />
        <StatTile
          label="Tasa de cierre"
          valor={<>{eq.tasaCierre}%</>}
          icon={<TrendingUp size={14} />}
          color="#1E9E6A"
          sub={`${eq.cierres} cierres este mes`}
          subTono="up"
          track={{ value: eq.tasaCierre }}
        />
        <StatTile
          label="Tiempo a cierre"
          valor={
            <>
              {eq.tiempoPromedioCierre ?? "—"}{" "}
              <span className="text-[14px] font-medium text-slate">días prom.</span>
            </>
          }
          icon={<Clock size={14} />}
          color="#E0A52F"
          sub="desde que se declara"
          track={{ value: Math.min(100, (eq.tiempoPromedioCierre ?? 0) * 4) }}
        />
        <StatTile
          label="Oportunidades activas"
          valor={eq.activas}
          icon={<TrendingUp size={14} />}
          color="#F2563A"
          sub="en el pipeline del equipo"
          track={{ value: Math.min(100, eq.activas * 2) }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Avance por vendedor */}
        <Card className="overflow-hidden">
          <div className="p-4 pb-1">
            <h2 className="text-[15px] font-semibold text-navy">Avance por vendedor</h2>
            <p className="mt-0.5 text-xs text-slate">
              Reuniones efectivas del mes · objetivo y mezcla de tipos
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
                  <th className="px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="px-4 py-2.5 font-medium">Reuniones efectivas</th>
                  <th className="px-4 py-2.5 font-medium">Cierre</th>
                  <th className="px-4 py-2.5 font-medium">Mezcla</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ v, av }) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <VAvatar iniciales={v.iniciales} />
                        <span className="text-[13px] font-medium text-ink">{v.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Progress
                          value={av.efectivas}
                          max={av.objetivo}
                          color={av.pctObjetivo >= 80 ? "#2F5BE6" : "#F2563A"}
                          className="w-[110px]"
                        />
                        <span className="w-12 text-right text-[12px] font-semibold tabular-nums text-ink">
                          {av.efectivas}/{av.objetivo}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{
                          background: (av.tasaCierre >= 25 ? "#1E9E6A" : "#E0A52F") + "1F",
                          color: av.tasaCierre >= 25 ? "#1E9E6A" : "#a5741a",
                        }}
                      >
                        {av.tasaCierre}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MixBar mix={av.mix} className="w-[120px]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mix del equipo + embudo */}
        <div className="grid gap-4">
          <Card className="p-4">
            <h2 className="text-[14px] font-semibold text-navy">Mezcla de tipos · equipo</h2>
            <p className="mb-3.5 mt-0.5 text-xs text-slate">Buckets con prioridad · real vs objetivo</p>
            <MixBar mix={eq.mix} className="h-3.5" />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {eq.mix.map((m) => (
                <div key={m.bucket} className="flex items-center gap-1.5 text-[12px]">
                  <span className="size-2 rounded-full" style={{ background: BUCKET_COLOR[m.bucket] }} />
                  <b className="font-semibold text-ink">{BUCKET_LABEL[m.bucket]}</b>
                  <span className="text-slate">
                    {m.pct}% · obj {m.objetivoPct}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate">
              Estratégico = marca reconocida o +{UMBRAL_ESTRATEGICO.toLocaleString("es-CL")}{" "}
              envíos/mes. Prioridad: Estratégico → Fulfillment → Mediano.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3.5 text-[14px] font-semibold text-navy">Embudo del mes</h2>
            <div className="flex flex-col gap-2">
              {fun.map((e) => (
                <div key={e.estado} className="flex items-center gap-3">
                  <div className="flex w-[132px] shrink-0 items-center gap-2 text-[12px] text-slate">
                    <span className="size-2 rounded-full" style={{ background: ESTADO_COLOR[e.estado] }} />
                    {ESTADO_LABEL[e.estado]}
                  </div>
                  <div className="flex flex-1 items-center gap-2.5">
                    <div
                      className="flex h-7 items-center rounded-md pl-2.5 text-[12px] font-semibold text-white"
                      style={{
                        width: `${Math.max(12, (e.cantidad / base) * 100)}%`,
                        background: ESTADO_COLOR[e.estado],
                      }}
                    >
                      {e.cantidad}
                    </div>
                    {e.conversion != null && (
                      <span className="text-[11px] text-slate tabular-nums">{e.conversion}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <BucketChip bucket="estrategico" />
        <p className="leading-relaxed">
          Todo el pipeline se mide sobre la misma oportunidad: el objetivo cuenta las que llegan a{" "}
          <b className="font-semibold text-ink">Reunión efectiva</b>; cierre y tiempo-a-cierre salen
          del mismo flujo. Más adelante, el cotizador integrado sumará el dato económico por
          prospecto.
        </p>
      </div>
    </>
  )
}
