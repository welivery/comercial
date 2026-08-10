// Capa de acceso a datos: queries a Supabase + mapeo de filas a los tipos del
// dominio (los mismos que consumían los mocks, así métricas/vistas no cambian).

import { supabase } from "@/lib/supabase"
import { asignarBucket } from "@/lib/buckets"
import { iniciales } from "@/lib/display"
import type {
  Bucket,
  Cliente,
  ConfigSecuencias,
  ContextoIA,
  CreditosLeads,
  EmailCuenta,
  IaAutonomia,
  EstadoOportunidad,
  Lead,
  LeadEstado,
  MotivoBaja,
  MotivoRechazo,
  InscripcionEstado,
  Objetivo,
  Oportunidad,
  OportunidadEvento,
  OrigenOportunidad,
  Secuencia,
  SecuenciaInscripcion,
  SecuenciaObjetivo,
  SecuenciaPaso,
  Segmento,
  SegmentoCliente,
  SegmentoTipo,
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
    mix: (r.mix ?? {}) as Record<string, number>,
    leads_cupo_diario: r.leads_cupo_diario ?? 10,
  }
}

function mapSegmento(r: any): Segmento {
  return {
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo as SegmentoTipo,
    envios_min: r.envios_min ?? null,
    regla: r.regla ?? null,
    color: r.color ?? "#7A869C",
    orden: r.orden ?? 0,
    activo: r.activo ?? true,
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
    contacto: r.contacto ?? null,
    email: r.email ?? null,
    telefono: r.telefono ?? null,
    comuna: r.comuna ?? null,
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

// Todos los usuarios (admins + vendedores) — para la gestión del admin.
export async function fetchUsuarios(): Promise<VendedorRow[]> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .order("rol")
    .order("nombre")
  return check(data, error).map(mapVendedor)
}

export interface NuevoUsuario {
  nombre: string
  email: string
  zona: string
  rol: "admin" | "vendedor"
}

// Crea la FICHA del usuario (sin cuenta de login todavía). La cuenta se enlaza
// cuando la persona se registra con ese email (trigger link_vendedor_on_signup).
export async function crearUsuario(u: NuevoUsuario): Promise<void> {
  const { error } = await supabase.from("vendedores").insert({
    nombre: u.nombre,
    email: u.email,
    zona: u.zona,
    rol: u.rol,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarUsuario(
  id: string,
  patch: Partial<{ nombre: string; zona: string; rol: "admin" | "vendedor"; activo: boolean }>
): Promise<void> {
  const { error } = await supabase.from("vendedores").update(patch).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function eliminarUsuario(id: string): Promise<void> {
  const { error } = await supabase.from("vendedores").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Extrae el mensaje de error de una Edge Function (cuerpo JSON si lo hay).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fnMsg(error: any): Promise<string> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const b = await error.context.json()
      if (b?.error) return b.error
    }
  } catch {
    /* ignore */
  }
  const msg = error?.message ?? "Error en la función"
  // La función `usuarios` no está deployada / no se llega a ella.
  if (/failed to (send|fetch)|not found|404/i.test(String(msg))) {
    return "La función 'usuarios' no está deployada. Creá el usuario SIN contraseña (se registra desde el login), o deployá la función 'usuarios' en Supabase."
  }
  return msg
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Crea la CUENTA de acceso (auth) + ficha, vía Edge Function (service_role).
export async function crearUsuarioConAcceso(p: NuevoUsuario & { password: string }): Promise<void> {
  const { error } = await supabase.functions.invoke("usuarios", {
    body: { action: "crear", ...p },
  })
  if (error) throw new Error(await fnMsg(error))
}

// Elimina la cuenta de acceso (auth) y la ficha, vía Edge Function.
export async function eliminarCuenta(userId: string, vendedorId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("usuarios", {
    body: { action: "eliminar", user_id: userId, vendedor_id: vendedorId },
  })
  if (error) throw new Error(await fnMsg(error))
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

// Alta/edición del objetivo mensual de un vendedor (upsert por vendedor+período).
// El mix es un mapa { segmentoId: porcentaje } que debe sumar 100.
export async function guardarObjetivo(
  vendedorId: string,
  periodo: string,
  reuniones: number,
  mix: Record<string, number>,
  cupoLeads: number
): Promise<void> {
  const { error } = await supabase.from("objetivos").upsert(
    {
      vendedor_id: vendedorId,
      periodo,
      reuniones_efectivas: reuniones,
      mix,
      leads_cupo_diario: cupoLeads,
    },
    { onConflict: "vendedor_id,periodo" }
  )
  if (error) throw new Error(error.message)
}

// ─────────────────────────────── Segmentos ───────────────────────────────
// Clasificaciones de cliente configurables por el admin (Estratégico, Mediano,
// Chico, Fulfillment…). Se cargan una vez en el registro reactivo (lib/buckets).
export async function fetchSegmentos(): Promise<Segmento[]> {
  const { data, error } = await supabase.from("segmentos").select("*").order("orden")
  return check(data, error).map(mapSegmento)
}

// Alta/edición de un segmento (upsert por id).
export async function guardarSegmento(s: Segmento): Promise<void> {
  const { error } = await supabase.from("segmentos").upsert(
    {
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      envios_min: s.tipo === "volumen" ? (s.envios_min ?? 0) : null,
      regla: s.tipo === "especial" ? (s.regla ?? "fulfillment") : null,
      color: s.color,
      orden: s.orden,
      activo: s.activo,
    },
    { onConflict: "id" }
  )
  if (error) throw new Error(error.message)
}

export async function eliminarSegmento(id: string): Promise<void> {
  const { error } = await supabase.from("segmentos").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function fetchOportunidades(vendedorId?: string): Promise<Oportunidad[]> {
  let q = supabase.from("oportunidades").select("*").order("declarada_at", { ascending: false })
  if (vendedorId) q = q.eq("vendedor_id", vendedorId)
  const { data, error } = await q
  return check(data, error).map(mapOportunidad)
}

// ─────────────────────────── Oportunidades (escritura) ───────────────────────────
export interface OportunidadInput {
  vendedor_id: string
  ecommerce: string
  sitio: string | null
  envios_aprox: number
  lugar_retiro: string
  tipo_producto: string
  interes: string | null
  marca_reconocida: boolean
  quiere_fulfillment: boolean
  origen: OrigenOportunidad
}

export async function crearOportunidad(i: OportunidadInput): Promise<void> {
  const bucket = asignarBucket({
    marca_reconocida: i.marca_reconocida,
    envios_aprox: i.envios_aprox,
    quiere_fulfillment: i.quiere_fulfillment,
  })
  const { error } = await supabase.from("oportunidades").insert({ ...i, bucket, estado: "interesado" })
  if (error) throw new Error(error.message)
}

const ORDEN_ESTADOS: EstadoOportunidad[] = [
  "interesado",
  "reunion_coordinada",
  "reunion_efectiva",
  "propuesta_enviada",
  "seguimiento",
  "cierre_ganado",
]

// Cambia el estado y backfillea los hitos temporales que correspondan (sin pisar
// los ya seteados), para que las métricas queden consistentes.
export async function moverOportunidad(o: Oportunidad, nuevo: EstadoOportunidad): Promise<void> {
  const now = new Date().toISOString()
  const idx = ORDEN_ESTADOS.indexOf(nuevo)
  const patch: Record<string, unknown> = { estado: nuevo }
  if (idx >= 1 && !o.reunion_coordinada_at) patch.reunion_coordinada_at = now
  if (idx >= 2 && !o.reunion_efectiva_at) patch.reunion_efectiva_at = now
  if (nuevo === "cierre_ganado" && !o.cierre_at) patch.cierre_at = now
  const { error } = await supabase.from("oportunidades").update(patch).eq("id", o.id)
  if (error) throw new Error(error.message)
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

// ─────────────────────────────── Clientes (CRUD) ───────────────────────────────
export interface ClienteInput {
  nombre: string
  segmento: SegmentoCliente
  envios_mes: number
  bucket: Bucket
  vendedor_id: string | null
  motivo_baja: MotivoBaja | null
  contacto: string | null
  email: string | null
  telefono: string | null
  comuna: string | null
  nota: string
}

export async function crearCliente(c: ClienteInput): Promise<void> {
  const { error } = await supabase.from("clientes").insert(c)
  if (error) throw new Error(error.message)
}
export async function actualizarCliente(id: string, patch: Partial<ClienteInput>): Promise<void> {
  const { error } = await supabase.from("clientes").update(patch).eq("id", id)
  if (error) throw new Error(error.message)
}
export async function eliminarCliente(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
// Alta en masa (importación CSV). Inserta en lotes para no exceder límites.
export async function crearClientesBulk(rows: ClienteInput[]): Promise<number> {
  let insertados = 0
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await supabase.from("clientes").insert(lote)
    if (error) throw new Error(error.message)
    insertados += lote.length
  }
  return insertados
}

// ─────────────────────────────── Leads ───────────────────────────────
// Clave normalizada para deduplicar (dominio del sitio, o nombre sin acentos).
function claveLead(nombre: string, web?: string | null): string {
  const dom = (web ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim()
  if (dom) return dom
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapLead(r: any): Lead {
  return {
    id: r.id,
    vendedor_id: r.vendedor_id,
    nombre: r.nombre,
    iniciales: iniciales(r.nombre),
    bucket: r.bucket as Bucket,
    fit: r.fit ?? 0,
    reconquista: !!r.reconquista,
    motivo: r.motivo ?? "",
    web: r.web ?? null,
    telefono: r.telefono ?? null,
    email: r.email ?? null,
    contacto: r.contacto ?? null,
    fuentes: Array.isArray(r.fuentes) ? r.fuentes : [],
    origen: r.origen,
    estado: r.estado,
    motivo_rechazo: (r.motivo_rechazo ?? null) as MotivoRechazo | null,
    oportunidad_id: r.oportunidad_id ?? null,
    created_at: r.created_at,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchLeads(vendedorId: string): Promise<Lead[]> {
  if (!vendedorId) return []
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
  return check(data, error).map(mapLead)
}

const MOTIVO_BAJA_TXT: Record<MotivoBaja, string> = {
  precio: "precio",
  servicio: "servicio",
  cerro: "cierre del negocio",
  deuda: "deuda",
  otro: "otro motivo",
}

// Actividad de leads del equipo (para el dashboard admin). Un lead se considera
// "contactado" cuando el vendedor lo clasificó (pasó a oportunidad o lo rechazó);
// la fecha de contacto es updated_at. Los 'nuevo' todavía no se contactaron.
export interface LeadActividad {
  vendedor_id: string
  estado: LeadEstado
  contactado_at: string | null
}

export async function fetchLeadsEquipo(): Promise<LeadActividad[]> {
  const { data, error } = await supabase.from("leads").select("vendedor_id, estado, updated_at")
  if (error) throw new Error(error.message)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => ({
    vendedor_id: r.vendedor_id,
    estado: r.estado,
    contactado_at: r.estado !== "nuevo" ? r.updated_at : null,
  }))
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// Tamaño del "cupo" diario: cuántos leads de la base trae cada vez.
export const LOTE_LEADS_BASE = 20

// Trae el próximo lote (~20) de leads desde la base: ex-clientes (reconquista) y
// prospectos, propios del vendedor o SIN asignar, priorizando los de mayor
// volumen. No repite los que ya trajo. Costo cero (no usa IA). Devuelve cuántos
// se agregaron.
export async function sembrarLeadsBase(vendedorId: string, lote = LOTE_LEADS_BASE): Promise<number> {
  if (!vendedorId) return 0
  const [baseRes, leadsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, segmento, bucket, envios_mes, motivo_baja, nota, vendedor_id, contacto, email, telefono, comuna")
      .in("segmento", ["ex_cliente", "prospeccion"])
      .or(`vendedor_id.eq.${vendedorId},vendedor_id.is.null`)
      .order("envios_mes", { ascending: false }),
    supabase.from("leads").select("clave").eq("vendedor_id", vendedorId),
  ])
  if (baseRes.error) throw new Error(baseRes.error.message)
  const yaHay = new Set((leadsRes.data ?? []).map((l: { clave: string }) => l.clave))

  const vistos = new Set<string>()
  const elegidos: { id: string; sinAsignar: boolean; fila: Record<string, unknown> }[] = []
  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (const c of (baseRes.data ?? []) as any[]) {
    const clave = claveLead(c.nombre)
    if (yaHay.has(clave) || vistos.has(clave)) continue
    vistos.add(clave)
    const esEx = c.segmento === "ex_cliente"
    // El contacto (persona/email/tel/comuna) ya son campos propios; el motivo
    // solo describe POR QUÉ es un lead, sin repetir datos de contacto.
    const motivo = esEx
      ? `Ex-cliente${c.motivo_baja ? ` (se fue por ${MOTIVO_BAJA_TXT[c.motivo_baja as MotivoBaja] ?? c.motivo_baja})` : ""}.` +
        (c.envios_mes ? ` Hacía ~${c.envios_mes} envíos/mes.` : "") +
        (c.nota ? ` ${String(c.nota).slice(0, 160)}` : "")
      : `Prospecto de tu base.` +
        (c.envios_mes ? ` ~${c.envios_mes} envíos/mes estimados.` : "") +
        (c.nota ? ` ${String(c.nota).slice(0, 160)}` : "")
    elegidos.push({
      id: c.id,
      sinAsignar: c.vendedor_id == null,
      fila: {
        vendedor_id: vendedorId,
        nombre: c.nombre,
        clave,
        bucket: c.bucket,
        fit: esEx ? 70 : 60,
        reconquista: esEx,
        motivo,
        email: c.email ?? null,
        telefono: c.telefono ?? null,
        contacto: c.contacto ?? null,
        fuentes: [{ tipo: "base", detalle: esEx ? "Tu base · ex-cliente" : "Tu base · prospección", url: null }],
        origen: "base",
        estado: "nuevo",
      },
    })
    if (elegidos.length >= lote) break
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!elegidos.length) return 0

  const { error: insErr } = await supabase
    .from("leads")
    .upsert(elegidos.map((e) => e.fila), { onConflict: "vendedor_id,clave", ignoreDuplicates: true })
  if (insErr) throw new Error(insErr.message)

  // Reclamar los clientes SIN asignar que se trajeron, para que no aparezcan
  // como lead de otro vendedor (best-effort; no bloquea si falla el RLS).
  const idsSinAsignar = elegidos.filter((e) => e.sinAsignar).map((e) => e.id)
  if (idsSinAsignar.length) {
    await supabase.from("clientes").update({ vendedor_id: vendedorId }).in("id", idsSinAsignar).is("vendedor_id", null)
  }
  return elegidos.length
}

export async function rechazarLead(id: string, motivo: MotivoRechazo): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ estado: "rechazado", motivo_rechazo: motivo, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// Vuelve un lead rechazado a "nuevo" (deshacer).
export async function reactivarLead(id: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ estado: "nuevo", motivo_rechazo: null, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// Crea la oportunidad a partir del lead + los datos que completa el vendedor,
// y marca el lead como convertido (linkeado). Devuelve el id de la oportunidad.
export async function convertirLead(
  leadId: string,
  i: OportunidadInput,
  nota?: string
): Promise<string> {
  const bucket = asignarBucket({
    marca_reconocida: i.marca_reconocida,
    envios_aprox: i.envios_aprox,
    quiere_fulfillment: i.quiere_fulfillment,
  })
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({ ...i, bucket, estado: "interesado" })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  const opId = (data as { id: string }).id
  const { error: updErr } = await supabase
    .from("leads")
    .update({ estado: "convertido", oportunidad_id: opId, updated_at: new Date().toISOString() })
    .eq("id", leadId)
  if (updErr) throw new Error(updErr.message)
  // Nota opcional del vendedor → queda como primer evento del historial.
  if (nota && nota.trim()) {
    await supabase
      .from("oportunidad_eventos")
      .insert({ oportunidad_id: opId, titulo: "Nota al pasar a oportunidad", detalle: nota.trim() })
  }
  return opId
}

export async function fetchCreditosLeads(vendedorId: string, periodo: string): Promise<CreditosLeads> {
  if (!vendedorId) return { limite: 0, usados: 0 }
  const [cfg, uso] = await Promise.all([
    supabase.from("config_ventas").select("leads_limite_mensual").eq("id", 1).maybeSingle(),
    supabase.from("leads_uso").select("usados").eq("vendedor_id", vendedorId).eq("periodo", periodo).maybeSingle(),
  ])
  if (cfg.error) throw new Error(cfg.error.message)
  return {
    limite: cfg.data?.leads_limite_mensual ?? 15,
    usados: uso.data?.usados ?? 0,
  }
}

// ─────────────────────────── Secuencias de email ───────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSecuencia(r: any): Secuencia {
  return {
    id: r.id,
    vendedor_id: r.vendedor_id ?? null,
    nombre: r.nombre,
    objetivo: r.objetivo as SecuenciaObjetivo,
    activo: r.activo ?? true,
    created_at: r.created_at,
  }
}
function mapPaso(r: any): SecuenciaPaso {
  return {
    id: r.id,
    secuencia_id: r.secuencia_id,
    orden: r.orden,
    dias_espera: r.dias_espera ?? 0,
    asunto: r.asunto ?? "",
    cuerpo: r.cuerpo ?? "",
    activo: r.activo ?? true,
  }
}
function mapInscripcion(r: any): SecuenciaInscripcion {
  return {
    id: r.id,
    secuencia_id: r.secuencia_id,
    vendedor_id: r.vendedor_id,
    lead_id: r.lead_id ?? null,
    destinatario_nombre: r.destinatario_nombre ?? "",
    destinatario_empresa: r.destinatario_empresa ?? null,
    destinatario_email: r.destinatario_email ?? "",
    estado: r.estado as InscripcionEstado,
    paso_actual: r.paso_actual ?? 0,
    proximo_envio_at: r.proximo_envio_at ?? null,
    ultimo_envio_at: r.ultimo_envio_at ?? null,
    ia_sentimiento: (r.ia_sentimiento ?? null) as SecuenciaInscripcion["ia_sentimiento"],
    ia_confianza: r.ia_confianza ?? null,
    ia_resumen: r.ia_resumen ?? null,
    created_at: r.created_at,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Secuencias del vendedor + las plantillas compartidas (vendedor_id null).
export async function fetchSecuencias(vendedorId: string): Promise<Secuencia[]> {
  let q = supabase.from("secuencias").select("*").order("created_at", { ascending: false })
  if (vendedorId) q = q.or(`vendedor_id.eq.${vendedorId},vendedor_id.is.null`)
  const { data, error } = await q
  return check(data, error).map(mapSecuencia)
}

export async function fetchPasos(secuenciaId: string): Promise<SecuenciaPaso[]> {
  const { data, error } = await supabase
    .from("secuencia_pasos")
    .select("*")
    .eq("secuencia_id", secuenciaId)
    .order("orden")
  return check(data, error).map(mapPaso)
}

export async function crearSecuencia(
  vendedorId: string | null,
  nombre: string,
  objetivo: SecuenciaObjetivo
): Promise<string> {
  const { data, error } = await supabase
    .from("secuencias")
    .insert({ vendedor_id: vendedorId, nombre, objetivo })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function actualizarSecuencia(
  id: string,
  patch: Partial<{ nombre: string; objetivo: SecuenciaObjetivo; activo: boolean }>
): Promise<void> {
  const { error } = await supabase.from("secuencias").update(patch).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function eliminarSecuencia(id: string): Promise<void> {
  const { error } = await supabase.from("secuencias").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Duplica una secuencia (típicamente una plantilla) como propia del vendedor.
export async function duplicarSecuencia(secuenciaId: string, vendedorId: string): Promise<string> {
  const [seqRes, pasos] = await Promise.all([
    supabase.from("secuencias").select("*").eq("id", secuenciaId).single(),
    fetchPasos(secuenciaId),
  ])
  if (seqRes.error) throw new Error(seqRes.error.message)
  const orig = mapSecuencia(seqRes.data)
  const nuevoId = await crearSecuencia(vendedorId, `${orig.nombre} (copia)`, orig.objetivo)
  if (pasos.length) {
    const { error } = await supabase.from("secuencia_pasos").insert(
      pasos.map((p) => ({
        secuencia_id: nuevoId,
        orden: p.orden,
        dias_espera: p.dias_espera,
        asunto: p.asunto,
        cuerpo: p.cuerpo,
        activo: p.activo,
      }))
    )
    if (error) throw new Error(error.message)
  }
  return nuevoId
}

export interface PasoInput {
  orden: number
  dias_espera: number
  asunto: string
  cuerpo: string
  activo: boolean
}

// Reemplaza todos los pasos de una secuencia por la lista dada (borra + inserta).
export async function guardarPasos(secuenciaId: string, pasos: PasoInput[]): Promise<void> {
  const del = await supabase.from("secuencia_pasos").delete().eq("secuencia_id", secuenciaId)
  if (del.error) throw new Error(del.error.message)
  if (!pasos.length) return
  const { error } = await supabase.from("secuencia_pasos").insert(
    pasos.map((p, i) => ({
      secuencia_id: secuenciaId,
      orden: i + 1,
      dias_espera: p.dias_espera,
      asunto: p.asunto,
      cuerpo: p.cuerpo,
      activo: p.activo,
    }))
  )
  if (error) throw new Error(error.message)
}

export async function fetchInscripciones(vendedorId: string): Promise<SecuenciaInscripcion[]> {
  if (!vendedorId) return []
  const { data, error } = await supabase
    .from("secuencia_inscripciones")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
  return check(data, error).map(mapInscripcion)
}

// Inscribe un destinatario a una secuencia. El primer envío queda agendado según
// el "días de espera" del paso 1 (el envío real se activa en la Etapa C).
export async function inscribir(p: {
  secuencia_id: string
  vendedor_id: string
  lead_id: string | null
  destinatario_nombre: string
  destinatario_empresa?: string | null
  destinatario_email: string
}): Promise<void> {
  const pasos = await fetchPasos(p.secuencia_id)
  const dias1 = pasos[0]?.dias_espera ?? 0
  const proximo = new Date(Date.now() + dias1 * 864e5).toISOString()
  const { error } = await supabase.from("secuencia_inscripciones").insert({
    secuencia_id: p.secuencia_id,
    vendedor_id: p.vendedor_id,
    lead_id: p.lead_id,
    destinatario_nombre: p.destinatario_nombre,
    destinatario_empresa: p.destinatario_empresa ?? null,
    destinatario_email: p.destinatario_email,
    estado: "activa",
    paso_actual: 0,
    proximo_envio_at: proximo,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarInscripcion(
  id: string,
  estado: InscripcionEstado
): Promise<void> {
  const { error } = await supabase.from("secuencia_inscripciones").update({ estado }).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function eliminarInscripcion(id: string): Promise<void> {
  const { error } = await supabase.from("secuencia_inscripciones").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ─────────────────────────── Conexión de email (OAuth) ───────────────────────────
// La casilla que el vendedor conecta para enviar secuencias. El intercambio del
// código y el guardado del token lo hace la Edge Function `gmail-oauth`
// (service_role). Acá el front solo consulta el estado y desconecta.
export async function fetchEmailCuenta(vendedorId: string): Promise<EmailCuenta | null> {
  if (!vendedorId) return null
  const { data, error } = await supabase
    .from("email_cuentas")
    .select("vendedor_id, email, provider, conectado_at")
    .eq("vendedor_id", vendedorId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as EmailCuenta) : null
}

export async function desconectarEmail(vendedorId: string): Promise<void> {
  const { error } = await supabase.from("email_cuentas").delete().eq("vendedor_id", vendedorId)
  if (error) throw new Error(error.message)
}

// URL que inicia la conexión con Google (redirige a la Edge Function → Google).
export function urlConectarGmail(vendedorId: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return `${base ?? ""}/functions/v1/gmail-oauth?action=start&vid=${encodeURIComponent(vendedorId)}`
}

// ─────────────── Automatización de secuencias (config org-wide) ───────────────
export async function fetchConfigSecuencias(): Promise<ConfigSecuencias> {
  const { data, error } = await supabase
    .from("config_ventas")
    .select("secuencias_envio_activo, secuencias_ia_activa, secuencias_ia_autonomia, secuencias_ia_limite_mensual")
    .eq("id", 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    envio_activo: data?.secuencias_envio_activo ?? false,
    ia_activa: data?.secuencias_ia_activa ?? false,
    ia_autonomia: (data?.secuencias_ia_autonomia ?? "auto_claros") as IaAutonomia,
    ia_limite_mensual: data?.secuencias_ia_limite_mensual ?? 200,
  }
}

export async function guardarConfigSecuencias(c: ConfigSecuencias): Promise<void> {
  const { error } = await supabase
    .from("config_ventas")
    .update({
      secuencias_envio_activo: c.envio_activo,
      secuencias_ia_activa: c.ia_activa,
      secuencias_ia_autonomia: c.ia_autonomia,
      secuencias_ia_limite_mensual: c.ia_limite_mensual,
    })
    .eq("id", 1)
  if (error) throw new Error(error.message)
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
