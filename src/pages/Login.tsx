import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Simbolo } from "@/components/brand/Simbolo"
import { Button } from "@/components/ui/button"
import { useVentas } from "@/store"

export function Login() {
  const { session, signIn } = useVentas()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión, salir del login.
  useEffect(() => {
    if (session) navigate("/", { replace: true })
  }, [session, navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error } = await signIn(email.trim(), password)
    setEnviando(false)
    if (error) setError("Email o contraseña incorrectos.")
    else navigate("/", { replace: true })
  }

  return (
    <div className="grid min-h-svh place-items-center bg-mist p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-navy">
            <Simbolo className="size-5" color="#FFFFFF" />
          </span>
          <div className="text-[18px] font-semibold text-navy">
            Welivery <span className="text-blue">Comercial</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-[15px] font-semibold text-navy">Ingresá a tu cuenta</h1>
          <p className="mt-0.5 text-[12.5px] text-slate">Seguimiento comercial · Chile</p>

          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="rounded-lg border border-input bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
                placeholder="vos@welivery.cl"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate">Contraseña</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="rounded-lg border border-input bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{error}</div>
            )}

            <Button type="submit" disabled={enviando} className="mt-1 w-full">
              {enviando ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-muted">
          ¿No tenés acceso? Pedile a tu admin que te cree el usuario.
        </p>
      </div>
    </div>
  )
}
