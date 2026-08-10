import { useEffect, useState } from "react"
import { Check, Link2, Mail, Unlink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEmailCuenta } from "@/hooks/useData"
import { desconectarEmail, urlConectarGmail } from "@/data/api"
import { cn } from "@/lib/utils"

// Tarjeta (compacta) para conectar/desconectar la casilla de Gmail del vendedor.
export function ConexionEmail({ vendedorId, onEditar }: { vendedorId: string; onEditar?: () => void }) {
  const { data: cuenta, loading, reload } = useEmailCuenta(vendedorId)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)

  // Lee el resultado del OAuth (?email=ok/error/cancelado) y limpia la URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const r = sp.get("email")
    if (!r) return
    if (r === "ok") setAviso({ tipo: "ok", texto: "¡Email conectado! Ya vas a poder enviar secuencias desde tu casilla." })
    else if (r === "cancelado") setAviso({ tipo: "error", texto: "Cancelaste la conexión con Google." })
    else setAviso({ tipo: "error", texto: "No se pudo conectar el email. Probá de nuevo." })
    sp.delete("email")
    const q = sp.toString()
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""))
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function desconectar() {
    if (!window.confirm("¿Desconectar tu email? Las secuencias dejarán de enviarse desde tu casilla.")) return
    try {
      await desconectarEmail(vendedorId)
      setAviso(null)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo desconectar")
    }
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#EEF3FE]">
        <Mail size={16} className="text-blue" />
      </span>
      <div className="min-w-0 flex-1">
        {loading ? (
          <p className="text-[12.5px] text-slate">Cargando tu email…</p>
        ) : cuenta ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-slate">
            <Check size={14} className="shrink-0 text-success" />
            Enviás desde <b className="font-semibold text-ink">{cuenta.email || "tu casilla"}</b>
          </p>
        ) : (
          <p className="text-[12.5px] text-slate">
            <b className="text-navy">Conectá tu casilla</b> de Welivery para poder enviar las secuencias.
          </p>
        )}
        {aviso && (
          <p className={cn("mt-0.5 text-[12px] font-medium", aviso.tipo === "ok" ? "text-success" : "text-error")}>
            {aviso.texto}
          </p>
        )}
      </div>
      {onEditar && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={onEditar}>
          Editar secuencias
        </Button>
      )}
      {cuenta ? (
        <Button variant="outline" size="sm" className="shrink-0" onClick={desconectar}>
          <Unlink /> Desconectar
        </Button>
      ) : (
        <Button
          variant="blue"
          size="sm"
          className="shrink-0"
          disabled={!vendedorId}
          onClick={() => {
            window.location.href = urlConectarGmail(vendedorId)
          }}
        >
          <Link2 /> Conectar mi email
        </Button>
      )}
    </Card>
  )
}
