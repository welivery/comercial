import { useEffect, useState } from "react"

export type Tema = "claro" | "oscuro"

const KEY = "wecare_tema"

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "oscuro")
}

// Tema claro/oscuro persistido en localStorage y aplicado en <html>.
export function useTheme() {
  const [tema, setTema] = useState<Tema>(() => {
    return (localStorage.getItem(KEY) as Tema) ?? "claro"
  })

  useEffect(() => {
    aplicar(tema)
    localStorage.setItem(KEY, tema)
  }, [tema])

  const toggle = () => setTema((t) => (t === "claro" ? "oscuro" : "claro"))
  return { tema, setTema, toggle }
}

// Aplicar el tema guardado lo antes posible (evita flash al cargar).
export function initTema() {
  const tema = (localStorage.getItem(KEY) as Tema) ?? "claro"
  aplicar(tema)
}
