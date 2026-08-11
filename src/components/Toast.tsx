import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Sistema de avisos (toasts) liviano, sin dependencias. Unifica el feedback de
// éxito/error/info en toda la app (antes: window.alert + estados inline sueltos).

type Tipo = "ok" | "error" | "info"
interface Aviso {
  id: number
  tipo: Tipo
  texto: string
}
interface ToastApi {
  ok: (texto: string) => void
  error: (texto: string) => void
  info: (texto: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const idRef = useRef(0)

  const cerrar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = ++idRef.current
      setAvisos((a) => [...a, { id, tipo, texto }])
      // El error queda más tiempo (hay que leerlo); éxito/info se van solos.
      window.setTimeout(() => cerrar(id), tipo === "error" ? 6000 : 4000)
    },
    [cerrar]
  )

  const api = useMemo<ToastApi>(
    () => ({ ok: (t) => push("ok", t), error: (t) => push("error", t), info: (t) => push("info", t) }),
    [push]
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,360px)] flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] shadow-[var(--shadow-card)]",
              a.tipo === "ok" && "border-success/30 bg-[#E4F5EC] text-success",
              a.tipo === "info" && "border-blue/25 bg-[#EEF3FE] text-blue",
              a.tipo === "error" && "border-error/30 bg-[#FBE2E2] text-error"
            )}
          >
            <span className="mt-px shrink-0">
              {a.tipo === "ok" ? <Check size={15} /> : <Info size={15} />}
            </span>
            <span className="min-w-0 flex-1 font-medium">{a.texto}</span>
            <button
              onClick={() => cerrar(a.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>")
  return ctx
}
