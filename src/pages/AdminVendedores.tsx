import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Settings2, TrendingUp, UserPlus, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { StatTile } from "@/components/StatTile"
import { Modal } from "@/components/Modal"
import { Cargando, ErrorMsg, Progress, SectionTitle, VAvatar } from "@/components/widgets"
import { useObjetivos, useOportunidades, useVendedores } from "@/hooks/useData"
import { crearUsuario, crearUsuarioConAcceso } from "@/data/api"
import { avanceVendedor, type AvanceVendedor } from "@/lib/metrics"
import { PERIODO_ACTUAL } from "@/lib/display"
import type { Vendedor } from "@/lib/types"

interface Fila {
  v: Vendedor
  av: AvanceVendedor
  enRiesgo: boolean
}

function GoalRow({
  color,
  titulo,
  sub,
  value,
  max,
  objetivo,
  figA,
  figB,
}: {
  color: string
  titulo: string
  sub: string
  value: number
  max: number
  objetivo?: number
  figA: string
  figB?: string
}) {
  return (
    <div className="flex items-center gap-3.5 border-b border-border py-3 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: color + "1F" }}>
        <span className="size-2.5 rounded-full" style={{ background: color }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{titulo}</div>
        <div className="text-[11px] text-slate">{sub}</div>
      </div>
      <Progress value={value} max={max} color={color} objetivo={objetivo} className="w-24" />
      <div className="w-[70px] text-right text-[13px] font-semibold tabular-nums text-ink">
        {figA}
        {figB && <span className="font-normal text-slate">{figB}</span>}
      </div>
    </div>
  )
}

interface NuevoForm {
  nombre: string
  email: string
  zona: string
  password: string
}
const VACIO: NuevoForm = { nombre: "", email: "", zona: "", password: "" }

export function AdminVendedores() {
  const { data: vendedores, loading, error, reload } = useVendedores()
  const { data: objetivos } = useObjetivos(PERIODO_ACTUAL)
  const { data: oportunidades } = useOportunidades()
  const ops = oportunidades ?? []
  const objs = objetivos ?? []

  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<NuevoForm>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setErrForm(null)
    try {
      if (form.password.trim()) {
        await crearUsuarioConAcceso({
          email: form.email,
          nombre: form.nombre,
          zona: form.zona,
          rol: "vendedor",
          password: form.password.trim(),
        })
      } else {
        await crearUsuario({ email: form.email, nombre: form.nombre, zona: form.zona, rol: "vendedor" })
      }
      setAbierto(false)
      setForm(VACIO)
      reload()
    } catch (err) {
      setErrForm(err instanceof Error ? err.message : "No se pudo agregar")
    } finally {
      setGuardando(false)
    }
  }

  const filas: Fila[] = useMemo(
    () =>
      (vendedores ?? []).map((v) => {
        const vops = ops.filter((o) => o.vendedor_id === v.id)
        const obj = objs.find((o) => o.vendedor_id === v.id)
        const av = avanceVendedor(vops, obj, PERIODO_ACTUAL)
        const estr = av.mix.find((m) => m.bucket === "estrategico")
        const enRiesgo = av.pctObjetivo < 80 || (estr ? estr.pct < estr.objetivoPct - 8 : false)
        return { v, av, enRiesgo }
      }),
    [vendedores, ops, objs]
  )

  const mejor = [...filas].sort((a, b) => b.av.pctObjetivo - a.av.pctObjetivo)[0]
  const enRiesgo = filas.filter((f) => f.enRiesgo).length
  const cierrePromedio = filas.length
    ? Math.round(filas.reduce((a, f) => a + f.av.tasaCierre, 0) / filas.length)
    : 0

  if (loading) return <Cargando que="el equipo" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Vendedores" descripcion="Detalle mensual del equipo">
        <Button asChild variant="outline">
          <Link to="/usuarios">
            <Settings2 /> Gestionar usuarios
          </Link>
        </Button>
        <Button variant="default" onClick={() => { setForm(VACIO); setErrForm(null); setAbierto(true) }}>
          <UserPlus /> Agregar vendedor
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Equipo" valor={filas.length} icon={<Users size={14} />} sub="vendedores activos" />
        <StatTile
          label="Mejor avance"
          valor={<span className="text-[18px]">{mejor ? mejor.v.nombre.split(" ")[0] : "—"}</span>}
          color="#1E9E6A"
          sub={mejor ? `${mejor.av.pctObjetivo}% del objetivo` : "sin datos"}
          subTono="up"
        />
        <StatTile
          label="En riesgo"
          valor={enRiesgo}
          color="#F2563A"
          sub="bajo objetivo o mix desalineado"
        />
        <StatTile
          label="Cierre promedio"
          valor={<>{cierrePromedio}%</>}
          color="#1E9E6A"
          icon={<TrendingUp size={14} />}
          sub="del equipo"
        />
      </div>

      <SectionTitle titulo="Vendedores" hint="Avance del mes por persona" />
      <div className="grid gap-4 lg:grid-cols-2">
        {filas.map(({ v, av, enRiesgo }) => {
          const estr = av.mix.find((m) => m.bucket === "estrategico")
          return (
            <Card key={v.id} className="p-[18px]">
              <div className="mb-3.5 flex items-center gap-3">
                <VAvatar iniciales={v.iniciales} className="size-10 text-[14px]" />
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold text-ink">{v.nombre}</div>
                  <div className="text-[11.5px] text-slate">{v.zona}</div>
                </div>
                <span
                  className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: (enRiesgo ? "#F2563A" : "#1E9E6A") + "1F",
                    color: enRiesgo ? "#F2563A" : "#1E9E6A",
                  }}
                >
                  {enRiesgo ? "En riesgo" : "Al día"}
                </span>
              </div>
              <GoalRow
                color={av.pctObjetivo >= 80 ? "#2F5BE6" : "#F2563A"}
                titulo="Reuniones efectivas"
                sub={`objetivo ${av.objetivo}`}
                value={av.efectivas}
                max={av.objetivo}
                objetivo={av.objetivo}
                figA={`${av.efectivas}`}
                figB={`/${av.objetivo}`}
              />
              <GoalRow
                color="#1E9E6A"
                titulo="Tasa de cierre"
                sub={`${av.cierres} cierres`}
                value={av.tasaCierre}
                max={100}
                figA={`${av.tasaCierre}%`}
              />
              <GoalRow
                color="#7A869C"
                titulo="Mix estratégico"
                sub={`objetivo ${estr?.objetivoPct ?? 0}%`}
                value={estr?.pct ?? 0}
                max={100}
                objetivo={estr?.objetivoPct}
                figA={`${estr?.pct ?? 0}%`}
              />
            </Card>
          )
        })}
      </div>

      {filas.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-[13px] text-slate">Todavía no hay vendedores cargados.</p>
          <Button variant="blue" className="mt-3" onClick={() => { setForm(VACIO); setErrForm(null); setAbierto(true) }}>
            <UserPlus /> Agregar el primero
          </Button>
        </Card>
      )}

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Nuevo vendedor">
        <form onSubmit={agregar} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Nombre</span>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="inp" placeholder="Nombre y apellido" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="inp" placeholder="persona@welivery.cl" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Zona</span>
            <input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} className="inp" placeholder="Santiago Centro" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Contraseña (opcional)</span>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="inp" placeholder="Dejá vacío para que se registre solo/a" autoComplete="off" />
            <span className="text-[11px] text-muted">Con contraseña le creás el acceso directo (requiere la Edge Function deployada). Vacío = solo la ficha; se registra con su email desde el login.</span>
          </label>

          {errForm && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{errForm}</div>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" variant="blue" disabled={guardando}>{guardando ? "Guardando…" : "Agregar"}</Button>
          </div>
        </form>
      </Modal>

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}
