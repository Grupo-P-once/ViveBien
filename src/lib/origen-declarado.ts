/**
 * Origen DECLARADO por quien sube la propiedad (24-oct-2026). Código puro: sin base ni red.
 *
 * Antes de enviar a revisión o publicar, una cuenta que paga comisión elige una de dos opciones y la pantalla le explica, con las mismas
 * palabras en ambos casos, qué hace VIVE BIEN y cuánto cuesta. Se guarda en `propiedad_origen` (la misma tabla de las notas internas).
 *
 * Reglas:
 *  · Opciones: «trato directo» (soy propietario/a o representante autorizado/a) o «agente inmobiliario/a o inmobiliaria».
 *    Se guardan con los valores que la tabla ya tiene: `trato_directo` e `inmobiliaria`.
 *  · Trato directo (decisión del propietario, 24-oct-2026): además de la declaración se piden nombre completo, teléfono y correo de quien es
 *    dueño o representa al dueño, para que el equipo vea de quién es la propiedad sin capturarlo a mano. Esos datos van a los campos del
 *    origen (los que muestra «Notas/Comisión»); la nota automática NO los repite porque las notas no se pueden borrar y estos datos sí
 *    tienen que poder corregirse o suprimirse.
 *  · Agente: se pide lo mínimo (nombre del agente y de la inmobiliaria); el folio de acreditación y el municipio son OPCIONALES. Nada de
 *    CURP, RFC ni identificaciones. Sin folio, el estado es «sin folio aportado · pendiente de verificación»: no «acreditado».
 *  · Declarar NO verifica. Que alguien escriba un folio no lo vuelve verificado; solo el equipo lo registra (`origen_verificar_acreditacion`).
 *  · «Listo para enviar» solo mira que se haya declarado lo necesario; la acreditación NO bloquea el envío (decisión del propietario),
 *    pero sí retiene la parte del reparto del agente hasta que esté verificada.
 *  · Los textos describen solo lo que hoy se cumple. Las citas en línea siguen apagadas (`citasEnLinea`): no se promete agenda automática.
 */
import { sanearFolio } from './comision-acreditacion'
import { REGLA_BORRADOR_2026_10_24, type ReglaComision } from './comision-calculo'

export const OPCIONES_ORIGEN = ['trato_directo', 'agente'] as const
export type OpcionOrigen = (typeof OPCIONES_ORIGEN)[number]

export const ETIQUETA_OPCION: Record<OpcionOrigen, string> = {
  trato_directo: 'Trato directo — soy propietario/a o representante autorizado/a',
  agente: 'Agente inmobiliario/a o inmobiliaria',
}

/** Lo que se guarda en la tabla: nada más. */
export type OrigenDeclarado = {
  origen_tipo: 'trato_directo' | 'inmobiliaria'
  declara_autorizacion: boolean | null
  titular_nombre: string | null
  titular_empresa: string | null
  titular_telefono: string | null
  titular_correo: string | null
  acreditacion_folio: string | null
  acreditacion_municipio: string | null
}

export type ResultadoDeclarado = { ok: true; datos: OrigenDeclarado } | { ok: false; errores: string[] }

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO = /^[0-9+()\-\s.]{7,40}$/
const texto = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim().replace(/\s+/g, ' ')
  if (!t) return null
  return t.length > max ? undefined : t
}

export function sanearOrigenDeclarado(entrada: unknown): ResultadoDeclarado {
  const e = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>
  const errores: string[] = []
  const opcion = (OPCIONES_ORIGEN as readonly string[]).includes(e.opcion as string) ? (e.opcion as OpcionOrigen) : null
  if (!opcion) errores.push('Elige cómo manejas esta propiedad.')

  if (opcion === 'trato_directo') {
    if (e.declara_autorizacion !== true) errores.push('Confirma que eres propietario/a o representante autorizado/a.')
    const nombreDueno = texto(e.nombre_completo, 200)
    const telefono = texto(e.telefono, 40)
    const correo = texto(e.correo, 200)
    if (nombreDueno === undefined) errores.push('El nombre es demasiado largo.')
    else if (!nombreDueno || nombreDueno.split(' ').length < 2) errores.push('Escribe el nombre completo (nombre y apellido).')
    if (telefono === undefined || !telefono || !TELEFONO.test(telefono)) errores.push('Escribe un teléfono válido.')
    if (correo === undefined || !correo || !CORREO.test(correo)) errores.push('Escribe un correo válido.')
    if (errores.length) return { ok: false, errores }
    return { ok: true, datos: { origen_tipo: 'trato_directo', declara_autorizacion: true, titular_nombre: nombreDueno ?? null, titular_empresa: null, titular_telefono: telefono ?? null, titular_correo: correo ?? null, acreditacion_folio: null, acreditacion_municipio: null } }
  }

  const nombre = texto(e.agente_nombre, 200)
  const inmobiliaria = texto(e.inmobiliaria, 200)
  const municipio = texto(e.municipio, 120)
  if (nombre === undefined) errores.push('El nombre del agente es demasiado largo.')
  else if (!nombre) errores.push('Escribe el nombre del agente.')
  if (inmobiliaria === undefined) errores.push('El nombre de la inmobiliaria es demasiado largo.')
  else if (!inmobiliaria) errores.push('Escribe el nombre comercial o la razón social de la inmobiliaria.')
  if (municipio === undefined) errores.push('El municipio es demasiado largo.')
  else if (municipio && municipio.length < 2) errores.push('El municipio no es válido.')
  const folio = sanearFolio(e.folio)
  if (!folio.ok) errores.push(folio.error)
  if (errores.length || !opcion) return { ok: false, errores }
  return {
    ok: true,
    datos: {
      origen_tipo: 'inmobiliaria',
      declara_autorizacion: null,
      titular_nombre: nombre ?? null,
      titular_empresa: inmobiliaria ?? null,
      titular_telefono: null,
      titular_correo: null,
      acreditacion_folio: folio.ok ? folio.folio : null,
      acreditacion_municipio: municipio ?? null,
    },
  }
}

type FilaOrigen = {
  origen_tipo?: string | null
  declara_autorizacion?: boolean | null
  titular_nombre?: string | null
  titular_empresa?: string | null
  titular_telefono?: string | null
  titular_correo?: string | null
} | null | undefined

/** ¿Ya declaró lo necesario? Ausente = no. */
export function origenListo(o: FilaOrigen): boolean {
  if (!o || !o.origen_tipo) return false
  if (o.origen_tipo === 'trato_directo') return o.declara_autorizacion === true && Boolean(o.titular_nombre?.trim()) && Boolean(o.titular_telefono?.trim()) && Boolean(o.titular_correo?.trim())
  if (o.origen_tipo === 'inmobiliaria' || o.origen_tipo === 'broker') return Boolean(o.titular_nombre?.trim()) && Boolean(o.titular_empresa?.trim())
  return false
}

export const MENSAJE_REQUIERE_ORIGEN = 'Antes de enviar tu propiedad dinos cómo la manejas (trato directo o agente/inmobiliaria).'

/** Mientras no exista un texto de comisión vigente, lo económico es una PROPUESTA: no se acepta ni se cobra nada. */
export const AVISO_SIN_ACUERDO = 'Propuesta comercial: todavía no hay un acuerdo vigente. Por ahora no aceptas nada ni se te cobra comisión; el acuerdo definitivo se te presentará para que lo aceptes antes de que estas condiciones apliquen.'

/** Lo que hace VIVE BIEN, solo lo que hoy se cumple. Mismas palabras para las dos opciones. */
export const COMO_FUNCIONA: readonly string[] = [
  'VIVE BIEN recibe las consultas que genera tu anuncio y las canaliza.',
  'El equipo les da seguimiento y coordina las visitas contigo, por los medios disponibles (hoy se coordinan manualmente, no hay agenda automática en línea).',
  'Quien pregunta habla con VIVE BIEN; por defecto no recibes sus datos personales.',
  'Tu propiedad se revisa antes de publicarse.',
]

const pct = (puntosBase: number) => `${(puntosBase / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`

/**
 * Resumen económico que se muestra ANTES de aceptar, calculado de la regla versionada (nunca escrito aparte).
 * Si la regla es un borrador, la pantalla lo dice; así nadie lo lee como contrato vigente.
 */
export function resumenEconomico(regla: ReglaComision = REGLA_BORRADOR_2026_10_24): { borrador: boolean; lineas: string[] } {
  const mes = regla.rentaMeses === 1 ? 'un mes de renta base' : `${regla.rentaMeses} meses de renta base`
  // Texto fijado por el propietario (25-oct-2026) mientras el abogado revisa el acuerdo: son exactamente estos seis párrafos y nada más.
  // Las cifras salen de la regla versionada, no de números escritos aparte.
  const lineas = [
    `Venta: comisión total del ${pct(regla.ventaPuntosBase)} del precio final establecido en el contrato de compraventa firmado. Se genera al cierre de la operación y cuando se recibe el pago correspondiente.`,
    `Renta: comisión total equivalente a ${mes}. Se genera cuando se firma el contrato de arrendamiento y se recibe la primera renta.`,
    'Sin exclusividad: puedes anunciar tu propiedad con otras inmobiliarias y también venderla o rentarla por tu cuenta.',
    'Operaciones atribuibles a VIVE BIEN: solo se cobra comisión si la operación se concreta con una persona interesada cuya relación con VIVE BIEN pueda verificarse conforme a las reglas del acuerdo.',
    `Agente colaborador: si participa un agente o una inmobiliaria colaboradora y se verifican su participación y acreditación conforme al acuerdo, la comisión se reparte ${pct(regla.colaboradorPuntosBase)} para cada parte. Este reparto no añade un cargo a la comisión total acordada contigo.`,
    'Impuestos: los importes de comisión se calculan antes del IVA cuando corresponda. Los impuestos aplicables se desglosarán conforme al acuerdo y al comprobante fiscal.',
  ]
  return { borrador: regla.estado === 'borrador', lineas }
}
