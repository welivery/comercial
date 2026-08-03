import { useMemo, useState } from "react"
import { Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { Modal } from "@/components/Modal"
import { BucketChip, Cargando, ErrorMsg, SegmentoBadge } from "@/components/widgets"
import { useClientes, useContexto, useVendedores } from "@/hooks/useData"
import {
  actualizarCliente,
  crearCliente,
  crearClientesBulk,
  eliminarCliente,
  type ClienteInput,
} from "@/data/api"
import { CSV_PLANTILLA, parseClientesCsv, type ParseResult } from "@/lib/csv"
import { BUCKETS, BUCKET_LABEL } from "@/lib/buckets"
import { MOTIVO_BAJA_LABEL, SEGMENTO_LABEL, fmtEnvios, iniciales } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { Cliente, MotivoBaja, SegmentoCliente } from "@/lib/types"

const MOTIVO_COLOR: Record<MotivoBaja, string> = {
  precio: "#F2563A",
  servicio: "#E0A52F",
  cerro: "#7A869C",
  deuda: "#DB3B3B",
  otro: "#7A869C",
}
const SEGMENTOS: SegmentoCliente[] = ["activo", "ex_cliente", "prospeccion"]
const MOTIVOS: MotivoBaja[] = ["precio", "servicio", "cerro", "deuda", "otro"]

type Filtro = "todos" | SegmentoCliente

const VACIO: ClienteInput = {
  nombre: "",
  segmento: "activo",
  envios_mes: 0,
  bucket: "mediano",
  vendedor_id: null,
  motivo_baja: null,
  nota: "",
}

export function AdminClientes() {
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const { data: clientes, loading, error, reload } = useClientes()
  const { data: vendedores } = useVendedores()
  const { data: contexto } = useContexto()
  const CLIENTES = clientes ?? []
  const vends = vendedores ?? []

  const [abierto, setAbierto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ClienteInput>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  // Importación CSV
  const [impOpen, setImpOpen] = useState(false)
  const [impResult, setImpResult] = useState<ParseResult | null>(null)
  const [impNombre, setImpNombre] = useState("")
  const [importando, setImportando] = useState(false)
  const [impMsg, setImpMsg] = useState<string | null>(null)

  function abrirImport() {
    setImpResult(null)
    setImpNombre("")
    setImpMsg(null)
    setImpOpen(true)
  }
  function analizar(texto: string, nombre: string) {
    setImpNombre(nombre)
    setImpMsg(null)
    setImpResult(parseClientesCsv(texto, vends.map((v) => ({ id: v.id, nombre: v.nombre, email: v.email }))))
  }
  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => analizar(String(reader.result ?? ""), f.name)
    reader.readAsText(f)
  }
  function descargarPlantilla() {
    const blob = new Blob([CSV_PLANTILLA], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "plantilla-clientes-welivery.csv"
    a.click()
    URL.revokeObjectURL(url)
  }
  async function importar() {
    if (!impResult?.rows.length) return
    setImportando(true)
    setImpMsg(null)
    try {
      const n = await crearClientesBulk(impResult.rows)
      setImpOpen(false)
      reload()
      setImpMsg(null)
      window.alert(`Se importaron ${n} clientes.`)
    } catch (err) {
      setImpMsg(err instanceof Error ? err.message : "No se pudo importar")
    } finally {
      setImportando(false)
    }
  }

  const counts = useMemo(() => {
    const c = { activo: 0, ex_cliente: 0, prospeccion: 0 } as Record<SegmentoCliente, number>
    for (const cl of CLIENTES) c[cl.segmento]++
    return c
  }, [CLIENTES])

  const filtrados = filtro === "todos" ? CLIENTES : CLIENTES.filter((c) => c.segmento === filtro)
  const nombreVendedor = (id: string | null) => vends.find((v) => v.id === id)?.nombre.split(" ")[0]

  const chips: { key: Filtro; label: string; n: number; dot?: string }[] = [
    { key: "todos", label: "Todos", n: CLIENTES.length },
    { key: "activo", label: "Activos", n: counts.activo, dot: "#1E9E6A" },
    { key: "ex_cliente", label: "Ex-clientes", n: counts.ex_cliente, dot: "#F2563A" },
    { key: "prospeccion", label: "Prospección", n: counts.prospeccion, dot: "#2F5BE6" },
  ]

  function abrirNuevo() {
    setEditId(null)
    setForm(VACIO)
    setErrForm(null)
    setAbierto(true)
  }
  function abrirEditar(c: Cliente) {
    setEditId(c.id)
    setForm({
      nombre: c.nombre,
      segmento: c.segmento,
      envios_mes: c.envios_mes,
      bucket: c.bucket,
      vendedor_id: c.vendedor_id,
      motivo_baja: c.motivo_baja,
      nota: c.nota,
    })
    setErrForm(null)
    setAbierto(true)
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setErrForm(null)
    // El motivo de baja solo aplica a ex-clientes.
    const payload: ClienteInput = { ...form, motivo_baja: form.segmento === "ex_cliente" ? form.motivo_baja : null }
    try {
      if (editId) await actualizarCliente(editId, payload)
      else await crearCliente(payload)
      setAbierto(false)
      reload()
    } catch (err) {
      setErrForm(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }
  async function borrar(c: Cliente) {
    if (!window.confirm(`¿Eliminar a ${c.nombre} de la base?`)) return
    try {
      await eliminarCliente(c.id)
      reload()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  if (loading) return <Cargando que="la base de clientes" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Base de clientes" descripcion="Clientes, bajas y prospección · alimenta al asistente de leads">
        <Button variant="outline" onClick={abrirImport}>
          <Upload /> Importar CSV
        </Button>
        <Button variant="blue" onClick={abrirNuevo}>
          <Plus /> Agregar cliente
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-success" /> Clientes activos
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-success tabular-nums">{counts.activo}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-coral" /> Ex-clientes
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-coral tabular-nums">{counts.ex_cliente}</div>
          <div className="mt-1.5 text-[11.5px] text-slate">con motivo de baja</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <span className="size-2 rounded-full bg-blue" /> En prospección
          </div>
          <div className="mt-2 text-[26px] font-semibold leading-none text-blue tabular-nums">{counts.prospeccion}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-slate">
            <Sparkles size={14} className="text-mint" /> Contexto IA
          </div>
          <div className="mt-2 text-[16px] font-semibold leading-none text-success">Actualizado</div>
          <div className="mt-1.5 text-[11.5px] text-slate">{contexto?.actualizado_at ?? "—"}</div>
        </Card>
      </div>

      <div className="mb-3 mt-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFiltro(c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              filtro === c.key ? "bg-navy text-white" : "border border-input bg-white text-slate hover:bg-mist"
            )}
          >
            {c.dot && <span className="size-1.5 rounded-full" style={{ background: c.dot }} />}
            {c.label}
            <span className="tabular-nums opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5 font-medium">Empresa</th>
              <th className="px-4 py-2.5 font-medium">Segmento</th>
              <th className="px-4 py-2.5 font-medium">Envíos/mes</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Vendedor</th>
              <th className="px-4 py-2.5 font-medium">Motivo / nota</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-mist/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-mist text-[11px] font-semibold text-navy">
                      {iniciales(c.nombre)}
                    </span>
                    <span className="text-[13px] font-medium text-ink">{c.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SegmentoBadge segmento={c.segmento} />
                </td>
                <td className="px-4 py-3 text-[13px] tabular-nums text-ink">{fmtEnvios(c.envios_mes)}</td>
                <td className="px-4 py-3">
                  <BucketChip bucket={c.bucket} short />
                </td>
                <td className="px-4 py-3 text-[13px] text-slate">{nombreVendedor(c.vendedor_id) ?? "—"}</td>
                <td className="px-4 py-3 text-[12px] text-slate">
                  {c.motivo_baja && (
                    <span
                      className="mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ background: MOTIVO_COLOR[c.motivo_baja] + "1F", color: MOTIVO_COLOR[c.motivo_baja] }}
                    >
                      {MOTIVO_BAJA_LABEL[c.motivo_baja]}
                    </span>
                  )}
                  {c.nota}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => abrirEditar(c)}
                      className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => borrar(c)}
                      className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-slate">
                  No hay clientes en este segmento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <Sparkles size={16} className="shrink-0 text-blue" />
        <p className="leading-relaxed">
          Esta base es la materia prima de la IA: los <b className="font-semibold text-ink">motivos de baja</b>{" "}
          le permiten sugerir reconquistas en buen momento, y los activos/prospección evitan que sugiera
          clientes ya trabajados. El detalle de a quién proponer y cómo encarar se define en{" "}
          <b className="font-semibold text-ink">Contexto IA</b>.
        </p>
      </div>

      <Modal open={abierto} onClose={() => setAbierto(false)} title={editId ? "Editar cliente" : "Nuevo cliente"}>
        <form onSubmit={guardar} className="flex flex-col gap-3.5">
          <Campo label="Empresa">
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="inp"
              placeholder="Nombre del e-commerce"
              required
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Segmento">
              <select
                value={form.segmento}
                onChange={(e) => setForm({ ...form, segmento: e.target.value as SegmentoCliente })}
                className="inp"
              >
                {SEGMENTOS.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENTO_LABEL[s]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Envíos/mes">
              <input
                type="number"
                min={0}
                value={form.envios_mes}
                onChange={(e) => setForm({ ...form, envios_mes: Number(e.target.value) })}
                className="inp"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo (bucket)">
              <select
                value={form.bucket}
                onChange={(e) => setForm({ ...form, bucket: e.target.value as ClienteInput["bucket"] })}
                className="inp"
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {BUCKET_LABEL[b]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Vendedor">
              <select
                value={form.vendedor_id ?? ""}
                onChange={(e) => setForm({ ...form, vendedor_id: e.target.value || null })}
                className="inp"
              >
                <option value="">Sin asignar</option>
                {vends.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {form.segmento === "ex_cliente" && (
            <Campo label="Motivo de baja">
              <select
                value={form.motivo_baja ?? ""}
                onChange={(e) => setForm({ ...form, motivo_baja: (e.target.value || null) as MotivoBaja | null })}
                className="inp"
              >
                <option value="">—</option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_BAJA_LABEL[m]}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo label="Nota">
            <input
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
              className="inp"
              placeholder="Contexto útil (ej: desde 2024, muy conforme)"
            />
          </Campo>

          {errForm && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{errForm}</div>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="blue" disabled={guardando}>
              {guardando ? "Guardando…" : editId ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: importar CSV */}
      <Modal open={impOpen} onClose={() => setImpOpen(false)} title="Importar clientes desde CSV">
        <div className="flex flex-col gap-3.5">
          <div className="rounded-lg bg-mist/70 p-3 text-[12.5px] leading-relaxed text-slate">
            <b className="text-ink">Formato:</b> una fila por cliente, con encabezado. Un mismo archivo puede
            traer <b>activos, ex-clientes y prospección</b> (lo define la columna <code>segmento</code>).
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <tbody>
                  <Fila k="nombre" v="obligatorio" />
                  <Fila k="segmento" v="activo · ex_cliente · prospeccion" />
                  <Fila k="envios_mes" v="número (ej: 890)" />
                  <Fila k="bucket" v="estrategico · fulfillment · mediano (opcional; si vacío se calcula)" />
                  <Fila k="vendedor_email" v="email del vendedor (opcional)" />
                  <Fila k="motivo_baja" v="precio · servicio · cerro · deuda · otro (solo ex_cliente)" />
                  <Fila k="nota" v="texto libre (opcional)" />
                </tbody>
              </table>
            </div>
            <button onClick={descargarPlantilla} className="mt-2 font-medium text-blue hover:underline">
              ↓ Descargar plantilla de ejemplo
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-slate">Archivo .csv</span>
            <input type="file" accept=".csv,text/csv" onChange={onArchivo} className="text-[13px] text-slate" />
          </label>
          <div className="text-center text-[11px] text-muted">— o pegá el contenido —</div>
          <textarea
            rows={4}
            onChange={(e) => analizar(e.target.value, "pegado")}
            className="inp font-mono text-[12px]"
            placeholder="nombre,segmento,envios_mes,bucket,vendedor_email,motivo_baja,nota"
          />

          {impResult && (
            <div className="rounded-lg border border-border p-3 text-[12.5px]">
              <div className="font-medium text-ink">
                {impNombre && <span className="text-slate">{impNombre} · </span>}
                {impResult.rows.length} listos para importar
                {impResult.errores.length > 0 && (
                  <span className="text-warning"> · {impResult.errores.length} avisos</span>
                )}
              </div>
              {impResult.errores.length > 0 && (
                <ul className="mt-1.5 max-h-24 list-disc overflow-y-auto pl-4 text-[11.5px] text-slate">
                  {impResult.errores.slice(0, 8).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {impResult.errores.length > 8 && <li>…y {impResult.errores.length - 8} más</li>}
                </ul>
              )}
            </div>
          )}

          {impMsg && <div className="rounded-lg bg-[#FBE2E2] px-3 py-2 text-[12.5px] text-error">{impMsg}</div>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setImpOpen(false)}>
              Cancelar
            </Button>
            <Button variant="blue" disabled={importando || !impResult?.rows.length} onClick={importar}>
              {importando ? "Importando…" : `Importar ${impResult?.rows.length ?? 0}`}
            </Button>
          </div>
        </div>
      </Modal>

      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap py-0.5 pr-3 align-top font-mono text-blue">{k}</td>
      <td className="py-0.5 text-slate">{v}</td>
    </tr>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-slate">{label}</span>
      {children}
    </label>
  )
}
