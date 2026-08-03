import { Navigate, Route, Routes } from "react-router-dom"
import { VentasProvider, useVentas } from "@/store"
import { VentasLayout } from "@/components/VentasLayout"
import { AdminDashboard } from "@/pages/AdminDashboard"
import { AdminObjetivos } from "@/pages/AdminObjetivos"
import { AdminVendedores } from "@/pages/AdminVendedores"
import { AdminClientes } from "@/pages/AdminClientes"
import { AdminContexto } from "@/pages/AdminContexto"
import { VendedorAvance } from "@/pages/VendedorAvance"
import { VendedorPipeline } from "@/pages/VendedorPipeline"
import { OportunidadDetalle } from "@/pages/OportunidadDetalle"
import { VendedorLeads } from "@/pages/VendedorLeads"

// Redirige a la pantalla inicial según el rol activo.
function InicioRedirect() {
  const { rol } = useVentas()
  return <Navigate to={rol === "admin" ? "/dashboard" : "/avance"} replace />
}

// App independiente de Ventas (montada bajo /*). Auth/rol mock en
// Etapa 1; al conectar Supabase se reemplaza VentasProvider por auth real.
export function VentasApp() {
  return (
    <VentasProvider>
      <Routes>
        <Route element={<VentasLayout />}>
          <Route index element={<InicioRedirect />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="objetivos" element={<AdminObjetivos />} />
          <Route path="vendedores" element={<AdminVendedores />} />
          <Route path="clientes" element={<AdminClientes />} />
          <Route path="contexto" element={<AdminContexto />} />
          <Route path="avance" element={<VendedorAvance />} />
          <Route path="pipeline" element={<VendedorPipeline />} />
          <Route path="pipeline/:id" element={<OportunidadDetalle />} />
          <Route path="leads" element={<VendedorLeads />} />
          <Route path="*" element={<InicioRedirect />} />
        </Route>
      </Routes>
    </VentasProvider>
  )
}
