'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/useAuth'
import { CLAVES_ANTIGUAS, crearAlmacen, instantaneaVacia, type AlmacenFavoritos } from '@/lib/favoritos/almacen'

/**
 * El corazón de TODAS las tarjetas: catálogo, portal y lo que venga (D-75).
 *
 * Un solo almacén por pestaña (lo comparten las 12 tarjetas del listado: una
 * lectura de `/api/favoritos`, no doce) y una sola verdad: la tabla
 * `favoritos` de la cuenta con sesión. Sin sesión no hay guardadas: el
 * corazón manda a entrar, igual que contactar. No se guarda nada en
 * `localStorage`.
 */

function limpiarRastrosAntiguos() {
  try {
    for (const k of CLAVES_ANTIGUAS) localStorage.removeItem(k)
  } catch {
    /* modo privado o almacenamiento bloqueado: no hay nada que limpiar */
  }
}

let almacen: AlmacenFavoritos | null = null
function obtener(): AlmacenFavoritos {
  if (!almacen) {
    almacen = crearAlmacen({
      token: async () => (await auth.currentUser?.getIdToken()) ?? null,
      fetch: (ruta, init) => fetch(ruta, init),
      limpiarRastros: limpiarRastrosAntiguos,
    })
  }
  return almacen
}

const suscribirNada = () => () => {}
const vacia = instantaneaVacia

export function useFavoritos() {
  const { user, loading, isLoggedIn } = useAuth()
  const uid = user?.uid ?? null

  useEffect(() => {
    // Mientras Firebase decide quién es, no se toca nada: «sin sesión»
    // aparente durante un instante vaciaría las guardadas de quien sí entró.
    if (loading) return
    limpiarRastrosAntiguos()
    obtener().cambiarUsuario(uid)
  }, [uid, loading])

  const instantanea = useSyncExternalStore(
    typeof window === 'undefined' ? suscribirNada : obtener().suscribir,
    typeof window === 'undefined' ? vacia : obtener().instantanea,
    vacia,
  )

  // Una foto de otra cuenta jamás se enseña: sólo vale si es de ESTA sesión.
  const propia = instantanea.uid === uid && uid !== null ? instantanea : null

  /** `undefined` = aún no se sabe (la lista no ha llegado y no se ha tocado). */
  const estadoDe = useCallback(
    (id: string): boolean | undefined => {
      if (!propia) return undefined
      if (propia.cargado || propia.tocadas.has(id)) return propia.ids.has(id)
      return undefined
    },
    [propia],
  )

  const esGuardada = useCallback((id: string) => estadoDe(id) === true, [estadoDe])

  /** Fija el estado; rechaza con el mensaje del servidor si no se pudo. */
  const establecer = useCallback((id: string, guardada: boolean) => obtener().establecer(id, guardada), [])

  /** Invierte lo que se ve. Rechaza si no se pudo (la vista ya volvió sola). */
  const alternar = useCallback((id: string) => obtener().establecer(id, !esGuardada(id)), [esGuardada])

  return {
    isLoggedIn,
    loading,
    cargado: propia?.cargado ?? false,
    error: propia?.error ?? '',
    estadoDe,
    esGuardada,
    establecer,
    alternar,
  }
}
