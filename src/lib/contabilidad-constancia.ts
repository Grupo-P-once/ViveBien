/**
 * Constancia de pago a un colaborador (26-oct-2026). Código puro: arma el TEXTO de la hoja membretada y el monto en letra. La hoja se imprime (o se guarda como PDF) desde la
 * pantalla `/admin/contabilidad/constancia/[folio]`; el comprobante de una transferencia se anexa si existe.
 *
 * El texto es un texto BASE y no está revisado por un abogado: dice solo lo que el sistema sabe (quién pagó, a quién, cuánto, cuándo, cómo y de qué operación) y no
 * afirma nada legal ni fiscal (no dice «finiquito», «liquidación» ni «única contraprestación»). Los datos fiscales de VIVE BIEN (razón social, RFC, domicilio) NO se
 * inventan: no están en el sistema, así que no salen.
 */

export type MetodoDePago = 'efectivo' | 'transferencia'
export const ETIQUETA_METODO: Readonly<Record<MetodoDePago, string>> = Object.freeze({ efectivo: 'Efectivo', transferencia: 'Transferencia bancaria' })

export type DatosDeConstancia = {
  folio: string
  fechaPago: string
  colaborador: string
  montoCentavos: number
  metodo: MetodoDePago
  referencia: string | null
  descripcion: string
  hayComprobante: boolean
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «26 de octubre de 2026» a partir de AAAA-MM-DD (sin zonas horarias: la fecha ya es la de México). */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`
}

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const VEINTES = ['VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

/** 0–999 en palabras; `apocopa` pone «UN» (y no «UNO») cuando va antes de «mil», «millón» o «pesos». */
function centenas(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (r) {
    if (r < 20) partes.push(UNIDADES[r])
    else if (r < 30) partes.push(VEINTES[r - 20])
    else { const d = Math.floor(r / 10), u = r % 10; partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]) }
  }
  return partes.join(' ')
}

function enteroEnLetra(n: number): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${enteroEnLetra(millones)} MILLONES`)
  if (miles) partes.push(miles === 1 ? 'MIL' : `${centenas(miles)} MIL`)
  if (resto) partes.push(centenas(resto))
  return partes.join(' ')
}

/** «CUARENTA MIL PESOS 00/100 M.N.» — el formato de los recibos en México. Acepta hasta 999,999,999,999 pesos. */
export function montoEnLetra(centavos: number): string {
  const total = Math.max(0, Math.round(centavos))
  const pesos = Math.floor(total / 100)
  const cts = String(total % 100).padStart(2, '0')
  const exactoEnMillones = pesos >= 1_000_000 && pesos % 1_000_000 === 0
  const sustantivo = pesos === 1 ? 'PESO' : exactoEnMillones ? 'DE PESOS' : 'PESOS'
  return `${enteroEnLetra(pesos)} ${sustantivo} ${cts}/100 M.N.`
}

export const mxnTexto = (centavos: number) => (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export type TextoDeConstancia = { titulo: string; subtitulo: string; parrafos: string[]; datos: Array<[string, string]>; firmas: { entrego: string; recibio: string } }

export function textoDeConstancia(d: DatosDeConstancia): TextoDeConstancia {
  const monto = `${mxnTexto(d.montoCentavos)} (${montoEnLetra(d.montoCentavos).toLowerCase().replace(/^./, (c) => c.toUpperCase())})`
  const forma = d.metodo === 'efectivo'
    ? 'El pago se realizó en efectivo.'
    : `El pago se realizó por transferencia bancaria${d.referencia ? ` con referencia ${d.referencia}` : ''}.${d.hayComprobante ? ' Se anexa el comprobante de la transferencia.' : ' El comprobante de la transferencia se anexará cuando se reciba.'}`
  return {
    titulo: 'Constancia de pago de comisión compartida',
    subtitulo: `Folio ${d.folio}`,
    parrafos: [
      `VIVE BIEN hace constar que, con fecha ${fechaLarga(d.fechaPago)}, entregó a ${d.colaborador} la cantidad de ${monto}, por concepto de su participación en la comisión compartida de: ${d.descripcion}.`,
      forma,
      'La persona que recibe manifiesta, con su firma, haber recibido la cantidad señalada.',
    ],
    datos: [
      ['Folio', d.folio], ['Fecha del pago', fechaLarga(d.fechaPago)], ['Quien recibe', d.colaborador], ['Monto', mxnTexto(d.montoCentavos)],
      ['Forma de pago', ETIQUETA_METODO[d.metodo]], ...(d.referencia ? [['Referencia', d.referencia] as [string, string]] : []), ['Operación', d.descripcion],
    ],
    firmas: { entrego: 'VIVE BIEN', recibio: d.colaborador },
  }
}
