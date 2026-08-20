import { useEffect, useState } from "react"

/**
 * Como useState, pero recuerda el valor en localStorage bajo `key`.
 *
 * Sirve para preferencias de UI (filtros, orden, toggles) que deben sobrevivir a
 * recargas y a salir/volver de la pestaña: al re-montar el componente el valor se
 * lee de localStorage en vez de arrancar del default, así el vendedor vuelve y
 * encuentra la lista como la había dejado.
 *
 * No usar para datos sensibles ni para estado que deba resetearse (ej: selección
 * múltiple). Si localStorage está bloqueado (modo privado, cuota llena) degrada a
 * un useState normal sin romper.
 */
export function usePersistedState<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* almacenamiento no disponible: seguimos sin persistir */
    }
  }, [key, state])

  return [state, setState]
}
