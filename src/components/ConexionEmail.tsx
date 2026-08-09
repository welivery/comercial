import { useEffect, useState } from "react"
import { Check, Link2, Mail, Unlink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEmailCuenta } from "@/hooks/useData"
import { desconectarEmail, urlConectarGmail } from "@/data/api"
import { cn } from "@/lib/utils"

// Tarjeta para conectar/desconectar la casilla de Gmail del vendedor (Etapa B).
export function ConexionEmail({ vendedorId }: { vendedorId: string }) {
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
    <Card className="mb-4 flex flex-col gap-3 p-[18px] sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EEF3FE]">
        <Mail size={20} className="text-blue" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold text-navy">Tu email para enviar</h2>
        {loading ? (
          <p className="mt-0.5 text-[12.5px] text-slate">Cargando…</p>
        ) : cuenta ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate">
            <Check size={14} className="text-success" />
            Conectado como <b className="font-semibold text-ink">{cuenta.email || "tu casilla"}</b>
          </p>
        ) : (
          <p className="mt-0.5 text-[12.5px] text-slate">
            Conectá tu casilla de Welivery para enviar las secuencias desde tu propio email. Un solo click.
          </p>
        )}
        {aviso && (
          <p className={cn("mt-1.5 text-[12px] font-medium", aviso.tipo === "ok" ? "text-success" : "text-error")}>
            {aviso.texto}
          </p>
        )}
      </div>
      {cuenta ? (
        <Button variant="outline" className="shrink-0" onClick={desconectar}>
          <Unlink /> Desconectar
        </Button>
      ) : (
        <Button
          variant="blue"
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
