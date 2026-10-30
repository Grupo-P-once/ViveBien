/**
 * Aceptación de la propuesta de comisión (Etapa B del motor de comisiones, 24-oct-2026). Código puro: sin base ni red.
 *
 * Reglas:
 *  · Todo está APAGADO salvo que el módulo `commissionEngine` esté encendido. Con el flag apagado nadie acepta nada y ninguna ruta cambia.
 *  · Solo se pide aceptar si existe un texto VIGENTE. Un texto nace en borrador y no pasa a vigente sin revisión jurídica (la base lo impone, D-19).
 *  · No aceptan: el equipo (admin / super admin: no publica «por un tercero») ni quien tiene la capacidad `sin_comision` (la modalidad asociado
 *    la trae encendida). La decisión se toma con CAPACIDADES, nunca con la modalidad (ADR-0013).
 *  · Se acepta una versión una sola vez por persona; si sale una versión nueva, hay que aceptarla de nuevo.
 */

export type TextoComision = { id: string; version: string; titulo: string; cuerpo: string; hash: string }

export type EstadoAceptacion = {
  /** ¿Tiene que aceptar antes de enviar o publicar? */
  requerida: boolean
  /** ¿Ya aceptó la versión vigente? (solo tiene sentido si es requerida) */
  aceptada: boolean
  /** El texto a mostrar: solo viene cuando la aceptación es requerida. */
  texto: TextoComision | null
}

export const SIN_ACEPTACION: EstadoAceptacion = { requerida: false, aceptada: false, texto: null }

export function debeAceptar(o: { flagEncendida: boolean; esEquipo: boolean; exenta: boolean; texto: TextoComision | null }): boolean {
  if (!o.flagEncendida) return false
  if (o.esEquipo || o.exenta) return false
  return o.texto !== null
}

export const MENSAJE_REQUIERE_ACEPTACION = 'Antes de enviar tu propiedad tienes que leer y aceptar la propuesta de comisión.'
export const MENSAJE_COMISION_NO_DISPONIBLE = 'No se pudo comprobar la propuesta de comisión. Intenta de nuevo en un momento.'
