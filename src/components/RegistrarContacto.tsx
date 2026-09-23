import { useEffect, useState } from "react"
import { AlarmClock, Handshake, Mail, MessageCircle, Phone } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { VAvatar } from "@/components/widgets"
import { useToast } from "@/components/Toast"
import {
  RESULTADO_CONTACTO_LABEL,
  TIPO_CONTACTO_EMOJI,
  TIPO_CONTACTO_LABEL,
  fetchContactos,
  registrarContacto,
} from "@/data/api"
import { msgError } from "@/lib/errors"
import { telHref, waHref } from "@/lib/contacto"
import { cn } from "@/lib/utils"
import type { LeadContacto, ResultadoContacto, TipoContacto } from "@/lib/types"

// Objetivo del contacto: lead u oportunidad, con lo mínimo para mostrar y guardar.
export interface ContactoTarget {
  origen: "lead" | "oportunidad"
  id: string
  clienteId: string | null
  titulo: string
  contacto: string | null
  telefono: string | null
  contactosPrevios?: number
}

const TIPOS: { k: TipoContacto; label: string; icon: React.ReactNode }[] = [
  { k: "llamada", label: "Llamada", icon: <Phone size={14} /> },
  { k: "whatsapp", label: "WhatsApp", icon: <MessageCircle size={14} /> },
  { k: "email", label: "Email", icon: <Mail size={14} /> },
  { k: "reunion", label: "Reunión", icon: <Handshake size={14} /> },
]
const RESULTADOS: { k: ResultadoContacto; label: string; tone: string }[] = [
  { k: "no_atendio", label: "No atendió", tone: "border-border text-slate" },
  { k: "dejo_mensaje", label: "Dejé mensaje", tone: "border-border text-slate" },
  { k: "hable", label: "Hablé", tone: "border-blue/40 text-blue" },
  { k: "interesado", label: "Interesado 👍", tone: "border-success/40 text-success" },
]
const SNOOZE: { d: number; label: string }[] = [
  { d: 0, label: "Sin posponer" },
  { d: 1, label: "Mañana" },
  { d: 3, label: "En 3 días" },
  { d: 7, label: "En 7 días" },
]

function fmtDia(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
}

/**
 * Modal único para registrar un contacto (llamada/WhatsApp/email/reunión) de un
 * lead u oportunidad. Se usa igual en "Buscar leads" y en "Seguimiento" para que
 * no diverjan. Guarda historial (lead_contactos), contadores, snooze y nota en la
 * empresa. `extra` = botones de "próximo paso" que aporta cada pantalla.
 */
export function RegistrarContacto({
  target,
  vendedorId,
  onClose,
  onRegistrado,
  extra,
}: {
  target: ContactoTarget | null
  vendedorId: string
  onClose: () => void
  onRegistrado: () => void
  extra?: React.ReactNode
}) {
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoContacto>("llamada")
  const [resultado, setResultado] = useState<ResultadoContacto | null>(null)
  const [nota, setNota] = useState("")
  const [snooze, setSnooze] = useState(0)
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<LeadContacto[]>([])

  // Reset + traer historial al abrir.
  useEffect(() => {
    if (!target) return
    setTipo("llamada")
    setResultado(null)
    setNota("")
    setSnooze(0)
    setSaving(false)
    setHistorial([])
    let vivo = true
    fetchContactos({ origen: target.origen, id: target.id })
      .then((h) => vivo && setHistorial(h))
      .catch(() => {})
    return () => { vivo = false }
  }, [target])

  async function guardar() {
    if (!target || !resultado) return
    setSaving(true)
    try {
      await registrarContacto({
        origen: target.origen,
        id: target.id,
        vendedorId,
        clienteId: target.clienteId,
        tipo,
        resultado,
        nota,
        snoozeDias: snooze,
        contactosPrevios: target.contactosPrevios ?? 0,
      })
      const t = target.titulo
      onRegistrado()
      onClose()
      toast.ok(`Contacto registrado — ${t}${snooze > 0 ? ` · vuelve ${SNOOZE.find((s) => s.d === snooze)?.label.toLowerCase()}` : ""}.`)
    } catch (e) {
      toast.error(msgError(e, "No se pudo registrar el contacto"))
      setSaving(false)
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title="Registrar contacto">
      {target && (
        <div className="flex flex-col gap-3.5">
          {/* Quién */}
          <div className="flex items-center gap-2.5 rounded-lg bg-mist/70 px-3 py-2.5">
            <VAvatar iniciales={(target.titulo || "—").slice(0, 2).toUpperCase()} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">{target.titulo}</div>
              {target.contacto && <div className="text-[12px] text-slate">{target.contacto}</div>}
            </div>
          </div>

          {/* Contacto directo */}
          {target.telefono ? (
            <div className="flex flex-wrap gap-2">
              <a href={telHref(target.telefono)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-blue/90">
                <Phone size={15} /> Llamar {target.telefono}
              </a>
              <a href={waHref(target.telefono)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
                <MessageCircle size={15} /> WhatsApp
              </a>
            </div>
          ) : (
            <p className="rounded-lg bg-[#FCF3E2] px-3 py-2 text-[12px] text-[#8a6416]">
              Sin teléfono cargado. Podés agregarlo en la ficha de la empresa.
            </p>
          )}

          {/* Tipo de contacto */}
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-slate">Tipo de contacto</div>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTipo(t.k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    tipo === t.k ? "border-navy bg-navy text-white" : "border-border bg-white text-slate hover:text-ink"
                  )}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resultado */}
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-slate">¿Qué pasó?</div>
            <div className="flex flex-wrap gap-1.5">
              {RESULTADOS.map((r) => (
                <button
                  key={r.k}
                  onClick={() => setResultado(r.k)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    resultado === r.k ? "border-navy bg-navy text-white" : cn("bg-white hover:text-ink", r.tone)
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nota */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Nota (opcional)</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="min-h-[56px] w-full resize-y rounded-lg border border-input px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
              placeholder="Ej: quedó en confirmar el jueves · pidió propuesta por mail…"
            />
          </label>

          {/* Volver a llamar */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate">
              <AlarmClock size={13} /> Volver a contactar
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SNOOZE.map((s) => (
                <button
                  key={s.d}
                  onClick={() => setSnooze(s.d)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    snooze === s.d ? "border-navy bg-navy text-white" : "border-border bg-white text-slate hover:text-ink"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Button variant="blue" disabled={!resultado || saving} onClick={guardar}>
            {saving ? "Guardando…" : "Guardar contacto"}
          </Button>

          {/* Próximo paso (lo aporta cada pantalla) */}
          {extra && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate">Próximo paso</div>
              <div className="flex flex-wrap gap-2">{extra}</div>
            </div>
          )}

          {/* Historial */}
          {historial.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate">
                Últimos contactos
              </div>
              <div className="flex flex-col gap-1">
                {historial.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-start gap-1.5 text-[12px] text-slate">
                    <span className="shrink-0 text-muted">{fmtDia(c.created_at)}</span>
                    <span>
                      {TIPO_CONTACTO_EMOJI[c.tipo]} {TIPO_CONTACTO_LABEL[c.tipo]} ({RESULTADO_CONTACTO_LABEL[c.resultado]})
                      {c.nota ? <span className="text-ink"> — {c.nota}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
