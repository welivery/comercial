import { cn } from "@/lib/utils"

// Card de marca: blanca, redondeada, borde Nube y sombra suave sobre Bruma.
// Centraliza el patrón "border + bg-white" que estaba repetido a mano.
// `as="button"` la convierte en un tile accionable (filtros KPI, etc.).
type CardProps = {
  hover?: boolean
  as?: "div" | "button"
} & React.HTMLAttributes<HTMLElement> &
  React.ButtonHTMLAttributes<HTMLButtonElement>

export function Card({ className, hover = false, as = "div", ...props }: CardProps) {
  const Comp = as as React.ElementType
  return (
    <Comp
      className={cn(
        "rounded-xl border border-border bg-white shadow-[var(--shadow-card)]",
        hover && "transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        className
      )}
      {...props}
    />
  )
}
