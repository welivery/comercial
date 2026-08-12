import { lazy, Suspense } from "react"
import { Navigate, Outlet, Route, Routes } from "react-router-dom"
import { VentasProvider, useVentas } from "@/store"
import { VentasLayout } from "@/components/VentasLayout"
import { ToastProvider } from "@/components/Toast"
import { Login } from "@/pages/Login"

// Páginas por ruta en chunks separados (code-splitting): un vendedor no descarga
// el código de las pantallas de admin y viceversa. Baja mucho el bundle inicial.
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })))
const AdminObjetivos = lazy(() => import("@/pages/AdminObjetivos").then((m) => ({ default: m.AdminObjetivos })))
const AdminVendedores = lazy(() => import("@/pages/AdminVendedores").then((m) => ({ default: m.AdminVendedores })))
const VendedorFicha = lazy(() => import("@/pages/VendedorFicha").then((m) => ({ default: m.VendedorFicha })))
const AdminUsuarios = lazy(() => import("@/pages/AdminUsuarios").then((m) => ({ default: m.AdminUsuarios })))
const AdminClientes = lazy(() => import("@/pages/AdminClientes").then((m) => ({ default: m.AdminClientes })))
const AdminContexto = lazy(() => import("@/pages/AdminContexto").then((m) => ({ default: m.AdminContexto })))
const VendedorAvance = lazy(() => import("@/pages/VendedorAvance").then((m) => ({ default: m.VendedorAvance })))
const VendedorPipeline = lazy(() => import("@/pages/VendedorPipeline").then((m) => ({ default: m.VendedorPipeline })))
const OportunidadDetalle = lazy(() => import("@/pages/OportunidadDetalle").then((m) => ({ default: m.OportunidadDetalle })))
const VendedorLeads = lazy(() => import("@/pages/VendedorLeads").then((m) => ({ default: m.VendedorLeads })))
const VendedorSeguimiento = lazy(() => import("@/pages/VendedorSeguimiento").then((m) => ({ default: m.VendedorSeguimiento })))
const VendedorSecuencias = lazy(() => import("@/pages/VendedorSecuencias").then((m) => ({ default: m.VendedorSecuencias })))

// Redirige a la pantalla inicial según el modo de vista activo.
function InicioRedirect() {
  const { modo } = useVentas()
  return <Navigate to={modo === "admin" ? "/dashboard" : "/avance"} replace />
}

// El layout + un Suspense para las páginas lazy (fallback mientras baja el chunk).
function LayoutConSuspense() {
  return (
    <VentasLayout>
      <Suspense fallback={<div className="p-8 text-center text-[13px] text-slate">Cargando…</div>}>
        <Outlet />
      </Suspense>
    </VentasLayout>
  )
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

// Exige rol admin para las rutas de administración. Defensa en profundidad: la
// seguridad real la impone RLS en la base, pero esto evita que un vendedor
// llegue a pantallas de admin tipeando la URL (y que dispare acciones que RLS
// rechazaría igual, pero con mejor UX). Si no es admin, lo manda a su inicio.
function RoleGate() {
  const { rol } = useVentas()
  if (rol !== "admin") return <Navigate to="/avance" replace />
  return <Outlet />
}

// App independiente de Welivery Comercial (montada en /). Auth real con Supabase.
export function VentasApp() {
  return (
    <VentasProvider>
      <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Gate />}>
          <Route element={<LayoutConSuspense />}>
            <Route index element={<InicioRedirect />} />
            {/* Rutas solo-admin (gate de rol + RLS en la base) */}
            <Route element={<RoleGate />}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="objetivos" element={<AdminObjetivos />} />
              <Route path="vendedores" element={<AdminVendedores />} />
              <Route path="vendedores/:id" element={<VendedorFicha />} />
              <Route path="usuarios" element={<AdminUsuarios />} />
              <Route path="clientes" element={<AdminClientes />} />
              <Route path="contexto" element={<AdminContexto />} />
            </Route>
            <Route path="avance" element={<VendedorAvance />} />
            <Route path="pipeline" element={<VendedorPipeline />} />
            <Route path="pipeline/:id" element={<OportunidadDetalle />} />
            <Route path="leads" element={<VendedorLeads />} />
            <Route path="seguimiento" element={<VendedorSeguimiento />} />
            <Route path="secuencias" element={<VendedorSecuencias />} />
            <Route path="*" element={<InicioRedirect />} />
          </Route>
        </Route>
      </Routes>
      </ToastProvider>
    </VentasProvider>
  )
}
