import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Ban, CheckCircle2, Flame, PartyPopper, Phone, PhoneOutgoing, Plus, Send, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/Modal"
import { PageHead } from "@/components/PageHead"
import { BucketChip, Cargando, VAvatar } from "@/components/widgets"
import { useToast } from "@/components/Toast"
import { useVentas } from "@/store"
import { useInscripciones, useLeads, useOportunidades, useSecuencias } from "@/hooks/useData"
import { inscribir, marcarContactado, rechazarLead } from "@/data/api"
import { msgError } from "@/lib/errors"
import { ESTADO_LABEL, MOTIVOS_RECHAZO } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { EstadoOportunidad, Lead, MotivoRechazo, Oportunidad, Secuencia, SecuenciaInscripcion, SecuenciaObjetivo } from "@/lib/types"

// ── Umbrales (defaults sensatos; configurables por el admin más adelante) ──────
const DIAS_REINTENTO = 3 // días desde el último contacto para volver a estar "pendiente"
const DIAS_ENFRIANDO = 7 // un lead sin tocar tanto tiempo ya se está enfriando
const UMBRAL_OP: Record<EstadoOportunidad, number> = {
  interesado: 4,
  reunion_coordinada: 3,
  reunion_efectiva: 7,
  propuesta_enviada: 7,
  seguimiento: 5,
  cierre_ganado: 9999,
  perdido: 9999,
}

type Tipo = "respondio" | "contactado" | "sin_tocar" | "op" | "en_curso"

const TIPO_META: Record<Tipo, { label: string; color: string; bg: string }> = {
  respondio: { label: "Te respondió", color: "#1E9E6A", bg: "#DFF2E9" },
  op: { label: "Oportunidad frenada", color: "#E0A52F", bg: "#FCF3E2" },
  contactado: { label: "Contactado sin rta", color: "#a5741a", bg: "#FCF3E2" },
  sin_tocar: { label: "Sin tocar", color: "#2F5BE6", bg: "#EEF3FE" },
  en_curso: { label: "En secuencia (auto)", color: "#5A6577", bg: "#F1F3F7" },
}

interface Item {
  key: string
  tipo: Tipo
  prioridad: number // menor = más urgente
  origen: "lead" | "oportunidad"
  lead?: Lead
  op?: Oportunidad
  titulo: string
  detalle: string // qué falta hacer, en una línea
  dias: number
  importante: boolean
  telefono: string | null
}

function dias(iso?: string | null): number {
  if (!iso) return 0
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : 0
}
function extraerTel(t?: string | null): string | null {
  const m = (t ?? "").match(/(\+?56\s?9(?:\s?\d){8}|9\d{8})/)
  return m ? m[0].trim() : null
}
function extraerEmail(t?: string | null): string | null {
  const m = (t ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return m ? m[0] : null
}
// Secuencia sugerida según el tipo de seguimiento: "sin tocar" → prospección
// (primer contacto), "contactado sin rta" → reactivación (re-contacto).
const OBJETIVO_POR_TIPO: Partial<Record<Tipo, SecuenciaObjetivo>> = {
  sin_tocar: "prospeccion",
  contactado: "reactivacion",
}
function haceDias(n: number): string {
  return n < 1 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`
}

export function VendedorSeguimiento() {
  const { vendedor, rol, vendedores, verVendedorId, setVerVendedorId, sinPerfil } = useVentas()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: leadsData, loading, reload } = useLeads(vendedor.id)
  const { data: inscData, reload: reloadInsc } = useInscripciones(vendedor.id)
  const { data: opsData } = useOportunidades(vendedor.id)
  const { data: secuenciasData } = useSecuencias(vendedor.id)

  const leads = useMemo(() => leadsData ?? [], [leadsData])
  const ops = useMemo(() => opsData ?? [], [opsData])
  const seqActivas = useMemo<Secuencia[]>(() => (secuenciasData ?? []).filter((s) => s.activo), [secuenciasData])
  // Secuencia sugerida para un tipo: la primera activa del objetivo que le
  // corresponde; si no hay, cualquiera activa (para no bloquear el seguimiento).
  function sugeridaPara(tipo: Tipo): Secuencia | null {
    const obj = OBJETIVO_POR_TIPO[tipo]
    return seqActivas.find((s) => s.objetivo === obj) ?? seqActivas[0] ?? null
  }
  const inscByLead = useMemo(() => {
    const m = new Map<string, SecuenciaInscripcion>()
    for (const i of inscData ?? []) if (i.lead_id && !m.has(i.lead_id)) m.set(i.lead_id, i)
    return m
  }, [inscData])

  const [filtro, setFiltro] = useState<Tipo | "todos">("todos")
  const [regContacto, setRegContacto] = useState<string | null>(null)

  // Modal "Rechazar / descartar" el lead (con motivo + nota).
  const [rechLead, setRechLead] = useState<Lead | null>(null)
  const [rechMotivo, setRechMotivo] = useState<MotivoRechazo>("no_interesado")
  const [rechNota, setRechNota] = useState("")
  const [rechSaving, setRechSaving] = useState(false)

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []

    // ── Leads (solo los sin clasificar) ──
    for (const l of leads) {
      if (l.estado !== "nuevo") continue
      const insc = inscByLead.get(l.id)
      const respondio = !!insc && (insc.estado === "respondio" || insc.pendiente_humano)
      const enSecViva = !!insc && (insc.estado === "activa" || insc.estado === "pausada")
      const tel = l.telefono ?? extraerTel(l.motivo)
      const importante =
        l.bucket === "estrategico" || l.bucket === "fulfillment" || l.reconquista || l.fit >= 70

      if (respondio) {
        out.push({
          key: `l-${l.id}`, tipo: "respondio", prioridad: 0, origen: "lead", lead: l,
          titulo: l.nombre, detalle: "Te contestó — clasificalo a oportunidad o descartalo.",
          dias: dias(insc?.respuesta_at ?? insc?.ultimo_envio_at), importante, telefono: tel,
        })
      } else if (enSecViva) {
        out.push({
          key: `l-${l.id}`, tipo: "en_curso", prioridad: 8, origen: "lead", lead: l,
          titulo: l.nombre, detalle: "En secuencia automática, esperando respuesta.",
          dias: dias(insc?.ultimo_envio_at ?? l.created_at), importante, telefono: tel,
        })
      } else if (l.contactos_intentos > 0) {
        const d = dias(l.ultimo_contacto_at)
        if (d < DIAS_REINTENTO) continue // contactado hace poco → todavía no toca
        out.push({
          key: `l-${l.id}`, tipo: "contactado", prioridad: importante ? 1 : 3, origen: "lead", lead: l,
          titulo: l.nombre,
          detalle: importante ? "Importante y sin respuesta — conviene llamar." : `${l.contactos_intentos} intento(s) sin respuesta — reintentá.`,
          dias: d, importante, telefono: tel,
        })
      } else {
        const d = dias(l.created_at)
        out.push({
          key: `l-${l.id}`, tipo: "sin_tocar", prioridad: importante ? 2 : d >= DIAS_ENFRIANDO ? 4 : 5, origen: "lead", lead: l,
          titulo: l.nombre,
          detalle: d >= DIAS_ENFRIANDO ? "Enfriándose — hacé el primer contacto ya." : "Todavía sin contactar — primer toque.",
          dias: d, importante, telefono: tel,
        })
      }
    }

    // ── Oportunidades activas (frenadas) ──
    for (const o of ops) {
      if (o.estado === "cierre_ganado" || o.estado === "perdido") continue
      const ref = Math.max(
        Date.parse(o.declarada_at) || 0,
        o.reunion_coordinada_at ? Date.parse(o.reunion_coordinada_at) : 0,
        o.reunion_efectiva_at ? Date.parse(o.reunion_efectiva_at) : 0
      )
      const d = Math.max(0, Math.floor((Date.now() - ref) / 86400000))
      if (d < (UMBRAL_OP[o.estado] ?? 5)) continue
      const importante = o.bucket === "estrategico" || o.bucket === "fulfillment" || o.envios_aprox >= 500
      const queFalta: Partial<Record<EstadoOportunidad, string>> = {
        interesado: "Sin avance — coordiná una reunión.",
        reunion_coordinada: "Reunión pendiente de concretar — reconfirmá.",
        reunion_efectiva: "Tuvo reunión — mandá la propuesta.",
        propuesta_enviada: "Propuesta sin respuesta — hacé seguimiento.",
        seguimiento: "En seguimiento hace rato — empujá al cierre.",
      }
      out.push({
        key: `o-${o.id}`, tipo: "op", prioridad: importante ? 1 : 2, origen: "oportunidad", op: o,
        titulo: o.ecommerce, detalle: queFalta[o.estado] ?? "Necesita un empuje.", dias: d, importante,
        telefono: null,
      })
    }

    return out.sort((a, b) => a.prioridad - b.prioridad || b.dias - a.dias)
  }, [leads, ops, inscByLead])

  const accionables = useMemo(() => items.filter((i) => i.tipo !== "en_curso"), [items])
  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: accionables.length }
    for (const i of items) c[i.tipo] = (c[i.tipo] ?? 0) + 1
    return c
  }, [items, accionables])

  const visibles = useMemo(
    () => (filtro === "todos" ? accionables : items.filter((i) => i.tipo === filtro)),
    [filtro, accionables, items]
  )

  async function registrarContacto(l: Lead) {
    setRegContacto(l.id)
    try {
      await marcarContactado(l.id, l.contactos_intentos)
      reload()
    } catch (e) {
      toast.error(msgError(e, "No se pudo registrar"))
    } finally {
      setRegContacto(null)
    }
  }

  function abrirRechazo(l: Lead) {
    setRechLead(l)
    setRechMotivo("no_interesado")
    setRechNota("")
  }
  async function confirmarRechazo(e: React.FormEvent) {
    e.preventDefault()
    if (!rechLead) return
    setRechSaving(true)
    try {
      await rechazarLead(rechLead.id, rechMotivo, rechNota)
      const nombre = rechLead.nombre
      setRechLead(null)
      reload()
      toast.ok(`${nombre} descartado. Ya no aparece en seguimiento.`)
    } catch (err) {
      toast.error(msgError(err, "No se pudo rechazar"))
    } finally {
      setRechSaving(false)
    }
  }

  const [siguiendo, setSiguiendo] = useState<string | null>(null)
  // Un click: inscribe al lead en la secuencia sugerida (seguimiento automático).
  // Si no tiene email cargado, manda a Leads a completarlo (modal de inscripción).
  async function hacerSeguimiento(l: Lead, tipo: Tipo) {
    const seq = sugeridaPara(tipo)
    if (!seq) {
      toast.error("No tenés secuencias activas. Creá una en Secuencias de email.")
      navigate("/secuencias")
      return
    }
    const email = l.email ?? extraerEmail(l.motivo)
    if (!email) {
      navigate(`/leads?seguir=${l.id}`)
      return
    }
    setSiguiendo(l.id)
    try {
      await inscribir({
        secuencia_id: seq.id,
        vendedor_id: vendedor.id,
        lead_id: l.id,
        destinatario_nombre: l.contacto || l.nombre,
        destinatario_empresa: l.nombre,
        destinatario_email: email,
      })
      reloadInsc()
      toast.ok(`${l.nombre} entró en “${seq.nombre}”. Sale el primer mail solo.`)
    } catch (e) {
      toast.error(msgError(e, "No se pudo poner en seguimiento"))
    } finally {
      setSiguiendo(null)
    }
  }

  const CHIPS: { k: Tipo | "todos"; label: string }[] = [
    { k: "todos", label: "Todo pendiente" },
    { k: "respondio", label: "🔥 Te respondió" },
    { k: "op", label: "Oportunidad frenada" },
    { k: "contactado", label: "Contactado sin rta" },
    { k: "sin_tocar", label: "Sin tocar" },
    { k: "en_curso", label: "En secuencia" },
  ]

  if (sinPerfil) {
    return (
      <>
        <PageHead titulo="Seguimiento" descripcion="Tu día: no dejes ningún lead sin cerrar" />
        <Card className="mt-4 p-6 text-center text-[13px] text-slate">
          Tu usuario todavía no está vinculado a un vendedor. Pedile al admin que te asocie.
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead titulo="Seguimiento" descripcion="Tu día: no dejes ningún lead sin cerrar">
        {rol === "admin" && vendedores.length > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-slate">
            De
            <select
              value={verVendedorId ?? vendedor.id}
              onChange={(e) => setVerVendedorId(e.target.value)}
              className="rounded-lg border border-input bg-white px-3 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-blue"
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          </label>
        )}
      </PageHead>

      {loading ? (
        <Cargando que="tu seguimiento" />
      ) : accionables.length === 0 ? (
        <Card className="mt-4 flex flex-col items-center p-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#DFF2E9]">
            <PartyPopper size={26} className="text-success" />
          </span>
          <p className="mt-4 text-[16px] font-semibold text-navy">¡Bandeja en cero! 🎉</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-slate">
            No tenés seguimientos pendientes. Todos tus leads y oportunidades están al día. Sumá más desde{" "}
            <Link to="/leads" className="font-medium text-blue underline">Buscar leads</Link>.
          </p>
        </Card>
      ) : (
        <>
          {/* Resumen / game */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-br from-navy via-[#1d3a6b] to-[#123f52] p-4 text-white">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/20">
              <Flame size={22} className="text-mint" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">
                Tenés {accionables.length} seguimiento{accionables.length === 1 ? "" : "s"} para hacer
              </div>
              <p className="mt-0.5 text-[12.5px] text-[#c6d0e0]">
                Trabajá de arriba hacia abajo hasta dejar la bandeja en cero. Los{" "}
                <b className="text-white">🔥 importantes</b> primero.
              </p>
            </div>
            {counts["respondio"] > 0 && (
              <div className="rounded-lg bg-white/10 px-3 py-1.5 text-center">
                <div className="text-[18px] font-semibold text-mint">{counts["respondio"]}</div>
                <div className="text-[10px] uppercase tracking-wide text-[#c6d0e0]">te respondieron</div>
              </div>
            )}
          </div>

          {/* Filtros por tipo */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CHIPS.filter((c) => c.k === "todos" || (counts[c.k] ?? 0) > 0).map((c) => (
              <button
                key={c.k}
                onClick={() => setFiltro(c.k)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  filtro === c.k ? "border-navy bg-navy text-white" : "border-border bg-white text-slate hover:text-ink"
                )}
              >
                {c.label} <span className="tabular-nums opacity-70">{counts[c.k] ?? 0}</span>
              </button>
            ))}
          </div>

          {/* Lista */}
          <div className="mt-3 flex flex-col gap-2.5">
            {visibles.map((it) => {
              const meta = TIPO_META[it.tipo]
              const l = it.lead
              const o = it.op
              return (
                <Card
                  key={it.key}
                  className={cn(
                    "flex flex-wrap items-center gap-3 p-3.5",
                    it.importante && it.tipo !== "en_curso" && "ring-1 ring-coral/40"
                  )}
                >
                  <VAvatar iniciales={(it.titulo || "—").slice(0, 2).toUpperCase()} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-ink">{it.titulo}</span>
                      {l && <BucketChip bucket={l.bucket} short />}
                      {o && <BucketChip bucket={o.bucket} short />}
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {it.tipo === "op" ? ESTADO_LABEL[o!.estado] : meta.label}
                      </span>
                      {it.importante && it.tipo !== "en_curso" && (
                        <span className="rounded-full bg-[#FDE7E1] px-1.5 py-0.5 text-[10.5px] font-semibold text-coral">
                          🔥 Importante
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-slate">
                      <span>{it.detalle}</span>
                      <span className="text-muted">· {haceDias(it.dias)}</span>
                    </div>
                    {/* Recomendación de llamada en importantes con teléfono */}
                    {it.importante && it.telefono && (it.tipo === "contactado" || it.tipo === "respondio") && (
                      <a
                        href={`tel:${it.telefono.replace(/\s/g, "")}`}
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-[#FDE7E1] px-2 py-1 text-[12px] font-semibold text-coral hover:bg-[#fbd9cf]"
                      >
                        <Phone size={13} /> Llamá ahora — {it.telefono}
                      </a>
                    )}
                  </div>

                  {/* Acciones según el tipo */}
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {o ? (
                      <Button size="sm" variant="blue" onClick={() => navigate(`/pipeline/${o.id}`)}>
                        Abrir ficha
                      </Button>
                    ) : l ? (
                      <>
                        {it.tipo === "respondio" ? (
                          <>
                            <Button size="sm" variant="blue" onClick={() => navigate(`/leads?convertir=${l.id}`)}>
                              <Plus /> A oportunidad
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => navigate("/secuencias")}>
                              Ver charla
                            </Button>
                          </>
                        ) : (
                          <>
                            {it.telefono && (
                              <a
                                href={`tel:${it.telefono.replace(/\s/g, "")}`}
                                title="Llamar"
                                className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                              >
                                <Phone size={15} />
                              </a>
                            )}
                            <button
                              onClick={() => registrarContacto(l)}
                              disabled={regContacto === l.id}
                              title="Registrar contacto (sin respuesta)"
                              className="grid size-8 place-items-center rounded-md text-[#a5741a] hover:bg-[#FCF3E2] disabled:opacity-50"
                            >
                              <PhoneOutgoing size={15} />
                            </button>
                            {(it.tipo === "sin_tocar" || it.tipo === "contactado") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={siguiendo === l.id}
                                title={
                                  sugeridaPara(it.tipo)
                                    ? `Seguimiento automático · secuencia “${sugeridaPara(it.tipo)!.nombre}”`
                                    : "Configurá una secuencia activa"
                                }
                                onClick={() => hacerSeguimiento(l, it.tipo)}
                              >
                                <Send /> {siguiendo === l.id ? "Poniendo…" : "Hacer seguimiento"}
                              </Button>
                            )}
                            <Button size="sm" variant="blue" onClick={() => navigate(`/leads?convertir=${l.id}`)}>
                              <Plus /> Oportunidad
                            </Button>
                          </>
                        )}
                        <button
                          onClick={() => abrirRechazo(l)}
                          title="Rechazar / descartar (no contesta, no le interesa…)"
                          className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error"
                        >
                          <Ban size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* En secuencia (automático) — visible solo con su filtro, tranquilizador */}
          {filtro === "en_curso" && visibles.length === 0 && (
            <Card className="mt-2 flex items-center gap-2 p-4 text-[13px] text-slate">
              <CheckCircle2 size={16} className="text-success" /> No hay nada corriendo en secuencia ahora.
            </Card>
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-blue" />
            <p className="leading-relaxed">
              El objetivo es simple: <b className="text-ink">cerrar cada lead</b> — avanzándolo a oportunidad o
              descartándolo con motivo. Nada debería quedarse sin próximo paso. (Pronto: seguimiento automático
              sugerido por tipo y racha diaria.)
            </p>
          </div>
        </>
      )}

      {/* Modal: rechazar / descartar el lead con motivo */}
      <Modal open={!!rechLead} onClose={() => setRechLead(null)} title="Rechazar lead">
        {rechLead && (
          <form onSubmit={confirmarRechazo} className="flex flex-col gap-3.5">
            <p className="rounded-lg bg-mist/70 px-3 py-2 text-[12px] text-slate">
              Descartás a <b className="text-ink">{rechLead.nombre}</b>. Sale del seguimiento y no se vuelve a
              contactar. Queda el motivo en su historial.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Motivo del rechazo</span>
              <select
                value={rechMotivo}
                onChange={(e) => setRechMotivo(e.target.value as MotivoRechazo)}
                className="rounded-lg border border-input bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
              >
                {MOTIVOS_RECHAZO.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Comentario (opcional)</span>
              <textarea
                value={rechNota}
                onChange={(e) => setRechNota(e.target.value)}
                className="min-h-[70px] w-full resize-y rounded-lg border border-input px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
                placeholder="Ej: no contesta hace 3 llamados · dijo que ya tiene courier · pidió no contactar…"
              />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRechLead(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="blue" disabled={rechSaving}>
                {rechSaving ? "Guardando…" : "Rechazar"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
