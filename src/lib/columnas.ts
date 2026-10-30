/**
 * Escribir en una tabla a la que le pueden faltar columnas.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE CIERRA (V-1.1.40)
 *
 * El código va por delante de la base: cada migración se escribe con el código
 * que la usa, pero la aplica una persona, a mano, más tarde. Entre medias, el
 * código escribe columnas que no existen.
 *
 * Había un reintento para eso, y **sólo quitaba una columna**. A `leads` le
 * faltaban tres (`interes`, `origen`, `consentimiento_version`): el primer
 * intento fallaba por una, el reintento por la siguiente, y **ningún formulario
 * del sitio podía guardar un lead**. Sin Resend configurado, tampoco salía el
 * correo. El lead se perdía entero y el visitante veía un error.
 *
 * Lo mismo en el asistente: el paso del mapa manda `lat` y `lng`, dos columnas
 * de la migración 07 — guardar ese paso daba 500.
 * ─────────────────────────────────────────────────────────────
 *
 * Ahora se quitan **todas** las que falten, una por una, hasta que entra.
 */

/** Nombre de la columna que PostgREST dice que no existe, o null. */
export function columnaFaltante(mensaje: string | undefined | null): string | null {
  if (!mensaje) return null
  // PostgREST: «Could not find the 'lat' column of 'propiedades' in the schema cache»
  // Postgres:  «column "lat" of relation "propiedades" does not exist»
  const m = mensaje.match(/'([a-z_][a-z0-9_]*)' column/) ?? mensaje.match(/column "([a-z_][a-z0-9_]*)"/)
  return m?.[1] ?? null
}

export type ResultadoEscritura = {
  error: string | null
  /** Columnas que no existían y se quitaron para poder escribir. */
  omitidas: string[]
}

type Escritor = (fila: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>

/**
 * Escribe `fila` con `escribir`; si una columna no existe, la quita y reintenta.
 *
 * `plegarEn`: si se da, lo que se quita **no se tira** — se añade a ese campo
 * de texto como `[columna] valor`. Para un lead, el consentimiento es lo que
 * lo hace utilizable: perderlo en silencio sería peor que no guardar.
 */
export async function escribirTolerante(
  escribir: Escritor,
  fila: Record<string, unknown>,
  opciones: { plegarEn?: string; maxReintentos?: number } = {},
): Promise<ResultadoEscritura> {
  const { plegarEn, maxReintentos = 12 } = opciones
  let actual: Record<string, unknown> = { ...fila }
  const omitidas: string[] = []

  for (let i = 0; i <= maxReintentos; i++) {
    const { error } = await escribir(actual)
    if (!error) return { error: null, omitidas }

    const columna = columnaFaltante(error.message)
    // Un error que no es «falta una columna», o una columna que no mandamos:
    // reintentar no lo arregla.
    if (!columna || !(columna in actual) || columna === plegarEn) {
      return { error: error.message, omitidas }
    }

    const { [columna]: valor, ...resto } = actual
    actual = resto
    omitidas.push(columna)

    if (plegarEn && valor !== null && valor !== undefined && valor !== '') {
      actual[plegarEn] = plegar(actual[plegarEn], columna, valor)
    }
  }

  return { error: `Demasiadas columnas pendientes de migración: ${omitidas.join(', ')}`, omitidas }
}

/* ── Plegar y desplegar ─────────────────────────────────────────
   Formato: una línea por campo al final del texto, `[columna] valor`.
   Legible para una persona que abra la tabla a mano, y reversible: la
   migración 08 lo devuelve a su columna con una expresión regular. */

export function plegar(texto: unknown, columna: string, valor: unknown): string {
  const base = typeof texto === 'string' ? texto.trimEnd() : ''
  const linea = `[${columna}] ${String(valor).replace(/\s*\n\s*/g, ' ')}`
  return base ? `${base}\n${linea}` : linea
}

const LINEA_PLEGADA = /^\[([a-z_][a-z0-9_]*)\] (.*)$/

/**
 * Separa el texto de lo plegado. Lo inverso de `plegar`.
 *
 * `solo`: qué columnas se reconocen. El mensaje lo escribe un desconocido, y
 * una línea suya que empiece por «[urgente] …» no es un campo. Si se repite
 * una columna gana la **última** — la que añadió el servidor, que va al final.
 */
export function desplegar(
  texto: string | null | undefined,
  solo?: readonly string[],
): {
  texto: string | null
  campos: Record<string, string>
} {
  if (!texto) return { texto: null, campos: {} }
  const campos: Record<string, string> = {}
  const resto: string[] = []
  for (const linea of texto.split('\n')) {
    const m = linea.match(LINEA_PLEGADA)
    if (m && (!solo || solo.includes(m[1]))) campos[m[1]] = m[2]
    else resto.push(linea)
  }
  const limpio = resto.join('\n').trim()
  return { texto: limpio || null, campos }
}
