import { puede, type QuienDecide } from '../acceso/permisos'
import type { Flags } from '../config/flags'

/**
 * Quién puede entrar al portal del cliente — apertura escalonada (D-27.5,
 * V-1.1.82). Código puro: lo prueban las pruebas y lo aplica el servidor.
 *
 *  · `portalCliente` encendido          → cualquier cuenta.
 *  · sólo `portalClienteInterno`        → sólo quien tiene `panel.admin`
 *                                         (admin / super admin), para la
 *                                         revisión visual en producción.
 *  · ninguno                            → nadie (404).
 */
export type Apertura = 'nadie' | 'interno' | 'todos'

export function aperturaDelPortal(f: Pick<Flags, 'portalCliente' | 'portalClienteInterno'>): Apertura {
  if (f.portalCliente) return 'todos'
  if (f.portalClienteInterno) return 'interno'
  return 'nadie'
}

export function portalAbiertoPara(
  f: Pick<Flags, 'portalCliente' | 'portalClienteInterno'>,
  quien: QuienDecide | null,
): boolean {
  const a = aperturaDelPortal(f)
  if (a === 'nadie' || !quien) return false
  if (a === 'todos') return true
  return puede(quien, 'panel.admin')
}
