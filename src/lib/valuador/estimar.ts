/**
 * Valuador de VIVE BIEN: estimación ORIENTATIVA de mercado a partir de comparables del propio catálogo.
 *
 * Qué es y qué no es
 *  · NO es un avalúo (ni oficial, ni hipotecario, ni certificado). Es una referencia para platicar con un asesor.
 *  · Los comparables son PRECIOS DE OFERTA («precio solicitado») de anuncios publicados en VIVE BIEN. No son precios de cierre: un precio de
 *    oferta suele ser mayor que el de cierre y el modelo no sabe cuánto. Por eso el resultado es un RANGO y el texto lo dice.
 *  · Si no hay comparables suficientes NO se inventa una cifra: se responde `insuficiente` y se propone la revisión de un asesor.
 *
 * Método (explicable, sin aprendizaje automático)
 *  1. Se toman los anuncios visibles al público, de la misma operación (venta/renta) y del mismo tipo de inmueble, con precio y superficie.
 *  2. Se descartan atípicos de precio por m² (fuera de 0,4×–2,5× la mediana, o a más de 3 desviaciones absolutas de la mediana).
 *  3. Cada comparable recibe una similitud (0–1): misma colonia, cercanía de tamaño, recámaras y baños.
 *  4. El valor por m² es la MEDIANA PONDERADA por similitud; el rango, los cuartiles ponderados 25–75 (ensanchado si hay pocos).
 *  5. La confianza sale de cuántos comparables hay, cuántos son de la misma colonia y cuánto se dispersan sus precios.
 *
 * Todo es función pura: se prueba sin red ni base de datos (`tests/valuador-estimar.test.ts`).
 */

export type Operacion = 'venta' | 'renta'
export type TipoInmueble = 'casa' | 'departamento' | 'terreno' | 'nave' | 'comercial' | 'oficina'
export const TIPOS: readonly TipoInmueble[] = ['casa', 'departamento', 'terreno', 'nave', 'comercial', 'oficina']

export type Entrada = {
  operacion: Operacion
  tipo: TipoInmueble
  /** Colonia tal como la eligió o escribió la persona; `null` si no la encontró (se usa toda la ciudad con menos peso). */
  colonia: string | null
  /** Superficie principal en m² (terreno para terrenos; construcción para lo demás). */
  metros: number
  recamaras?: number | null
  banos?: number | null
}

/** Lo mínimo que se necesita de un anuncio del catálogo (columnas públicas). */
export type Anuncio = {
  id: string
  slug?: string | null
  titulo?: string | null
  tipo?: string | null
  operacion?: string | null
  precio?: number | string | null
  moneda?: string | null
  colonia?: string | null
  ciudad?: string | null
  metros?: number | string | null
  recamaras?: number | string | null
  banos?: number | string | null
  estatus?: string | null
  estado_pub?: string | null
}

export type Comparable = {
  id: string
  slug: string | null
  etiqueta: string
  colonia: string | null
  metros: number
  precio: number
  ppm: number
  /** 0–1: cuánto se parece a lo que se valúa. */
  similitud: number
  /** Texto corto de por qué se parece (para enseñarlo). */
  parecido: string[]
}

export type Nivel = 'alto' | 'medio' | 'bajo'

export type Resultado =
  | {
      estado: 'estimado'
      /** Pesos mexicanos redondeados (a miles en venta, a cientos en renta). */
      rango: { min: number; central: number; max: number }
      ppm: { min: number; mediana: number; max: number }
      confianza: { nivel: Nivel; puntos: number; motivos: string[] }
      comparables: Comparable[]
      total_considerados: number
      descartados_atipicos: number
      factores: string[]
      faltantes: string[]
    }
  | {
      estado: 'insuficiente'
      motivo: string
      comparables_encontrados: number
      minimo_requerido: number
      faltantes: string[]
    }

/** Comparables mínimos por tipo: los segmentos con menos datos exigen más (y, en la práctica, casi siempre quedan «insuficiente»). */
export const MINIMO_POR_TIPO: Record<TipoInmueble, number> = { casa: 3, departamento: 3, terreno: 5, nave: 5, comercial: 5, oficina: 5 }
const MAX_COMPARABLES = 8
const SIMILITUD_MINIMA = 0.25

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[, ]/g, '')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

/** El catálogo llama `comercial` a los locales, y algunos anuncios traen `local`/`bodega`: se agrupan para comparar. */
export function grupoDeTipo(tipo: string | null | undefined): TipoInmueble | null {
  const t = norm(tipo)
  if (t === 'casa') return 'casa'
  if (t === 'departamento') return 'departamento'
  if (t === 'terreno') return 'terreno'
  if (t === 'nave' || t === 'bodega') return 'nave'
  if (t === 'comercial' || t === 'local') return 'comercial'
  if (t === 'oficina') return 'oficina'
  return null
}

export function medianaPonderada(valores: number[], pesos: number[], q = 0.5): number {
  const pares = valores.map((v, i) => [v, pesos[i]] as const).sort((a, b) => a[0] - b[0])
  const total = pares.reduce((s, p) => s + p[1], 0)
  let acum = 0
  for (const [v, w] of pares) {
    acum += w
    if (acum >= total * q - 1e-9) return v
  }
  return pares[pares.length - 1][0]
}

function mediana(xs: number[]): number { return medianaPonderada(xs, xs.map(() => 1)) }

/** Redondeo «de persona»: a miles en venta (≥ 100 000) y a cientos en renta. */
export function redondear(v: number, operacion: Operacion): number {
  const paso = operacion === 'renta' ? 100 : v >= 1_000_000 ? 10_000 : 1_000
  return Math.round(v / paso) * paso
}

function similitud(a: Anuncio & { _m: number; _r: number | null; _b: number | null }, e: Entrada): { s: number; parecido: string[] } {
  const parecido: string[] = []
  let s = 0.25 // base: mismo tipo y operación, en León
  if (e.colonia && norm(a.colonia) === norm(e.colonia)) { s += 0.4; parecido.push('misma colonia') }
  else if (e.colonia && norm(a.colonia) && (norm(a.colonia).includes(norm(e.colonia)) || norm(e.colonia).includes(norm(a.colonia)))) { s += 0.25; parecido.push('colonia parecida') }
  const razon = a._m / e.metros
  const dif = Math.abs(Math.log(razon))              // 0 = mismo tamaño; 0,69 = el doble
  const tam = Math.max(0, 1 - dif / 0.9)             // 1 → 0 al llegar a ×2,46
  s += 0.25 * tam
  if (tam > 0.7) parecido.push('tamaño parecido')
  if (e.recamaras != null && a._r != null) { if (a._r === e.recamaras) { s += 0.06; parecido.push('mismas recámaras') } else if (Math.abs(a._r - e.recamaras) === 1) s += 0.03 }
  if (e.banos != null && a._b != null) { if (a._b === e.banos) { s += 0.04; parecido.push('mismos baños') } }
  return { s: Math.min(1, s), parecido }
}

export function estimar(entrada: Entrada, catalogo: Anuncio[]): Resultado {
  const minimo = MINIMO_POR_TIPO[entrada.tipo]
  const faltantes: string[] = []
  if (!entrada.colonia) faltantes.push('La colonia: sin ella se compara con toda la ciudad y la confianza baja.')
  if (entrada.recamaras == null && (entrada.tipo === 'casa' || entrada.tipo === 'departamento')) faltantes.push('El número de recámaras.')
  if (entrada.banos == null && (entrada.tipo === 'casa' || entrada.tipo === 'departamento')) faltantes.push('El número de baños.')

  // 1) universo: anuncios visibles, de la misma operación y tipo, con precio y superficie
  const base = catalogo.flatMap((a) => {
    if ((a.estado_pub ?? 'publicada') !== 'publicada') return []
    if (['pausada', 'eliminada'].includes(norm(a.estatus))) return []
    if (norm(a.operacion) !== entrada.operacion) return []
    if (grupoDeTipo(a.tipo) !== entrada.tipo) return []
    const moneda = (a.moneda ?? 'MXN').toUpperCase()
    if (moneda !== 'MXN') return []      // sin tipo de cambio confiable, no se mezclan monedas
    const ciudad = norm(a.ciudad)
    if (ciudad && !ciudad.includes('leon')) return []
    const precio = num(a.precio), m = num(a.metros)
    if (!precio || !m || precio <= 0 || m <= 0) return []
    return [{ ...a, _m: m, _p: precio, _ppm: precio / m, _r: num(a.recamaras), _b: num(a.banos) }]
  })

  if (base.length < minimo) {
    return { estado: 'insuficiente', motivo: `Solo hay ${base.length} anuncio${base.length === 1 ? '' : 's'} comparable${base.length === 1 ? '' : 's'} en VIVE BIEN y para este tipo de inmueble se necesitan al menos ${minimo}.`, comparables_encontrados: base.length, minimo_requerido: minimo, faltantes }
  }

  // 2) atípicos de precio por m²
  const med = mediana(base.map((b) => b._ppm))
  const mad = mediana(base.map((b) => Math.abs(b._ppm - med))) || med * 0.1
  const sanos = base.filter((b) => b._ppm >= med * 0.4 && b._ppm <= med * 2.5 && Math.abs(b._ppm - med) <= 3 * 1.4826 * mad + med * 0.15)
  const descartados = base.length - sanos.length
  if (sanos.length < minimo) {
    return { estado: 'insuficiente', motivo: `Tras descartar precios atípicos quedan ${sanos.length} comparables y se necesitan al menos ${minimo}.`, comparables_encontrados: sanos.length, minimo_requerido: minimo, faltantes }
  }

  // 3) similitud y selección
  const puntuados = sanos
    .map((a) => ({ a, ...similitud(a, entrada) }))
    .filter((x) => x.s >= SIMILITUD_MINIMA)
    .sort((x, y) => y.s - x.s)
    .slice(0, MAX_COMPARABLES)
  if (puntuados.length < minimo) {
    return { estado: 'insuficiente', motivo: `Ninguno de los anuncios se parece lo bastante (colonia y tamaño) a lo que buscas: solo ${puntuados.length} de los ${minimo} necesarios.`, comparables_encontrados: puntuados.length, minimo_requerido: minimo, faltantes }
  }

  // 4) mediana ponderada y cuartiles
  const ppms = puntuados.map((x) => x.a._ppm)
  const pesos = puntuados.map((x) => x.s * x.s)
  const q50 = medianaPonderada(ppms, pesos, 0.5)
  let q25 = medianaPonderada(ppms, pesos, 0.25)
  let q75 = medianaPonderada(ppms, pesos, 0.75)
  // Con pocos comparables los cuartiles se parecen demasiado y dan una falsa precisión: se ensancha el rango.
  const ancho = puntuados.length < 5 ? 0.12 : puntuados.length < 7 ? 0.06 : 0
  q25 = Math.min(q25, q50) * (1 - ancho)
  q75 = Math.max(q75, q50) * (1 + ancho)

  const r = (v: number) => redondear(v, entrada.operacion)
  const rango = { min: r(q25 * entrada.metros), central: r(q50 * entrada.metros), max: r(q75 * entrada.metros) }

  // 5) confianza
  const mismaColonia = puntuados.filter((x) => x.parecido.includes('misma colonia')).length
  const dispersion = (q75 - q25) / q50
  const motivos: string[] = []
  let puntos = 0
  if (puntuados.length >= 6) { puntos += 3; motivos.push(`${puntuados.length} comparables`) } else if (puntuados.length >= 4) { puntos += 2; motivos.push(`${puntuados.length} comparables (lo ideal son 6 o más)`) } else { puntos += 1; motivos.push(`solo ${puntuados.length} comparables`) }
  if (mismaColonia >= 3) { puntos += 3; motivos.push(`${mismaColonia} de tu misma colonia`) } else if (mismaColonia >= 1) { puntos += 1; motivos.push(`solo ${mismaColonia} de tu misma colonia`) } else motivos.push(entrada.colonia ? 'ninguno de tu misma colonia' : 'no se indicó colonia')
  if (dispersion <= 0.2) { puntos += 2; motivos.push('precios muy parecidos entre sí') } else if (dispersion <= 0.4) { puntos += 1; motivos.push('precios algo dispersos') } else motivos.push('precios muy dispersos')
  if (entrada.tipo === 'terreno' || entrada.tipo === 'nave' || entrada.tipo === 'comercial' || entrada.tipo === 'oficina') motivos.push('segmento con pocos datos: la confianza se limita')
  let nivel: Nivel = puntos >= 7 ? 'alto' : puntos >= 5 ? 'medio' : 'bajo'
  if (['terreno', 'nave', 'comercial', 'oficina'].includes(entrada.tipo) && nivel === 'alto') nivel = 'medio'

  const factores = [
    `Valor por m² de referencia: mediana ponderada de ${puntuados.length} comparables.`,
    mismaColonia ? `Pesan más los anuncios de tu colonia (${mismaColonia}).` : 'Se compara con toda la ciudad porque no hay anuncios de tu colonia.',
    'Pesan más los inmuebles de tamaño parecido; un tamaño muy distinto cuenta poco.',
    ...(entrada.recamaras != null ? ['Las recámaras y baños iguales suman similitud.'] : []),
  ]
  if (descartados) factores.push(`Se descartaron ${descartados} anuncio${descartados === 1 ? '' : 's'} con precio por m² atípico.`)
  if (nivel !== 'alto') faltantes.push('Más anuncios comparables de tu zona (precios de cierre reales mejorarían mucho la estimación).')

  const comparables: Comparable[] = puntuados.map((x) => ({
    id: x.a.id, slug: x.a.slug ?? null,
    etiqueta: (x.a.titulo ?? '').trim() || `${entrada.tipo} en ${x.a.colonia ?? 'León'}`,
    colonia: x.a.colonia ?? null, metros: Math.round(x.a._m), precio: Math.round(x.a._p), ppm: Math.round(x.a._ppm),
    similitud: Math.round(x.s * 100) / 100, parecido: x.parecido,
  }))

  return {
    estado: 'estimado', rango,
    ppm: { min: Math.round(q25), mediana: Math.round(q50), max: Math.round(q75) },
    confianza: { nivel, puntos, motivos }, comparables,
    total_considerados: sanos.length, descartados_atipicos: descartados, factores, faltantes,
  }
}
