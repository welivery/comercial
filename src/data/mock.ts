// Datos de prueba del módulo Ventas (Etapa 1). Reemplazables por queries a
// Supabase sin tocar las vistas: las páginas consumen estos arrays vía hooks.

import { asignarBucket } from "@/lib/buckets"
import { ESTADOS_PIPELINE, iniciales } from "@/lib/display"
import type {
  Cliente,
  ContextoIA,
  EstadoOportunidad,
  Objetivo,
  Oportunidad,
  OportunidadEvento,
  OrigenOportunidad,
  Vendedor,
} from "@/lib/types"

export const VENDEDORES: Vendedor[] = [
  { id: "v1", nombre: "Camila Rojas", iniciales: "CR", zona: "Santiago Centro", activo: true },
  { id: "v2", nombre: "Matías Fuentes", iniciales: "MF", zona: "Providencia", activo: true },
  { id: "v3", nombre: "Fernanda Soto", iniciales: "FS", zona: "Ñuñoa", activo: true },
  { id: "v4", nombre: "Diego Araya", iniciales: "DA", zona: "Las Condes", activo: true },
]

// Vendedor "logueado" en la vista vendedor (mock de sesión).
export const VENDEDOR_ACTUAL = "v1"

export const OBJETIVOS: Objetivo[] = [
  { id: "o1", vendedor_id: "v1", periodo: "2026-08", reuniones_efectivas: 12, mix: { estrategico: 40, fulfillment: 30, mediano: 30 }, leads_cupo_diario: 10 },
  { id: "o2", vendedor_id: "v2", periodo: "2026-08", reuniones_efectivas: 12, mix: { estrategico: 35, fulfillment: 45, mediano: 20 }, leads_cupo_diario: 10 },
  { id: "o3", vendedor_id: "v3", periodo: "2026-08", reuniones_efectivas: 12, mix: { estrategico: 45, fulfillment: 25, mediano: 30 }, leads_cupo_diario: 10 },
  { id: "o4", vendedor_id: "v4", periodo: "2026-08", reuniones_efectivas: 10, mix: { estrategico: 30, fulfillment: 30, mediano: 40 }, leads_cupo_diario: 10 },
]

// ─────────────────── Factory de oportunidades (terse) ───────────────────
interface OpSpec {
  eco: string
  env: number
  marca?: boolean
  full?: boolean // quiere fulfillment
  estado: EstadoOportunidad
  tipo: string
  retiro: string
  interes?: string
  origen?: OrigenOportunidad
  sitio?: string
  declarada: string
  efectiva?: string
  coord?: string
  cierre?: string
  perdida?: string
}

function mkOp(vid: string, i: number, s: OpSpec): Oportunidad {
  const clasificacion = {
    marca_reconocida: !!s.marca,
    envios_aprox: s.env,
    quiere_fulfillment: !!s.full,
  }
  const idx = ESTADOS_PIPELINE.indexOf(s.estado)
  return {
    id: `${vid}-op${i}`,
    vendedor_id: vid,
    ecommerce: s.eco,
    sitio: s.sitio ?? null,
    envios_aprox: s.env,
    lugar_retiro: s.retiro,
    tipo_producto: s.tipo,
    interes: s.interes ?? null,
    bucket: asignarBucket(clasificacion),
    clasificacion,
    estado: s.estado,
    origen: s.origen ?? "manual",
    declarada_at: s.declarada,
    reunion_coordinada_at: idx >= 1 ? (s.coord ?? s.efectiva ?? "2026-08-06") : null,
    reunion_efectiva_at: idx >= 2 ? (s.efectiva ?? "2026-08-11") : null,
    cierre_at: s.estado === "cierre_ganado" ? (s.cierre ?? "2026-08-17") : null,
    perdida_motivo: s.estado === "perdido" ? (s.perdida ?? "No avanzó") : null,
  }
}

// ── Camila (v1) — pipeline completo y mostrado en la vista vendedor ──
const CAMILA: OpSpec[] = [
  { eco: "Kütral Velas", env: 320, estado: "interesado", tipo: "Velas y deco", retiro: "Ñuñoa", declarada: "2026-08-19" },
  { eco: "Anho Deco", env: 180, estado: "interesado", tipo: "Deco hogar", retiro: "Maipú", declarada: "2026-08-17" },
  { eco: "Fresh Market", env: 600, full: true, estado: "interesado", tipo: "Alimentos", retiro: "Quilicura", declarada: "2026-08-20", origen: "ia" },
  { eco: "Ruca Outdoor", env: 1400, estado: "reunion_coordinada", tipo: "Outdoor", retiro: "Ñuñoa", coord: "2026-08-13", declarada: "2026-08-08", origen: "ia" },
  { eco: "Cachai Snacks", env: 750, full: true, estado: "reunion_coordinada", tipo: "Snacks", retiro: "San Joaquín", coord: "2026-08-14", declarada: "2026-08-09" },
  { eco: "Prilana", env: 2100, marca: true, full: true, estado: "reunion_efectiva", tipo: "Textil / abrigo", retiro: "Quilicura", interes: "Fulfillment + última milla RM", sitio: "prilana.cl", efectiva: "2026-08-19", coord: "2026-08-15", declarada: "2026-08-12", origen: "ia" },
  { eco: "Bendito Café", env: 410, estado: "reunion_efectiva", tipo: "Café", retiro: "Providencia", efectiva: "2026-08-16", declarada: "2026-08-07" },
  { eco: "Ñam Mascotas", env: 980, full: true, estado: "reunion_efectiva", tipo: "Petshop", retiro: "La Florida", efectiva: "2026-08-18", declarada: "2026-08-10" },
  { eco: "Verde Limón", env: 1800, marca: true, estado: "propuesta_enviada", tipo: "Cosmética", retiro: "Providencia", efectiva: "2026-08-12", declarada: "2026-08-04" },
  { eco: "Mundo Bici", env: 340, estado: "propuesta_enviada", tipo: "Deportes", retiro: "Recoleta", efectiva: "2026-08-13", declarada: "2026-08-05" },
  { eco: "Deco Norte", env: 720, full: true, estado: "propuesta_enviada", tipo: "Hogar", retiro: "Huechuraba", efectiva: "2026-08-14", declarada: "2026-08-06" },
  { eco: "Bazar Aurora", env: 260, estado: "seguimiento", tipo: "Bazar", retiro: "Estación Central", efectiva: "2026-08-08", declarada: "2026-07-30" },
  { eco: "Vitalis", env: 1200, estado: "seguimiento", tipo: "Suplementos", retiro: "Las Condes", efectiva: "2026-08-09", declarada: "2026-07-31" },
  { eco: "Manoseca", env: 890, full: true, estado: "cierre_ganado", tipo: "Limpieza", retiro: "Cerrillos", efectiva: "2026-08-05", declarada: "2026-07-24", cierre: "2026-08-05" },
  { eco: "Café Aroma", env: 900, full: true, estado: "cierre_ganado", tipo: "Café de especialidad", retiro: "Ñuñoa", efectiva: "2026-08-03", declarada: "2026-07-25", cierre: "2026-08-04" },
  { eco: "Tienda Rosa", env: 210, estado: "perdido", tipo: "Indumentaria", retiro: "Independencia", declarada: "2026-08-02", perdida: "Precio (se quedó con courier propio)" },
  { eco: "KioscoYa", env: 150, estado: "perdido", tipo: "Kiosco online", retiro: "Quinta Normal", declarada: "2026-08-01", perdida: "Sin volumen suficiente" },
]

// ── Otros vendedores — set más chico, para los agregados del dashboard ──
const MATIAS: OpSpec[] = [
  { eco: "Nutra Chile", env: 1300, marca: true, estado: "reunion_efectiva", tipo: "Suplementos", retiro: "Providencia", efectiva: "2026-08-12", declarada: "2026-08-03" },
  { eco: "Sabores del Sur", env: 820, full: true, estado: "propuesta_enviada", tipo: "Alimentos", retiro: "Maipú", efectiva: "2026-08-10", declarada: "2026-08-02" },
  { eco: "BioCasa", env: 640, full: true, estado: "reunion_efectiva", tipo: "Limpieza eco", retiro: "La Reina", efectiva: "2026-08-14", declarada: "2026-08-06" },
  { eco: "PetGo", env: 700, full: true, estado: "cierre_ganado", tipo: "Petshop", retiro: "Ñuñoa", efectiva: "2026-08-07", declarada: "2026-07-28", cierre: "2026-08-08" },
  { eco: "Duna Store", env: 300, estado: "seguimiento", tipo: "Accesorios", retiro: "Santiago", efectiva: "2026-08-09", declarada: "2026-08-01" },
  { eco: "Kobe Wear", env: 1100, marca: true, estado: "propuesta_enviada", tipo: "Streetwear", retiro: "Providencia", efectiva: "2026-08-11", declarada: "2026-08-04" },
  { eco: "Lumen", env: 250, estado: "reunion_coordinada", tipo: "Iluminación", retiro: "Recoleta", declarada: "2026-08-15" },
]

const FERNANDA: OpSpec[] = [
  { eco: "Andes Gear", env: 1600, marca: true, estado: "reunion_efectiva", tipo: "Outdoor", retiro: "Ñuñoa", efectiva: "2026-08-13", declarada: "2026-08-05" },
  { eco: "Pura Vida", env: 1500, marca: true, estado: "cierre_ganado", tipo: "Cosmética natural", retiro: "Providencia", efectiva: "2026-08-06", declarada: "2026-07-27", cierre: "2026-08-09" },
  { eco: "Marea", env: 480, estado: "reunion_efectiva", tipo: "Indumentaria", retiro: "Las Condes", efectiva: "2026-08-15", declarada: "2026-08-07" },
  { eco: "Aurora Kids", env: 900, full: true, estado: "propuesta_enviada", tipo: "Infantil", retiro: "La Florida", efectiva: "2026-08-12", declarada: "2026-08-03" },
  { eco: "Trekco", env: 1200, marca: true, estado: "reunion_efectiva", tipo: "Camping", retiro: "Maipú", efectiva: "2026-08-16", declarada: "2026-08-08" },
  { eco: "Bello Hogar", env: 350, estado: "seguimiento", tipo: "Deco", retiro: "Recoleta", efectiva: "2026-08-10", declarada: "2026-08-01" },
]

const DIEGO: OpSpec[] = [
  { eco: "Tech Nova", env: 800, full: true, estado: "reunion_efectiva", tipo: "Electrónica", retiro: "Las Condes", efectiva: "2026-08-14", declarada: "2026-08-06" },
  { eco: "Casa Bonita", env: 300, estado: "reunion_efectiva", tipo: "Deco hogar", retiro: "Vitacura", efectiva: "2026-08-12", declarada: "2026-08-04" },
  { eco: "Snack Attack", env: 260, estado: "reunion_efectiva", tipo: "Snacks", retiro: "Providencia", efectiva: "2026-08-16", declarada: "2026-08-08" },
  { eco: "Vinos del Valle", env: 1400, marca: true, estado: "propuesta_enviada", tipo: "Vinos", retiro: "Maipú", efectiva: "2026-08-11", declarada: "2026-08-02" },
  { eco: "Kids Land", env: 520, full: true, estado: "cierre_ganado", tipo: "Juguetería", retiro: "La Reina", efectiva: "2026-08-05", declarada: "2026-07-26", cierre: "2026-08-10" },
  { eco: "Punto Verde", env: 190, estado: "seguimiento", tipo: "Plantas", retiro: "Ñuñoa", efectiva: "2026-08-09", declarada: "2026-08-01" },
]

export const OPORTUNIDADES: Oportunidad[] = [
  ...CAMILA.map((s, i) => mkOp("v1", i, s)),
  ...MATIAS.map((s, i) => mkOp("v2", i, s)),
  ...FERNANDA.map((s, i) => mkOp("v3", i, s)),
  ...DIEGO.map((s, i) => mkOp("v4", i, s)),
]

// Línea de tiempo de una oportunidad (mock para el detalle de Prilana).
export const EVENTOS: OportunidadEvento[] = [
  { id: "e1", oportunidad_id: "v1-op5", titulo: "Reunión efectiva registrada", detalle: "Recorrido de bodega + demo de tracking. Muy interesados en fulfillment.", at: "2026-08-19" },
  { id: "e2", oportunidad_id: "v1-op5", titulo: "Reunión coordinada", detalle: "Agendada por WhatsApp con Josefina (ops Prilana).", at: "2026-08-15" },
  { id: "e3", oportunidad_id: "v1-op5", titulo: "Bucket asignado: Estratégico", detalle: "Marca reconocida y >1.000 envíos/mes → prioridad estratégica.", at: "2026-08-12" },
  { id: "e4", oportunidad_id: "v1-op5", titulo: "Oportunidad declarada", detalle: "Origen: sugerencia de IA (Buscar leads).", at: "2026-08-12" },
]

// ─────────────────────────── Base de clientes ───────────────────────────
function cli(
  nombre: string,
  segmento: Cliente["segmento"],
  envios_mes: number,
  bucket: Cliente["bucket"],
  vendedor_id: string | null,
  motivo_baja: Cliente["motivo_baja"],
  nota: string
): Cliente {
  return { id: nombre.toLowerCase().replace(/\s+/g, "-"), nombre, iniciales: iniciales(nombre), segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota }
}

export const CLIENTES: Cliente[] = [
  cli("Manoseca", "activo", 890, "fulfillment", "v1", null, "Cliente desde ago 2026"),
  cli("Café Altura", "activo", 1500, "estrategico", "v3", null, "Desde 2024 · muy conforme"),
  cli("Tienda Verde", "activo", 420, "mediano", "v2", null, "Desde 2025"),
  cli("Café Aroma", "activo", 900, "fulfillment", "v1", null, "Cliente nuevo · ago 2026"),
  cli("Deco Sur", "activo", 820, "fulfillment", "v2", null, "Desde 2025"),
  cli("Zapatería Andes", "activo", 500, "mediano", "v4", null, "Desde 2024"),
  cli("Petmania", "ex_cliente", 1900, "estrategico", null, "precio", "Se fue a Chilexpress (2024)"),
  cli("Bikeshop Sur", "ex_cliente", 380, "mediano", null, "servicio", "Demoras en regiones (2025)"),
  cli("La Despensa", "ex_cliente", 640, "fulfillment", null, "cerro", "Cerró operación online"),
  cli("Runa Andina", "prospeccion", 1600, "estrategico", "v1", null, "Sugerido por IA · 92% fit"),
  cli("Huerto Bravo", "prospeccion", 700, "fulfillment", "v1", null, "Busca 3PL (post LinkedIn)"),
  cli("Petmania", "prospeccion", 1900, "estrategico", "v1", null, "Reconquista sugerida por IA"),
]

// ─────────────────────────── Contexto para la IA ───────────────────────────
export const CONTEXTO_IA: ContextoIA = {
  actualizado_at: "2026-08-18",
  general: [
    "Propuesta de valor: entregas 24-48h en RM y 48-72h en regiones, tracking en tiempo real y fulfillment opcional (almacenamiento + armado de pedidos).",
    "Diferenciales: mejor tiempo en regiones que couriers tradicionales; retiro sin costo en bodega del cliente desde 300 envíos/mes.",
    "Zonas fuertes: RM completa, Valparaíso, Concepción. Más débil: extremo norte y sur (subcontratado).",
    "Tarifas de referencia: última milla RM desde $2.490; fulfillment desde $390 por pedido armado.",
    "Foco del trimestre: marcas reconocidas, e-commerce +1.000 envíos/mes y clientes que quieran fulfillment.",
    "Competencia frecuente: Chilexpress, Blue Express, Starken y couriers propios.",
  ].join("\n\n"),
  fuentes: [
    { key: "base", label: "Base de clientes (activos, ex, prospección)", activa: true },
    { key: "maps", label: "Google Maps / negocios locales", activa: true },
    { key: "web", label: "Sitios web y redes sociales", activa: true },
    { key: "directorios", label: "Directorios de e-commerce CL", activa: true },
    { key: "resenas", label: "Reseñas públicas (detectar dolor)", activa: false },
  ],
  reglas: [
    { tipo: "evitar", texto: "No sugerir ex-clientes dados de baja por deuda." },
    { tipo: "evitar", texto: "No proponer clientes ya activos de otro vendedor." },
    { tipo: "priorizar", texto: "Priorizar zonas fuertes (RM, Valparaíso, Concepción)." },
    { tipo: "priorizar", texto: "Reconquistar bajas por precio si mejoró su volumen." },
  ],
  por_vendedor: [
    { vendedor_id: "v1", foco: "Estratégico", texto: "Va bajo en estratégico este mes — priorizar marcas reconocidas y +1.000 envíos en su zona. Buena para outdoor y textil. Evitar alimentos perecederos (no le cierran)." },
    { vendedor_id: "v2", foco: "Fulfillment", texto: "Fuerte en fulfillment. Sugerir e-commerce que pidan tercerizar almacenamiento. Tiene contactos en cosmética y suplementos — aprovechar referidos." },
  ],
}
