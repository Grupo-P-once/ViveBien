'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

/**
 * La sesión del panel, compartida por todas sus pantallas.
 *
 * El rol lo dice el servidor (`/api/usuarios/me`); aquí sólo se guarda para
 * pintar. Cada ruta de `/api/admin/*` lo vuelve a comprobar con el token.
 */

export type PerfilPanel = {
  uid: string
  email: string | null
  nombre: string | null
  foto: string | null
  /** Lo dice el servidor; el portal lo usa para enseñar lo del publicador. */
  rol?: 'cliente' | 'publicador' | 'admin'
  /** V-1.1.80: lo dice `/api/usuarios/me`. Un Super Admin tiene rol 'admin'. */
  superAdmin?: boolean
  /** Modalidad del publicador según el servidor (`publicador` | `asociado`). Sólo decide qué ENTRADAS se muestran; nunca un permiso. */
  tipoPublicador?: string
}

type Sesion = {
  user: User
  perfil: PerfilPanel
  /** `fetch` con el token de Firebase; lanza con el mensaje del servidor si falla. */
  pedir: <T>(ruta: string, opciones?: RequestInit) => Promise<T>
}

const ContextoSesion = createContext<Sesion | null>(null)

export class ErrorDePeticion extends Error {
  /**
   * `codigo` (V-1.1.91): el identificador corto que devuelve la API
   * (`en_curso`, `ya_completada`, …). Sin él, el navegador sólo veía «409» y no
   * podía distinguir «otro lo tiene tomado» de «ya no procede».
   */
  constructor(mensaje: string, public estado: number, public codigo?: string) {
    super(mensaje)
  }
}

export type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>

/**
 * `pedirFijo` (V-1.1.82): sustituye a la petición real. Lo usa la vista previa
 * de desarrollo para que ninguna pantalla pueda llamar a la API.
 */
export function ProveedorSesion({ user, perfil, children, pedirFijo }: { user: User; perfil: PerfilPanel; children: React.ReactNode; pedirFijo?: Pedir }) {
  const pedirReal = useCallback(async <T,>(ruta: string, opciones: RequestInit = {}): Promise<T> => {
    const token = await (auth.currentUser ?? user).getIdToken()
    // Un archivo (FormData) lleva su propio Content-Type con la frontera: no se le pone el de JSON.
    const esFormulario = typeof FormData !== 'undefined' && opciones.body instanceof FormData
    const res = await fetch(ruta, {
      ...opciones,
      headers: {
        ...(esFormulario ? {} : { 'Content-Type': 'application/json' }),
        ...(opciones.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    })
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) {
      const mensaje = typeof datos?.error === 'string' ? datos.error : `El servidor respondió ${res.status}.`
      throw new ErrorDePeticion(mensaje, res.status, typeof datos?.codigo === 'string' ? datos.codigo : undefined)
    }
    return datos as T
  }, [user])
  const pedir = pedirFijo ?? pedirReal

  const valor = useMemo(() => ({ user, perfil, pedir }), [user, perfil, pedir])
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export function useSesion(): Sesion {
  const s = useContext(ContextoSesion)
  if (!s) throw new Error('useSesion fuera del panel o del portal')
  return s
}

/** Como `useSesion`, pero sin lanzar: las páginas compartidas también se pintan sin marco (portal cerrado). */
export function useSesionOpcional(): Sesion | null {
  return useContext(ContextoSesion)
}
