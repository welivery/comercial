import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Clock, Columns3, Sparkles, Target, TrendingUp, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead, MonthPill } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { Cargando, ErrorMsg, Progress } from "@/components/widgets"
import { useVentas } from "@/store"
import { useLeads, useObjetivos, useOportunidades, useSeguimientoDiario } from "@/hooks/useData"
import { avanceVendedor } from "@/lib/metrics"
import { segColor, segLabel, segmentosActivos, useSegmentos } from "@/lib/buckets"
import { cn } from "@/lib/utils"
import { HOY, PERIODO_ACTUAL, enPeriodo, fechaHoyChile, tuvoReunionEfectiva } from "@/lib/display"
import type { Segmento } from "@/lib/types"

// Subtítulo de cada segmento, derivado de su definición (no hardcodeado).
function subtituloSegmento(s: Segmento | undefined): string {
  if (!s) return ""
  if (s.tipo === "especial") return "quieren almacenamiento + fulfillment"
  const min = s.envios_min ?? 0
  return min > 0 ? `≥ ${min.toLocaleString("es-CL")} envíos/mes` : "menor volumen · el que menos queremos sumar"
}

// Mensajes motivacionales (rotan por día) que conectan leads → reuniones → meta.
const MENSAJES = [
  "Cada lead que contactás hoy te acerca a tu objetivo. ¡Arrancá!",
  "Mientras más leads trabajás, más reuniones coordinás. La constancia gana.",
  "Un lead contactado hoy puede ser una reunión efectiva esta semana.",
  "El objetivo se construye contacto a contacto. Sumá el tuyo hoy.",
  "Tus próximas reuniones están en tu lista de leads. Empezá ahora.",
  "No dejes leads sin contactar: cada uno es una chance de acercarte a la meta.",
  "Ritmo diario que suma: contactá algunos leads todos los días.",
]

export function VendedorAvance() {
  const { vendedor } = useVentas()
  const { data: oportunidades, loading, error } = useOportunidades(vendedor.id)
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const { data: leadsData } = useLeads(vendedor.id)
  const segsReg = useSegmentos()
  const activos = useMemo(() => segmentosActivos(segsReg), [segsReg])
  const ops = useMemo(() => oportunidades ?? [], [oportunidades])
  const av = useMemo(() => {
    const obj = (objetivos ?? []).find((o) => o.vendedor_id === vendedor.id)
    return avanceVendedor(ops, obj, PERIODO_ACTUAL, activos)
  }, [ops, objetivos, vendedor.id, activos])

  const leadsNuevos = (leadsData ?? []).filter((l) => l.estado === "nuevo").length
  const leadsTrabajados = (leadsData ?? []).filter((l) => l.estado !== "nuevo").length

  // Cuota diaria de contactos (leads_cupo_diario del objetivo) y lo hecho HOY.
  const { data: diario } = useSeguimientoDiario(vendedor.id)
  const cupo = (objetivos ?? []).find((o) => o.vendedor_id === vendedor.id)?.leads_cupo_diario ?? 10
  const contactadosHoy = (diario ?? []).find((d) => d.fecha === fechaHoyChile())?.hechos ?? 0
  const faltanHoy = Math.max(0, cupo - contactadosHoy)
  const cuotaCumplida = contactadosHoy >= cupo

  // Fechas del mes.
  const diasEnMes = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0).getDate()
  const hoyDia = HOY.getDate()
  const diasRestantes = Math.max(0, diasEnMes - hoyDia)
  const mensaje = MENSAJES[hoyDia % MENSAJES.length]

  // Objetivo por segmento en CANTIDAD (no %), y cuánto falta del prioritario
  // (el primer segmento activo por orden = el más valioso).
  const mixCant = av.mix.map((m) => ({ ...m, objetivoCant: Math.round((m.objetivoPct / 100) * av.objetivo) }))
  const topSeg = activos[0]
  const topCant = topSeg ? mixCant.find((m) => m.bucket === topSeg.id) : undefined
  const faltaTop = topCant ? Math.max(0, topCant.objetivoCant - topCant.cantidad) : 0

  // Ritmo REAL: reuniones efectivas acumuladas por día del mes.
  const ritmo = useMemo(() => {
    const dias = ops
      .filter((o) => tuvoReunionEfectiva(o.estado) && o.reunion_efectiva_at && enPeriodo(o.reunion_efectiva_at, PERIODO_ACTUAL))
      .map((o) => new Date(o.reunion_efectiva_at as string).getDate())
    const cum: number[] = []
    for (let d = 1; d <= hoyDia; d++) cum.push(dias.filter((x) => x <= d).length)
    return cum
  }, [ops, hoyDia])
  const idealHoy = av.objetivo ? Math.round((av.objetivo * hoyDia) / diasEnMes) : 0
  const atrasado = av.efectivas < idealHoy

  if (loading) return <Cargando que="tu avance" />
  if (error) return <ErrorMsg msg={error} />

  // Geometría del gráfico de ritmo.
  const W = 300
  const H = 116
  const topMax = Math.max(av.objetivo, ritmo[ritmo.length - 1] ?? 0, 1)
  const x = (d: number) => (diasEnMes > 1 ? ((d - 1) / (diasEnMes - 1)) * W : 0)
  const y = (v: number) => H - (v / topMax) * H
  const realLine = ritmo.map((v, i) => `${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(" L ")
  const realPath = ritmo.length ? `M ${realLine}` : ""
  const realArea = ritmo.length
    ? `${realPath} L ${x(hoyDia).toFixed(1)} ${H} L ${x(1).toFixed(1)} ${H} Z`
    : ""
  const idealPath = `M ${x(1).toFixed(1)} ${y(0).toFixed(1)} L ${x(diasEnMes).toFixed(1)} ${y(av.objetivo).toFixed(1)}`
  const hoyX = x(hoyDia)

  return (
    <>
      <PageHead titulo="Mi avance" descripcion={`${vendedor.nombre} · ${vendedor.zona}`}>
        <MonthPill />
      </PageHead>

      {/* Banner de urgencia + motivación (leads → reuniones → objetivo) */}
      <div className="mb-[18px] flex flex-col gap-3 rounded-xl bg-gradient-to-br from-navy via-[#1d3a6b] to-[#123f52] p-5 text-white sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/20">
          <Target size={22} className="text-mint" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white">
            {av.restantes > 0 ? (
              <>
                Te faltan {av.restantes} reunion{av.restantes === 1 ? "" : "es"} efectiva
                {av.restantes === 1 ? "" : "s"} para tu objetivo · quedan {diasRestantes} días
              </>
            ) : (
              <>¡Llegaste a tu objetivo de reuniones del mes! 🎉</>
            )}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#c6d0e0]">{mensaje}</p>
        </div>
        {leadsNuevos > 0 && (
          <Button asChild className="shrink-0 bg-mint text-navy hover:bg-mint/90">
            <Link to="/leads">
              Contactar {leadsNuevos} lead{leadsNuevos === 1 ? "" : "s"} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>

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

      {/* Cuota diaria de contactos — resaltada si va atrás */}
      <Card
        className={cn(
          "mt-4 flex flex-col gap-4 border-l-4 p-[18px] sm:flex-row sm:items-center",
          cuotaCumplida ? "border-l-success bg-[#F0FAF5]" : "border-l-coral bg-[#FEF4F1]"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl"
            style={{ background: (cuotaCumplida ? "#1E9E6A" : "#F2563A") + "1F" }}
          >
            <Target size={20} style={{ color: cuotaCumplida ? "#1E9E6A" : "#F2563A" }} />
          </span>
          <div>
            <div className="text-[26px] font-semibold leading-none tabular-nums text-navy">
              {contactadosHoy}
              <span className="text-[15px] font-medium text-slate">/{cupo}</span>
            </div>
            <div className="mt-1 text-[12px] font-medium text-slate">tu cuota de contactos de hoy</div>
          </div>
        </div>
        <div className="hidden h-10 w-px bg-border sm:block" />
        <div className="min-w-0 flex-1">
          {cuotaCumplida ? (
            <p className="text-[13px] font-semibold text-success">¡Cumpliste tu cuota de hoy! 🔥 Seguí sumando.</p>
          ) : (
            <p className="text-[13px] font-semibold text-[#a5341f]">
              Te faltan {faltanHoy} contacto{faltanHoy === 1 ? "" : "s"} para tu cuota de hoy.
            </p>
          )}
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate">
            Más leads contactados hoy = más reuniones esta semana. Tenés{" "}
            <b className="font-semibold text-ink">{leadsNuevos} sin contactar</b> · ya trabajaste {leadsTrabajados}.
          </p>
        </div>
        {leadsNuevos > 0 && (
          <Button asChild variant={cuotaCumplida ? "outline" : "accent"} className="shrink-0">
            <Link to="/leads">
              Contactar leads <ArrowRight />
            </Link>
          </Button>
        )}
      </Card>

      {/* Leads = tu camino al objetivo */}
      <Card className="mt-4 flex flex-col gap-4 p-[18px] sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EEF3FE]">
            <Sparkles size={20} className="text-blue" />
          </span>
          <div>
            <div className="text-[26px] font-semibold leading-none text-navy tabular-nums">{leadsNuevos}</div>
            <div className="mt-1 text-[12px] font-medium text-slate">leads sin contactar</div>
          </div>
        </div>
        <div className="hidden h-10 w-px bg-border sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-navy">Tus leads son el camino al objetivo</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate">
            Contactás un lead → coordinás una reunión → suma a tus {av.objetivo} del mes.{" "}
            {leadsNuevos > 0
              ? `Tenés ${leadsNuevos} sin contactar y ya trabajaste ${leadsTrabajados}.`
              : "Traé más leads desde “Buscar leads” para no frenar el ritmo."}
          </p>
        </div>
        <Button asChild variant="blue" className="shrink-0">
          <Link to="/leads">
            Ir a mis leads <ArrowRight />
          </Link>
        </Button>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Reuniones por tipo de cliente */}
        <Card className="p-[18px]">
          <h2 className="text-[15px] font-semibold text-navy">Reuniones por tipo de cliente</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate">Cuántas efectivas llevás de cada tipo, sobre las que necesitás</p>
          {mixCant.map((m) => {
            const seg = activos.find((s) => s.id === m.bucket)
            const color = segColor(m.bucket, activos)
            return (
              <div key={m.bucket} className="flex items-center gap-3.5 border-b border-border py-3 last:border-b-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: color + "1F" }}>
                  <span className="size-2.5 rounded-full" style={{ background: color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{segLabel(m.bucket, activos)}</div>
                  <div className="text-[11px] text-slate">{subtituloSegmento(seg)}</div>
                </div>
                <Progress value={m.cantidad} max={Math.max(1, m.objetivoCant)} color={color} className="w-28" />
                <div className="w-[64px] text-right text-[13px] font-semibold tabular-nums text-ink">
                  {m.cantidad}<span className="font-normal text-slate"> / {m.objetivoCant}</span>
                </div>
              </div>
            )
          })}
          <p className="mt-3.5 text-[11.5px] leading-relaxed text-slate">
            {faltaTop > 0 && topSeg
              ? `Te faltan ${faltaTop} reunión${faltaTop === 1 ? "" : "es"} con clientes ${topSeg.nombre} para cumplir tu mezcla — son los de mayor valor.`
              : "Vas bien con la mezcla de tipos de cliente. 👌"}
          </p>
        </Card>

        {/* Ritmo del mes (real) */}
        <Card className="p-[18px]">
          <h2 className="text-[14px] font-semibold text-navy">Ritmo del mes</h2>
          <p className="mb-4 mt-0.5 text-xs text-slate">Tus reuniones efectivas acumuladas vs. el ritmo ideal</p>
          <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-auto w-full">
            <defs>
              <linearGradient id="rit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2F5BE6" stopOpacity="0.20" />
                <stop offset="1" stopColor="#2F5BE6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* objetivo (arriba) */}
            <line x1="0" y1={y(av.objetivo)} x2={W} y2={y(av.objetivo)} stroke="#E7EBF1" strokeDasharray="3 3" />
            <text x="2" y={y(av.objetivo) - 4} fontSize="9" fill="#8b94a3">
              objetivo {av.objetivo}
            </text>
            {/* ritmo ideal (diagonal gris) */}
            <path d={idealPath} fill="none" stroke="#A6AEBC" strokeWidth="1.5" strokeDasharray="4 3" />
            {/* real */}
            {realArea && <path d={realArea} fill="url(#rit)" />}
            {realPath && <path d={realPath} fill="none" stroke="#2F5BE6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            {ritmo.length > 0 && <circle cx={hoyX} cy={y(ritmo[ritmo.length - 1])} r="4" fill="#2F5BE6" />}
            {/* hoy */}
            <line x1={hoyX} y1="4" x2={hoyX} y2={H} stroke="#F2563A" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
            <text x={Math.min(hoyX - 2, W - 46)} y={H + 12} fontSize="8.5" fill="#F2563A">
              hoy · día {hoyDia}
            </text>
          </svg>
          <p className="mt-2 text-[12px] leading-relaxed text-slate">
            Vas <b className="font-semibold text-ink">{av.efectivas} de {av.objetivo}</b>.{" "}
            {av.objetivo === 0 ? (
              "Todavía no tenés objetivo cargado."
            ) : atrasado ? (
              <>
                Para ir al día deberías llevar <b className="font-semibold text-coral">~{idealHoy}</b>. Contactá
                leads para recuperar ritmo.
              </>
            ) : (
              <>Vas al día o adelantado 💪 (ritmo ideal ~{idealHoy}). ¡Seguí así!</>
            )}
          </p>
        </Card>
      </div>
    </>
  )
}
