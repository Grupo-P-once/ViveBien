import { puedeEditarAnuncio } from '../publicacion'
import { nombreDe, nombreProvisional } from '../propiedad-publica'

/**
 * «Mis propiedades» (R8, 18-oct-2026): la lista de lo que subió cada cuenta, en el sidebar y en la página. Código puro: sin red.
 *
 * Qué se puede hacer con cada propiedad lo decide la regla que ya existía (`puedeEditarAnuncio`, ADR-0013), NO este archivo:
 *  · borrador / cambios solicitados / rechazada → se edita;
 *  · en revisión → NO se edita (solo se ve o se retira el envío); un administrador sí puede;
 *  · publicada → se edita solo con la capacidad `editar_publicadas` (asociado por defecto); si no, solo se ve.
 * El servidor vuelve a comprobarlo en cada escritura (PATCH → 409/403); esto solo rotula bien el botón.
 */

/** Cuántas propiedades como máximo viajan al menú (las más recientes). El resto está en «Ver todas». */
export const MAXIMO_EN_MENU = 30

/** Columnas que el menú necesita; nada de contacto, dueño ni notas del revisor. */
export const COLUMNAS_RESUMEN = 'id, titulo, tipo, operacion, folio, estado_pub, completitud'

export type ResumenPropiedad = {
  id: string
  titulo: string | null
  tipo: string | null
  operacion: string | null
  folio: string | null
  estado_pub: string
  completitud: number
}

const ESTADOS: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  cambios_solicitados: 'Cambios pedidos',
  rechazada: 'Rechazada',
  publicada: 'Publicada',
}

/** Etiqueta corta del estado (lista compacta del sidebar). Un estado desconocido se dice tal cual, nunca se inventa. */
export function etiquetaDeEstado(estado: string | null | undefined): string {
  return (estado && ESTADOS[estado]) || 'Sin estado'
}

/** Ruta del asistente de la propiedad. El id va codificado: viene de la base, pero es una ruta. */
export function rutaDeFicha(id: string): string {
  return `/portal/mis-propiedades/${encodeURIComponent(id)}/editar`
}

/**
 * Qué ofrece el acceso principal de una propiedad: editarla o solo verla.
 * `editable` sale de `puedeEditarAnuncio`; el texto no promete editar lo que está cerrado.
 */
export function accesoAPropiedad(o: {
  estadoPub: string | null | undefined
  esAdmin: boolean
  editaPublicadas: boolean
  completa: boolean
}): { editable: boolean; texto: string } {
  const editable = puedeEditarAnuncio(o.estadoPub, o.esAdmin, o.editaPublicadas)
  if (!editable) return { editable: false, texto: 'Ver ficha' }
  return { editable: true, texto: o.completa ? 'Editar ficha' : 'Completar ficha' }
}

/** Nombre para mostrar en el menú (título real o, si no hay, «Casa en venta», «Borrador sin título»…). */
export function nombreParaMenu(p: Pick<ResumenPropiedad, 'titulo' | 'tipo' | 'operacion'>): { texto: string; provisional: boolean } {
  return { texto: nombreDe(p), provisional: nombreProvisional(p) }
}

/**
 * Deja pasar solo lo que el menú muestra. Defensa en profundidad: aunque una respuesta trajera más columnas (un `select('*')` por
 * descuido), el menú no las conserva. Filas sin id o con forma rara se descartan, no se arreglan.
 */
export function resumenParaMenu(filas: unknown): ResumenPropiedad[] {
  if (!Array.isArray(filas)) return []
  const salida: ResumenPropiedad[] = []
  for (const f of filas) {
    if (!f || typeof f !== 'object') continue
    const r = f as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id) continue
    const s = (v: unknown) => (typeof v === 'string' ? v : null)
    salida.push({
      id: r.id,
      titulo: s(r.titulo),
      tipo: s(r.tipo),
      operacion: s(r.operacion),
      folio: s(r.folio),
      estado_pub: s(r.estado_pub) ?? 'borrador',
      completitud: typeof r.completitud === 'number' ? r.completitud : 0,
    })
    if (salida.length >= MAXIMO_EN_MENU) break
  }
  return salida
}
