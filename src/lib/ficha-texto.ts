import { extraerDeTexto } from './telegram'

/**
 * Leer una ficha técnica y sacar de ahí los datos de la propiedad.
 *
 * ─────────────────────────────────────────────────────────────
 * PARA QUÉ
 *
 * Quien tiene una propiedad casi siempre tiene ya **una ficha en PDF**: la que
 * le pasó el dueño, la del avalúo, la de otra inmobiliaria. Contestar siete
 * preguntas cuando todo eso está escrito en un archivo es trabajo repetido.
 *
 * Se manda el PDF al bot y se rellena lo que se reconozca. Lo que no, se
 * pregunta. El PDF entero queda además como descripción de partida, así que
 * **nada se pierde**: lo que el lector no entienda sigue estando a la vista
 * en el asistente para corregirlo a mano.
 * ─────────────────────────────────────────────────────────────
 *
 * Sin IA: leer números y palabras conocidas cubre la mayoría de las fichas, y
 * una equivocación silenciosa de un modelo sería peor que un hueco visible.
 */

export type DatosFicha = {
  campos: Record<string, unknown>
  /** Qué se reconoció, en palabras, para decírselo a quien mandó el archivo. */
  reconocido: string[]
}

/** Número suelto tras una etiqueta: «Recámaras: 3», «3 recámaras», «Baños 2.5». */
function tras(texto: string, etiquetas: string[]): number | null {
  for (const e of etiquetas) {
    const despues = texto.match(new RegExp(`${e}\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)`, 'i'))
    if (despues) {
      const n = Number(despues[1].replace(',', '.'))
      if (Number.isFinite(n) && n > 0) return n
    }
    const antes = texto.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${e}`, 'i'))
    if (antes) {
      const n = Number(antes[1].replace(',', '.'))
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

const ETIQUETA_CAMPO: Record<string, string> = {
  tipo: 'tipo de inmueble',
  operacion: 'operación',
  precio: 'precio',
  metros: 'superficie',
  recamaras: 'recámaras',
  banos: 'baños',
  altura_libre: 'altura libre',
  andenes: 'andenes',
  ubicacion: 'ubicación',
}

/**
 * Lee el texto de una ficha —de un PDF, de un mensaje largo— y devuelve los
 * campos que reconoce.
 *
 * Lo básico (tipo, operación, precio, superficie) lo resuelve `extraerDeTexto`,
 * que ya se usa para los mensajes sueltos. Aquí se añade lo que sólo aparece
 * en fichas formales: recámaras, baños, altura libre, andenes y la dirección.
 */
export function leerFicha(texto: string): DatosFicha {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return { campos: {}, reconocido: [] }

  const campos: Record<string, unknown> = { ...extraerDeTexto(t) }

  const recamaras = tras(t, ['rec[áa]maras?', 'habitaciones?', 'dormitorios?'])
  if (recamaras) campos.recamaras = Math.round(recamaras)

  const banos = tras(t, ['ba[ñn]os?(?: completos?)?', 'sanitarios?'])
  if (banos) campos.banos = banos

  const altura = tras(t, ['altura(?: libre)?'])
  if (altura && altura < 60) campos.altura_libre = altura

  const andenes = tras(t, ['andenes?', 'rampas?'])
  if (andenes) campos.andenes = Math.round(andenes)

  // Dirección: la línea que sigue a «Ubicación», «Dirección» o «Domicilio».
  const dir = texto.match(/(?:ubicaci[óo]n|direcci[óo]n|domicilio)\s*[:\-]?\s*([^\n\r]{6,160})/i)
  if (dir) {
    const limpio = dir[1].trim().replace(/\s{2,}/g, ' ')
    // Que no se cuele la etiqueta siguiente de una tabla de dos columnas.
    campos.ubicacion = limpio.split(/\s{2,}|\s(?=[A-ZÁÉÍÓÚ][a-z]+\s*:)/)[0].slice(0, 200)
  }

  // El texto entero queda de descripción: lo que el lector no entendió sigue
  // estando a la vista para corregirlo en el asistente.
  campos.descripcion = texto.trim().slice(0, 5000)

  const reconocido = Object.keys(campos)
    .filter((k) => k !== 'descripcion' && ETIQUETA_CAMPO[k])
    .map((k) => ETIQUETA_CAMPO[k])

  return { campos, reconocido }
}

/** El primer paso del asistente que la ficha NO resolvió. */
export function primerHueco(campos: Record<string, unknown>): string {
  if (!campos.operacion) return 'operacion'
  if (!campos.tipo) return 'tipo'
  if (!campos.ubicacion) return 'ubicacion'
  if (!campos.metros) return 'metros'
  if (!campos.precio) return 'precio'
  if (!campos.titulo) return 'titulo'
  return 'fotos'
}
