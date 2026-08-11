// Mensaje de error legible desde cualquier valor atrapado en un catch. Reemplaza
// el patrón repetido `e instanceof Error ? e.message : "..."` en toda la app.
export function msgError(e: unknown, fallback = "Ocurrió un error"): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === "string" && e.trim()) return e
  return fallback
}
