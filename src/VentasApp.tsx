import { Navigate, Outlet, Route, Routes } from "react-router-dom"
import { VentasProvider, useVentas } from "@/store"
import { VentasLayout } from "@/components/VentasLayout"
import { Login } from "@/pages/Login"
import { AdminDashboard } from "@/pages/AdminDashboard"
import { AdminObjetivos } from "@/pages/AdminObjetivos"
import { AdminVendedores } from "@/pages/AdminVendedores"
import { AdminUsuarios } from "@/pages/AdminUsuarios"
import { AdminClientes } from "@/pages/AdminClientes"
import { AdminContexto } from "@/pages/AdminContexto"
import { VendedorAvance } from "@/pages/VendedorAvance"
import { VendedorPipeline } from "@/pages/VendedorPipeline"
import { OportunidadDetalle } from "@/pages/OportunidadDetalle"
import { VendedorLeads } from "@/pages/VendedorLeads"

// Redirige a la pantalla inicial según el modo de vista activo.
function InicioRedirect() {
  const { modo } = useVentas()
  return <Navigate to={modo === "admin" ? "/dashboard" : "/avance"} replace />
}

// Exige sesión: mientras carga muestra spinner; sin sesión manda al login.
function Gate() {
  const { session, loading } = useVentas()
  if (loading) {
    return <div className="grid min-h-svh place-items-center bg-mist text-sm text-slate">Cargando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

// App independiente de Welivery Comercial (montada en /). Auth real con Supabase.
export function VentasApp() {
  return (
    <VentasProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Gate />}>
          <Route element={<VentasLayout />}>
            <Route index element={<InicioRedirect />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="objetivos" element={<AdminObjetivos />} />
            <Route path="vendedores" element={<AdminVendedores />} />
            <Route path="usuarios" element={<AdminUsuarios />} />
            <Route path="clientes" element={<AdminClientes />} />
            <Route path="contexto" element={<AdminContexto />} />
            <Route path="avance" element={<VendedorAvance />} />
            <Route path="pipeline" element={<VendedorPipeline />} />
            <Route path="pipeline/:id" element={<OportunidadDetalle />} />
            <Route path="leads" element={<VendedorLeads />} />
            <Route path="*" element={<InicioRedirect />} />
          </Route>
        </Route>
      </Routes>
    </VentasProvider>
  )
}
