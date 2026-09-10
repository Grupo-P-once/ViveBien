'use client'

/**
 * Qué propiedades está comparando el visitante.
 *
 * Vive en `localStorage`, no en la base: es una conveniencia de esta persona en
 * este navegador, no un dato del negocio. Guardarlo en Supabase obligaría a
 * tener cuenta para comparar dos casas, que es justo lo contrario de lo que
 * hace falta — comparar es lo que se hace **antes** de decidir registrarse.
 *
 * El evento propio es lo que permite que la tarjeta y la barra flotante se
 * enteren a la vez sin pasar el estado por media aplicación. `storage` no
 * sirve: sólo se dispara en **otras** pestañas, nunca en la que escribió.
 */

const CLAVE = 'vivebien:comparar'
const EVENTO = 'vivebien:comparar-cambio'

/** Tres es el máximo que cabe en una pantalla sin encogerlo todo. */
export const MAXIMO_COMPARAR = 3

function leerCrudo(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const v = window.localStorage.getItem(CLAVE)
    if (!v) return []
    const arr = JSON.parse(v)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Ventana privada, almacenamiento bloqueado, JSON corrupto. Nada de eso
    // debe romper la página: comparar es un extra, no el producto.
    return []
  }
}

function escribir(ids: string[]) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(ids))
  } catch { /* si no se puede guardar, al menos la sesión actual funciona */ }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: ids }))
}

export function obtenerComparar(): string[] {
  return leerCrudo().slice(0, MAXIMO_COMPARAR)
}

export type Resultado =
  | { ok: true; ids: string[]; accion: 'agregada' | 'quitada' }
  | { ok: false; motivo: string }

export function alternarComparar(id: string): Resultado {
  const actuales = obtenerComparar()

  if (actuales.includes(id)) {
    const ids = actuales.filter(x => x !== id)
    escribir(ids)
    return { ok: true, ids, accion: 'quitada' }
  }

  if (actuales.length >= MAXIMO_COMPARAR) {
    return {
      ok: false,
      motivo: `Puedes comparar ${MAXIMO_COMPARAR} a la vez. Quita una para añadir otra.`,
    }
  }

  const ids = [...actuales, id]
  escribir(ids)
  return { ok: true, ids, accion: 'agregada' }
}

export function limpiarComparar() {
  escribir([])
}

/** Suscribe a los cambios. Devuelve la función para darse de baja. */
export function alCambiarComparar(fn: (ids: string[]) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<string[]>).detail ?? [])
  window.addEventListener(EVENTO, handler)
  // Otra pestaña del mismo navegador también cuenta.
  const otro = () => fn(obtenerComparar())
  window.addEventListener('storage', otro)
  return () => {
    window.removeEventListener(EVENTO, handler)
    window.removeEventListener('storage', otro)
  }
}
