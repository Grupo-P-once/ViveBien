import { describe, expect, it } from 'vitest'
import { aHref, coincide, describir, filtrosDeUrl, mismaBusqueda, normalizarFiltros, type Filtros, type PropiedadBuscable } from '../src/lib/busquedas'
import { DEFINICIONES, aplica } from '../src/lib/caracteristicas'
import { ANTIGUEDADES, BLOQUEADOS, GRUPOS_MAS_UI, ITEMS_MAS, PUBLICACIONES, coincideMas, cumpleItem, desdePublicacion, fuentesDeTermino, inicioDeDiaEnMexico, normalizarMas, patronSinAcentos, type ItemMas } from '../src/lib/filtros-mas'

/**
 * «Más filtros» del catálogo (28-oct-2026) — pruebas unitarias POR FILTRO con fixtures sintéticos claramente positivos y negativos.
 * Los casos por opción se GENERAN desde el catálogo de definiciones: así la prueba no repite el código que prueba y detecta una opción que apunte a un valor que no existe.
 * Zona horaria: America/Mexico_City (México no tiene horario de verano desde el 30-oct-2022; se prueban ambos lados de ese cambio).
 */
type Fila = PropiedadBuscable & { id: string }
const URL_VIDEO = 'https://www.youtube.com/watch?v=aaaaaaaaaaa'
const URL_PLANO = 'https://res.cloudinary.com/demo/image/upload/plano.jpg'

const fila = (id: string, o: Partial<Fila> = {}, car: Record<string, unknown> = {}): Fila => ({
  id, operacion: 'venta', tipo: 'casa', ubicacion: 'Calle Uno 10', colonia: 'Centro', ciudad: 'León', precio: 1_000_000, estatus: 'disponible', metros: 100,
  recamaras: 3, banos: 2, videos: [], planos: [], publicada_en: '2026-10-01T12:00:00Z', extras: { caracteristicas: { v: 1, ...car } }, ...o,
})
const ids = (lista: Fila[], f: Filtros, ahora?: number) => lista.filter((p) => coincide(p, f, ahora)).map((p) => p.id)

/* ── Integridad del catálogo de opciones ───────────────────────────────────── */
describe('catálogo de opciones: cada opción apunta a datos que EXISTEN', () => {
  it('cada fuente referencia una característica real del catálogo, de la forma correcta y con un valor que existe', () => {
    for (const it of ITEMS_MAS) for (const s of it.fuentes) {
      if (s.k === 'columna') { expect(['videos', 'planos']).toContain(s.col); continue }
      const def = DEFINICIONES.find((d) => d.clave === s.clave)
      expect(def, `${it.id}: no existe la característica «${s.clave}»`).toBeTruthy()
      if (s.k === 'bool') { expect(def!.forma, `${it.id}`).toBe('bool'); continue }
      const valores = s.k === 'lista' ? [s.valor] : s.valores
      const formaEsperada = s.k === 'enum' ? 'enum' : 'lista'
      expect(def!.forma, `${it.id}: «${s.clave}» debe ser ${formaEsperada}`).toBe(formaEsperada)
      for (const v of valores) expect((def as { opciones: readonly (readonly [string, string])[] }).opciones.some(([val]) => val === v), `${it.id}: «${v}» no es una opción de «${s.clave}»`).toBe(true)
    }
  })
  it('los ids no se repiten dentro de su grupo y todos los grupos tienen opciones', () => {
    for (const g of GRUPOS_MAS_UI) {
      const del = ITEMS_MAS.filter((i) => i.grupo === g.id).map((i) => i.id)
      expect(del.length, g.titulo).toBeGreaterThan(0)
      expect(new Set(del).size, `ids repetidos en ${g.titulo}`).toBe(del.length)
    }
  })
  it('las 12 opciones SIN dato están bloqueadas y NO aparecen entre las funcionales', () => {
    expect(BLOQUEADOS.length).toBe(12)
    const etiquetas = ITEMS_MAS.map((i) => i.etiqueta.toLowerCase())
    // Por PALABRA completa: la subcadena «spa» está dentro de «Espacio de co-working» y una comparación por subcadena daba un falso positivo.
    const palabra = (texto: string, w: string) => new RegExp(`(^|[^a-záéíóúñ0-9])${w}($|[^a-záéíóúñ0-9])`).test(texto)
    for (const b of BLOQUEADOS) {
      expect(b.falta.length, b.etiqueta).toBeGreaterThan(20)
      const nombre = b.etiqueta.toLowerCase().split(' (')[0]
      expect(etiquetas.some((e) => palabra(e, nombre)), `«${b.etiqueta}» está bloqueada pero aparece como funcional`).toBe(false)
    }
    for (const prohibida of ['business', 'sauna', 'spa', 'jacuzzi', 'eventos', 'comerciales', 'escuelas', 'calefacción', 'visitas', '360', 'anunciante']) expect(etiquetas.some((e) => palabra(e, prohibida)), prohibida).toBe(false)
  })
})

/* ── Un positivo y un negativo por cada opción (generados desde el catálogo) ── */
const TIPOS_PRUEBA = ['casa', 'departamento', 'oficina', 'local', 'nave', 'bodega', 'edificio', 'terreno']
function construir(item: ItemMas): { positivo: Fila; vacio: Fila } {
  const s = item.fuentes[0]
  for (const tipo of TIPOS_PRUEBA) for (const operacion of ['venta', 'renta']) {
    if (s.k === 'columna') {
      return { positivo: fila(`pos-${item.id}`, { tipo, operacion, [s.col]: [s.col === 'videos' ? URL_VIDEO : URL_PLANO] }), vacio: fila(`neg-${item.id}`, { tipo, operacion }) }
    }
    const def = DEFINICIONES.find((d) => d.clave === s.clave)!
    if (!aplica(def, tipo, operacion)) continue
    const valor = s.k === 'lista' ? [s.valor] : s.k === 'enum' ? s.valores[0] : s.k === 'bool' ? true : [...s.valores]
    return { positivo: fila(`pos-${item.id}`, { tipo, operacion }, { [s.clave]: valor }), vacio: fila(`neg-${item.id}`, { tipo, operacion }) }
  }
  throw new Error(`no hay tipo/operación donde aplique ${item.id}`)
}
const GRUPO_A_CLAVE = (g: string) => g as 'amb' | 'gen' | 'ext' | 'srv' | 'ame' | 'mm'

describe('cada opción filtra: encuentra su positivo y descarta lo que no la declara', () => {
  for (const item of ITEMS_MAS) {
    it(`${item.grupo} · ${item.etiqueta}`, () => {
      const { positivo, vacio } = construir(item)
      const f: Filtros = { [GRUPO_A_CLAVE(item.grupo)]: [item.id] }
      expect(cumpleItem(positivo, item)).toBe(true)
      expect(ids([positivo, vacio], f)).toEqual([positivo.id])
    })
  }
  it('una opción NO se cumple con el valor de OTRA opción del mismo grupo (negativo cruzado)', () => {
    const estudio = fila('estudio', {}, { interiores: ['estudio'] })
    const cocina = fila('cocina', {}, { interiores: ['cocina_integral'] })
    expect(ids([estudio, cocina], { amb: ['estudio'] })).toEqual(['estudio'])
    expect(ids([estudio, cocina], { amb: ['cocina_integral'] })).toEqual(['cocina'])
  })
  it('«Servicios básicos (agua/luz)» exige AGUA Y LUZ: solo una no basta', () => {
    const ambas = fila('ambas', {}, { servicios: ['agua', 'luz', 'drenaje'] })
    const soloAgua = fila('agua', {}, { servicios: ['agua'] })
    const soloLuz = fila('luz', {}, { servicios: ['luz'] })
    expect(ids([ambas, soloAgua, soloLuz], { srv: ['servicios_basicos'] })).toEqual(['ambas'])
  })
  it('«Internet/Wifi» acepta internet O fibra óptica; «Alberca» acepta la privada O la común', () => {
    expect(ids([fila('a', {}, { servicios: ['internet'] }), fila('b', {}, { servicios: ['fibra_optica'] }), fila('c', {}, { servicios: ['agua'] })], { srv: ['internet'] }).sort()).toEqual(['a', 'b'])
    expect(ids([fila('p', {}, { exteriores: ['alberca'] }), fila('q', {}, { amenidades_comunes: ['alberca_comun'] }), fila('r', {}, { exteriores: ['patio'] })], { gen: ['alberca'] }).sort()).toEqual(['p', 'q'])
  })
  it('«Amueblado» solo existe en RENTA: una venta (aunque lo traiga en extras) no entra', () => {
    const renta = fila('renta', { operacion: 'renta' }, { amueblado: 'si' })
    const semi = fila('semi', { operacion: 'renta' }, { amueblado: 'semi' })
    const no = fila('no', { operacion: 'renta' }, { amueblado: 'no' })
    const venta = fila('venta', { operacion: 'venta' }, { amueblado: 'si' })
    expect(ids([renta, semi, no, venta], { gen: ['amueblado'] }).sort()).toEqual(['renta', 'semi'])
  })
  it('lo que no aplica al TIPO no cuenta aunque venga en extras (un terreno con «alberca» no es una casa con alberca)', () => {
    const terreno = fila('terreno', { tipo: 'terreno' }, { exteriores: ['alberca'] })
    expect(ids([terreno], { gen: ['alberca'] })).toEqual([])
  })
})

/* ── Reglas de combinación ─────────────────────────────────────────────────── */
describe('combinaciones: AND entre grupos, OR dentro de un grupo', () => {
  const a = fila('a', {}, { interiores: ['estudio'], exteriores: ['patio'] })
  const b = fila('b', {}, { interiores: ['cocina_integral'], exteriores: ['terraza'] })
  const c = fila('c', {}, { interiores: ['estudio', 'cocina_integral'], exteriores: ['patio', 'terraza'] })
  const d = fila('d', {})
  const todas = [a, b, c, d]
  it('OR dentro del grupo: estudio O cocina integral', () => { expect(ids(todas, { amb: ['estudio', 'cocina_integral'] }).sort()).toEqual(['a', 'b', 'c']) })
  it('AND entre grupos: (estudio) Y (terraza) → solo quien cumple los dos grupos', () => { expect(ids(todas, { amb: ['estudio'], ext: ['terraza'] })).toEqual(['c']) })
  it('OR dentro de cada grupo y AND entre ellos', () => { expect(ids(todas, { amb: ['estudio', 'cocina_integral'], ext: ['patio'] }).sort()).toEqual(['a', 'c']) })
  it('combinación con filtros de siempre (tipo, precio, baños)', () => {
    const l = [fila('x', { tipo: 'casa', precio: 2_000_000, banos: 3 }, { exteriores: ['jardin'] }), fila('y', { tipo: 'casa', precio: 2_000_000, banos: 1 }, { exteriores: ['jardin'] }), fila('z', { tipo: 'departamento', precio: 2_000_000, banos: 3 }, { exteriores: ['balcon'] })]
    expect(ids(l, { tipo: 'casa', pmax: 2_500_000, ban: 2, ext: ['jardin'] })).toEqual(['x'])
  })
  it('una combinación sin ninguna coincidencia da CERO resultados (no «todo»)', () => { expect(ids(todas, { amb: ['estudio'], ext: ['balcon'] })).toEqual([]) })
})

/* ── Superficie, baños y estacionamientos ──────────────────────────────────── */
describe('superficie: construida y terreno, desde/hasta en m²', () => {
  const casa = fila('casa', { tipo: 'casa', metros: 180 }, { m_terreno: 300 })
  const casaSinTerreno = fila('casa-sin', { tipo: 'casa', metros: 120 })
  const depto = fila('depto', { tipo: 'departamento', metros: 85 })
  const terreno = fila('terreno', { tipo: 'terreno', metros: 1000 })
  const todas = [casa, casaSinTerreno, depto, terreno]
  it('construida desde/hasta: los terrenos no tienen construcción', () => {
    expect(ids(todas, { cmin: 100 }).sort()).toEqual(['casa', 'casa-sin'])
    expect(ids(todas, { cmax: 100 })).toEqual(['depto'])
    expect(ids(todas, { cmin: 100, cmax: 150 })).toEqual(['casa-sin'])
  })
  it('terreno desde/hasta: `metros` si es terreno, `m_terreno` si es casa; deptos y casas sin dato NO entran', () => {
    expect(ids(todas, { tmin: 250 }).sort()).toEqual(['casa', 'terreno'])
    expect(ids(todas, { tmax: 500 })).toEqual(['casa'])
    expect(ids(todas, { tmin: 1 }).sort()).toEqual(['casa', 'terreno'])
  })
  it('los límites son INCLUSIVOS (≥ desde, ≤ hasta)', () => {
    expect(ids(todas, { cmin: 180, cmax: 180 })).toEqual(['casa'])
    expect(ids(todas, { tmin: 1000, tmax: 1000 })).toEqual(['terreno'])
  })
  it('rango INVERTIDO se intercambia (igual que precio); extremos inválidos se descartan', () => {
    expect(normalizarMas({ cmin: '200', cmax: '100' })).toMatchObject({ cmin: 100, cmax: 200 })
    expect(normalizarMas({ tmin: '5', tmax: '1' })).toMatchObject({ tmin: 1, tmax: 5 })
    for (const malo of ['-5', '0', 'abc', '', '1e999', '100000001', 'NaN', ' ', '12px']) expect(normalizarMas({ cmin: malo }).cmin, `«${malo}»`).toBeUndefined()
    expect(normalizarMas({ cmin: '100000000' }).cmin).toBe(100_000_000)   // el tope es inclusivo
    expect(normalizarMas({ cmin: '12,5' }).cmin).toBe(12.5)               // coma decimal
  })
  it('un campo nulo o ausente nunca cumple un rango', () => {
    const sin = fila('sin', { tipo: 'casa', metros: null })
    expect(ids([sin], { cmin: 1 })).toEqual([])
    expect(ids([sin], { cmax: 999_999 })).toEqual([])
  })
})

describe('baños y estacionamientos', () => {
  it('«N+» es mayor o igual a N (columna `banos`, admite medios baños)', () => {
    const l = [fila('b1', { banos: 1 }), fila('b2', { banos: 2 }), fila('b25', { banos: 2.5 }), fila('b5', { banos: 5 }), fila('bn', { banos: null })]
    expect(ids(l, { ban: 1 }).sort()).toEqual(['b1', 'b2', 'b25', 'b5'])
    expect(ids(l, { ban: 2 }).sort()).toEqual(['b2', 'b25', 'b5'])
    expect(ids(l, { ban: 3 })).toEqual(['b5'])
    expect(ids(l, { ban: 5 })).toEqual(['b5'])
  })
  it('estacionamientos: «0» = DECLARADO sin estacionamiento; «N+» = ≥ N; sin dato NO entra en ninguno', () => {
    const l = [fila('e0', {}, { estacionamientos: 0 }), fila('e1', {}, { estacionamientos: 1 }), fila('e2', {}, { estacionamientos: 2 }), fila('e4', {}, { estacionamientos: 4 }), fila('sin', {}), fila('terreno', { tipo: 'terreno' }, { estacionamientos: 2 })]
    expect(ids(l, { est: 0 })).toEqual(['e0'])
    expect(ids(l, { est: 1 }).sort()).toEqual(['e1', 'e2', 'e4'])
    expect(ids(l, { est: 2 }).sort()).toEqual(['e2', 'e4'])
    expect(ids(l, { est: 4 })).toEqual(['e4'])
  })
  it('«0» sobrevive a la normalización, a la URL y a guardar (antes un 0 se perdía)', () => {
    expect(normalizarFiltros({ est: '0' })).toEqual({ est: 0 })
    expect(normalizarFiltros({ est: 0 })).toEqual({ est: 0 })
    expect(aHref({ est: 0 })).toBe('/propiedades?est=0')
    expect(filtrosDeUrl(new URLSearchParams('est=0'))).toEqual({ est: 0 })
    expect(mismaBusqueda({ est: 0 }, {})).toBe(false)
    expect(mismaBusqueda({ est: 0 }, { est: 0 })).toBe(true)
    expect(describir({ est: 0 })).toContain('sin estacionamiento')
  })
})

/* ── Antigüedad ────────────────────────────────────────────────────────────── */
describe('antigüedad (`antiguedad_anos`; 0 = a estrenar)', () => {
  const l = [fila('a0', {}, { antiguedad_anos: 0 }), fila('a3', {}, { antiguedad_anos: 3 }), fila('a5', {}, { antiguedad_anos: 5 }), fila('a6', {}, { antiguedad_anos: 6 }), fila('a10', {}, { antiguedad_anos: 10 }),
    fila('a20', {}, { antiguedad_anos: 20 }), fila('a50', {}, { antiguedad_anos: 50 }), fila('a51', {}, { antiguedad_anos: 51 }), fila('a80', {}, { antiguedad_anos: 80 }), fila('sin', {})]
  it('A estrenar = exactamente 0', () => { expect(ids(l, { ant: 'estreno' })).toEqual(['a0']) })
  it('«Hasta N años» es ≤ N y acumulado (incluye a estrenar); el límite es inclusivo', () => {
    expect(ids(l, { ant: '5' }).sort()).toEqual(['a0', 'a3', 'a5'])
    expect(ids(l, { ant: '10' }).sort()).toEqual(['a0', 'a10', 'a3', 'a5', 'a6'])
    expect(ids(l, { ant: '20' }).length).toBe(6)
    expect(ids(l, { ant: '50' }).length).toBe(7)
  })
  it('«Más de 50» es > 50 (el 50 NO entra); sin dato no entra en ninguna', () => {
    expect(ids(l, { ant: 'mas50' }).sort()).toEqual(['a51', 'a80'])
    for (const ant of ['estreno', '5', '10', '20', '50', 'mas50'] as const) expect(ids(l, { ant }), ant).not.toContain('sin')
  })
  it('un valor desconocido se ignora al normalizar y no filtra nada', () => { expect(normalizarMas({ ant: 'en construccion' }).ant).toBeUndefined() })
  it('las opciones de la interfaz son las pedidas (sin «En construcción», que no tiene dato)', () => {
    expect(ANTIGUEDADES.map(([, t]) => t)).toEqual(['A estrenar', 'Hasta 5 años', 'Hasta 10 años', 'Hasta 20 años', 'Hasta 50 años', 'Más de 50 años'])
  })
})

/* ── Fecha de publicación en America/Mexico_City ───────────────────────────── */
describe('fecha de publicación: se calcula en America/Mexico_City, no en UTC', () => {
  const Z = (s: string) => Date.parse(s)
  it('el inicio del día en México: UTC−6 (sin horario de verano desde 2022)', () => {
    expect(inicioDeDiaEnMexico(Z('2026-10-28T15:00:00Z'))).toBe(Z('2026-10-28T06:00:00Z'))
    expect(inicioDeDiaEnMexico(Z('2026-10-28T15:00:00Z'), 1)).toBe(Z('2026-10-27T06:00:00Z'))
  })
  it('LÍMITE DE DÍA: a las 05:59:59Z todavía es el día anterior en México; a las 06:00:00Z ya es el nuevo (un cálculo en UTC fallaría)', () => {
    expect(inicioDeDiaEnMexico(Z('2026-10-28T05:59:59Z'))).toBe(Z('2026-10-27T06:00:00Z'))
    expect(inicioDeDiaEnMexico(Z('2026-10-28T06:00:00Z'))).toBe(Z('2026-10-28T06:00:00Z'))
    expect(inicioDeDiaEnMexico(Z('2026-10-28T00:00:00Z'))).toBe(Z('2026-10-27T06:00:00Z'))   // medianoche UTC = 18:00 del día anterior en México
  })
  it('horario de verano HISTÓRICO (antes de nov-2022): se respeta el desfase de cada fecha', () => {
    expect(inicioDeDiaEnMexico(Z('2022-10-30T12:00:00Z'))).toBe(Z('2022-10-30T05:00:00Z'))        // aún CDT (UTC−5)
    expect(inicioDeDiaEnMexico(Z('2022-10-31T12:00:00Z'))).toBe(Z('2022-10-31T06:00:00Z'))        // ya CST (UTC−6)
    expect(inicioDeDiaEnMexico(Z('2022-10-31T12:00:00Z'), 1)).toBe(Z('2022-10-30T05:00:00Z'))     // retroceder un día cruzando el cambio
    expect(inicioDeDiaEnMexico(Z('2022-04-03T12:00:00Z'))).toBe(Z('2022-04-03T06:00:00Z'))
  })
  it('«Hoy» y «Desde ayer» dependen del día de México', () => {
    const ahora = Z('2026-10-28T15:00:00Z')                                   // 09:00 del 28 en México
    expect(desdePublicacion('hoy', ahora)).toBe(Z('2026-10-28T06:00:00Z'))
    expect(desdePublicacion('ayer', ahora)).toBe(Z('2026-10-27T06:00:00Z'))
    expect(desdePublicacion('7', ahora)).toBe(Z('2026-10-22T06:00:00Z'))      // hoy y los 6 días anteriores
    expect(desdePublicacion('45', ahora)).toBe(Z('2026-09-14T06:00:00Z'))
  })
  const l = [
    fila('hoy-madrugada', { publicada_en: '2026-10-28T06:00:00Z' }), fila('ayer-noche', { publicada_en: '2026-10-28T05:59:59Z' }), fila('ayer-0001', { publicada_en: '2026-10-27T06:00:00Z' }),
    fila('antier', { publicada_en: '2026-10-27T05:59:59Z' }), fila('hace-6', { publicada_en: '2026-10-22T06:00:00Z' }), fila('hace-7', { publicada_en: '2026-10-22T05:59:59Z' }), fila('sin-fecha', { publicada_en: null }), fila('basura', { publicada_en: 'no-es-fecha' }),
  ]
  const ahora = Z('2026-10-28T15:00:00Z')
  it('Hoy: solo desde las 00:00 de México (06:00Z); lo de las 05:59:59Z es de AYER', () => { expect(ids(l, { pub: 'hoy' }, ahora)).toEqual(['hoy-madrugada']) })
  it('Desde ayer: desde las 00:00 de ayer en México', () => { expect(ids(l, { pub: 'ayer' }, ahora).sort()).toEqual(['ayer-0001', 'ayer-noche', 'hoy-madrugada']) })
  it('Últimos 7 días: hoy y los 6 anteriores; el límite es inclusivo', () => { expect(ids(l, { pub: '7' }, ahora).sort()).toEqual(['antier', 'ayer-0001', 'ayer-noche', 'hace-6', 'hoy-madrugada']) })
  it('sin fecha o con fecha ilegible NO entra', () => { for (const pub of ['hoy', 'ayer', '7', '15', '30', '45'] as const) expect(ids(l, { pub }, ahora)).not.toEqual(expect.arrayContaining(['sin-fecha', 'basura'])) })
  it('las opciones de la interfaz son las pedidas', () => { expect(PUBLICACIONES.map(([, t]) => t)).toEqual(['Desde ayer', 'Hoy', 'Últimos 7 días', 'Últimos 15 días', 'Últimos 30 días', 'Últimos 45 días']) })
})

/* ── Dirección y Características (texto): acentos, mayúsculas, espacios ────── */
describe('dirección: solo `ubicacion` y `colonia` públicas; sin acentos ni mayúsculas', () => {
  const l = [fila('a', { ubicacion: 'Boulevard San Juan Bosco 4021', colonia: 'Buenaventura' }), fila('b', { ubicacion: 'Calle Cañada 5', colonia: 'Cañada del Refugio' }), fila('c', { ubicacion: 'Av. Insurgentes', colonia: 'Jardines de Jerez' })]
  it('coincide por calle o colonia, con acentos y mayúsculas distintas', () => {
    expect(ids(l, { dir: 'san juan bosco' })).toEqual(['a'])
    expect(ids(l, normalizarFiltros({ dir: '  SAN   JUAN  ' })!)).toEqual(['a'])      // espacios colapsados
    expect(ids(l, normalizarFiltros({ dir: 'cañada' })!).length).toBe(1)
    expect(ids(l, normalizarFiltros({ dir: 'CANADA' })!)).toEqual(['b'])               // sin ñ también
    expect(ids(l, normalizarFiltros({ dir: 'buenaventura' })!)).toEqual(['a'])
  })
  it('no busca en `ciudad`, `calle` ni `cp` (no autorizados para la dirección)', () => {
    const privada = { ...fila('p', { ubicacion: 'Zona X', colonia: 'Centro' }), calle: 'Secreta 123', cp: '37000' } as Fila
    expect(ids([privada], normalizarFiltros({ dir: 'secreta' })!)).toEqual([])
    expect(ids([privada], normalizarFiltros({ dir: '37000' })!)).toEqual([])
    expect(ids([privada], normalizarFiltros({ dir: 'leon' })!)).toEqual([])
  })
  it('entradas inválidas o hostiles: no rompen ni devuelven «todo»', () => {
    expect(normalizarMas({ dir: 'a' }).dir).toBeUndefined()
    expect(normalizarMas({ dir: 'x'.repeat(500) }).dir).toHaveLength(80)
    for (const h of ["' OR 1=1;--", '<script>x</script>', '(.*', '[a-', '%%__\\']) expect(ids(l, normalizarFiltros({ dir: h })!), h).toEqual([])
  })
  it('el patrón SQL tolera acentos como SUPERCONJUNTO (el filtro exacto lo da `coincide`)', () => {
    // `plano` quita acentos (ñ→n), pero en la BASE `ñ` y `n` son letras distintas: por eso a, e, i, o, u y n pasan a comodín de UN carácter.
    expect(patronSinAcentos('León')).toBe('%l___%')
    expect(patronSinAcentos('Cañada')).toBe('%____d_%')    // c,a,ñ,a → comodines · d · a → comodín
    expect(patronSinAcentos('canada')).toBe('%____d_%')     // «cañada» y «canada» piden lo mismo a la base
    expect(patronSinAcentos('100%')).toBe('%100_%')         // un % escrito por la persona NO actúa como comodín de SQL
    expect(patronSinAcentos('a_b%c\\d')).toBe('%__b___d%')  // ni «_» ni «\»
    expect(patronSinAcentos('San  Juan')).toBe('%s__%j___%') // los espacios se colapsan y se vuelven «%»
  })
})

describe('«Características» (texto): solo contra datos ESTRUCTURADOS, nunca texto libre', () => {
  const alberca = fila('alberca', {}, { exteriores: ['alberca'] })
  const mascotas = fila('mascotas', { operacion: 'renta' }, { mascotas: 'permitidas', amueblado: 'si' })
  const restricciones = fila('restr', { operacion: 'renta' }, { mascotas: 'con_restricciones' })
  const noMascotas = fila('no-masc', { operacion: 'renta' }, { mascotas: 'no_permitidas' })
  const textoLibre = { ...fila('libre', {}), amenidades: ['alberca', 'jacuzzi'], descripcion: 'Casa con alberca, jacuzzi y amueblado' } as Fila
  const todas = [alberca, mascotas, restricciones, noMascotas, textoLibre]
  it('«alberca» encuentra la estructurada; el texto libre / la descripción NO cuentan', () => { expect(ids(todas, normalizarFiltros({ car: 'alberca' })!)).toEqual(['alberca']) })
  it('«permite mascotas» ← `mascotas` permitidas o con restricciones (no «no permitidas»)', () => { expect(ids(todas, normalizarFiltros({ car: 'permite mascotas' })!).sort()).toEqual(['mascotas', 'restr']) })
  it('«amueblado» ← `amueblado` sí/semi', () => { expect(ids(todas, normalizarFiltros({ car: 'amueblado' })!)).toEqual(['mascotas']) })
  it('varios términos: TODOS deben cumplirse (decisión a confirmar con el dueño)', () => {
    expect(ids(todas, normalizarFiltros({ car: 'amueblado, mascotas' })!)).toEqual(['mascotas'])
    expect(ids(todas, normalizarFiltros({ car: 'alberca, mascotas' })!)).toEqual([])
  })
  it('acentos, mayúsculas, espacios y separadores distintos dan lo mismo', () => {
    const a = normalizarFiltros({ car: '  ALBERCA ;  Amueblado ' })!
    expect(a.car).toEqual(['alberca', 'amueblado'])
    expect(normalizarFiltros({ car: ['Alberca', 'AMUEBLADO'] })!.car).toEqual(['alberca', 'amueblado'])
  })
  it('CIERRE: por `coincide()` CADA filtro nuevo incluye al positivo y EXCLUYE al negativo (nadie pasa «de largo» hasta coincideMas)', () => {
    const AHORA = Date.parse('2026-10-28T18:00:00Z')
    const DIA = 86_400_000
    const casos: Array<[string, Record<string, string>, Fila, Fila]> = [
      ['car', { car: 'alberca' }, fila('p', {}, { exteriores: ['alberca'] }), fila('n', {}, { exteriores: ['jardin'] })],
      ['cmin', { cmin: '150' }, fila('p', { metros: 200 }), fila('n', { metros: 100 })],
      ['cmax', { cmax: '150' }, fila('p', { metros: 100 }), fila('n', { metros: 200 })],
      ['tmin', { tmin: '250' }, fila('p', {}, { m_terreno: 300 }), fila('n', {}, { m_terreno: 100 })],
      ['tmax', { tmax: '250' }, fila('p', {}, { m_terreno: 100 }), fila('n', {}, { m_terreno: 300 })],
      ['ban', { ban: '3' }, fila('p', { banos: 3 }), fila('n', { banos: 2 })],
      ['est', { est: '2' }, fila('p', {}, { estacionamientos: 2 }), fila('n', {}, { estacionamientos: 1 })],
      ['est=0', { est: '0' }, fila('p', {}, { estacionamientos: 0 }), fila('n', {}, { estacionamientos: 1 })],
      ['amb', { amb: 'estudio' }, fila('p', {}, { interiores: ['estudio'] }), fila('n', {}, { interiores: ['closets'] })],
      ['gen', { gen: 'alberca' }, fila('p', {}, { exteriores: ['alberca'] }), fila('n', {}, { exteriores: ['patio'] })],
      ['ext', { ext: 'jardin' }, fila('p', {}, { exteriores: ['jardin'] }), fila('n', {}, { exteriores: ['patio'] })],
      ['srv', { srv: 'caseta' }, fila('p', {}, { seguridad: ['caseta'] }), fila('n', {}, { seguridad: ['camaras'] })],
      ['ame', { ame: 'gimnasio' }, fila('p', {}, { amenidades_comunes: ['gimnasio'] }), fila('n', {}, { amenidades_comunes: ['cancha'] })],
      ['mm=video', { mm: 'video' }, fila('p', { videos: [URL_VIDEO] }), fila('n', { videos: [] })],
      ['mm=planos', { mm: 'planos' }, fila('p', { planos: [URL_PLANO] }), fila('n', { planos: [] })],
      ['ant', { ant: 'estreno' }, fila('p', {}, { antiguedad_anos: 0 }), fila('n', {}, { antiguedad_anos: 5 })],
      ['pub', { pub: '7' }, fila('p', { publicada_en: new Date(AHORA - 2 * DIA).toISOString() }), fila('n', { publicada_en: new Date(AHORA - 20 * DIA).toISOString() })],
      ['dir', { dir: 'alamo' }, fila('p', { ubicacion: 'Calle Álamo 4' }), fila('n', { ubicacion: 'Calle Uno 10' })],
    ]
    for (const [nombre, entrada, pos, neg] of casos) {
      const f = normalizarFiltros(entrada)
      expect(f, `${nombre}: el filtro debe ser válido`).not.toBeNull()
      expect(coincide(pos, f!, AHORA), `${nombre}: el positivo debe entrar`).toBe(true)
      expect(coincide(neg, f!, AHORA), `${nombre}: el negativo debe quedar FUERA`).toBe(false)
    }
  })
  it('REVISIÓN: «se permiten» no trae los anuncios que PROHÍBEN mascotas (las opciones negativas no entran al texto)', () => {
    const fuentes = fuentesDeTermino('se permiten')
    expect(JSON.stringify(fuentes)).not.toContain('no_permitidas')
    expect(fuentes.length, 'la opción afirmativa SÍ debe resolverse (control positivo)').toBeGreaterThan(0)
    const f = normalizarFiltros({ car: 'se permiten', op: 'renta' })!
    const prohibe = { ...fila('no', { operacion: 'renta' }, { mascotas: 'no_permitidas' }) }
    const permite = { ...fila('si', { operacion: 'renta' }, { mascotas: 'permitidas' }) }
    expect(ids([prohibe, permite], f)).toEqual(['si'])
  })
  it('REVISIÓN: la caché de términos tiene tope y sigue resolviendo después de vaciarse', () => {
    for (let i = 0; i < 1200; i++) fuentesDeTermino(`termino${i}`)
    expect(fuentesDeTermino('alberca').length).toBeGreaterThan(0)
  })
  it('REVISIÓN: un carácter no ASCII (ç, ý) y las letras que lo admiten (c, y) pasan a comodín: «garcon» encuentra «Garçon» en la base', () => {
    expect(patronSinAcentos('garcon')).toBe('%g_r___%')
    expect(patronSinAcentos('garçon')).toBe('%g_r___%')
    expect(patronSinAcentos('çy')).toBe('%__%')
  })
  it('un término que no existe en el catálogo → CERO resultados (no «todo») y lo detecta la consulta (`imposible`)', () => {
    expect(fuentesDeTermino('jacuzzi')).toEqual([])
    expect(ids(todas, normalizarFiltros({ car: 'jacuzzi' })!)).toEqual([])
  })
  it('términos demasiado cortos o repetidos se descartan; hay un tope de términos y de largo', () => {
    expect(normalizarMas({ car: 'a, bb, ab' }).car).toBeUndefined()
    expect(normalizarMas({ car: 'patio, PATIO, Patio' }).car).toEqual(['patio'])
    expect(normalizarMas({ car: Array.from({ length: 30 }, (_, i) => `termino${i}`).join(',') }).car).toHaveLength(8)
    expect(normalizarMas({ car: 'x'.repeat(500) }).car![0]).toHaveLength(40)
  })
})

/* ── Multimedia ────────────────────────────────────────────────────────────── */
describe('multimedia: Video y Planos (OR)', () => {
  const v = fila('v', { videos: [URL_VIDEO] }), p = fila('p', { planos: [URL_PLANO] }), vp = fila('vp', { videos: [URL_VIDEO], planos: [URL_PLANO] }), nada = fila('nada'), nulos = fila('nulos', { videos: null, planos: undefined })
  it('Video → solo con videos; Planos → solo con planos; ambos → OR; nulos/vacíos nunca', () => {
    const todas = [v, p, vp, nada, nulos]
    expect(ids(todas, { mm: ['video'] }).sort()).toEqual(['v', 'vp'])
    expect(ids(todas, { mm: ['planos'] }).sort()).toEqual(['p', 'vp'])
    expect(ids(todas, { mm: ['video', 'planos'] }).sort()).toEqual(['p', 'v', 'vp'])
  })
  it('«Recorrido 360» NO es un valor válido (no hay dato): se descarta al normalizar', () => { expect(normalizarMas({ mm: 'recorrido_360,video' }).mm).toEqual(['video']) })
})

/* ── Normalización, URL, guardar y limpiar ─────────────────────────────────── */
describe('URL: normalización, ida y vuelta y restauración', () => {
  const URL_COMPLETA = 'op=Renta&tipo=CASA&zona=  León &pmax=30000&ban=2&est=0&cmin=50&cmax=300&tmin=100&amb=ESTUDIO,bodega&gen=amueblado&ext=patio&srv=internet&ame=gimnasio&mm=video&ant=10&pub=7&dir=San Juan&car=Alberca, mascotas'
  it('valores en mayúsculas, con espacios y listas con coma se normalizan', () => {
    const f = filtrosDeUrl(new URLSearchParams(URL_COMPLETA))!
    expect(f).toMatchObject({ op: 'renta', tipo: 'casa', zona: 'León', pmax: 30000, ban: 2, est: 0, cmin: 50, cmax: 300, tmin: 100, amb: ['bodega', 'estudio'], gen: ['amueblado'], ext: ['patio'], srv: ['internet'], ame: ['gimnasio'], mm: ['video'], ant: '10', pub: '7', dir: 'san juan', car: ['alberca', 'mascotas'] })
  })
  it('ida y vuelta: filtros → URL → filtros es idéntico, y la URL es ESTABLE (mismo orden siempre)', () => {
    const f = filtrosDeUrl(new URLSearchParams(URL_COMPLETA))!
    const href = aHref(f)
    const de = filtrosDeUrl(new URLSearchParams(href.split('?')[1]))!
    expect(de).toEqual(f)
    expect(aHref(de)).toBe(href)
    const otroOrden = filtrosDeUrl(new URLSearchParams('mm=video&car=mascotas,alberca&dir=San Juan&pub=7&ant=10&ame=gimnasio&srv=internet&ext=patio&gen=amueblado&amb=bodega,estudio&tmin=100&cmax=300&cmin=50&est=0&ban=2&pmax=30000&zona=León&tipo=casa&op=renta'))!
    expect(mismaBusqueda(f, otroOrden)).toBe(false)   // el orden de los términos de «car» sí es parte de la búsqueda (se conserva tal cual)
    expect(aHref({ ...f, car: ['mascotas', 'alberca'] })).toContain('car=mascotas%2Calberca')
  })
  it('guardar y restaurar: el JSON de `busquedas_guardadas.filtros` se normaliza igual (listas como arreglos)', () => {
    const f = filtrosDeUrl(new URLSearchParams(URL_COMPLETA))!
    const guardado = JSON.parse(JSON.stringify(f))
    expect(normalizarFiltros(guardado)).toEqual(f)
    expect(mismaBusqueda(f, normalizarFiltros(guardado)!)).toBe(true)
  })
  it('URLs inválidas: todo lo desconocido se ignora y no queda un filtro fantasma', () => {
    expect(filtrosDeUrl(new URLSearchParams('amb=inexistente,,,&ant=foo&pub=9&cmin=-5&cmax=abc&dir=a&car=ab&mm=360&gen=centros_comerciales&ext=%00'))).toBeNull()
    expect(filtrosDeUrl(new URLSearchParams(''))).toBeNull()
    expect(filtrosDeUrl(new URLSearchParams('AMB=estudio&Ant=5'))).toBeNull()   // los NOMBRES de parámetro distinguen mayúsculas (sin cambio)
  })
  it('contaminación de prototipo y tipos raros no se cuelan', () => {
    expect(normalizarFiltros(JSON.parse('{"__proto__":{"amb":["estudio"]},"constructor":{"prototype":{"ant":"5"}}}'))).toBeNull()
    expect(({} as Record<string, unknown>).amb).toBeUndefined()
    expect(normalizarMas({ cmin: 5 })).toEqual({ cmin: 5 })   // 5 m² SÍ es un valor válido de superficie (no es un valor «raro»)
    expect(normalizarMas({ amb: 5, car: 5, dir: 5, ant: 5, pub: 5 } as never)).toEqual({})
    for (const raro of [null, undefined, true, {}, [], [[]], [{ a: 1 }]]) expect(normalizarMas({ amb: raro, car: raro, dir: raro, ant: raro, pub: raro, cmin: raro } as never), String(JSON.stringify(raro))).toEqual({})
  })
  it('limpiar: sin filtros no queda nada (null) y cada filtro se puede quitar por separado', () => {
    const f = filtrosDeUrl(new URLSearchParams('amb=estudio&ant=5'))!
    const sinAmb = { ...f }
    delete sinAmb.amb
    expect(normalizarFiltros(sinAmb)).toEqual({ ant: '5' })
    expect(normalizarFiltros({})).toBeNull()
  })
  it('describir() menciona los filtros nuevos (panel y correos)', () => {
    const t = describir(filtrosDeUrl(new URLSearchParams('amb=estudio&ext=patio&ant=10&pub=7&dir=san juan&cmin=50&car=alberca'))!)
    for (const parte of ['estudio', 'patio', 'hasta 10 años', 'últimos 7 días', 'san juan', 'construcción desde 50 m²', 'alberca']) expect(t.toLowerCase()).toContain(parte)
  })
})

describe('coincideMas es PURA y no rompe con filas incompletas', () => {
  it('una fila sin extras, sin videos y sin fecha: ningún filtro nuevo se cumple y nada lanza', () => {
    const vacia = { id: 'v', operacion: 'venta', tipo: 'casa' } as Fila
    for (const f of [{ amb: ['estudio'] }, { mm: ['video'] }, { ant: '5' as const }, { pub: 'hoy' as const }, { cmin: 1 }, { tmin: 1 }, { dir: 'x1' }, { car: ['alberca'] }] as Filtros[]) expect(() => coincideMas(vacia, f), JSON.stringify(f)).not.toThrow()
    for (const f of [{ amb: ['estudio'] }, { mm: ['video'] }, { ant: '5' as const }, { pub: 'hoy' as const }, { tmin: 1 }, { dir: 'x1' }, { car: ['alberca'] }] as Filtros[]) expect(coincideMas(vacia, f), JSON.stringify(f)).toBe(false)
  })
  it('extras corruptos (cadena, arreglo, null) se toleran', () => {
    for (const extras of ['basura', [], null, 5, { caracteristicas: 'x' }, { caracteristicas: { interiores: 'estudio' } }]) expect(coincideMas({ id: 'x', tipo: 'casa', operacion: 'venta', extras } as Fila, { amb: ['estudio'] })).toBe(false)
  })
})
