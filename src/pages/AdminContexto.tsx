import { useEffect, useState } from "react"
import { Check, Pencil, Plus, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { Cargando, ErrorMsg, SectionTitle, VAvatar } from "@/components/widgets"
import { useContexto, useVendedores } from "@/hooks/useData"
import { cn } from "@/lib/utils"
import type { FuenteIA } from "@/lib/types"

export function AdminContexto() {
  const { data: contexto, loading, error } = useContexto()
  const { data: vendedores } = useVendedores()
  const vends = vendedores ?? []
  const [general, setGeneral] = useState("")
  const [editando, setEditando] = useState(false)
  const [fuentes, setFuentes] = useState<FuenteIA[]>([])

  useEffect(() => {
    if (contexto) {
      setGeneral(contexto.general)
      setFuentes(contexto.fuentes)
    }
  }, [contexto])

  const toggleFuente = (key: string) =>
    setFuentes((fs) => fs.map((f) => (f.key === key ? { ...f, activa: !f.activa } : f)))

  if (loading) return <Cargando que="el contexto" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Contexto IA" descripcion="Lo que la IA usa para recomendar mejor" />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-[#E7EDFC] p-3.5 text-[13px] text-blue">
        <Sparkles size={17} className="mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          Todo lo que cargues acá alimenta al <b className="font-semibold">Asistente de leads</b> de cada
          vendedor: define a quién sugerir, qué priorizar y cómo encarar la conversación. Cuanto más
          específico, mejores las recomendaciones.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Contexto general */}
        <Card className="p-[18px]">
          <h2 className="text-[15px] font-semibold text-navy">Contexto general del negocio</h2>
          <p className="mb-3.5 mt-0.5 text-xs text-slate">
            Propuesta de valor, diferenciales, zonas y tarifas de referencia
          </p>
          {editando ? (
            <textarea
              value={general}
              onChange={(e) => setGeneral(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-[10px] border border-input bg-mist/60 p-4 text-[13px] leading-relaxed text-slate outline-none focus:border-blue"
            />
          ) : (
            <div className="whitespace-pre-line rounded-[10px] border border-input bg-mist/60 p-4 text-[13px] leading-relaxed text-slate">
              {general}
            </div>
          )}
          <div className="mt-3.5 flex gap-2">
            <Button variant="blue" onClick={() => setEditando(false)}>
              <Check /> Guardar contexto
            </Button>
            <Button variant="outline" onClick={() => setEditando((e) => !e)}>
              <Pencil /> {editando ? "Cancelar" : "Editar"}
            </Button>
          </div>
        </Card>

        <div className="grid gap-4">
          {/* Fuentes */}
          <Card className="p-[18px]">
            <h2 className="text-[14px] font-semibold text-navy">Fuentes que puede usar la IA</h2>
            <p className="mb-3 mt-0.5 text-xs text-slate">Dónde busca nuevos potenciales</p>
            <div className="flex flex-col">
              {fuentes.map((f) => (
                <div key={f.key} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                  <span className="flex-1 text-[13px] text-ink">{f.label}</span>
                  <button
                    onClick={() => toggleFuente(f.key)}
                    role="switch"
                    aria-checked={f.activa}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      f.activa ? "bg-success" : "bg-cloud"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all",
                        f.activa ? "left-[18px]" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* Reglas */}
          <Card className="p-[18px]">
            <h2 className="text-[14px] font-semibold text-navy">Reglas y a evitar</h2>
            <p className="mb-3 mt-0.5 text-xs text-slate">Guardarraíles para las sugerencias</p>
            <div className="flex flex-col gap-2.5 text-[12.5px] text-slate">
              {(contexto?.reglas ?? []).map((r, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className={cn("shrink-0 font-semibold", r.tipo === "evitar" ? "text-error" : "text-success")}>
                    {r.tipo === "evitar" ? "✕" : "✓"}
                  </span>
                  {r.texto}
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-3.5 w-full">
              <Plus /> Agregar regla
            </Button>
          </Card>
        </div>
      </div>

      <SectionTitle titulo="Contexto por vendedor" hint="Notas específicas que ajustan las sugerencias de cada uno" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(contexto?.por_vendedor ?? []).map((cv) => {
          const v = vends.find((x) => x.id === cv.vendedor_id)
          if (!v) return null
          return (
            <Card key={cv.vendedor_id} className="p-[18px]">
              <div className="mb-3 flex items-center gap-3">
                <VAvatar iniciales={v.iniciales} />
                <div className="leading-tight">
                  <div className="text-[13px] font-semibold text-ink">{v.nombre}</div>
                  <div className="text-[11.5px] text-slate">{v.zona}</div>
                </div>
                <span className="ml-auto rounded-md bg-[#E7EDFC] px-2 py-0.5 text-[11px] font-medium text-blue">
                  Foco: {cv.foco}
                </span>
              </div>
              <div className="rounded-[9px] border border-input bg-mist/60 p-3.5 text-[12.5px] leading-relaxed text-slate">
                {cv.texto}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
