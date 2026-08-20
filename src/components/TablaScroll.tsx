import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

/**
 * Envoltorio para tablas anchas.
 *
 * Problema que resuelve: con `<Card className="overflow-x-auto">` la barra de
 * scroll horizontal queda al FINAL de toda la lista, así que en listas largas
 * hay que bajar hasta el fondo para alcanzarla y las columnas de la derecha
 * (acciones) quedan cortadas.
 *
 * Solución: la tabla scrollea (horizontal y vertical) dentro de un alto acotado.
 * La barra horizontal queda entonces pegada abajo del área visible —siempre a la
 * vista— y el encabezado puede quedar fijo. Combinar con las clases del <table>:
 *   - `tbl-fija`     → encabezado fijo al scrollear vertical.
 *   - `tbl-acciones` → última columna (acciones) fija a la derecha.
 *
 * En listas cortas el alto se ajusta al contenido (maxHeight solo pone un tope),
 * así que no aparece scroll interno de más.
 */
export function TablaScroll({
  className,
  maxH = "max-h-[70vh]",
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { maxH?: string }) {
  return (
    <Card className={cn("overflow-auto", maxH, className)} {...props}>
      {children}
    </Card>
  )
}
