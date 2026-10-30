import { FORMATOS_FOTO, MAXIMO_BYTES_FOTO, MAXIMO_FOTOS } from './esquemas/propiedad'

/**
 * Reglas del paso de multimedia, sin interfaz — para poder probarlas.
 *
 * Sale de [[Especificacion - Wizard de publicacion]] → Paso 2: entre 5 y 50
 * fotos, orden elegible, planos aparte y hasta 10 videos de YouTube.
 */

export const MAXIMO_VIDEOS = 10
export const MAXIMO_PLANOS = 20

/** Por qué no se puede subir un archivo, o null si se puede. */
export function problemaConArchivo(a: { name?: string; type: string; size: number }): string | null {
  const nombre = a.name ? `«${a.name}»` : 'Ese archivo'
  if (!FORMATOS_FOTO.includes(a.type)) {
    return `${nombre} no es una imagen JPG, PNG o WebP.`
  }
  if (a.size > MAXIMO_BYTES_FOTO) {
    const mb = (a.size / 1024 / 1024).toFixed(1)
    return `${nombre} pesa ${mb} MB; el máximo es ${MAXIMO_BYTES_FOTO / 1024 / 1024} MB.`
  }
  return null
}

/**
 * Separa lo que se puede subir de lo que no, respetando el tope.
 * `yaHay`: cuántas hay subidas; lo que exceda el tope se descarta y se dice.
 */
export function repartirArchivos<T extends { name?: string; type: string; size: number }>(
  archivos: T[],
  yaHay: number,
  tope: number = MAXIMO_FOTOS,
): { validos: T[]; problemas: string[] } {
  const validos: T[] = []
  const problemas: string[] = []
  for (const a of archivos) {
    const p = problemaConArchivo(a)
    if (p) problemas.push(p)
    else validos.push(a)
  }
  const hueco = Math.max(0, tope - yaHay)
  if (validos.length > hueco) {
    problemas.push(`Sólo caben ${tope} en total: se subirán ${hueco} y se descartan ${validos.length - hueco}.`)
    validos.length = hueco
  }
  return { validos, problemas }
}

/**
 * Mueve un elemento `delta` posiciones. Fuera de rango, no hace nada.
 * La alternativa accesible a arrastrar y soltar: con teclado o en un teléfono
 * arrastrar no siempre se puede; dos botones, sí.
 */
export function mover<T>(lista: readonly T[], i: number, delta: number): T[] {
  const j = i + delta
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return [...lista]
  const copia = [...lista]
  const [x] = copia.splice(i, 1)
  copia.splice(j, 0, x)
  return copia
}

// Reexportado: vive aparte para que la ficha pública no cargue zod por él.
export { idYoutube, urlYoutube } from './youtube'
