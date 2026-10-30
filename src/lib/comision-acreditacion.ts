/**
 * Acreditación de agentes inmobiliarios (24-oct-2026). Código puro: sin base, sin red, sin reloj (la fecha de hoy entra como argumento).
 *
 * Por qué existe: el reparto 50/50 solo se libera a un agente o inmobiliaria cuya acreditación se COMPROBÓ. Declarar un nombre no es probar nada.
 * Lo que dice la normativa estatal se verifica en fuentes oficiales y se documenta en Obsidian; este módulo no afirma qué exige la ley, solo
 * impide presentar como verificado algo que no se verificó.
 *
 * Reglas:
 *  · El folio es OPCIONAL en el formulario (decisión del propietario). Sin folio el estado es `sin_folio`: ni «acreditado» ni «verificado».
 *  · Con folio y sin revisión del equipo: `pendiente`. Con revisión: `verificado` (con vigencia), `no_coincide` o, pasada la vigencia, `vencido`.
 *  · Solo el EQUIPO verifica, y nunca lo suyo (no hay autoaprobación). Sin vigencia registrada, una coincidencia NO cuenta como verificada.
 *  · Ausente = sin permiso: ante cualquier duda el estado cae a `pendiente` o `sin_folio`, jamás a `verificado`.
 */
import type { EstadoAcreditacion } from './comision-calculo'

export type { EstadoAcreditacion }

export const ETIQUETA_ACREDITACION: Record<EstadoAcreditacion, string> = {
  sin_folio: 'Sin folio aportado · pendiente de verificación',
  pendiente: 'Folio aportado · pendiente de verificación',
  verificado: 'Verificado por el equipo',
  no_coincide: 'No coincide con el padrón',
  vencido: 'Acreditación vencida',
}

export type RegistroAcreditacion = {
  folio: string | null
  /** Resultado de la última revisión del equipo contra el padrón oficial. */
  resultado: 'coincide' | 'no_coincide' | null
  /** Fecha (AAAA-MM-DD) hasta la que el padrón indica vigencia. */
  vigenteHasta: string | null
  verificadoPor: string | null
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export function estadoAcreditacion(r: RegistroAcreditacion | null | undefined, hoy: string): EstadoAcreditacion {
  if (!r || !r.folio || !r.folio.trim()) return 'sin_folio'
  if (!FECHA.test(hoy)) return 'pendiente'
  if (!r.resultado || !r.verificadoPor) return 'pendiente'
  if (r.resultado === 'no_coincide') return 'no_coincide'
  if (!r.vigenteHasta || !FECHA.test(r.vigenteHasta)) return 'pendiente'
  return r.vigenteHasta < hoy ? 'vencido' : 'verificado'
}

/**
 * ¿Puede esta persona registrar la verificación? Solo el equipo, y nunca sobre una propiedad suya ni sobre un folio que ella misma aportó.
 * `duenoUid` es el dueño de la propiedad y `aportoUid` quien capturó el folio (pueden coincidir).
 */
export function puedeVerificar(o: { actorUid: string | null | undefined; esEquipo: boolean; duenoUid?: string | null; aportoUid?: string | null }): boolean {
  if (!o.esEquipo || !o.actorUid) return false
  if (o.duenoUid && o.duenoUid === o.actorUid) return false
  if (o.aportoUid && o.aportoUid === o.actorUid) return false
  return true
}

/** Folio tal como lo escribe una persona: recortado, sin controles, 3–40 caracteres de letras, números y separadores comunes. */
export function sanearFolio(entrada: unknown): { ok: true; folio: string | null } | { ok: false; error: string } {
  if (entrada === undefined || entrada === null) return { ok: true, folio: null }
  if (typeof entrada !== 'string') return { ok: false, error: 'El folio no es válido.' }
  const t = entrada.trim()
  if (!t) return { ok: true, folio: null }
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_/. ]{1,38}[A-Za-z0-9]$/.test(t)) return { ok: false, error: 'El folio no es válido (letras, números y guiones, de 3 a 40 caracteres).' }
  return { ok: true, folio: t }
}
