import { lugarDe } from './ubicacion'
import { sinEmojis } from './descripcion'

/**
 * El título y la descripción de una ficha de propiedad.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ NO VALÍA LO QUE HABÍA
 *
 * El título era `${titulo} – ${precio} | Vive Bien León`, con el título tal
 * cual lo escribió quien publicó. Salían cosas de 81 caracteres:
 *
 *     CASA CAÑADA DE MARICHES CAÑADA DEL REFUGIO SUR – $14,900,000 MXN | Vive Bien León
 *
 * Google recorta alrededor de los 60. Lo que se ve en el resultado es la mitad
 * de una dirección en mayúsculas, y la marca —que va al final— no se ve nunca.
 *
 * La descripción era la descripción completa de la propiedad: una de ellas,
 * 1.942 caracteres. Se recorta en 160, así que 1.780 no los lee nadie; y las
 * dos primeras líneas, que son las únicas que cuentan, suelen ser el saludo.
 *
 * Y dos terrenos del mismo desarrollo compartían descripción palabra por
 * palabra: para un buscador, dos páginas idénticas.
 * ─────────────────────────────────────────────────────────────
 *
 * Esto no inventa nada. Ordena lo que ya está en la base —tipo, operación,
 * lugar, superficie, precio— en el orden en que alguien lo busca.
 */

const TIPOS: Record<string, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  terreno: 'Terreno',
  nave: 'Nave industrial',
  bodega: 'Bodega',
  local: 'Local comercial',
  comercial: 'Local comercial',
  oficina: 'Oficina',
}

/** Cómo se escribe el estado cuando el sitio es escaso: «Gto.», no «Guanajuato». */
const ABREVIA: Record<string, string> = {
  Guanajuato: 'Gto.',
  Jalisco: 'Jal.',
  'Querétaro': 'Qro.',
  Aguascalientes: 'Ags.',
  'Michoacán': 'Mich.',
  'San Luis Potosí': 'S.L.P.',
}

/** Palabras que nunca van en mayúscula dentro de un nombre. */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'a', 'al'])

export type FuenteSeo = {
  titulo?: string | null
  descripcion?: string | null
  tipo?: string | null
  operacion?: string | null
  precio?: number | string | null
  metros?: number | string | null
  ubicacion?: string | null
  ciudad?: string | null
  estado_dir?: string | null
}

/** Corta por la última palabra entera, no a mitad de una. */
function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio.length <= tope) return limpio
  const corte = limpio.slice(0, tope - 1)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > tope * 0.6 ? corte.slice(0, espacio) : corte).replace(/[,;:.\s]+$/, '')}…`
}

function precioDe(p: FuenteSeo): string | null {
  const n = Number(p.precio)
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('es-MX')}` : null
}

/** Sin acentos y en minúsculas, para comparar palabras sin tropezar con «León». */
function plano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Lo que distingue esta propiedad de otra igual.
 *
 * Hace falta de verdad: dos terrenos del mismo parque industrial, los dos de
 * 600 m², los dos al mismo precio, en la misma ciudad. Todo lo que se genera a
 * partir de los datos sale idéntico, y dos páginas con el mismo título compiten
 * entre ellas en vez de sumar.
 *
 * Lo único que las separa está en el título que escribió quien publicó —«(A)»
 * y «(B)»—, así que se rescata de ahí lo que no repite lo ya dicho.
 */
function distintivoDe(p: FuenteSeo, yaDicho: string): string | null {
  const propio = (p.titulo ?? '').replace(/\s+/g, ' ').trim()
  if (!propio || /^propiedad sin t[ií]tulo/i.test(propio)) return null

  const dichas = new Set(plano(yaDicho).split(/[^a-z0-9()]+/).filter(Boolean))
  const sobra = propio
    .split(/\s+/)
    .filter((w) => w.length > 1 && !dichas.has(plano(w).replace(/[^a-z0-9()]/g, '')))
    .join(' ')
    .trim()

  if (!sobra) return null

  // En mayúsculas completas —como se suelen escribir los títulos aquí— grita en
  // el resultado. Pero no todo se trata igual:
  //
  //   · «de», «del», «la»… van en minúscula. Con la regla de las siglas salía
  //     «Cañada DE Mariches Cañada DEL», que parece un error tipográfico.
  //   · «II», «SA», «(A)» se quedan: en minúscula se vuelven «Ii», «Sa», que
  //     ya no son nombres de nada.
  return sobra
    .split(' ')
    .map((w, i) => {
      const solo = w.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
      // Sólo es conector si la palabra es la palabra, sin nada alrededor:
      // «(A)» acabó en minúscula porque «a» está en la lista, y el terreno (A)
      // quedó escrito distinto que el (B) siendo lo mismo.
      if (i > 0 && w === solo && CONECTORES.has(plano(solo))) return w.toLowerCase()
      // Siglas y marcadores cortos se quedan como están. Sin el guardia de
      // arriba esta rama tenía que excluir los conectores, y esa exclusión era
      // la que convertía «(A)» en «(a)»: «a» está en la lista de conectores.
      if (solo.length <= 3 && solo === solo.toUpperCase()) return w
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
    .trim()
}

/**
 * El título de la ficha.
 *
 *     Nave industrial en renta en León, Gto. | Vive Bien
 *     Terreno en venta en Silao, Gto. (A) Panam II | Vive Bien
 *
 * La marca va siempre, y va al final, pero sólo si cabe: es preferible perder
 * «| Vive Bien» a perder la mitad de la dirección.
 */
export function tituloDe(p: FuenteSeo): string {
  const tipo = TIPOS[(p.tipo ?? '').toLowerCase()] ?? 'Propiedad'
  const op = p.operacion === 'renta' ? 'en renta' : p.operacion === 'venta' ? 'en venta' : null
  const { ciudad, estado } = lugarDe(p)

  // «Gto.» y no «Guanajuato»: es como se escribe aquí y deja seis caracteres
  // más para lo que de verdad distingue una propiedad de otra.
  const corto = ABREVIA[estado] ?? estado
  const nucleo = [tipo, op, `en ${ciudad}, ${corto}`].filter(Boolean).join(' ')

  const extra = distintivoDe(p, `${nucleo} ${tipo} ${estado}`)

  // El distintivo se RECORTA para que quepa; antes se descartaba entero en
  // cuanto sobraba un carácter, y dos terrenos del mismo parque acababan con
  // exactamente el mismo título. Media palabra distingue más que nada.
  if (extra) {
    const conMarca = `${nucleo} — ${extra} | Vive Bien`
    if (conMarca.length <= 60) return conMarca

    const sitio = 60 - nucleo.length - 3
    if (sitio >= 8) return `${nucleo} — ${recortar(extra, sitio)}`
  }

  const conMarca = `${nucleo} | Vive Bien`
  return conMarca.length <= 60 ? conMarca : recortar(nucleo, 60)
}

/**
 * La descripción de la ficha, en 160 caracteres.
 *
 * Primero los datos —superficie, precio, lugar—, y sólo después el texto que
 * escribió quien publicó. Al revés, cuando la descripción empieza con «Hermosa
 * oportunidad única», lo único que se ve en Google es eso.
 */
export function descripcionDe(p: FuenteSeo): string {
  const tipo = (TIPOS[(p.tipo ?? '').toLowerCase()] ?? 'Propiedad').toLowerCase()
  const op = p.operacion === 'renta' ? 'en renta' : 'en venta'
  const { completo } = lugarDe(p)

  const metros = Number(p.metros)
  const datos = [
    `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} ${op} en ${completo}`,
    Number.isFinite(metros) && metros > 0 ? `${metros.toLocaleString('es-MX')} m²` : null,
    precioDe(p),
  ].filter(Boolean).join('. ')

  // El texto del dueño llega con emojis, **negritas**, # y enlaces: en la vista previa de WhatsApp o Google eso se ve como basura («🏡 **CASA EN VENTA | …»).
  const propia = sinEmojis(p.descripcion ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\*\*|__|`|^\s*#{1,3}\s+/gm, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
  // El texto propio es lo que distingue una ficha de otra —dos terrenos del
  // mismo desarrollo comparten todo lo demás—, así que se conserva mientras
  // quepa, detrás de los datos.
  const hueco = 158 - datos.length - 2
  if (propia && hueco > 40) return recortar(`${datos}. ${propia}`, 158)
  return recortar(`${datos}. Vive Bien Grupo Inmobiliario.`, 158)
}
