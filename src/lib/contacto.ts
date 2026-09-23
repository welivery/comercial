// Helpers de contacto directo. Los teléfonos son celulares chilenos (+56 9…).
export function telHref(t: string): string {
  return "tel:" + t.replace(/[^\d+]/g, "")
}
export function waHref(t: string): string {
  let d = t.replace(/\D/g, "")
  if (d.startsWith("56")) { /* ya trae país */ }
  else if (d.length === 9 && d.startsWith("9")) d = "56" + d
  else if (d.length === 8) d = "569" + d
  else d = "56" + d
  return `https://wa.me/${d}`
}
