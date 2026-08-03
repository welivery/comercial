// Tipos del dominio Welivery Ventas (seguimiento comercial de vendedores CL).
// App separada de Welivery Care: mismo stack y marca, datos independientes.
// Espejo del esquema en supabase/.

export type RolVentas = "admin" | "vendedor"

// Bucket = tipo de cliente que buscamos, asignado por PRIORIDAD al cargar la
// oportunidad: Estratégico (marca reconocida o +1.000 envíos) → Fulfillment
// (quiere almacenamiento + armado) → Mediano (el resto). Los % del objetivo
// suman 100%.
export type Bucket = "estrategico" | "fulfillment" | "mediano"

// Estados del pipeline (una oportunidad los recorre en orden; "perdido" es
// salida lateral). "reunion_efectiva" es el hito que cuenta al objetivo.
export type EstadoOportunidad =
  | "interesado"
  | "reunion_coordinada"
  | "reunion_efectiva"
  | "propuesta_enviada"
  | "seguimiento"
  | "cierre_ganado"
  | "perdido"

// Cómo nació la oportunidad (alimenta métricas de origen).
export type OrigenOportunidad = "manual" | "ia" | "referido"

// Segmento de un cliente en la base comercial.
export type SegmentoCliente = "activo" | "ex_cliente" | "prospeccion"

// Motivo de baja de un ex-cliente (guía a la IA para reconquistas).
export type MotivoBaja = "precio" | "servicio" | "cerro" | "deuda" | "otro"

export interface Vendedor {
  id: string
  nombre: string
  iniciales: string
  zona: string
  activo: boolean
}

// Insumos para asignar el bucket por prioridad (ver lib/buckets.ts).
export interface DatosClasificacion {
  marca_reconocida: boolean
  envios_aprox: number
  quiere_fulfillment: boolean
}

export interface Oportunidad {
  id: string
  vendedor_id: string
  ecommerce: string
  sitio: string | null
  envios_aprox: number // envíos/mes estimados
  lugar_retiro: string
  tipo_producto: string
  interes: string | null // qué busca el prospecto
  bucket: Bucket
  clasificacion: DatosClasificacion // por qué cayó en ese bucket
  estado: EstadoOportunidad
  origen: OrigenOportunidad
  declarada_at: string // cuándo se declaró la oportunidad
  reunion_coordinada_at: string | null
  reunion_efectiva_at: string | null // hito que cuenta al objetivo
  cierre_at: string | null // solo si estado = cierre_ganado
  perdida_motivo: string | null
}

export interface OportunidadEvento {
  id: string
  oportunidad_id: string
  titulo: string
  detalle: string | null
  at: string
}

// Objetivo mensual de un vendedor: cantidad de reuniones efectivas + mezcla de
// tipos (porcentajes que suman 100).
export interface Objetivo {
  id: string
  vendedor_id: string
  periodo: string // "YYYY-MM"
  reuniones_efectivas: number
  mix: Record<Bucket, number> // porcentaje objetivo por bucket
}

export interface Cliente {
  id: string
  nombre: string
  iniciales: string
  segmento: SegmentoCliente
  envios_mes: number
  bucket: Bucket
  vendedor_id: string | null
  motivo_baja: MotivoBaja | null
  nota: string
}

// Contexto que alimenta al asistente de leads (editable por el admin).
export interface FuenteIA {
  key: string
  label: string
  activa: boolean
}
export interface ReglaIA {
  tipo: "evitar" | "priorizar"
  texto: string
}
export interface ContextoVendedor {
  vendedor_id: string
  foco: string
  texto: string
}
export interface ContextoIA {
  general: string
  actualizado_at: string
  fuentes: FuenteIA[]
  reglas: ReglaIA[]
  por_vendedor: ContextoVendedor[]
}
