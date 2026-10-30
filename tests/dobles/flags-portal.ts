/**
 * Doble de `lib/config/flags-servidor` para las pruebas de rutas (R8.6).
 *
 * Desde R8.6 las escrituras de propiedades de un publicador / asociado dependen de que el portal esté abierto PARA ÉL
 * (`portalCerradoParaEscribir`). Las pruebas de esas rutas no leen la base: este doble les da los flags. Por defecto el portal está
 * ABIERTO (`portalCliente`), que es el estado en el que ya funcionaban; `fijarFlags({ portalCliente: false })` lo cierra y
 * `restablecerFlags()` lo devuelve. Nunca toca los flags reales de nadie.
 */
import { FLAGS_APAGADOS, type Flag, type Flags } from '@/lib/config/flags'

const ABIERTO: Flags = { ...FLAGS_APAGADOS, portalCliente: true }
let flags: Flags = { ...ABIERTO }

export function fijarFlags(cambios: Partial<Flags>): void {
  flags = { ...ABIERTO, ...cambios }
}
export function restablecerFlags(): void {
  flags = { ...ABIERTO }
}

export async function leerFlags(): Promise<Flags> {
  return flags
}
export async function flagEncendido(flag: Flag): Promise<boolean> {
  return flags[flag]
}
export function olvidarFlags(): void {}
