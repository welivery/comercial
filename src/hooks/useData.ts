// Hooks de datos: envuelven las queries de src/data/api.ts con estado
// loading/error y recarga. (Sin react-query para mantener las deps chicas.)

import { useCallback, useEffect, useState } from "react"
import {
  fetchClientes,
  fetchContexto,
  fetchEventos,
  fetchObjetivos,
  fetchOportunidad,
  fetchOportunidades,
  fetchVendedores,
} from "@/data/api"

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // fn se re-crea por render; controlamos la ejecución con deps + tick.
  const run = useCallback(fn, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [run, tick])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}

export const useVendedores = () => useAsync(() => fetchVendedores(), [])
export const useObjetivos = (periodo: string) => useAsync(() => fetchObjetivos(periodo), [periodo])
export const useOportunidades = (vendedorId?: string) =>
  useAsync(() => fetchOportunidades(vendedorId), [vendedorId])
export const useOportunidad = (id: string | undefined) =>
  useAsync(() => (id ? fetchOportunidad(id) : Promise.resolve(null)), [id])
export const useEventos = (oportunidadId: string | undefined) =>
  useAsync(() => (oportunidadId ? fetchEventos(oportunidadId) : Promise.resolve([])), [oportunidadId])
export const useClientes = () => useAsync(() => fetchClientes(), [])
export const useContexto = () => useAsync(() => fetchContexto(), [])
