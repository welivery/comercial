// Parser de CSV + mapeo a clientes. Sin dependencias. Un mismo archivo puede
// traer activos, ex-clientes y prospección (lo define la columna `segmento`).

import { asignarBucket } from "@/lib/buckets"
import type { Bucket, MotivoBaja, SegmentoCliente } from "@/lib/types"
import type { ClienteInput } from "@/data/api"

// Columnas esperadas (el header es obligatorio; el orden no importa).
export const CSV_COLUMNS = [
  "nombre",
  "segmento",
  "envios_mes",
  "bucket",
  "vendedor_email",
  "motivo_baja",
  "nota",
] as const

export const CSV_PLANTILLA =
  "nombre,segmento,envios_mes,bucket,vendedor_email,motivo_baja,nota\n" +
  "Tienda Sol,activo,850,fulfillment,camila@welivery.cl,,Desde 2025\n" +
  "Moda Norte,ex_cliente,1200,estrategico,,precio,Se fue por tarifas (2024)\n" +
  "Deco Austral,prospeccion,400,,,,Sugerido por referido\n"

// Parser CSV robusto (comillas, comas escapadas, delimitador , o ;).
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "") // BOM
  // Delimitador: el más frecuente en la primera línea.
  const firstLine = t.slice(0, t.indexOf("\n") === -1 ? t.length : t.indexOf("\n"))
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === delim) {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c !== "\r") field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

// Normalizadores tolerantes.
function normSegmento(v: string): SegmentoCliente | null {
  const s = v.trim().toLowerCase().replace(/[-\s]/g, "_")
  if (["activo", "activos", "cliente"].includes(s)) return "activo"
  if (["ex_cliente", "excliente", "ex", "baja", "bajas"].includes(s)) return "ex_cliente"
  if (["prospeccion", "prospección", "prospecto", "prospeccion_"].includes(s)) return "prospeccion"
  return null
}
function normBucket(v: string): Bucket | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith("estr")) return "estrategico"
  if (s.startsWith("full") || s.startsWith("fulf")) return "fulfillment"
  if (s.startsWith("med")) return "mediano"
  return null
}
function normMotivo(v: string): MotivoBaja | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith("prec")) return "precio"
  if (s.startsWith("serv")) return "servicio"
  if (s.startsWith("cer")) return "cerro"
  if (s.startsWith("deud")) return "deuda"
  return "otro"
}
function toNum(v: string): number {
  const n = Number(String(v).replace(/[^\d]/g, "")) // "~1.500" -> 1500
  return Number.isFinite(n) ? n : 0
}

export interface ParseResult {
  rows: ClienteInput[]
  errores: string[]
  totalLineas: number
}

export function parseClientesCsv(
  text: string,
  vendedores: { id: string; nombre: string; email: string }[]
): ParseResult {
  const grid = parseCsv(text)
  if (grid.length < 2) return { rows: [], errores: ["El archivo no tiene datos (falta el encabezado o las filas)."], totalLineas: 0 }

  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/[-\s]/g, "_"))
  const idx = (name: string) => header.indexOf(name)
  const iNombre = idx("nombre")
  const iSeg = idx("segmento")
  const iEnv = idx("envios_mes") >= 0 ? idx("envios_mes") : idx("envios")
  const iBucket = idx("bucket")
  const iVend = idx("vendedor_email") >= 0 ? idx("vendedor_email") : idx("vendedor")
  const iMotivo = idx("motivo_baja") >= 0 ? idx("motivo_baja") : idx("motivo")
  const iNota = idx("nota")

  if (iNombre < 0 || iSeg < 0) {
    return { rows: [], errores: ["Faltan columnas obligatorias: 'nombre' y 'segmento'."], totalLineas: grid.length - 1 }
  }

  const byEmail = new Map(vendedores.map((v) => [v.email.toLowerCase(), v.id]))
  const byNombre = new Map(vendedores.map((v) => [v.nombre.trim().toLowerCase(), v.id]))

  const rows: ClienteInput[] = []
  const errores: string[] = []
  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r]
    const nombre = (cols[iNombre] ?? "").trim()
    if (!nombre) {
      errores.push(`Fila ${r + 1}: sin nombre — se saltea.`)
      continue
    }
    const seg = normSegmento(cols[iSeg] ?? "")
    if (!seg) {
      errores.push(`Fila ${r + 1} (${nombre}): segmento inválido "${cols[iSeg] ?? ""}" — se saltea.`)
      continue
    }
    const envios = iEnv >= 0 ? toNum(cols[iEnv] ?? "") : 0
    const bucket =
      (iBucket >= 0 ? normBucket(cols[iBucket] ?? "") : null) ??
      asignarBucket({ marca_reconocida: false, envios_aprox: envios, quiere_fulfillment: false })
    const vendRaw = (iVend >= 0 ? cols[iVend] ?? "" : "").trim().toLowerCase()
    const vendedor_id = vendRaw ? byEmail.get(vendRaw) ?? byNombre.get(vendRaw) ?? null : null
    if (vendRaw && !vendedor_id) errores.push(`Fila ${r + 1} (${nombre}): vendedor "${cols[iVend]}" no encontrado — queda sin asignar.`)
    const motivo_baja = seg === "ex_cliente" && iMotivo >= 0 ? normMotivo(cols[iMotivo] ?? "") : null
    const nota = iNota >= 0 ? (cols[iNota] ?? "").trim() : ""
    rows.push({ nombre, segmento: seg, envios_mes: envios, bucket, vendedor_id, motivo_baja, nota })
  }
  return { rows, errores, totalLineas: grid.length - 1 }
}
