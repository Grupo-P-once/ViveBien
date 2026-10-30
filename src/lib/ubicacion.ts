/**
 * De dónde es una propiedad, sin inventárselo.
 *
 * La ciudad estaba escrita a mano como «León, Guanajuato» en tres sitios de la
 * ficha, incluidos:
 *
 *   · El **mapa**, que hacía `ubicacion + ', León, Guanajuato'`. Una propiedad
 *     en Silao mostraba un mapa de León.
 *   · Los **datos estructurados** de Google (`addressLocality: 'León'`), que
 *     indexan cada ficha. Eso no es cosmético: le dice al buscador que la nave
 *     está en una ciudad donde no está.
 *
 * Y la propia página «Nosotros» dice que la casa opera **también en Silao**. La
 * contradicción ya estaba en el sitio; sólo que nadie la había mirado.
 *
 * Mientras `07-ubicacion-y-fotos.sql` no esté aplicado no hay columna `ciudad`,
 * así que esto la deduce del texto libre. Cuando la migración entre, la columna
 * manda y esto deja de adivinar.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.44 — LA DIRECCIÓN SALÍA DUPLICADA
 *
 * La ficha de Tzula enseñaba «Tzula Los Castillos, Leon, Gto., **León,
 * Guanajuato**». El texto trae «Gto.» —como escribe todo el mundo en León— y
 * sólo se reconocían estados con su nombre completo y con acento. Al no
 * encontrarlo, se daba por hecho que faltaba y se añadía otra vez.
 *
 * Y el listado decía «Propiedades en **2 ciudades**» con las dos en León:
 * una escrita «Leon» y otra «León».
 *
 * Ahora se compara sin acentos, se reconocen las abreviaturas y las ciudades
 * conocidas, y **nunca se añade lo que el texto ya dice**.
 * ─────────────────────────────────────────────────────────────
 */

/** Dónde opera la casa por defecto. No es una verdad sobre cada propiedad. */
export const CIUDAD_BASE = 'León'
export const ESTADO_BASE = 'Guanajuato'

/** Sin acentos, sin mayúsculas, sin puntos: «Gto.» y «gto» son lo mismo. */
function clave(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Estado → cómo se escribe de verdad (nombre completo y abreviaturas). */
const ESTADOS: Record<string, string[]> = {
  'Guanajuato': ['guanajuato', 'gto', 'gua', 'gt'],
  'Jalisco': ['jalisco', 'jal'],
  'Michoacán': ['michoacan', 'mich'],
  'Querétaro': ['queretaro', 'qro'],
  'Aguascalientes': ['aguascalientes', 'ags'],
  'San Luis Potosí': ['san luis potosi', 'slp'],
  'Zacatecas': ['zacatecas', 'zac'],
  'Ciudad de México': ['ciudad de mexico', 'cdmx', 'df'],
  // Sin «mex» a secas: «León, Gto., México» es el país, no el Estado de México.
  'Estado de México': ['estado de mexico', 'edomex', 'edo mex', 'edo de mex'],
  'Nuevo León': ['nuevo leon', 'nl'],
  'Colima': ['colima', 'col'],
  'Nayarit': ['nayarit', 'nay'],
}

/**
 * Ciudades de la zona donde opera la casa, con su estado. Sirven para dos
 * cosas: escribirlas bien («Leon» → «León») y saber el estado cuando el texto
 * no lo dice («Nave en Silao» → Guanajuato).
 */
const CIUDADES: Record<string, string> = {
  'León': 'Guanajuato',
  'Silao': 'Guanajuato',
  'Irapuato': 'Guanajuato',
  'Guanajuato': 'Guanajuato',
  'Celaya': 'Guanajuato',
  'Salamanca': 'Guanajuato',
  'San Francisco del Rincón': 'Guanajuato',
  'Purísima del Rincón': 'Guanajuato',
  'San Miguel de Allende': 'Guanajuato',
  'Lagos de Moreno': 'Jalisco',
  'Aguascalientes': 'Aguascalientes',
  'Querétaro': 'Querétaro',
}

const PAIS = ['mexico', 'mex', 'mx']

function estadoDe(parte: string): string | null {
  const k = clave(parte)
  for (const [nombre, formas] of Object.entries(ESTADOS)) {
    if (formas.includes(k)) return nombre
  }
  return null
}

/**
 * La ciudad de un trozo de dirección.
 *
 * Tiene que aguantar lo que de verdad escriben las personas y lo que devuelve
 * un servicio de mapas, que no es «Silao» a secas:
 *
 *   · `36293 Silao de la Victoria`  — código postal delante y nombre oficial
 *   · `León de los Aldama`          — el nombre oficial de León
 *   · `Leon`                        — sin acento
 *
 * Comparando sólo por igualdad exacta, las tres fallaban. Y fallar aquí no es
 * un detalle: la ciudad acaba en el `<title>` y en el `addressLocality` de los
 * datos estructurados, así que un título decía literalmente «Terreno en venta
 * en 36293 Silao de la Victoria».
 */
function ciudadDe(parte: string): string | null {
  // El código postal va delante en las direcciones que devuelve el mapa.
  const k = clave(parte).replace(/^\d{4,5}\s+/, '')
  if (!k) return null

  const exacta = Object.keys(CIUDADES).find((c) => clave(c) === k)
  if (exacta) return exacta

  // Nombres oficiales largos: «León de los Aldama», «Silao de la Victoria».
  // Se exige que empiece por el nombre y siga con « de »/« del », para no
  // convertir «Nuevo León» en «León».
  return Object.keys(CIUDADES).find((c) => {
    const n = clave(c)
    return k.startsWith(`${n} de `) || k.startsWith(`${n} del `)
  }) ?? null
}

type Fuente = {
  ciudad?: string | null
  estado_dir?: string | null
  ubicacion?: string | null
}

export type Lugar = {
  ciudad: string
  estado: string
  /** `Colonia, Ciudad, Estado`, listo para enseñar o para buscar en el mapa. */
  completo: string
  /** True si salió de una columna real o del propio texto; false si se supuso. */
  fiable: boolean
}

/**
 * Resuelve la ubicación de una propiedad.
 *
 * Orden: columnas reales → texto libre → valor por defecto de la casa.
 */
export function lugarDe(p: Fuente): Lugar {
  const ciudadCol = p.ciudad?.trim()
  const estadoCol = p.estado_dir?.trim()
  const texto = (p.ubicacion ?? '').trim()

  if (ciudadCol) {
    const ciudad = ciudadDe(ciudadCol) ?? ciudadCol
    const estado = (estadoCol && (estadoDe(estadoCol) ?? estadoCol)) || CIUDADES[ciudad] || ESTADO_BASE
    return { ciudad, estado, completo: unir(texto, ciudad, estado), fiable: true }
  }

  if (!texto) {
    return {
      ciudad: CIUDAD_BASE,
      estado: ESTADO_BASE,
      completo: `${CIUDAD_BASE}, ${ESTADO_BASE}`,
      fiable: false,
    }
  }

  const partes = texto.split(',').map((x) => x.trim()).filter(Boolean)
  // «…, León, Gto., México»: el país al final no dice nada y taparía al estado.
  while (partes.length > 1 && PAIS.includes(clave(partes[partes.length - 1]))) partes.pop()

  // 1. ¿La última parte es un estado? Entonces la anterior es la ciudad.
  const estadoFinal = estadoDe(partes[partes.length - 1] ?? '')
  if (estadoFinal && partes.length >= 2) {
    const anterior = partes[partes.length - 2]
    const reconocida = ciudadDe(anterior)
    return {
      // Si no se reconoce, se limpia al menos el código postal: dejarlo entrar
      // tal cual producía «en 36293 Silao de la Victoria» en el título.
      ciudad: reconocida ?? anterior.replace(/^\d{4,5}\s+/, '').trim(),
      estado: estadoFinal,
      completo: texto,
      // Sólo es fiable si se reconoció de verdad; si no, es una conjetura.
      fiable: Boolean(reconocida),
    }
  }

  // 2. ¿Alguna parte es una ciudad conocida? Se busca desde el final, que es
  //    donde la gente la escribe — pero saltándose las que son el estado.
  //
  //    «…, León, Guanajuato, 37358, México» tiene dos entradas de CIUDADES:
  //    «Guanajuato» (la capital) y «León». Buscando desde el final ganaba
  //    Guanajuato, y una casa de León quedaba indexada en otra ciudad.
  //    Dos vueltas: primero las ciudades cuyo nombre NO es también el de un
  //    estado, y sólo si no hay ninguna se acepta una ambigua. Con una sola
  //    vuelta, «Guanajuato» ganaba siempre por estar más al final.
  for (const ambiguas of [false, true]) {
    for (let i = partes.length - 1; i >= 0; i--) {
      const ciudad = ciudadDe(partes[i])
      if (!ciudad) continue
      if (!ambiguas && estadoDe(partes[i]) !== null) continue
      const estado = CIUDADES[ciudad]
      return { ciudad, estado, completo: unir(texto, ciudad, estado), fiable: true }
    }
  }

  // 3. Nada reconocible: se asume la ciudad de la casa, marcado como no fiable
  //    para que quien lo use decida si lo enseña.
  return {
    ciudad: CIUDAD_BASE,
    estado: ESTADO_BASE,
    completo: unir(texto, CIUDAD_BASE, ESTADO_BASE),
    fiable: false,
  }
}

/**
 * `texto, ciudad, estado` sin repetir lo que el texto ya dice. Es la parte que
 * fallaba: «…, Leon, Gto.» + «León, Guanajuato».
 */
function unir(texto: string, ciudad: string, estado: string): string {
  const partes = texto.split(',').map((x) => x.trim()).filter(Boolean)
  const yaCiudad = partes.some((x) => clave(x) === clave(ciudad))
  const yaEstado = partes.some((x) => estadoDe(x) === estado || clave(x) === clave(estado))
  return [texto, yaCiudad ? null : ciudad, yaEstado ? null : estado].filter(Boolean).join(', ')
}

/**
 * Cuántas ciudades distintas hay en una lista. «Leon» y «León» son una.
 * Devuelve el nombre bien escrito si sólo hay una.
 */
export function ciudadesDe(lista: Fuente[]): string[] {
  const vistas = new Map<string, string>()
  for (const p of lista) {
    if (!p.ubicacion?.trim() && !p.ciudad?.trim()) continue
    const { ciudad } = lugarDe(p)
    const k = clave(ciudad)
    if (!vistas.has(k)) vistas.set(k, ciudad)
  }
  return [...vistas.values()]
}
