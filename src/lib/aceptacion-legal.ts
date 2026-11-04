/**
 * Aceptación de los Términos y Condiciones y del Aviso de Privacidad por quien sube una propiedad (25-oct-2026). Código puro: sin base ni red.
 *
 * Reglas:
 *  · Detrás del módulo `legalAcceptance` (ya existía, apagado y sin consumidores). Apagado = no se pide nada y nadie lee la base.
 *  · Aplica a toda cuenta que NO es del equipo (publicador y asociado por igual: no depende de la comisión ni de `sin_comision`).
 *  · Se acepta CADA documento por separado y por versión. La versión es la fecha de «Última actualización» de la página publicada
 *    (`/terminos`, `/privacidad`); si el abogado cambia un texto se sube la versión aquí y se vuelve a pedir. Una prueba vigila que estas
 *    constantes coincidan con lo que dicen las páginas, para que nadie acepte «la versión de abril» mientras la página dice otra cosa.
 *  · No se inventa ninguna versión: son las fechas que las páginas ya muestran.
 */

export const DOCUMENTOS = ['terminos', 'privacidad'] as const
export type Documento = (typeof DOCUMENTOS)[number]

/** Versión vigente de cada documento = fecha de «Última actualización» de su página (AAAA-MM-DD). */
export const VERSIONES: Readonly<Record<Documento, string>> = Object.freeze({ terminos: '2026-11-03', privacidad: '2026-11-03' })

export const RUTA_DOCUMENTO: Readonly<Record<Documento, string>> = Object.freeze({ terminos: '/terminos', privacidad: '/privacidad' })
export const NOMBRE_DOCUMENTO: Readonly<Record<Documento, string>> = Object.freeze({ terminos: 'Términos y Condiciones', privacidad: 'Aviso de Privacidad' })

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `2026-04-06` → «6 de abril de 2026» (tal como lo escribe la página). */
export function fechaDeVersion(version: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version)
  if (!m) return version
  const mes = MESES[Number(m[2]) - 1]
  return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : version
}

export type AceptacionGuardada = { documento: string; version: string }

export type EstadoLegal = {
  /** ¿Se le pide aceptar algo a esta cuenta? */
  requerida: boolean
  /** Qué documentos faltan por aceptar en su versión vigente. */
  pendientes: Documento[]
  documentos: Array<{ documento: Documento; nombre: string; ruta: string; version: string; fecha: string; aceptado: boolean }>
}

export const SIN_ACEPTACION_LEGAL: EstadoLegal = { requerida: false, pendientes: [], documentos: [] }

/** Ausente = sin aceptar: solo cuenta lo que coincide EXACTAMENTE con la versión vigente de ese documento. */
export function estadoLegal(o: { flagEncendida: boolean; esEquipo: boolean; aceptadas: AceptacionGuardada[] }): EstadoLegal {
  if (!o.flagEncendida || o.esEquipo) return SIN_ACEPTACION_LEGAL
  const documentos = DOCUMENTOS.map((documento) => ({
    documento,
    nombre: NOMBRE_DOCUMENTO[documento],
    ruta: RUTA_DOCUMENTO[documento],
    version: VERSIONES[documento],
    fecha: fechaDeVersion(VERSIONES[documento]),
    aceptado: o.aceptadas.some((a) => a.documento === documento && a.version === VERSIONES[documento]),
  }))
  const pendientes = documentos.filter((d) => !d.aceptado).map((d) => d.documento)
  return { requerida: true, pendientes, documentos }
}

/** Valida lo que manda el navegador: debe marcar los documentos pendientes y la versión que vio debe ser la vigente. */
export function sanearAceptacionLegal(entrada: unknown): { ok: true; documentos: Documento[] } | { ok: false; error: string; codigo?: string } {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as { documentos?: unknown; versiones?: unknown }
  if (!Array.isArray(e.documentos) || e.documentos.length === 0) return { ok: false, error: 'Marca que leíste y aceptas los documentos.' }
  const docs: Documento[] = []
  for (const d of e.documentos) {
    if (typeof d !== 'string' || !(DOCUMENTOS as readonly string[]).includes(d)) return { ok: false, error: 'Documento no válido.' }
    if (!docs.includes(d as Documento)) docs.push(d as Documento)
  }
  const v = (e.versiones && typeof e.versiones === 'object' ? e.versiones : {}) as Record<string, unknown>
  for (const d of docs) {
    if (v[d] !== VERSIONES[d]) return { ok: false, error: `El ${NOMBRE_DOCUMENTO[d]} cambió mientras lo leías. Léelo de nuevo antes de aceptar.`, codigo: 'version_cambio' }
  }
  return { ok: true, documentos: docs }
}

export const MENSAJE_REQUIERE_ACEPTACION_LEGAL = 'Antes de enviar tu propiedad tienes que aceptar los Términos y Condiciones y el Aviso de Privacidad.'
export const MENSAJE_LEGAL_NO_DISPONIBLE = 'No se pudo comprobar la aceptación de los Términos y del Aviso de Privacidad. Intenta de nuevo en un momento.'
