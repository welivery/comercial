// Render de variables de plantillas de email. La MISMA lógica corre en el
// servidor (supabase/functions/secuencias-cron) — si cambiás una, cambiá la otra.
//
// Regla de oro: nunca sale un {{...}} sin reemplazar, ni un saludo vacío.
//   {{empresa}} → empresa, o el nombre de contacto, o "tu empresa"
//   {{nombre}}  → nombre de contacto, o la empresa, o "equipo"
// Cualquier otra variable desconocida se borra (no queda el literal).

export function renderPlantilla(txt: string, v: { nombre?: string | null; empresa?: string | null }): string {
  const emp = (v.empresa ?? "").trim() || (v.nombre ?? "").trim() || "tu empresa"
  const nom = (v.nombre ?? "").trim() || (v.empresa ?? "").trim() || "equipo"
  return (txt ?? "")
    .replaceAll("{{empresa}}", emp)
    .replaceAll("{{nombre}}", nom)
    .replace(/\{\{\s*[\w.]+\s*\}\}/g, "")
}
