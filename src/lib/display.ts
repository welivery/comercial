// Etiquetas, colores y helpers de fecha del módulo Ventas.

import type {
  EstadoOportunidad,
  MotivoBaja,
  MotivoRechazo,
  SegmentoCliente,
} from "@/lib/types"

// Motivos de rechazo de un lead (desplegable en la vista de leads).
export const MOTIVOS_RECHAZO: { key: MotivoRechazo; label: string }[] = [
  { key: "no_interesado", label: "No interesado" },
  { key: "pocos_envios", label: "Pocos envíos" },
  { key: "negocio_inactivo", label: "Negocio no activo" },
  { key: "no_contesta", label: "No contesta" },
  { key: "ya_tiene_proveedor", label: "Ya tiene proveedor" },
  { key: "fuera_zona", label: "Fuera de zona" },
  { key: "otro", label: "Otro" },
]
export const MOTIVO_RECHAZO_LABEL: Record<MotivoRechazo, string> = Object.fromEntries(
  MOTIVOS_RECHAZO.map((m) => [m.key, m.label])
) as Record<MotivoRechazo, string>

// Fecha de referencia del período de demo (evita depender del reloj real en la
// vista con datos de prueba). Al conectar datos reales se usa `new Date()`.
export const HOY = new Date("2026-08-21T12:00:00")
export const PERIODO_ACTUAL = "2026-08"
export const PERIODO_LABEL = "Agosto 2026"

// ─────────────────────────── Estados del pipeline ───────────────────────────
// Orden de columnas del tablero (perdido va aparte).
export const ESTADOS_PIPELINE: EstadoOportunidad[] = [
  "interesado",
  "reunion_coordinada",
  "reunion_efectiva",
  "propuesta_enviada",
  "seguimiento",
  "cierre_ganado",
]

export const ESTADO_LABEL: Record<EstadoOportunidad, string> = {
  interesado: "Interesado",
  reunion_coordinada: "Reunión coordinada",
  reunion_efectiva: "Reunión efectiva",
  propuesta_enviada: "Propuesta enviada",
  seguimiento: "Seguimiento",
  cierre_ganado: "Cierre ganado",
  perdido: "Perdido",
}

export const ESTADO_COLOR: Record<EstadoOportunidad, string> = {
  interesado: "#7A869C",
  reunion_coordinada: "#2F5BE6",
  reunion_efectiva: "#152A4F",
  propuesta_enviada: "#E0A52F",
  seguimiento: "#F2563A",
  cierre_ganado: "#1E9E6A",
  perdido: "#A6AEBC",
}

// Una oportunidad "ya tuvo reunión efectiva" si alcanzó ese hito o lo superó.
const DESPUES_DE_EFECTIVA: EstadoOportunidad[] = [
  "reunion_efectiva",
  "propuesta_enviada",
  "seguimiento",
  "cierre_ganado",
]
export function tuvoReunionEfectiva(estado: EstadoOportunidad): boolean {
  return DESPUES_DE_EFECTIVA.includes(estado)
}

// ─────────────────────────── Clientes / segmentos ───────────────────────────
export const SEGMENTO_LABEL: Record<SegmentoCliente, string> = {
  activo: "Activo",
  ex_cliente: "Ex-cliente",
  prospeccion: "Prospección",
}
export const SEGMENTO_COLOR: Record<SegmentoCliente, "success" | "coral" | "blue"> = {
  activo: "success",
  ex_cliente: "coral",
  prospeccion: "blue",
}

export const MOTIVO_BAJA_LABEL: Record<MotivoBaja, string> = {
  precio: "Precio",
  servicio: "Servicio",
  cerro: "Cerró",
  deuda: "Deuda",
  otro: "Otro",
}

// ─────────────────────────── Helpers de formato ───────────────────────────
export function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

// Envíos aproximados con separador de miles (es-CL).
export function fmtEnvios(n: number): string {
  return "~" + n.toLocaleString("es-CL")
}

const MS_DIA = 86400000

export function diasEntre(desdeIso: string, hasta: Date = HOY): number {
  return Math.max(0, Math.round((hasta.getTime() - new Date(desdeIso).getTime()) / MS_DIA))
}

// "hace 2 días" / "hoy" / "ayer" — relativo a HOY.
export function haceTexto(iso: string): string {
  const d = diasEntre(iso)
  if (d === 0) return "hoy"
  if (d === 1) return "ayer"
  return `hace ${d} días`
}

// ¿El timestamp cae dentro del período "YYYY-MM"?
export function enPeriodo(iso: string | null, periodo: string): boolean {
  return iso != null && iso.slice(0, 7) === periodo
}
