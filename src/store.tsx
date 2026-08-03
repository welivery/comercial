// Sesión y rol del módulo (auth real con Supabase). El rol (admin/vendedor)
// sale de la ficha `vendedores` enlazada al usuario logueado. El admin puede
// togglear a la vista de vendedor y elegir a quién ver (usa su acceso de lectura
// total; el RLS igual protege del lado servidor).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { fetchVendedorByUser, fetchVendedores, type VendedorRow } from "@/data/api"
import type { RolVentas, Vendedor } from "@/lib/types"

const FALLBACK: Vendedor = { id: "", nombre: "—", iniciales: "—", zona: "", activo: true }

interface VentasState {
  session: Session | null
  loading: boolean
  rol: RolVentas
  usuario: VendedorRow | null
  // Modo de vista (para el admin: previsualizar vistas de vendedor).
  modo: RolVentas
  setModo: (m: RolVentas) => void
  // Vendedor "actual" para las vistas de vendedor (self, o el elegido por admin).
  vendedor: Vendedor
  vendedores: Vendedor[]
  verVendedorId: string | null
  setVerVendedorId: (id: string) => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null; necesitaConfirmar: boolean }>
  signOut: () => Promise<void>
}

const Ctx = createContext<VentasState | undefined>(undefined)

export function VentasProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<VendedorRow | null>(null)
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<RolVentas>("admin")
  const [verVendedorId, setVerVendedorId] = useState<string | null>(null)

  // Sesión de Supabase.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setUsuario(null)
        setVendedores([])
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Perfil (rol) + equipo cuando hay sesión.
  useEffect(() => {
    if (!session) return
    let cancel = false
    setLoading(true)
    Promise.all([fetchVendedorByUser(session.user.id), fetchVendedores()])
      .then(([yo, team]) => {
        if (cancel) return
        setUsuario(yo)
        setVendedores(team)
        setModo(yo?.rol === "admin" ? "admin" : "vendedor")
      })
      .catch(() => {
        if (!cancel) {
          setUsuario(null)
          setVendedores([])
        }
      })
      .finally(() => !cancel && setLoading(false))
    return () => {
      cancel = true
    }
  }, [session])

  const rol: RolVentas = usuario?.rol ?? "vendedor"

  const vendedor: Vendedor = useMemo(() => {
    if (rol === "vendedor" && usuario) return usuario
    return vendedores.find((v) => v.id === verVendedorId) ?? vendedores[0] ?? FALLBACK
  }, [rol, usuario, vendedores, verVendedorId])

  const value: VentasState = {
    session,
    loading,
    rol,
    usuario,
    modo: rol === "admin" ? modo : "vendedor",
    setModo,
    vendedor,
    vendedores,
    verVendedorId,
    setVerVendedorId,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      // Si la confirmación por email está activada, no hay sesión hasta confirmar.
      return { error: error?.message ?? null, necesitaConfirmar: !error && !data.session }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVentas() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useVentas debe usarse dentro de <VentasProvider>")
  return ctx
}
