// Capa de acceso a datos: queries a Supabase + mapeo de filas a los tipos del
// dominio (los mismos que consumían los mocks, así métricas/vistas no cambian).

import { supabase } from "@/lib/supabase"
import { iniciales } from "@/lib/display"
import type {
  Bucket,
  Cliente,
  ContextoIA,
  EstadoOportunidad,
  MotivoBaja,
  Objetivo,
  Oportunidad,
  OportunidadEvento,
  OrigenOportunidad,
  SegmentoCliente,
  Vendedor,
} from "@/lib/types"

// Fila cruda de vendedores (incluye rol/user_id que el dominio no expone).
export interface VendedorRow extends Vendedor {
  rol: "admin" | "vendedor"
  user_id: string | null
  email: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapVendedor(r: any): VendedorRow {
  return {
    id: r.id,
    nombre: r.nombre,
    iniciales: iniciales(r.nombre || r.email || "?"),
    zona: r.zona ?? "",
    activo: r.activo,
    rol: r.rol,
    user_id: r.user_id,
    email: r.email,
  }
}

function mapObjetivo(r: any): Objetivo {
  return {
    id: r.id,
    vendedor_id: r.vendedor_id,
    periodo: r.periodo,
    reuniones_efectivas: r.reuniones_efectivas,
    mix: { estrategico: r.mix_estrategico, fulfillment: r.mix_fulfillment, mediano: r.mix_mediano },
  }
}

function mapOportunidad(r: any): Oportunidad {
  return {
    id: r.id,
    vendedor_id: r.vendedor_id,
    ecommerce: r.ecommerce,
    sitio: r.sitio,
    envios_aprox: r.envios_aprox,
    lugar_retiro: r.lugar_retiro,
    tipo_producto: r.tipo_producto,
    interes: r.interes,
    bucket: r.bucket as Bucket,
    clasificacion: {
      marca_reconocida: r.marca_reconocida,
      envios_aprox: r.envios_aprox,
      quiere_fulfillment: r.quiere_fulfillment,
    },
    estado: r.estado as EstadoOportunidad,
    origen: r.origen as OrigenOportunidad,
    declarada_at: r.declarada_at,
    reunion_coordinada_at: r.reunion_coordinada_at,
    reunion_efectiva_at: r.reunion_efectiva_at,
    cierre_at: r.cierre_at,
    perdida_motivo: r.perdida_motivo,
  }
}

function mapCliente(r: any): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    iniciales: iniciales(r.nombre),
    segmento: r.segmento as SegmentoCliente,
    envios_mes: r.envios_mes,
    bucket: r.bucket as Bucket,
    vendedor_id: r.vendedor_id,
    motivo_baja: (r.motivo_baja ?? null) as MotivoBaja | null,
    nota: r.nota ?? "",
  }
}

function mapEvento(r: any): OportunidadEvento {
  return { id: r.id, oportunidad_id: r.oportunidad_id, titulo: r.titulo, detalle: r.detalle, at: r.created_at }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function check<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  return (data ?? ([] as unknown as T))
}

// ─────────────────────────────── Vendedores ───────────────────────────────
// Solo los del equipo (rol vendedor); los admin no aparecen en listados.
export async function fetchVendedores(): Promise<VendedorRow[]> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("rol", "vendedor")
    .order("nombre")
  return check(data, error).map(mapVendedor)
}

// Ficha del vendedor enlazada al usuario logueado (para auth/rol).
export async function fetchVendedorByUser(userId: string): Promise<VendedorRow | null> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapVendedor(data) : null
}

export async function fetchObjetivos(periodo: string): Promise<Objetivo[]> {
  const { data, error } = await supabase.from("objetivos").select("*").eq("periodo", periodo)
  return check(data, error).map(mapObjetivo)
}

export async function fetchOportunidades(vendedorId?: string): Promise<Oportunidad[]> {
  let q = supabase.from("oportunidades").select("*").order("declarada_at", { ascending: false })
  if (vendedorId) q = q.eq("vendedor_id", vendedorId)
  const { data, error } = await q
  return check(data, error).map(mapOportunidad)
}

export async function fetchOportunidad(id: string): Promise<Oportunidad | null> {
  const { data, error } = await supabase.from("oportunidades").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapOportunidad(data) : null
}

export async function fetchEventos(oportunidadId: string): Promise<OportunidadEvento[]> {
  const { data, error } = await supabase
    .from("oportunidad_eventos")
    .select("*")
    .eq("oportunidad_id", oportunidadId)
    .order("created_at", { ascending: false })
  return check(data, error).map(mapEvento)
}

export async function fetchClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase.from("clientes").select("*").order("segmento")
  return check(data, error).map(mapCliente)
}

// Ensambla el contexto IA de sus 4 tablas.
export async function fetchContexto(): Promise<ContextoIA> {
  const [gen, fuentes, reglas, porVend] = await Promise.all([
    supabase.from("contexto_ia").select("*").eq("id", 1).maybeSingle(),
    supabase.from("fuentes_ia").select("*").order("orden"),
    supabase.from("reglas_ia").select("*").order("orden"),
    supabase.from("contexto_vendedor").select("*"),
  ])
  if (gen.error) throw new Error(gen.error.message)
  return {
    general: gen.data?.general ?? "",
    actualizado_at: (gen.data?.updated_at ?? "").slice(0, 10),
    /* eslint-disable @typescript-eslint/no-explicit-any */
    fuentes: (fuentes.data ?? []).map((f: any) => ({ key: f.key, label: f.label, activa: f.activa })),
    reglas: (reglas.data ?? []).map((r: any) => ({ tipo: r.tipo, texto: r.texto })),
    por_vendedor: (porVend.data ?? []).map((v: any) => ({
      vendedor_id: v.vendedor_id,
      foco: v.foco,
      texto: v.texto,
    })),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
}
