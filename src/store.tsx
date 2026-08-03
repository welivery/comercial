// Estado de sesión del módulo Ventas (mock de Etapa 1). Maneja el rol activo
// (admin / vendedor) con un toggle persistido, como en el mockup. Al conectar
// auth real, el rol y el vendedor salen del usuario logueado.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { VENDEDOR_ACTUAL, VENDEDORES } from "@/data/mock"
import type { RolVentas, Vendedor } from "@/lib/types"

interface VentasState {
  rol: RolVentas
  setRol: (r: RolVentas) => void
  // Vendedor "logueado" cuando el rol es vendedor (mock).
  vendedor: Vendedor
}

const Ctx = createContext<VentasState | undefined>(undefined)
const KEY = "welivery_ventas_rol"

export function VentasProvider({ children }: { children: ReactNode }) {
  const [rol, setRolState] = useState<RolVentas>(
    () => (localStorage.getItem(KEY) as RolVentas) ?? "admin"
  )
  const setRol = (r: RolVentas) => {
    setRolState(r)
    localStorage.setItem(KEY, r)
  }
  const vendedor = useMemo(
    () => VENDEDORES.find((v) => v.id === VENDEDOR_ACTUAL) ?? VENDEDORES[0],
    []
  )
  return <Ctx.Provider value={{ rol, setRol, vendedor }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVentas() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useVentas debe usarse dentro de <VentasProvider>")
  return ctx
}
