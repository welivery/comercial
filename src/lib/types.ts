// Tipos del dominio Welivery Ventas (seguimiento comercial de vendedores CL).
// App separada de Welivery Care: mismo stack y marca, datos independientes.
// Espejo del esquema en supabase/.

export type RolVentas = "admin" | "vendedor"

// Bucket = id del SEGMENTO de cliente al que cayó la oportunidad. Los segmentos
// son configurables por el admin (tabla `segmentos`, ver lib/buckets.ts); por eso
// el tipo es un string abierto y no un union fijo. Semilla: estrategico /
// fulfillment / mediano / chico.
export type Bucket = string

// Un segmento clasifica clientes/oportunidades. 'volumen' = banda por envíos/mes
// (envios_min); 'especial' = se asigna por una regla (hoy 'fulfillment').
export type SegmentoTipo = "volumen" | "especial"
export interface Segmento {
  id: string
  nombre: string
  tipo: SegmentoTipo
  envios_min: number | null // solo 'volumen'
  regla: string | null // solo 'especial' (p.ej. 'fulfillment')
  color: string
  orden: number
  activo: boolean
}

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
  leads_cupo_diario: number // leads nuevos que se le cargan automático por día
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

// ─────────────────────────────── Leads ───────────────────────────────
// Un lead es un potencial cliente detectado (por IA en la web, o sembrado de
// la base como ex-cliente a reconquistar). Persistente: el vendedor lo clasifica
// pasándolo a oportunidad o rechazándolo con un motivo.
export type LeadEstado = "nuevo" | "convertido" | "rechazado"
export type LeadOrigen = "ia" | "base"
export type MotivoRechazo =
  | "no_interesado"
  | "pocos_envios"
  | "negocio_inactivo"
  | "no_contesta"
  | "ya_tiene_proveedor"
  | "fuera_zona"
  | "otro"

export interface FuenteLead {
  tipo: "maps" | "web" | "social" | "base" | "linkedin" | "tendencia"
  detalle: string
  url?: string | null
}

export interface Lead {
  id: string
  vendedor_id: string
  nombre: string
  iniciales: string
  bucket: Bucket
  fit: number // 0-100, encaje con el objetivo del vendedor
  reconquista: boolean // true = ex-cliente a recuperar
  motivo: string
  web: string | null
  telefono: string | null
  email: string | null
  fuentes: FuenteLead[]
  origen: LeadOrigen
  estado: LeadEstado
  motivo_rechazo: MotivoRechazo | null
  oportunidad_id: string | null
  created_at: string
}

// Créditos de búsqueda con IA (por vendedor y mes).
export interface CreditosLeads {
  limite: number
  usados: number
}

// ─────────────────────────── Secuencias de email ───────────────────────────
// Una secuencia = varios mails con tiempos de espera para reactivar/prospectar.
// vendedor_id null = plantilla compartida del equipo (editable solo por admin).
export type SecuenciaObjetivo = "reactivacion" | "prospeccion" | "otro"
export interface Secuencia {
  id: string
  vendedor_id: string | null
  nombre: string
  objetivo: SecuenciaObjetivo
  activo: boolean
  created_at: string
}
export interface SecuenciaPaso {
  id: string
  secuencia_id: string
  orden: number
  dias_espera: number // días desde la inscripción (paso 1) o desde el paso anterior
  asunto: string
  cuerpo: string
  activo: boolean
}
export type InscripcionEstado = "activa" | "pausada" | "respondio" | "terminada" | "rebotada"
export interface SecuenciaInscripcion {
  id: string
  secuencia_id: string
  vendedor_id: string
  lead_id: string | null
  destinatario_nombre: string
  destinatario_email: string
  estado: InscripcionEstado
  paso_actual: number
  proximo_envio_at: string | null
  created_at: string
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
