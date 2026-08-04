import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  Building2,
  Check,
  Globe,
  Lightbulb,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { BucketChip, SectionTitle } from "@/components/widgets"
import { useVentas } from "@/store"
import { crearOportunidad } from "@/data/api"
import { generarLeads, type FuenteLead, type IdeaConversacion, type LeadSugerido } from "@/data/leads"

const FUENTE_ICON: Record<FuenteLead["tipo"], React.ReactNode> = {
  maps: <MapPin size={13} />,
  web: <Globe size={13} />,
  social: <Star size={13} />,
  linkedin: <Building2 size={13} />,
  base: <Check size={13} />,
  tendencia: <TrendingUp size={13} />,
}

export function VendedorLeads() {
  const { vendedor } = useVentas()
  const [sugeridos, setSugeridos] = useState<LeadSugerido[]>([])
  const [ideas, setIdeas] = useState<IdeaConversacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [mock, setMock] = useState(false)
  const [errorIa, setErrorIa] = useState<string | null>(null)
  const [creadas, setCreadas] = useState<Record<string, "creando" | "ok" | "error">>({})

  const generar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await generarLeads(vendedor.id)
      setSugeridos(r.sugeridos)
      setIdeas(r.ideas)
      setMock(r.usandoMock)
      setErrorIa(r.error ?? null)
    } finally {
      setCargando(false)
    }
  }, [vendedor.id])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    generarLeads(vendedor.id).then((r) => {
      if (!vivo) return
      setSugeridos(r.sugeridos)
      setIdeas(r.ideas)
      setMock(r.usandoMock)
      setErrorIa(r.error ?? null)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [vendedor.id])

  async function crear(l: LeadSugerido) {
    setCreadas((m) => ({ ...m, [l.id]: "creando" }))
    try {
      await crearOportunidad({
        vendedor_id: vendedor.id,
        ecommerce: l.nombre,
        sitio: null,
        envios_aprox: 0,
        lugar_retiro: "",
        tipo_producto: "",
        interes: l.motivo.slice(0, 200),
        marca_reconocida: l.bucket === "estrategico",
        quiere_fulfillment: l.bucket === "fulfillment",
        origen: "ia",
      })
      setCreadas((m) => ({ ...m, [l.id]: "ok" }))
    } catch {
      setCreadas((m) => ({ ...m, [l.id]: "error" }))
    }
  }

  return (
    <>
      <PageHead titulo="Buscar leads" descripcion="Asistente de IA para prospección" />

      {/* Hero */}
      <div className="flex items-center gap-5 rounded-xl bg-gradient-to-br from-navy via-[#1d3a6b] to-[#123f52] p-6 text-white">
        <span className="grid size-[46px] shrink-0 place-items-center rounded-xl bg-mint/20">
          <Sparkles size={24} className="text-mint" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-white">Asistente de leads</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] text-[#c6d0e0]">
            Cruzo tu base (activos, ex-clientes y prospección), el contexto que cargó el admin y tu objetivo del
            mes para sugerirte e-commerces que encajan — priorizando el tipo de cliente que te falta.
          </p>
        </div>
        <Button
          onClick={generar}
          disabled={cargando}
          className="ml-auto shrink-0 bg-mint text-navy hover:bg-mint/90"
        >
          <RefreshCw className={cargando ? "animate-spin" : undefined} /> {cargando ? "Analizando…" : "Regenerar"}
        </Button>
      </div>

      {mock && !cargando && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-[#FCF3E2] p-3 text-[12px] text-[#8a6416]">
          <Sparkles size={15} className="mt-0.5 shrink-0" />
          <div className="leading-relaxed">
            <p>
              Estás viendo <b>sugerencias de demostración</b>. Para generar leads reales con IA hay que deployar la
              Edge Function <code className="rounded bg-black/5 px-1">leads-ia</code> y cargar la key de Anthropic
              (ver <code className="rounded bg-black/5 px-1">supabase/functions/README.md</code>).
            </p>
            {errorIa && (
              <p className="mt-1.5 font-medium">
                Detalle del error: <span className="font-normal">{errorIa}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <SectionTitle titulo="Nuevos potenciales sugeridos" hint="Priorizados por tu mezcla faltante" />
      {cargando ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex animate-pulse gap-3.5 p-4">
              <span className="size-[42px] shrink-0 rounded-[10px] bg-mist" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-mist" />
                <div className="h-3 w-full rounded bg-mist" />
                <div className="h-3 w-2/3 rounded bg-mist" />
              </div>
            </Card>
          ))}
        </div>
      ) : sugeridos.length === 0 ? (
        <Card className="p-6 text-center text-[13px] text-slate">
          No se generaron sugerencias. Probá <b>Regenerar</b> o cargá más contexto en Configuración.
        </Card>
      ) : (
        <div className="grid gap-3">
          {sugeridos.map((l) => {
            const estado = creadas[l.id]
            return (
              <Card key={l.id} className="flex gap-3.5 p-4">
                <span
                  className={
                    "grid size-[42px] shrink-0 place-items-center rounded-[10px] text-[15px] font-semibold " +
                    (l.reconquista ? "bg-[#FBEFD4] text-[#a5741a]" : "bg-mist text-navy")
                  }
                >
                  {l.iniciales}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    {l.nombre}
                    <BucketChip bucket={l.bucket} />
                    {l.reconquista ? (
                      <span className="rounded-full bg-[#FBEFD4] px-2 py-0.5 text-[11px] font-semibold text-[#a5741a]">
                        Ex-cliente · reconquista
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#DFF2E9] px-2 py-0.5 text-[11px] font-semibold text-success">
                        {l.fit}% fit
                      </span>
                    )}
                  </h4>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate">{l.motivo}</p>
                  <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted">
                    {l.fuentes.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        {FUENTE_ICON[f.tipo]}
                        {f.detalle}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  {estado === "ok" ? (
                    <Button asChild variant="outline" size="sm" className="text-success">
                      <Link to="/pipeline">
                        <Check /> En pipeline
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="blue" size="sm" disabled={estado === "creando"} onClick={() => crear(l)}>
                      <Plus /> {estado === "creando" ? "Creando…" : "Crear oportunidad"}
                    </Button>
                  )}
                  {estado === "error" && <span className="text-center text-[11px] text-error">No se pudo crear</span>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <SectionTitle titulo="Ideas de conversación" hint="Para prospectos con reunión próxima o seguimiento activo" />
      {!cargando && ideas.length === 0 ? (
        <Card className="p-6 text-center text-[13px] text-slate">
          Sin ideas por ahora — aparecen cuando tenés oportunidades con reunión coordinada o en seguimiento.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ideas.map((idea) => (
            <Card key={idea.oportunidad} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#FDE5E0] text-[11px] font-semibold text-coral">
                  {idea.oportunidad.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    {idea.oportunidad}
                    <BucketChip bucket={idea.bucket} />
                  </div>
                  <div className="text-[11.5px] text-slate">{idea.contexto}</div>
                </div>
              </div>
              <div className="px-4 py-3.5">
                {idea.angulos.map((a, i) => (
                  <div key={i} className="flex gap-2.5 border-b border-dashed border-border py-2.5 last:border-b-0">
                    <Lightbulb size={15} className="mt-0.5 shrink-0 text-[#0F9D8F]" />
                    <p className="text-[12.5px] leading-relaxed text-slate">
                      <b className="font-semibold text-ink">{a.titulo}:</b> {a.texto}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <Sparkles size={16} className="shrink-0 text-blue" />
        <p className="leading-relaxed">
          Las sugerencias se generan con IA sobre fuentes públicas (Google Maps, sitios, redes) cruzadas con
          tu base. <b className="font-semibold text-ink">Siempre revisá antes de contactar.</b> Cada lead
          aceptado nace como oportunidad con su bucket ya asignado.
        </p>
      </div>
    </>
  )
}
