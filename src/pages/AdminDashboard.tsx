import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Activity, Clock, Plus, Search, TrendingUp, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead, MonthPill } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { BucketChip, Cargando, ErrorMsg, Progress, VAvatar } from "@/components/widgets"
import {
  useLeadsEquipo,
  useLeadsPorVendedor,
  useObjetivos,
  useOportunidades,
  useVendedores,
} from "@/hooks/useData"
import type { LeadActividad, LeadsVendedorKpi, VendedorRow } from "@/data/api"
import type { Objetivo } from "@/lib/types"
import { useVentas } from "@/store"
import { avanceEquipo, avanceVendedor, embudo } from "@/lib/metrics"
import { segmentosActivos, useSegmentos } from "@/lib/buckets"
import { ESTADO_COLOR, ESTADO_LABEL, PERIODO_ACTUAL } from "@/lib/display"
import { cn } from "@/lib/utils"

export function AdminDashboard() {
  const { data: vendedores } = useVendedores()
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const { data: oportunidades, loading, error } = useOportunidades()
  const { data: actividadLeads } = useLeadsEquipo()
  const { data: leadsVend } = useLeadsPorVendedor()
  const { setVerVendedorId, setModo } = useVentas()
  const navigate = useNavigate()
  const segsReg = useSegmentos()
  const activos = useMemo(() => segmentosActivos(segsReg), [segsReg])
  const ops = oportunidades ?? []
  const objs = objetivos ?? []
  const vends = vendedores ?? []

  const eq = useMemo(() => avanceEquipo(ops, objs, PERIODO_ACTUAL, activos), [ops, objs, activos])
  const fun = useMemo(() => embudo(ops), [ops])
  const base = fun[0]?.cantidad || 1

  const filas = useMemo(
    () =>
      vends.map((v) => {
        const vops = ops.filter((o) => o.vendedor_id === v.id)
        const obj = objs.find((o) => o.vendedor_id === v.id)
        return { v, av: avanceVendedor(vops, obj, PERIODO_ACTUAL, activos) }
      }),
    [vends, ops, objs, activos]
  )

  // Abre el "Buscar leads" del vendedor elegido (drill-down desde el dashboard).
  function verLeadsDe(vendedorId: string) {
    setVerVendedorId(vendedorId)
    setModo("vendedor")
    navigate("/leads")
  }

  if (loading) return <Cargando que="el dashboard" />
  if (error) return <ErrorMsg msg={error} />

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
            <p className="mt-0.5 text-xs text-slate">Reuniones efectivas del mes · objetivo y cierre</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
                  <th className="px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="px-4 py-2.5 font-medium">Reuniones efectivas</th>
                  <th className="px-4 py-2.5 font-medium">Cierre</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Embudo */}
        <div className="grid gap-4">
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

      <LeadsPorVendedor vendedores={vends} kpis={leadsVend ?? []} onVer={verLeadsDe} />

      <RitmoDiario vendedores={vends} actividad={actividadLeads ?? []} objetivos={objs} onVer={verLeadsDe} />

      <ActividadLeads vendedores={vends} actividad={actividadLeads ?? []} />

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <BucketChip bucket={activos[0]?.id ?? "estrategico"} />
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

// ─────────────────────── Leads por vendedor (carga de trabajo) ────────────────
// Cuántos leads tiene cada vendedor en "Buscar leads", cuántos trabajó y cuántos
// pasó a oportunidad. "Por trabajar" = pila pendiente (nuevo, sin contacto ni
// secuencia). Es la foto de dónde hay backlog y quién está avanzando.
function LeadsPorVendedor({
  vendedores,
  kpis,
  onVer,
}: {
  vendedores: VendedorRow[]
  kpis: LeadsVendedorKpi[]
  onVer: (vendedorId: string) => void
}) {
  const porId = new Map(kpis.map((k) => [k.vendedor_id, k]))
  const VACIO: Omit<LeadsVendedorKpi, "vendedor_id"> = {
    total: 0, nuevos: 0, sin_trabajar: 0, en_secuencia: 0, contactados: 0, a_oportunidad: 0, rechazados: 0,
  }
  const filas = vendedores
    .map((v) => ({ v, k: { ...VACIO, ...(porId.get(v.id) ?? {}) } }))
    .sort((a, b) => b.k.total - a.k.total)

  const tot = filas.reduce(
    (acc, { k }) => ({
      total: acc.total + k.total,
      sin_trabajar: acc.sin_trabajar + k.sin_trabajar,
      trabajados: acc.trabajados + (k.total - k.sin_trabajar),
      a_oportunidad: acc.a_oportunidad + k.a_oportunidad,
    }),
    { total: 0, sin_trabajar: 0, trabajados: 0, a_oportunidad: 0 }
  )
  const pctEquipo = tot.total ? Math.round((tot.trabajados / tot.total) * 100) : 0

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 pb-2">
        <span className="grid size-8 place-items-center rounded-lg bg-[#EEF3FE]">
          <Search size={16} className="text-blue" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-navy">Leads por vendedor</h2>
          <p className="text-xs text-slate">Carga de trabajo real · cuántos tiene, cuántos trabajó y cuántos pasó a oportunidad</p>
        </div>
        {/* Resumen del equipo */}
        <div className="flex flex-wrap gap-2">
          <ResumenChip label="Total leads" valor={tot.total} color="#152A4F" />
          <ResumenChip label="Por trabajar" valor={tot.sin_trabajar} color="#F2563A" />
          <ResumenChip label="Trabajados" valor={`${tot.trabajados} · ${pctEquipo}%`} color="#2F5BE6" />
          <ResumenChip label="A oportunidad" valor={tot.a_oportunidad} color="#1E9E6A" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5 font-medium">Vendedor</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Por trabajar</th>
              <th className="px-4 py-2.5 font-medium">Trabajados</th>
              <th className="px-4 py-2.5 text-right font-medium">En secuencia</th>
              <th className="px-4 py-2.5 text-right font-medium">A oportunidad</th>
              <th className="px-4 py-2.5 text-right font-medium">Rechazados</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-slate">
                  No hay vendedores cargados.
                </td>
              </tr>
            ) : (
              filas.map(({ v, k }) => {
                const trabajados = k.total - k.sin_trabajar
                const pct = k.total ? Math.round((trabajados / k.total) * 100) : 0
                return (
                  <tr key={v.id} className="border-t border-border hover:bg-mist/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <VAvatar iniciales={v.iniciales} />
                        <span className="text-[13px] font-medium text-ink">{v.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-ink">{k.total}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
                          k.sin_trabajar > 0 ? "bg-[#FDECE9] text-[#c23c22]" : "text-muted"
                        )}
                      >
                        {k.sin_trabajar}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Progress value={trabajados} max={k.total || 1} color="#2F5BE6" className="w-[90px]" />
                        <span className="w-16 text-[12px] tabular-nums text-slate">
                          {trabajados}/{k.total} · {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[12.5px] tabular-nums text-slate">{k.en_secuencia}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-success">
                      {k.a_oportunidad}
                    </td>
                    <td className="px-4 py-3 text-right text-[12.5px] tabular-nums text-slate">{k.rechazados}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onVer(v.id)}
                        className="rounded-md px-2 py-1 text-[12px] font-medium text-blue hover:bg-[#EEF3FE]"
                      >
                        Ver leads
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ResumenChip({ label, valor, color }: { label: string; valor: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-mist/40 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums" style={{ color }}>
        {valor}
      </div>
    </div>
  )
}

// ─────────────────────── Actividad de leads (contactos) ───────────────────────
// Mide cuántos leads contacta (clasifica) el equipo por día / semana / mes.
// Es el indicador temprano: más contactos hoy → más reuniones después.
type ModoAct = "dia" | "semana" | "mes"
const MODOS: { k: ModoAct; label: string; rango: string }[] = [
  { k: "dia", label: "Día", rango: "últimos 14 días" },
  { k: "semana", label: "Semana", rango: "últimas 8 semanas" },
  { k: "mes", label: "Mes", rango: "últimos 6 meses" },
]

// ─────────────────── Ritmo diario por vendedor (contactos/día vs cuota) ───────────────────
// Muestra, por vendedor, cuántos leads contactó HOY y en los últimos 7 días, y si
// llega o no a su CUOTA DIARIA (leads_cupo_diario del objetivo). Ordena a los que
// están más atrás arriba, para saber a quién empujar hoy.
function RitmoDiario({
  vendedores,
  actividad,
  objetivos,
  onVer,
}: {
  vendedores: VendedorRow[]
  actividad: LeadActividad[]
  objetivos: Objetivo[]
  onVer: (vendedorId: string) => void
}) {
  const now = new Date()
  const dias = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - k))
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    return { d, next, label: `${d.getDate()}/${d.getMonth() + 1}` }
  })
  const contactos = useMemo(
    () =>
      actividad
        .filter((a) => a.contactado_at)
        .map((a) => ({ v: a.vendedor_id, d: new Date(a.contactado_at as string) })),
    [actividad]
  )
  const filas = useMemo(
    () =>
      vendedores
        .map((v) => {
          const cupo = objetivos.find((o) => o.vendedor_id === v.id)?.leads_cupo_diario ?? 10
          const serie = dias.map((dd) => contactos.filter((c) => c.v === v.id && c.d >= dd.d && c.d < dd.next).length)
          const hoy = serie[serie.length - 1]
          return { v, cupo, serie, hoy, falta: Math.max(0, cupo - hoy), alDia: hoy >= cupo }
        })
        .sort((a, b) => Number(a.alDia) - Number(b.alDia) || b.falta - a.falta),
    [vendedores, objetivos, contactos] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const hoyEquipo = filas.reduce((s, f) => s + f.hoy, 0)
  const metaEquipo = filas.reduce((s, f) => s + f.cupo, 0)
  const maxSerie = Math.max(1, ...filas.flatMap((f) => f.serie))
  const alDiaN = filas.filter((f) => f.alDia).length

  return (
    <Card className="mt-4 p-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[#EEF3FE]">
          <TrendingUp size={16} className="text-blue" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-navy">Ritmo diario · ¿llegan a su cuota?</h2>
          <p className="text-xs text-slate">
            Leads contactados por día vs. la cuota diaria de cada vendedor · últimos 7 días
          </p>
        </div>
        <div className="rounded-lg bg-mist/60 px-3 py-1.5 text-right">
          <div className="text-[11px] text-slate">Hoy · equipo</div>
          <div className="text-[15px] font-semibold text-navy tabular-nums">
            {hoyEquipo}
            <span className="text-[12px] font-medium text-slate">/{metaEquipo}</span>
          </div>
        </div>
      </div>

      {filas.length > 0 && (
        <div className="mt-2 text-[12px] text-slate">
          <b className={cn("font-semibold", alDiaN === filas.length ? "text-success" : "text-coral")}>
            {alDiaN}/{filas.length}
          </b>{" "}
          vendedores llegaron a su cuota de hoy.
        </div>
      )}

      <div className="mt-3 flex flex-col divide-y divide-border">
        {filas.map(({ v, cupo, serie, hoy, falta, alDia }) => (
          <div key={v.id} className="flex items-center gap-3 py-2.5">
            <VAvatar iniciales={v.iniciales} />
            <span className="min-w-0 flex-[1.2] truncate text-[13px] font-medium text-ink">{v.nombre}</span>

            {/* Sparkline 7 días (hoy resaltado) */}
            <div className="flex items-end gap-[3px]" style={{ height: 30 }} title="Contactos por día (últimos 7)">
              {serie.map((n, i) => {
                const hoyBar = i === serie.length - 1
                return (
                  <div
                    key={i}
                    title={`${dias[i].label}: ${n}`}
                    className="w-[7px] rounded-t"
                    style={{
                      height: `${Math.max(8, (n / maxSerie) * 100)}%`,
                      background: hoyBar ? (alDia ? "#1E9E6A" : "#F2563A") : n ? "#9DB4F0" : "#EEF1F6",
                    }}
                  />
                )
              })}
            </div>

            {/* Hoy vs cuota */}
            <div className="w-[112px] text-right">
              <div className="text-[13px] font-semibold tabular-nums text-ink">
                {hoy}
                <span className="text-[12px] font-medium text-slate">/{cupo} hoy</span>
              </div>
              {alDia ? (
                <div className="text-[11px] font-semibold text-success">✓ al día</div>
              ) : (
                <div className="text-[11px] font-semibold text-coral">faltan {falta}</div>
              )}
            </div>

            <button
              onClick={() => onVer(v.id)}
              className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-blue hover:bg-[#EEF3FE]"
            >
              Ver leads
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ActividadLeads({ vendedores, actividad }: { vendedores: VendedorRow[]; actividad: LeadActividad[] }) {
  const [modo, setModo] = useState<ModoAct>("dia")
  const contactos = useMemo(
    () =>
      actividad
        .filter((a) => a.contactado_at)
        .map((a) => ({ vendedor_id: a.vendedor_id, d: new Date(a.contactado_at as string) })),
    [actividad]
  )

  const now = new Date()
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)

  const buckets: { label: string; n: number }[] = []
  if (modo === "dia") {
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      buckets.push({ label: `${day.getDate()}/${day.getMonth() + 1}`, n: contactos.filter((c) => c.d >= day && c.d < next).length })
    }
  } else if (modo === "semana") {
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7 + 1)
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7)
      buckets.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, n: contactos.filter((c) => c.d >= start && c.d < end).length })
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1)
      buckets.push({ label: m.toLocaleDateString("es-CL", { month: "short" }), n: contactos.filter((c) => c.d >= m && c.d < next).length })
    }
  }
  const maxN = Math.max(...buckets.map((b) => b.n), 1)
  const totalRango = buckets.reduce((a, b) => a + b.n, 0)
  const rangoTxt = MODOS.find((m) => m.k === modo)?.rango ?? ""

  const porVendedor = vendedores
    .map((v) => ({ v, n: contactos.filter((c) => c.vendedor_id === v.id && c.d >= inicioMes).length }))
    .sort((a, b) => b.n - a.n)
  const maxV = Math.max(...porVendedor.map((p) => p.n), 1)
  const totalMes = porVendedor.reduce((a, b) => a + b.n, 0)
  const mejora = porVendedor.length ? porVendedor[porVendedor.length - 1] : null

  return (
    <Card className="mt-4 p-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[#EEF3FE]">
          <Activity size={16} className="text-blue" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-navy">Actividad de leads</h2>
          <p className="text-xs text-slate">Leads contactados por el equipo · indicador temprano de reuniones</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-mist/40 p-1">
          {MODOS.map((m) => (
            <button
              key={m.k}
              onClick={() => setModo(m.k)}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                modo === m.k ? "bg-white text-navy shadow-[var(--shadow-card)]" : "text-slate hover:text-ink"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        {/* Barras por período */}
        <div>
          <div className="mb-2 text-[12.5px] text-slate">
            <b className="text-[15px] font-semibold text-navy">{totalRango}</b> contactados · {rangoTxt}
          </div>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {buckets.map((b, i) => (
              <div
                key={i}
                title={`${b.label}: ${b.n} contactados`}
                className="flex-1 rounded-t transition-all"
                style={{ height: `${Math.max(3, (b.n / maxN) * 100)}%`, background: b.n ? "#2F5BE6" : "#EEF1F6" }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            {buckets.map((b, i) => (
              <span key={i} className="flex-1 truncate text-center text-[9px] text-muted">
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Por vendedor (este mes) + punto de mejora */}
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-slate">Contactados este mes, por vendedor</div>
          {porVendedor.length === 0 ? (
            <p className="text-[12.5px] text-slate">No hay vendedores cargados.</p>
          ) : (
            porVendedor.map(({ v, n }) => (
              <div key={v.id} className="flex items-center gap-2.5 py-1.5">
                <VAvatar iniciales={v.iniciales} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{v.nombre}</span>
                <Progress value={n} max={maxV} color="#2F5BE6" className="w-20" />
                <span className="w-6 text-right text-[12.5px] font-semibold tabular-nums text-ink">{n}</span>
              </div>
            ))
          )}
          {totalMes === 0 ? (
            <p className="mt-2 rounded-lg bg-[#FCF3E2] px-3 py-2 text-[11.5px] text-[#8a6416]">
              Nadie contactó leads este mes todavía. Recordales clasificar sus leads: es el primer paso hacia las
              reuniones.
            </p>
          ) : (
            mejora && (
              <p className="mt-2 rounded-lg bg-[#EEF3FE] px-3 py-2 text-[11.5px] text-blue">
                Punto de mejora: <b className="font-semibold">{mejora.v.nombre}</b> lleva {mejora.n} este mes. Más
                contactos hoy = más reuniones después.
              </p>
            )
          )}
        </div>
      </div>
    </Card>
  )
}
