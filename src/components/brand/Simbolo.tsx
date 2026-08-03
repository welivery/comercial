import { cn } from "@/lib/utils"

// Símbolo de marca Welivery (isotipo): el paquete (rombo = cuadrado redondeado
// rotado, visto desde arriba) + la curva menta (ruta). Manual de Marca v2.0.
// Complemento del wordmark; se usa en espacios chicos (favicon, sidebar
// colapsado, lockup). El trazo del paquete hereda el color (currentColor).
export function Simbolo({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("block", className)} fill="none" aria-hidden>
      <rect
        x="19.25" y="13.25" width="25.5" height="25.5" rx="6.5"
        transform="rotate(45 32 26)"
        stroke={color} strokeWidth="4.2" strokeLinejoin="round"
      />
      <path d="M22 46 Q32 52.5 42 46" stroke="#6FE0CB" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
