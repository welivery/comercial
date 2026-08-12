import { useEffect, useState } from "react"
import { Bot, Check, ListChecks, Send, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfigSecuencias, useSecuenciasCompartidas } from "@/hooks/useData"
import { guardarConfigSecuencias } from "@/data/api"
import { msgError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { ConfigSecuencias } from "@/lib/types"

// Panel de admin: prende/apaga el envío automático y la clasificación de
// respuestas con IA. Todo arranca apagado (no envía ni gasta IA hasta acá).
export function ConfigAutomatizacion() {
  const { data, loading } = useConfigSecuencias()
  const { data: compartidas } = useSecuenciasCompartidas()
  const [cfg, setCfg] = useState<ConfigSecuencias | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (data) setCfg(data)
  }, [data])

  async function guardar() {
    if (!cfg) return
    setGuardando(true)
    setErr(null)
    try {
      await guardarConfigSecuencias(cfg)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e) {
      setErr(msgError(e, "No se pudo guardar"))
    } finally {
      setGuardando(false)
    }
  }

  if (loading || !cfg) return null

  return (
    <Card className="mb-4 flex flex-col gap-4 p-[18px]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EAFBF5]">
          <Sparkles size={18} className="text-mint" />
        </span>
        <div>
          <h2 className="text-[14px] font-semibold text-navy">Automatización (admin)</h2>
          <p className="text-[12px] text-slate">Controlá el envío automático y qué hace la IA con las respuestas.</p>
        </div>
      </div>

      <Fila
        icon={<Send size={16} className="text-blue" />}
        titulo="Envío automático"
        detalle="Manda los mails de cada secuencia según sus tiempos, desde la casilla de cada vendedor. Frena solo cuando el contacto responde."
        on={cfg.envio_activo}
        onToggle={() => setCfg({ ...cfg, envio_activo: !cfg.envio_activo })}
      />

      {cfg.envio_activo && (
        <div className="ml-1 flex flex-col gap-3 rounded-xl bg-mist/50 p-3.5 text-[12.5px] text-ink sm:flex-row sm:items-center sm:gap-6">
          <label className="flex items-center gap-2">
            Máximo por día por casilla:
            <input
              type="number"
              min={1}
              value={cfg.max_dia_casilla}
              onChange={(e) => setCfg({ ...cfg, max_dia_casilla: Number(e.target.value) })}
              className="w-[72px] rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-blue"
            />
          </label>
          <label className="flex items-center gap-2">
            Esperar entre mails:
            <input
              type="number"
              min={0}
              value={cfg.min_minutos}
              onChange={(e) => setCfg({ ...cfg, min_minutos: Number(e.target.value) })}
              className="w-[64px] rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-blue"
            />
            min
          </label>
          <span className="text-[11.5px] text-slate">Protege la reputación del dominio y evita el spam.</span>
        </div>
      )}

      <Fila
        icon={<Bot size={16} className="text-blue" />}
        titulo="Clasificar respuestas con IA"
        detalle="Cuando alguien responde, la IA lee el mail una vez y decide si es interés, no, o duda. Tiene costo por respuesta (acotado, con tope mensual)."
        on={cfg.ia_activa}
        onToggle={() => setCfg({ ...cfg, ia_activa: !cfg.ia_activa })}
      />

      {cfg.ia_activa && (
        <div className="ml-1 flex flex-col gap-3 rounded-xl bg-mist/50 p-3.5">
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-ink">¿Cuánta autonomía tiene la IA?</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AutoOpcion
                sel={cfg.ia_autonomia === "sugiere"}
                onClick={() => setCfg({ ...cfg, ia_autonomia: "sugiere" })}
                titulo="Sugiere y el vendedor confirma"
                detalle="La IA propone; el vendedor decide con 1 click."
              />
              <AutoOpcion
                sel={cfg.ia_autonomia === "auto_claros"}
                onClick={() => setCfg({ ...cfg, ia_autonomia: "auto_claros" })}
                titulo="Auto en casos clarísimos"
                detalle="Si está muy segura: 'no' → rechaza el lead; interés → lo deja listo para pasar a oportunidad. Lo dudoso queda para el vendedor."
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            Tope de respuestas por mes:
            <input
              type="number"
              min={0}
              value={cfg.ia_limite_mensual}
              onChange={(e) => setCfg({ ...cfg, ia_limite_mensual: Number(e.target.value) })}
              className="w-[90px] rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] tabular-nums text-ink outline-none focus:border-blue"
            />
            <span className="text-[11.5px] text-slate">(control de costo)</span>
          </label>
        </div>
      )}

      <Fila
        icon={<ListChecks size={16} className="text-blue" />}
        titulo="Seguimiento automático de leads"
        detalle="Inscribe solo, en la secuencia elegida, a los leads 'sin tocar' (nuevos, sin contacto ni secuencia) que pasaron X días. Garantiza al menos un primer seguimiento sin depender del vendedor."
        on={cfg.seg_auto_activo}
        onToggle={() => setCfg({ ...cfg, seg_auto_activo: !cfg.seg_auto_activo })}
      />

      {cfg.seg_auto_activo && (
        <div className="ml-1 flex flex-col gap-3 rounded-xl bg-mist/50 p-3.5 text-[12.5px] text-ink">
          <label className="flex flex-wrap items-center gap-2">
            Inscribir después de
            <input
              type="number"
              min={1}
              value={cfg.seg_auto_dias}
              onChange={(e) => setCfg({ ...cfg, seg_auto_dias: Number(e.target.value) })}
              className="w-[64px] rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-blue"
            />
            días sin que el vendedor lo toque.
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Secuencia por defecto:
            <select
              value={cfg.seg_auto_secuencia_id ?? ""}
              onChange={(e) => setCfg({ ...cfg, seg_auto_secuencia_id: e.target.value || null })}
              className="min-w-[200px] rounded-lg border border-input bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-blue"
            >
              <option value="">— Elegí una plantilla compartida —</option>
              {(compartidas ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
          {(compartidas ?? []).length === 0 && (
            <span className="text-[11.5px] text-warning">
              No hay plantillas compartidas activas. Creá una secuencia del equipo primero.
            </span>
          )}
          <span className="text-[11.5px] text-slate">
            Solo inscribe leads con email y cuyo vendedor tenga la casilla conectada. Requiere el envío automático prendido.
          </span>
        </div>
      )}

      {err && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{err}</div>}

      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-muted">
          El procesamiento corre en segundo plano (Edge Function + cron en Supabase).
        </span>
        <Button variant={guardado ? "outline" : "blue"} disabled={guardando} onClick={guardar}>
          <Check /> {guardando ? "Guardando…" : guardado ? "Guardado" : "Guardar"}
        </Button>
      </div>
    </Card>
  )
}

function Fila({
  icon,
  titulo,
  detalle,
  on,
  onToggle,
}: {
  icon: React.ReactNode
  titulo: string
  detalle: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#EEF3FE]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">{titulo}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate">{detalle}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          on ? "bg-blue" : "bg-cloud"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all",
            on ? "left-[22px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  )
}

function AutoOpcion({
  sel,
  onClick,
  titulo,
  detalle,
}: {
  sel: boolean
  onClick: () => void
  titulo: string
  detalle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border p-2.5 text-left transition-colors",
        sel ? "border-blue bg-white ring-1 ring-blue" : "border-input bg-white hover:bg-mist/60"
      )}
    >
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <span
          className={cn(
            "grid size-4 place-items-center rounded-full border",
            sel ? "border-blue bg-blue text-white" : "border-muted"
          )}
        >
          {sel && <Check size={11} />}
        </span>
        {titulo}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate">{detalle}</p>
    </button>
  )
}
