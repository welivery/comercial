import { useMemo, useState } from "react"
import { Plus, Sparkles, Upload } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { BucketChip, SegmentoBadge } from "@/components/widgets"
import { CLIENTES, CONTEXTO_IA, VENDEDORES } from "@/data/mock"
import { MOTIVO_BAJA_LABEL, fmtEnvios, iniciales } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { MotivoBaja, SegmentoCliente } from "@/lib/types"

const MOTIVO_COLOR: Record<MotivoBaja, string> = {
  precio: "#F2563A",
  servicio: "#E0A52F",
  cerro: "#7A869C",
  deuda: "#DB3B3B",
  otro: "#7A869C",
}

type Filtro = "todos" | SegmentoCliente

export function AdminClientes() {
  const [filtro, setFiltro] = useState<Filtro>("todos")

  const counts = useMemo(() => {
    const c = { activo: 0, ex_cliente: 0, prospeccion: 0 } as Record<SegmentoCliente, number>
    for (const cl of CLIENTES) c[cl.segmento]++
    return c
  }, [])

  const filtrados = filtro === "todos" ? CLIENTES : CLIENTES.filter((c) => c.segmento === filtro)
  const nombreVendedor = (id: string | null) => VENDEDORES.find((v) => v.id === id)?.nombre.split(" ")[0]

  const chips: { key: Filtro; label: string; n: number; dot?: string }[] = [
    { key: "todos", label: "Todos", n: CLIENTES.length },
    { key: "activo", label: "Activos", n: counts.activo, dot: "#1E9E6A" },
    { key: "ex_cliente", label: "Ex-clientes", n: counts.ex_cliente, dot: "#F2563A" },
    { key: "prospeccion", label: "Prospección", n: counts.prospeccion, dot: "#2F5BE6" },
  ]

  return (
    <>
      <PageHead titulo="Base de clientes" descripcion="Clientes, bajas y prospección · alimenta al asistente de leads">
        <Button variant="outline">
          <Upload /> Importar CSV
        </Button>
        <Button variant="blue">
          <Plus /> Agregar cliente
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-success" /> Clientes activos
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-success tabular-nums">{counts.activo}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-coral" /> Ex-clientes
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-coral tabular-nums">{counts.ex_cliente}</div>
          <div className="mt-1.5 text-[11.5px] text-slate">con motivo de baja</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-blue" /> En prospección
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-blue tabular-nums">{counts.prospeccion}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <Sparkles size={14} className="text-mint" /> Contexto IA
          </div>
          <div className="mt-2 text-[16px] font-semibold leading-none text-success">Actualizado</div>
          <div className="mt-1.5 text-[11.5px] text-slate">{CONTEXTO_IA.actualizado_at}</div>
        </Card>
      </div>

      <div className="mb-3 mt-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFiltro(c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              filtro === c.key ? "bg-navy text-white" : "border border-input bg-white text-slate hover:bg-mist"
            )}
          >
            {c.dot && <span className="size-1.5 rounded-full" style={{ background: c.dot }} />}
            {c.label}
            <span className="tabular-nums opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5 font-medium">Empresa</th>
              <th className="px-4 py-2.5 font-medium">Segmento</th>
              <th className="px-4 py-2.5 font-medium">Envíos/mes</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Vendedor</th>
              <th className="px-4 py-2.5 font-medium">Motivo / nota</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c, idx) => (
              <tr key={c.id + idx} className="border-t border-border hover:bg-mist/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-mist text-[11px] font-semibold text-navy">
                      {iniciales(c.nombre)}
                    </span>
                    <span className="text-[13px] font-medium text-ink">{c.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SegmentoBadge segmento={c.segmento} />
                </td>
                <td className="px-4 py-3 text-[13px] tabular-nums text-ink">{fmtEnvios(c.envios_mes)}</td>
                <td className="px-4 py-3">
                  <BucketChip bucket={c.bucket} short />
                </td>
                <td className="px-4 py-3 text-[13px] text-slate">{nombreVendedor(c.vendedor_id) ?? "—"}</td>
                <td className="px-4 py-3 text-[12px] text-slate">
                  {c.motivo_baja && (
                    <span
                      className="mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ background: MOTIVO_COLOR[c.motivo_baja] + "1F", color: MOTIVO_COLOR[c.motivo_baja] }}
                    >
                      {MOTIVO_BAJA_LABEL[c.motivo_baja]}
                    </span>
                  )}
                  {c.nota}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <Sparkles size={16} className="shrink-0 text-blue" />
        <p className="leading-relaxed">
          Esta base es la materia prima de la IA: los <b className="font-semibold text-ink">motivos de baja</b>{" "}
          le permiten sugerir reconquistas en buen momento, y los activos/prospección evitan que sugiera
          clientes ya trabajados. El detalle de a quién proponer y cómo encarar se define en{" "}
          <b className="font-semibold text-ink">Contexto IA</b>.
        </p>
      </div>
    </>
  )
}
