import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Simbolo } from "@/components/brand/Simbolo"
import { Button } from "@/components/ui/button"
import { useVentas } from "@/store"

export function Login() {
  const { session, signIn, signUp } = useVentas()
  const navigate = useNavigate()
  const [modo, setModo] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión, salir del login.
  useEffect(() => {
    if (session) navigate("/", { replace: true })
  }, [session, navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)
    if (modo === "login") {
      const { error } = await signIn(email.trim(), password)
      setEnviando(false)
      if (error) setError("Email o contraseña incorrectos.")
      else navigate("/", { replace: true })
    } else {
      const { error, necesitaConfirmar } = await signUp(email.trim(), password)
      setEnviando(false)
      if (error) setError(error)
      else if (necesitaConfirmar) setAviso("¡Listo! Revisá tu email para confirmar la cuenta y después ingresá.")
      else navigate("/", { replace: true })
    }
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
          <h1 className="text-[15px] font-semibold text-navy">
            {modo === "login" ? "Ingresá a tu cuenta" : "Creá tu cuenta"}
          </h1>
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
                autoComplete={modo === "login" ? "current-password" : "new-password"}
                className="rounded-lg border border-input bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-blue"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{error}</div>
            )}
            {aviso && (
              <div className="rounded-lg bg-[#DFF2E9] px-3 py-2 text-[12.5px] text-success">{aviso}</div>
            )}

            <Button type="submit" disabled={enviando} className="mt-1 w-full">
              {enviando
                ? modo === "login"
                  ? "Ingresando…"
                  : "Creando…"
                : modo === "login"
                  ? "Ingresar"
                  : "Crear cuenta"}
            </Button>
          </form>

          <div className="mt-4 border-t border-border pt-3 text-center text-[12px] text-slate">
            {modo === "login" ? (
              <>
                ¿Primera vez?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setModo("signup")
                    setError(null)
                    setAviso(null)
                  }}
                  className="font-medium text-blue hover:underline"
                >
                  Creá tu cuenta
                </button>
              </>
            ) : (
              <>
                ¿Ya tenés cuenta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setModo("login")
                    setError(null)
                    setAviso(null)
                  }}
                  className="font-medium text-blue hover:underline"
                >
                  Ingresá
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-muted">
          ¿No tenés acceso? Pedile a tu admin que te cree el usuario.
        </p>
      </div>
    </div>
  )
}
