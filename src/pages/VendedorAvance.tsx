import { useMemo } from "react"
import { Clock, Columns3, TriangleAlert, TrendingUp, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { PageHead, MonthPill } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { Progress } from "@/components/widgets"
import { useVentas } from "@/store"
import { OBJETIVOS, OPORTUNIDADES } from "@/data/mock"
import { avanceVendedor } from "@/lib/metrics"
import { BUCKET_COLOR, BUCKET_LABEL } from "@/lib/buckets"
import { HOY, PERIODO_ACTUAL } from "@/lib/display"

const SUBTITULO_BUCKET: Record<string, string> = {
  estrategico: "marca reconocida o +1.000 envíos",
  fulfillment: "quieren almacenamiento + fulfillment",
  mediano: "resto de los clientes",
}

export function VendedorAvance() {
  const { vendedor } = useVentas()
  const av = useMemo(() => {
    const ops = OPORTUNIDADES.filter((o) => o.vendedor_id === vendedor.id)
    const obj = OBJETIVOS.find((o) => o.vendedor_id === vendedor.id)
    return avanceVendedor(ops, obj, PERIODO_ACTUAL)
  }, [vendedor.id])

  // Días hábiles restantes (aprox): hasta fin de mes.
  const finMes = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0)
  const diasRestantes = Math.max(0, Math.round((finMes.getTime() - HOY.getTime()) / 86400000))

  const estr = av.mix.find((m) => m.bucket === "estrategico")
  const faltaEstr = estr ? Math.max(0, Math.ceil(((estr.objetivoPct - estr.pct) / 100) * av.objetivo)) : 0

  return (
    <>
      <PageHead titulo="Mi avance" descripcion={`${vendedor.nombre} · ${vendedor.zona}`}>
        <MonthPill />
      </PageHead>

      {(av.restantes > 0 || faltaEstr > 0) && (
        <div className="mb-[18px] flex items-start gap-3 rounded-xl bg-[#FDE5E0] p-3.5 text-[13px] text-[#b03a24]">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-coral" />
          <p className="leading-relaxed">
            {av.restantes > 0 ? (
              <>
                Te faltan <b className="font-semibold">{av.restantes} reuniones efectivas</b> para el objetivo
                del mes y quedan <b className="font-semibold">{diasRestantes} días</b>.
              </>
            ) : (
              <>Llegaste al objetivo de reuniones del mes. </>
            )}
            {faltaEstr > 0 && (
              <>
                {" "}
                Además vas <b className="font-semibold">bajo en Estratégico</b>: necesitás {faltaEstr} marca
                reconocida o +1.000 envíos más para llegar al {estr?.objetivoPct}%.
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Reuniones efectivas"
          valor={
            <>
              {av.efectivas} <span className="text-[14px] font-medium text-slate">/ {av.objetivo}</span>
            </>
          }
          icon={<Users size={14} />}
          color="#2F5BE6"
          sub={`${av.pctObjetivo}% del objetivo`}
          subTono="up"
          track={{ value: av.efectivas, max: av.objetivo }}
        />
        <StatTile
          label="Cierres ganados"
          valor={
            <>
              {av.cierres} <span className="text-[14px] font-medium text-slate">· {av.tasaCierre}%</span>
            </>
          }
          icon={<TrendingUp size={14} />}
          color="#1E9E6A"
          sub="tasa de cierre"
          subTono="up"
          track={{ value: av.tasaCierre }}
        />
        <StatTile
          label="Tiempo a cierre"
          valor={
            <>
              {av.tiempoPromedioCierre ?? "—"} <span className="text-[14px] font-medium text-slate">días</span>
            </>
          }
          icon={<Clock size={14} />}
          color="#E0A52F"
          sub="promedio del mes"
          track={{ value: Math.min(100, (av.tiempoPromedioCierre ?? 0) * 4) }}
        />
        <StatTile
          label="En el pipeline"
          valor={av.enPipeline}
          icon={<Columns3 size={14} />}
          color="#F2563A"
          sub="oportunidades activas"
          track={{ value: Math.min(100, av.enPipeline * 6) }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Mezcla de tipos */}
        <Card className="p-[18px]">
          <h2 className="text-[15px] font-semibold text-navy">Mi mezcla de tipos</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate">Reuniones efectivas por bucket · real vs objetivo</p>
          {av.mix.map((m) => (
            <div key={m.bucket} className="flex items-center gap-3.5 border-b border-border py-3 last:border-b-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: BUCKET_COLOR[m.bucket] + "1F" }}>
                <span className="size-2.5 rounded-full" style={{ background: BUCKET_COLOR[m.bucket] }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{BUCKET_LABEL[m.bucket]}</div>
                <div className="text-[11px] text-slate">{SUBTITULO_BUCKET[m.bucket]}</div>
              </div>
              <Progress value={m.pct} max={100} color={BUCKET_COLOR[m.bucket]} objetivo={m.objetivoPct} className="w-28" />
              <div className="w-[74px] text-right text-[13px] font-semibold tabular-nums text-ink">
                {m.pct}%<span className="font-normal text-slate"> / {m.objetivoPct}</span>
              </div>
            </div>
          ))}
          <p className="mt-3.5 flex items-center gap-1.5 text-[11.5px] text-slate">
            <span className="inline-block h-0.5 w-3.5 bg-ink/60" /> La línea marca el objetivo de cada bucket.
          </p>
        </Card>

        {/* Ritmo del mes */}
        <Card className="p-[18px]">
          <h2 className="text-[14px] font-semibold text-navy">Ritmo del mes</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate">Reuniones efectivas acumuladas</p>
          <svg viewBox="0 0 300 130" className="h-auto w-full">
            <defs>
              <linearGradient id="rit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2F5BE6" stopOpacity="0.22" />
                <stop offset="1" stopColor="#2F5BE6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="30" x2="300" y2="30" stroke="#E7EBF1" strokeDasharray="3 3" />
            <text x="2" y="26" fontSize="9" fill="#8b94a3">
              objetivo {av.objetivo}
            </text>
            <path d="M0 112 L50 98 L100 86 L150 70 L200 56 L250 44 L300 40 L300 130 L0 130 Z" fill="url(#rit)" />
            <path
              d="M0 112 L50 98 L100 86 L150 70 L200 56 L250 44 L300 40"
              fill="none"
              stroke="#2F5BE6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="300" cy="40" r="4" fill="#2F5BE6" />
            <line x1="288" y1="8" x2="288" y2="122" stroke="#F2563A" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
            <text x="232" y="120" fontSize="8.5" fill="#F2563A">
              hoy · día {HOY.getDate()}
            </text>
          </svg>
          <p className="mt-2 text-[12px] leading-relaxed text-slate">
            Vas <b className="font-semibold text-ink">{av.efectivas} de {av.objetivo}</b>. Cerrá{" "}
            {faltaEstr > 0 ? `${faltaEstr} estratégica más` : "el mix objetivo"} para asegurar la mezcla.
          </p>
        </Card>
      </div>
    </>
  )
}
