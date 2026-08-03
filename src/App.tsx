import { BrowserRouter } from "react-router-dom"
import { VentasApp } from "@/VentasApp"

// App de Welivery Comercial (Chile). El ruteo y las vistas viven en VentasApp;
// la sesión/rol hoy es mock (VentasProvider). Al conectar Supabase se reemplaza
// por auth real (ver src/lib/supabase.ts).
export default function App() {
  return (
    <BrowserRouter>
      <VentasApp />
    </BrowserRouter>
  )
}
