import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  Activity,
  Building2,
  Columns3,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Sparkles,
  Sun,
  Target,
  Users,
} from "lucide-react"
import { Simbolo } from "@/components/brand/Simbolo"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"
import { useVentas } from "@/store"
import type { RolVentas } from "@/lib/types"

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_ADMIN: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { to: "/objetivos", label: "Objetivos", icon: <Target size={17} /> },
  { to: "/vendedores", label: "Vendedores", icon: <Users size={17} /> },
]
const NAV_ADMIN_DATOS: NavItem[] = [
  { to: "/clientes", label: "Base de clientes", icon: <Building2 size={17} /> },
  { to: "/contexto", label: "Contexto IA", icon: <Sparkles size={17} /> },
]
const NAV_VENDEDOR: NavItem[] = [
  { to: "/avance", label: "Mi avance", icon: <Activity size={17} /> },
  { to: "/pipeline", label: "Oportunidades", icon: <Columns3 size={17} /> },
  { to: "/leads", label: "Buscar leads (IA)", icon: <Search size={17} /> },
]

export function VentasLayout() {
  const { rol, modo, setModo, vendedor, vendedores, verVendedorId, setVerVendedorId, usuario, signOut } =
    useVentas()
  const { tema, toggle } = useTheme()
  const navigate = useNavigate()

  function cambiarModo(m: RolVentas) {
    setModo(m)
    navigate(m === "admin" ? "/dashboard" : "/avance")
  }

  async function handleSalir() {
    await signOut()
    navigate("/login", { replace: true })
  }

  const esVista = modo === "admin"
  const quien =
    modo === "admin"
      ? {
          ini: usuario?.iniciales ?? "AD",
          nombre: usuario?.nombre || "Admin",
          sub: "Admin comercial",
        }
      : { ini: vendedor.iniciales, nombre: vendedor.nombre, sub: `Vendedor · ${vendedor.zona}` }

  return (
    <div className="flex min-h-svh bg-mist">
      <aside className="sticky top-0 flex h-svh w-[236px] shrink-0 flex-col bg-navy p-3 text-[#c6d0e0]">
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue">
            <Simbolo className="size-[18px]" color="#FFFFFF" />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-white">
              Welivery <span className="text-mint">Comercial</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8394b3]">Chile</div>
          </div>
        </div>

        {/* Toggle de vista — solo para admin (previsualizar vistas de vendedor) */}
        {rol === "admin" && (
          <div className="mx-1 mb-3 flex gap-1 rounded-lg bg-white/[0.06] p-1">
            {(["admin", "vendedor"] as RolVentas[]).map((m) => (
              <button
                key={m}
                onClick={() => cambiarModo(m)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors",
                  modo === m ? "bg-white text-navy" : "text-[#8394b3] hover:text-white"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Selector de vendedor (admin viendo la vista de vendedor) */}
        {rol === "admin" && modo === "vendedor" && vendedores.length > 0 && (
          <div className="mx-1 mb-3">
            <label className="mb-1 block px-1 text-[10px] uppercase tracking-wide text-[#8394b3]">
              Ver como
            </label>
            <select
              value={verVendedorId ?? vendedor.id}
              onChange={(e) => setVerVendedorId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[12.5px] text-white outline-none"
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id} className="text-ink">
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navegación */}
        {esVista ? (
          <>
            <NavGroup label="Gestión" items={NAV_ADMIN} />
            <NavGroup label="Datos" items={NAV_ADMIN_DATOS} />
          </>
        ) : (
          <NavGroup label="Mi mes" items={NAV_VENDEDOR} />
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 pt-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-[12px] font-semibold text-navy">
            {quien.ini}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12px] text-white">{quien.nombre}</div>
            <div className="truncate text-[10.5px] text-[#8394b3]">{quien.sub}</div>
          </div>
          <button
            onClick={toggle}
            title={tema === "claro" ? "Modo oscuro" : "Modo claro"}
            className="ml-auto grid size-8 place-items-center rounded-lg text-[#8394b3] hover:bg-white/[0.07] hover:text-white"
          >
            {tema === "claro" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            onClick={handleSalir}
            title="Cerrar sesión"
            className="grid size-8 place-items-center rounded-lg text-[#8394b3] hover:bg-white/[0.07] hover:text-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-7">
        <Outlet />
      </main>
    </div>
  )
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <>
      <div className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.13em] text-[#8394b3]">
        {label}
      </div>
      <nav className="mb-2 flex flex-col gap-0.5">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                isActive ? "bg-blue text-white" : "text-[#c6d0e0] hover:bg-white/[0.05] hover:text-white"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r bg-mint" />
                )}
                {i.icon}
                <span>{i.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
