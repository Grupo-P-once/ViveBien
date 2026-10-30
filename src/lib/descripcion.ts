/**
 * La descripción de una propiedad («Sobre esta propiedad») con formato LIBRE y seguro (22-oct-2026).
 *
 * ANTES la descripción salía como un solo párrafo: los saltos de línea y las líneas en blanco que escribía quien publica se perdían (el navegador junta los
 * espacios) y todo quedaba amontonado. Ahora se respeta cómo la escribió, con unas pocas marcas sencillas —sin HTML—:
 *
 *   · Una línea EN BLANCO separa párrafos.        · Un salto de línea simple se conserva dentro del párrafo.
 *   · `## Título` (o `# Título`) → subtítulo.     · Una línea corta que termina en «:» («Incluye:») también se lee como subtítulo.
 *   · `- cosa`, `• cosa`, `* cosa` → viñetas.      · `1. cosa` o `1) cosa` → lista numerada.
 *   · `**texto**` → negritas.
 *
 *   · Limpieza (27-oct-2026): los emojis sueltos se quitan (se ven distinto en cada aparato) y una línea corta TODA EN MAYÚSCULAS («UBICACIÓN») es un subtítulo.
 *   · Los enlaces `http(s)://…` se pintan como botón («Ver ubicación en Google Maps»); nunca se interpreta HTML.
 *
 * Es código puro: devuelve BLOQUES de datos (no HTML) que `DescripcionRica` pinta como elementos de React; nada de lo escrito se interpreta como marcado.
 */

export type BloqueDescripcion =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'parrafo'; lineas: string[] }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'numerada'; items: string[] }

const VINETA = /^\s*(?:[-•*·–—])\s+(.+)$/
const NUMERADA = /^\s*\d{1,2}[.)]\s+(.+)$/
const TITULO_MARCADO = /^\s*#{1,3}\s+(.+?)\s*#*\s*$/
const CONTINUACION = /^\s{2,}\S/

/** Un subtítulo implícito: corto, termina en «:» y no es una oración larga. */
function esTituloImplicito(l: string): boolean {
  const t = l.trim()
  return t.length >= 3 && t.length <= 60 && t.endsWith(':') && !/[.!?]\s/.test(t)
}

/** Quita emojis y pictogramas (y sus modificadores) y los espacios que dejan. */
export function sinEmojis(t: string): string {
  // Solo se junta el hueco que deja el emoji DENTRO de la línea; la sangría del principio (continuación de viñeta) se conserva.
  return t.replace(/[\p{Extended_Pictographic}️‍⃣]/gu, '').replace(/(\S) {2,}(?=\S)/g, '$1 ')
}

/** Subtítulo en MAYÚSCULAS: corto, con letras, sin punto final ni cifras largas. «UBICACIÓN» → «Ubicación». */
function esTituloEnMayusculas(l: string): boolean {
  const t = l.trim()
  return t.length >= 3 && t.length <= 48 && /\p{L}/u.test(t) && t === t.toUpperCase() && t !== t.toLowerCase() && !/[.!?]$/.test(t) && !/\d{3,}/.test(t) && !/^https?:/i.test(t)
}
const enOracion = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()

export function parsearDescripcion(texto: string | null | undefined): BloqueDescripcion[] {
  const lineas = sinEmojis(String(texto ?? '')).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').replace(/ /g, ' ').split('\n')
  const bloques: BloqueDescripcion[] = []
  let actual: BloqueDescripcion | null = null
  const cerrar = () => { if (actual) { bloques.push(actual); actual = null } }

  for (const bruta of lineas) {
    const linea = bruta.replace(/\s+$/, '')
    if (linea.trim() === '') { cerrar(); continue }

    const titulo = linea.match(TITULO_MARCADO)
    if (titulo) { cerrar(); bloques.push({ tipo: 'titulo', texto: titulo[1].trim() }); continue }

    const vineta = linea.match(VINETA)
    if (vineta) {
      if (actual?.tipo !== 'lista') { cerrar(); actual = { tipo: 'lista', items: [] } }
      actual.items.push(vineta[1].trim()); continue
    }
    const numerada = linea.match(NUMERADA)
    if (numerada) {
      if (actual?.tipo !== 'numerada') { cerrar(); actual = { tipo: 'numerada', items: [] } }
      actual.items.push(numerada[1].trim()); continue
    }

    // Una línea con sangría debajo de una viñeta es la continuación de esa viñeta.
    if ((actual?.tipo === 'lista' || actual?.tipo === 'numerada') && CONTINUACION.test(linea) && actual.items.length) {
      actual.items[actual.items.length - 1] += ` ${linea.trim()}`; continue
    }

    // Subtítulo implícito: solo al inicio de un bloque (no en medio de un párrafo).
    if (!actual && esTituloImplicito(linea)) { bloques.push({ tipo: 'titulo', texto: linea.trim().replace(/:$/, '') }); continue }
    if (!actual && esTituloEnMayusculas(linea)) { bloques.push({ tipo: 'titulo', texto: enOracion(linea.trim()) }); continue }

    if (actual?.tipo !== 'parrafo') { cerrar(); actual = { tipo: 'parrafo', lineas: [] } }
    actual.lineas.push(linea.trim())
  }
  cerrar()
  return bloques
}

export type Trozo = { texto: string; negrita: boolean; /** Solo http(s): una dirección web que se pinta como botón. */ enlace?: string }

/** «Ver ubicación en Google Maps» para un enlace de mapas; «Abrir sitio.com» para cualquier otro. Nunca devuelve el enlace crudo. */
export function etiquetaDeEnlace(url: string): string {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\./, '').toLowerCase()
    if (h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'maps.google.com' || (h.endsWith('google.com') && u.pathname.startsWith('/maps'))) return 'Ver ubicación en Google Maps'
    return `Abrir ${h}`
  } catch { return 'Abrir enlace' }
}

/** Trozos de una línea: texto normal, **negritas** y enlaces http(s). Ningún texto se interpreta como HTML. */
export function trozosDeLinea(linea: string): Trozo[] {
  const salida: Trozo[] = []
  for (const t of linea.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)) {
    const m = t.match(/^\*\*([^*]+)\*\*$/)
    if (m) { salida.push({ texto: m[1], negrita: true }); continue }
    for (const p of t.split(/(https?:\/\/[^\s<>"']+)/g).filter(Boolean)) {
      if (/^https?:\/\//i.test(p)) {
        const limpio = p.replace(/[.,;:!?)\]]+$/, '')
        const resto = p.slice(limpio.length)
        let valido = false
        try { valido = ['http:', 'https:'].includes(new URL(limpio).protocol) } catch { valido = false }
        if (valido) { salida.push({ texto: etiquetaDeEnlace(limpio), negrita: false, enlace: limpio }); if (resto) salida.push({ texto: resto, negrita: false }); continue }
      }
      salida.push({ texto: p, negrita: false })
    }
  }
  return salida
}

/** Ejemplo para el editor: cómo se ve cada marca. */
export const EJEMPLO_DESCRIPCION = [
  'Nave industrial en una de las zonas con mejor acceso a vialidades principales.',
  '',
  '## Lo que incluye',
  '- 3 andenes de carga y patio de maniobras',
  '- Oficinas y 2 baños',
  '- Energía eléctrica trifásica',
  '',
  'Ideal para almacén, distribución o manufactura ligera. **Disponible de inmediato.**',
].join('\n')
