import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Check, Mail, Search, Send, Target, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { Cargando, ErrorMsg, VAvatar } from "@/components/widgets"
import {
  useEmailCuenta,
  useInscripciones,
  useLeads,
  useObjetivos,
  useOportunidades,
  useVendedores,
} from "@/hooks/useData"
import { actualizarUsuario } from "@/data/api"
import { PERIODO_ACTUAL } from "@/lib/display"

// Ficha consolidada de un vendedor (vista admin): datos, estado del email de
// secuencias, objetivo del mes y KPIs de leads / pipeline / secuencias.
export function VendedorFicha() {
  const { id = "" } = useParams()
  const { data: vendedores, loading, error, reload } = useVendedores()
  const { data: leads } = useLeads(id)
  const { data: ops } = useOportunidades(id)
  const { data: insc } = useInscripciones(id)
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const { data: cuenta, loading: loadingCuenta } = useEmailCuenta(id)

  const v = (vendedores ?? []).find((x) => x.id === id) ?? null
  const [guardando, setGuardando] = useState(false)

  const leadK = useMemo(() => {
    const l = leads ?? []
    return {
      traidos: l.length,
      nuevos: l.filter((x) => x.estado === "nuevo").length,
      conv: l.filter((x) => x.estado === "convertido").length,
    }
  }, [leads])

  const opK = useMemo(() => {
    const o = ops ?? []
    const abiertas = o.filter((x) => x.estado !== "cierre_ganado" && x.estado !== "perdido").length
    const efectivas = o.filter((x) => !!x.reunion_efectiva_at).length
    const cierres = o.filter((x) => x.estado === "cierre_ganado").length
    return { abiertas, efectivas, cierres }
  }, [ops])

  const secK = useMemo(() => {
    const i = insc ?? []
    const enSecuencia = i.filter((x) => x.estado === "activa" || x.estado === "pausada").length
    const respondieron = i.filter((x) => x.estado === "respondio").length
    const mails = i.reduce((a, x) => a + (x.paso_actual || 0), 0)
    return { enSecuencia, mails, respondieron }
  }, [insc])

  const obj = (objetivos ?? []).find((o) => o.vendedor_id === id)

  async function toggleActivo() {
    if (!v) return
    setGuardando(true)
    try {
      await actualizarUsuario(v.id, { activo: !v.activo })
      reload()
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <Cargando que="la ficha" />
  if (error) return <ErrorMsg msg={error} />
  if (!v)
    return (
      <Card className="mt-4 p-6 text-center">
        <p className="text-[14px] font-semibold text-navy">Vendedor no encontrado</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/vendedores">
            <ArrowLeft /> Volver a Vendedores
          </Link>
        </Button>
      </Card>
    )

  return (
    <>
      <PageHead titulo={v.nombre} descripcion={v.zona || "Ficha del vendedor"}>
        <Button asChild variant="outline">
          <Link to="/vendedores">
            <ArrowLeft /> Vendedores
          </Link>
        </Button>
      </PageHead>

      {/* Encabezado */}
      <Card className="flex flex-col gap-4 p-[18px] sm:flex-row sm:items-center">
        <VAvatar iniciales={v.iniciales} className="size-12 text-[16px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-ink">{v.nombre}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate">
            {v.zona && <span>{v.zona}</span>}
            {v.email && (
              <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1 text-blue hover:underline">
                <Mail size={13} /> {v.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            style={{ background: (v.activo ? "#1E9E6A" : "#7A869C") + "1F", color: v.activo ? "#1E9E6A" : "#7A869C" }}
          >
            {v.activo ? "Activo" : "Inactivo"}
          </span>
          <Button variant="outline" size="sm" disabled={guardando} onClick={toggleActivo}>
            {v.activo ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </Card>

      {/* Email de secuencias + objetivo del mes */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex items-center gap-3 p-[18px]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF3FE]">
            <Send size={18} className="text-blue" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-navy">Email de secuencias</div>
            {loadingCuenta ? (
              <div className="text-[12.5px] text-slate">Cargando…</div>
            ) : cuenta ? (
              <div className="flex items-center gap-1.5 text-[12.5px] text-slate">
                <Check size={14} className="text-success" /> Conectado ·{" "}
                <b className="font-medium text-ink">{cuenta.email}</b>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[12.5px] text-slate">
                <X size={14} className="text-error" /> Sin conectar (lo conecta el vendedor desde su vista)
              </div>
            )}
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-[18px]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAFBF5]">
            <Target size={18} className="text-mint" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-navy">Objetivo del mes</div>
            <div className="text-[12.5px] text-slate">
              {obj
                ? `${obj.reuniones_efectivas} reuniones · ${obj.leads_cupo_diario} leads/día`
                : "Sin objetivo cargado"}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/objetivos">Editar</Link>
          </Button>
        </Card>
      </div>

      {/* KPIs */}
      <h2 className="mb-2 mt-5 text-[14px] font-semibold text-navy">Leads</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Traídos" valor={leadK.traidos} icon={<Search size={14} />} sub="en total" />
        <StatTile label="Sin clasificar" valor={leadK.nuevos} color="#2F5BE6" sub="pendientes" />
        <StatTile label="A oportunidad" valor={leadK.conv} color="#1E9E6A" sub="convertidos" />
      </div>

      <h2 className="mb-2 mt-5 text-[14px] font-semibold text-navy">Pipeline</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Oportunidades abiertas" valor={opK.abiertas} color="#2F5BE6" sub="en curso" />
        <StatTile label="Reuniones efectivas" valor={opK.efectivas} color="#1E9E6A" sub="hitos" />
        <StatTile label="Cierres ganados" valor={opK.cierres} color="#1E9E6A" sub="cerrados" />
      </div>

      <h2 className="mb-2 mt-5 text-[14px] font-semibold text-navy">Secuencias</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="En secuencia" valor={secK.enSecuencia} color="#2F5BE6" sub="contactos activos" />
        <StatTile label="Mails enviados" valor={secK.mails} sub="acumulado" />
        <StatTile label="Respondieron" valor={secK.respondieron} color="#1E9E6A" sub="con respuesta" />
      </div>
    </>
  )
}
