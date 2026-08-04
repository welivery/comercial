import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  Building2,
  Check,
  Globe,
  Lightbulb,
  Mail,
  MapPin,
  Phone,
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
  const [cargando, setCargando] = useState(false)
  const [yaBusco, setYaBusco] = useState(false)
  const [mock, setMock] = useState(false)
  const [errorIa, setErrorIa] = useState<string | null>(null)
  const [status, setStatus] = useState("Analizando…")
  const [creadas, setCreadas] = useState<Record<string, "creando" | "ok" | "error">>({})

  const sinVendedor = !vendedor.id
  const vivoRef = useRef(true)

  // La búsqueda con IA NUNCA se dispara sola (gasta tokens de la API): solo
  // corre cuando la persona aprieta el botón. Al cambiar de vendedor se limpian
  // los resultados anteriores, pero NO se vuelve a llamar.
  const generar = useCallback(async () => {
    if (!vendedor.id) return
    setCargando(true)
    setYaBusco(true)
    setStatus("Analizando…")
    try {
      const r = await generarLeads(vendedor.id, (m) => vivoRef.current && setStatus(m))
      if (!vivoRef.current) return
      setSugeridos(r.sugeridos)
      setIdeas(r.ideas)
      setMock(r.usandoMock)
      setErrorIa(r.error ?? null)
    } finally {
      if (vivoRef.current) setCargando(false)
    }
  }, [vendedor.id])

  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  // Al cambiar de vendedor, limpiar (sin llamar a la IA).
  useEffect(() => {
    setSugeridos([])
    setIdeas([])
    setYaBusco(false)
    setMock(false)
    setErrorIa(null)
    setCargando(false)
  }, [vendedor.id])

  async function crear(l: LeadSugerido) {
    setCreadas((m) => ({ ...m, [l.id]: "creando" }))
    try {
      await crearOportunidad({
        vendedor_id: vendedor.id,
        ecommerce: l.nombre,
        sitio: l.web ?? null,
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
            mes, y busco en la web e-commerces que encajan — priorizando el tipo de cliente que te falta.
          </p>
        </div>
        <Button
          onClick={generar}
          disabled={cargando || sinVendedor}
          className="ml-auto shrink-0 bg-mint text-navy hover:bg-mint/90"
        >
          <RefreshCw className={cargando ? "animate-spin" : undefined} />{" "}
          {cargando ? "Buscando…" : yaBusco ? "Buscar de nuevo" : "Buscar leads con IA"}
        </Button>
      </div>

      {cargando && !sinVendedor && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-blue/25 bg-[#EEF3FE] px-3.5 py-2.5 text-[12.5px] text-blue">
          <RefreshCw size={15} className="shrink-0 animate-spin" />
          <span className="font-medium">{status}</span>
          <span className="text-[11.5px] text-slate">— busca en la web en tiempo real, puede tardar hasta ~1 min.</span>
        </div>
      )}

      {sinVendedor && (
        <Card className="mt-4 p-6 text-center">
          <p className="text-[14px] font-semibold text-navy">Elegí o cargá un vendedor</p>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-slate">
            El asistente genera leads para un vendedor puntual (cruza su objetivo del mes y su base). Todavía no
            hay ninguno en el equipo. Agregá uno en{" "}
            <Link to="/vendedores" className="font-medium text-blue underline">
              Vendedores
            </Link>{" "}
            y volvé.
          </p>
        </Card>
      )}

      {!sinVendedor && !yaBusco && !cargando && (
        <Card className="mt-4 flex flex-col items-center p-8 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-mist">
            <Sparkles size={22} className="text-blue" />
          </span>
          <p className="mt-3 text-[15px] font-semibold text-navy">Buscá nuevos leads con IA</p>
          <p className="mx-auto mt-1.5 max-w-[56ch] text-[13px] text-slate">
            Al apretar el botón, la IA sale a buscar e-commerces chilenos reales en la web y te arma sugerencias
            con datos de contacto. Cada búsqueda usa la API de Claude (tiene un costo por uso), por eso se ejecuta
            solo cuando vos lo pedís.
          </p>
          <Button onClick={generar} variant="blue" className="mt-4">
            <Sparkles /> Buscar leads con IA
          </Button>
        </Card>
      )}

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

      {!sinVendedor && yaBusco && (
        <>
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

                  {/* Contacto real (cuando la IA lo encontró en la web) */}
                  {(l.web || l.telefono || l.email) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
                      {l.web && (
                        <a
                          href={l.web}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-blue hover:underline"
                        >
                          <Globe size={13} /> {l.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      )}
                      {l.telefono && (
                        <a
                          href={`tel:${l.telefono.replace(/\s/g, "")}`}
                          className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
                        >
                          <Phone size={13} /> {l.telefono}
                        </a>
                      )}
                      {l.email && (
                        <a
                          href={`mailto:${l.email}`}
                          className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
                        >
                          <Mail size={13} /> {l.email}
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted">
                    {l.fuentes.map((f, i) =>
                      f.url ? (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 hover:text-blue hover:underline"
                        >
                          {FUENTE_ICON[f.tipo]}
                          {f.detalle}
                        </a>
                      ) : (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          {FUENTE_ICON[f.tipo]}
                          {f.detalle}
                        </span>
                      )
                    )}
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
      )}
    </>
  )
}
