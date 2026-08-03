import { useState } from "react"
import { Pencil, Plus, Shield, Trash2, UserRound } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHead } from "@/components/PageHead"
import { Modal } from "@/components/Modal"
import { Cargando, ErrorMsg, VAvatar } from "@/components/widgets"
import { useUsuarios } from "@/hooks/useData"
import {
  actualizarUsuario,
  crearUsuario,
  crearUsuarioConAcceso,
  eliminarCuenta,
  eliminarUsuario,
  type VendedorRow,
} from "@/data/api"
import { useVentas } from "@/store"

type RolV = "admin" | "vendedor"

interface FormState {
  nombre: string
  email: string
  zona: string
  rol: RolV
  password: string
}
const VACIO: FormState = { nombre: "", email: "", zona: "", rol: "vendedor", password: "" }

export function AdminUsuarios() {
  const { usuario } = useVentas()
  const { data: usuarios, loading, error, reload } = useUsuarios()
  const [abierto, setAbierto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  const lista = usuarios ?? []

  function abrirNuevo() {
    setEditId(null)
    setForm(VACIO)
    setErrForm(null)
    setAbierto(true)
  }
  function abrirEditar(u: VendedorRow) {
    setEditId(u.id)
    setForm({ nombre: u.nombre, email: u.email, zona: u.zona, rol: u.rol, password: "" })
    setErrForm(null)
    setAbierto(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setErrForm(null)
    try {
      if (editId) {
        await actualizarUsuario(editId, { nombre: form.nombre, zona: form.zona, rol: form.rol })
      } else if (form.password.trim()) {
        // Con contraseña → crea la cuenta de acceso (Edge Function).
        await crearUsuarioConAcceso({
          email: form.email,
          nombre: form.nombre,
          zona: form.zona,
          rol: form.rol,
          password: form.password.trim(),
        })
      } else {
        // Sin contraseña → solo la ficha (la persona se registra después).
        await crearUsuario({ email: form.email, nombre: form.nombre, zona: form.zona, rol: form.rol })
      }
      setAbierto(false)
      reload()
    } catch (err) {
      setErrForm(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(u: VendedorRow) {
    await actualizarUsuario(u.id, { activo: !u.activo })
    reload()
  }

  async function borrar(u: VendedorRow) {
    const conAcceso = !!u.user_id
    const msg = conAcceso
      ? `¿Eliminar a ${u.nombre || u.email}? Se borra también su cuenta de acceso.`
      : `¿Eliminar el registro de ${u.nombre || u.email}?`
    if (!window.confirm(msg)) return
    try {
      if (conAcceso) await eliminarCuenta(u.user_id as string, u.id)
      else await eliminarUsuario(u.id)
      reload()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  if (loading) return <Cargando que="los usuarios" />
  if (error) return <ErrorMsg msg={error} />

  return (
    <>
      <PageHead titulo="Usuarios" descripcion="Equipo comercial: crear, editar y dar acceso">
        <Button variant="blue" onClick={abrirNuevo}>
          <Plus /> Agregar usuario
        </Button>
      </PageHead>

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5 font-medium">Usuario</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Zona</th>
              <th className="px-4 py-2.5 font-medium">Acceso</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-mist/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <VAvatar iniciales={u.iniciales} />
                    <span className="text-[13px] font-medium text-ink">
                      {u.nombre || <span className="text-muted">Sin nombre</span>}
                      {usuario?.id === u.id && <span className="ml-1.5 text-[11px] text-blue">(vos)</span>}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-slate">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: (u.rol === "admin" ? "#2F5BE6" : "#7A869C") + "1F",
                      color: u.rol === "admin" ? "#2F5BE6" : "#5A6577",
                    }}
                  >
                    {u.rol === "admin" ? <Shield size={11} /> : <UserRound size={11} />}
                    {u.rol === "admin" ? "Admin" : "Vendedor"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-slate">{u.zona || "—"}</td>
                <td className="px-4 py-3">
                  {u.user_id ? (
                    <span className="text-[12px] font-medium text-success">Con login</span>
                  ) : (
                    <span className="text-[12px] text-warning" title="Se activa cuando la persona se registra con su email">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActivo(u)}
                    className="text-[12px] font-medium underline-offset-2 hover:underline"
                    style={{ color: u.activo ? "#1E9E6A" : "#A6AEBC" }}
                  >
                    {u.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => abrirEditar(u)}
                      className="grid size-8 place-items-center rounded-md text-slate hover:bg-mist"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => borrar(u)}
                      disabled={usuario?.id === u.id}
                      className="grid size-8 place-items-center rounded-md text-slate hover:bg-[#FBE2E2] hover:text-error disabled:opacity-30"
                      title={usuario?.id === u.id ? "No podés eliminarte a vos" : "Eliminar"}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-slate">
                  No hay usuarios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3.5 text-[12px] text-slate">
        <UserRound size={16} className="mt-0.5 shrink-0 text-blue" />
        <p className="leading-relaxed">
          Al crear un usuario cargás su ficha con un email. Para que pueda entrar, la persona se{" "}
          <b className="font-semibold text-ink">registra con ese mismo email</b> desde la pantalla de login
          (queda enganchada automáticamente), o le seteás una contraseña desde Supabase → Authentication.
          Eliminar el registro lo saca del equipo, pero no borra su cuenta de acceso (eso se hace en Supabase).
        </p>
      </div>

      <Modal open={abierto} onClose={() => setAbierto(false)} title={editId ? "Editar usuario" : "Nuevo usuario"}>
        <form onSubmit={guardar} className="flex flex-col gap-3.5">
          <Campo label="Nombre">
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="inp"
              placeholder="Nombre y apellido"
              required
            />
          </Campo>
          <Campo label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="inp disabled:bg-mist disabled:text-slate"
              placeholder="persona@welivery.cl"
              required
              disabled={!!editId}
            />
          </Campo>
          <Campo label="Zona">
            <input
              value={form.zona}
              onChange={(e) => setForm({ ...form, zona: e.target.value })}
              className="inp"
              placeholder="Santiago Centro"
            />
          </Campo>
          <Campo label="Rol">
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as RolV })}
              className="inp"
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin">Admin</option>
            </select>
          </Campo>

          {!editId && (
            <Campo label="Contraseña (opcional)">
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="inp"
                placeholder="Dejá vacío para que se registre solo/a"
                minLength={6}
                autoComplete="off"
              />
              <span className="text-[11px] text-muted">
                Con contraseña le creás el acceso directo. Vacío = solo la ficha; la persona se registra
                con su email desde el login.
              </span>
            </Campo>
          )}

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

      {/* estilos de inputs del modal */}
      <style>{`.inp{border:1px solid var(--color-input);border-radius:8px;padding:8px 12px;font-size:14px;color:var(--color-ink);outline:none;width:100%;background:#fff}.inp:focus{border-color:var(--color-blue)}`}</style>
    </>
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
