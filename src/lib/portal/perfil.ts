import type { QueBusco } from '../cliente/busqueda'

/**
 * El perfil tal como lo devuelve `/api/usuarios/me` (V-1.1.86).
 *
 * Es lo que pintan «Mi perfil» y «Mi búsqueda»: la respuesta del servidor
 * después de guardar, no lo que se tecleó (D-32). Se escribe el tipo aquí para
 * que las dos pantallas y sus pruebas hablen de lo mismo.
 */
export type PerfilDelPortal = {
  uid?: string
  email?: string | null
  nombre?: string | null
  telefono?: string | null
  whatsapp?: string | null
  foto_url?: string | null
  rol?: string
  superAdmin?: boolean
  estado?: string
  completitud?: number
  faltantes?: Array<{ campo: string; etiqueta: string }>
  /** Lo que llegó y NO se guardó (campos que no son editables). */
  ignorados?: string[]
  ok?: boolean
  sinCambios?: boolean
} & Partial<Record<'busca_operacion', QueBusco['operacion']>>
  & Partial<Record<'busca_zonas' | 'busca_tipos', string[] | null>>
  & Partial<Record<'presupuesto_max', number | null>>

/** Lo que busca, tal como viaja en la respuesta (sin inventar nada si falta). */
export function queBuscoDelPerfil(p: PerfilDelPortal | null): QueBusco {
  return {
    operacion: p?.busca_operacion ?? null,
    zonas: Array.isArray(p?.busca_zonas) ? p!.busca_zonas! : [],
    tipos: Array.isArray(p?.busca_tipos) ? p!.busca_tipos! : [],
    presupuestoMax: typeof p?.presupuesto_max === 'number' ? p.presupuesto_max : null,
  }
}

/** Cómo entra esta persona, para «Configuración» (D-28.4). */
export function comoEntra(proveedores: readonly string[]): {
  conContrasena: boolean
  conGoogle: boolean
  /** Qué se le dice, en una frase. */
  texto: string
} {
  const conContrasena = proveedores.includes('password')
  const conGoogle = proveedores.includes('google.com')
  const texto = conGoogle && conContrasena
    ? 'Con Google y también con tu correo y contraseña.'
    : conGoogle
      ? 'Con tu cuenta de Google.'
      : conContrasena
        ? 'Con tu correo y contraseña.'
        : 'Con el método con el que creaste la cuenta.'
  return { conContrasena, conGoogle, texto }
}
