// Genera supabase/seed.sql a partir del mock (src/data/mock.ts) para que los
// datos de demo en Supabase coincidan exactamente con lo que ya se ve en la app.
// Uso: tsx --tsconfig scripts/tsconfig.seed.json scripts/gen-seed.mts > supabase/seed.sql

import { VENDEDORES, OBJETIVOS, OPORTUNIDADES, EVENTOS, CLIENTES, CONTEXTO_IA } from "@/data/mock"
import type { Bucket } from "@/lib/types"

const s = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`
const num = (v: number | null | undefined) => (v === null || v === undefined ? "NULL" : String(v))
const bool = (v: boolean) => (v ? "true" : "false")
const tsv = (v: string | null | undefined) => (v ? `'${v}'` : "NULL")

// UUID determinístico por vendedor (v1..v4 -> dígito repetido, hex válido).
const vuid = (id: string) => {
  const d = id.replace("v", "")
  return `${d.repeat(8)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`
}
// UUID determinístico por oportunidad (por índice).
const oppMap = new Map<string, string>()
OPORTUNIDADES.forEach((o, i) => {
  oppMap.set(o.id, `a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`)
})

const out: string[] = []
out.push("-- Welivery Comercial — Seed de demo (generado desde el mock).")
out.push("-- Idempotente: usa on conflict do nothing donde hay PK fija.")
out.push("begin;")

// config + contexto IA
out.push(`insert into config_ventas (id, pais, umbral_estrategico) values (1, 'CL', 1000) on conflict (id) do nothing;`)
out.push(
  `insert into contexto_ia (id, general) values (1, ${s(CONTEXTO_IA.general)}) on conflict (id) do nothing;`
)
for (const f of CONTEXTO_IA.fuentes)
  out.push(
    `insert into fuentes_ia (key, label, activa, orden) values (${s(f.key)}, ${s(f.label)}, ${bool(
      f.activa
    )}, ${CONTEXTO_IA.fuentes.indexOf(f)}) on conflict (key) do nothing;`
  )
CONTEXTO_IA.reglas.forEach((r, i) =>
  out.push(`insert into reglas_ia (tipo, texto, orden) values (${s(r.tipo)}, ${s(r.texto)}, ${i});`)
)

// vendedores
out.push("")
for (const v of VENDEDORES)
  out.push(
    `insert into vendedores (id, email, nombre, rol, zona) values (${s(vuid(v.id))}, ${s(
      v.id + "@demo.welivery.cl"
    )}, ${s(v.nombre)}, 'vendedor', ${s(v.zona)}) on conflict (id) do nothing;`
  )

// objetivos
out.push("")
for (const o of OBJETIVOS)
  out.push(
    `insert into objetivos (vendedor_id, periodo, reuniones_efectivas, mix_estrategico, mix_fulfillment, mix_mediano) values (${s(
      vuid(o.vendedor_id)
    )}, ${s(o.periodo)}, ${o.reuniones_efectivas}, ${o.mix.estrategico}, ${o.mix.fulfillment}, ${
      o.mix.mediano
    }) on conflict (vendedor_id, periodo) do nothing;`
  )

// oportunidades
out.push("")
for (const o of OPORTUNIDADES) {
  const c = o.clasificacion
  out.push(
    `insert into oportunidades (id, vendedor_id, ecommerce, sitio, envios_aprox, lugar_retiro, tipo_producto, interes, marca_reconocida, quiere_fulfillment, bucket, estado, origen, declarada_at, reunion_coordinada_at, reunion_efectiva_at, cierre_at, perdida_motivo) values (` +
      [
        s(oppMap.get(o.id)),
        s(vuid(o.vendedor_id)),
        s(o.ecommerce),
        s(o.sitio),
        num(o.envios_aprox),
        s(o.lugar_retiro),
        s(o.tipo_producto),
        s(o.interes),
        bool(c.marca_reconocida),
        bool(c.quiere_fulfillment),
        s(o.bucket as Bucket),
        s(o.estado),
        s(o.origen),
        tsv(o.declarada_at),
        tsv(o.reunion_coordinada_at),
        tsv(o.reunion_efectiva_at),
        tsv(o.cierre_at),
        s(o.perdida_motivo),
      ].join(", ") +
      `) on conflict (id) do nothing;`
  )
}

// eventos
out.push("")
for (const e of EVENTOS) {
  const oid = oppMap.get(e.oportunidad_id)
  if (!oid) continue
  out.push(
    `insert into oportunidad_eventos (oportunidad_id, titulo, detalle, created_at) values (${s(
      oid
    )}, ${s(e.titulo)}, ${s(e.detalle)}, ${tsv(e.at)});`
  )
}

// clientes
out.push("")
for (const c of CLIENTES)
  out.push(
    `insert into clientes (nombre, segmento, envios_mes, bucket, vendedor_id, motivo_baja, nota) values (${s(
      c.nombre
    )}, ${s(c.segmento)}, ${num(c.envios_mes)}, ${s(c.bucket)}, ${
      c.vendedor_id ? s(vuid(c.vendedor_id)) : "NULL"
    }, ${c.motivo_baja ? s(c.motivo_baja) : "NULL"}, ${s(c.nota)});`
  )

// contexto por vendedor
out.push("")
for (const cv of CONTEXTO_IA.por_vendedor)
  out.push(
    `insert into contexto_vendedor (vendedor_id, foco, texto) values (${s(vuid(cv.vendedor_id))}, ${s(
      cv.foco
    )}, ${s(cv.texto)}) on conflict (vendedor_id) do nothing;`
  )

out.push("commit;")
console.log(out.join("\n"))
