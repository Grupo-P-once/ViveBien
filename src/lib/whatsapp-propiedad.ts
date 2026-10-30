import { SITIO } from './sitio'
import { nombreDe, rutaDe } from './propiedad-publica'

/**
 * El primer mensaje de WhatsApp sobre una propiedad (28-oct-2026): el MISMO en la ficha, el catálogo, la tarjeta y el listado.
 * Antes la tarjeta y el listado solo mandaban el nombre; quien atiende no podía abrir la propiedad ni saber cuál era. Ahora lleva el nombre, el ID público (el folio) y el enlace a la ficha:
 *   «Hola, quiero más información sobre Casa en Cañada (ID VB-2026-00003): https://…/propiedades/casa-en-canada-…»
 * Código puro: el enlace sale del slug (o del id si aún no hay slug); nunca lleva datos de la persona.
 */
export type PropiedadParaMensaje = { id: string; slug?: string | null; titulo?: string | null; folio?: string | null; tipo?: string | null; operacion?: string | null; ubicacion?: string | null }

export function mensajeDeInformes(p: PropiedadParaMensaje, sitio: string = SITIO): string {
  const nombre = nombreDe(p as Parameters<typeof nombreDe>[0]).trim() || 'una propiedad'
  const folio = (p.folio ?? '').trim()
  return `Hola, quiero más información sobre ${nombre}${folio ? ` (ID ${folio})` : ''}: ${sitio}${rutaDe(p)}`
}

/** Ya codificado para `?text=`. */
export const textoDeInformes = (p: PropiedadParaMensaje, sitio?: string) => encodeURIComponent(mensajeDeInformes(p, sitio))
