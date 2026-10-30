import { describe, expect, it } from 'vitest'
import { coincide, contar, mismaBusqueda, normalizarFiltros, plano, type PropiedadBuscable } from '../src/lib/busquedas'
import { esFolio, normalizarFolio } from '../src/lib/folio'

/**
 * Auditoría del rol cliente (28-oct-2026) — buscador del catálogo: casos que `busquedas.test.ts` no cubre (parcial, unicode, hostiles, tipos raros, prototipo, folio).
 * Funciones PURAS (las mismas que usan el listado, el panel y el contador de «nuevas»). Datos sintéticos. Lo que aquí aparece como «documentado» es el comportamiento
 * REAL de hoy, no necesariamente el deseado; los defectos se nombran con «HUECO».
 */
const base: PropiedadBuscable & { folio: string } = {
  folio: 'VB-2026-00004', operacion: 'venta', tipo: 'casa', ubicacion: 'Blvd. Francisco Villa 540', colonia: 'Cañada del Refugio', ciudad: 'León',
  precio: 4_500_000, estatus: 'disponible', recamaras: 3, banos: 2, metros: 180,
}
const lista: (PropiedadBuscable & { folio: string })[] = [
  base,
  { ...base, folio: 'VB-2026-00005', tipo: 'nave', colonia: 'Buenaventura', ubicacion: 'Calle San Juan Bosco', precio: 7_599_000, recamaras: null, banos: null, metros: 1500 },
  { ...base, folio: 'VB-2026-00006', operacion: 'renta', tipo: 'departamento', colonia: 'Jardines de Jerez', precio: 12_000, metros: 70 },
]
const salen = (f: Parameters<typeof coincide>[1], l = lista) => l.filter((p) => coincide(p, f)).map((p) => p.folio)

describe('zona: acentos, mayúsculas y coincidencia parcial', () => {
  it('«cañada», «CAÑADA», «canada» y «Cañada» dan lo mismo (ñ→n por NFD)', () => {
    const esperado = ['VB-2026-00004']
    for (const z of ['cañada', 'CAÑADA', 'canada', 'Cañada']) expect(salen({ zona: z }), z).toEqual(esperado)
  })
  it('parcial: un trozo del nombre basta, en cualquiera de ubicación / colonia / ciudad', () => {
    expect(salen({ zona: 'buenavent' })).toEqual(['VB-2026-00005'])
    expect(salen({ zona: 'san juan' })).toEqual(['VB-2026-00005'])
    expect(salen({ zona: 'leon' })).toHaveLength(3)                  // ciudad en las tres
    expect(salen({ zona: 'jerez' })).toEqual(['VB-2026-00006'])
  })
  it('sin coincidencias: lista vacía, sin error', () => {
    expect(salen({ zona: 'zzzzz' })).toEqual([])
    expect(contar(lista, { zona: 'zzzzz' })).toEqual({ total: 0, nuevas: 0 })
  })
  it('la forma descompuesta (NFD) y la compuesta (NFC) de «ñ» coinciden', () => {
    expect(plano('Cañada'.normalize('NFC'))).toBe(plano('Cañada'.normalize('NFD')))
  })
  it('documentado: la «İ» turca SÍ se iguala a «i» (NFD separa el punto y se elimina); las letras de ancho completo NO se igualan a ASCII (no se usa NFKD)', () => {
    expect(plano('İ')).toBe('i')                   // corregido: la primera versión de esta prueba suponía lo contrario y estaba equivocada
    expect(plano('ＬＥＯＮ')).not.toBe('leon')      // ancho completo: no se normaliza; sin caso real en León, se deja anotado
  })
})

describe('entradas hostiles: no revientan, no devuelven «todo»', () => {
  const hostiles = ['(.*', '[a-', '\\', '.*', '%', '_', "' OR 1=1;--", '<script>x</script>', 'a'.repeat(5000), '\u0000\u0001', '‮', '😀😀']
  it('coincide() con una zona hostil devuelve false y no lanza (usa includes, no RegExp)', () => {
    for (const z of hostiles) expect(() => salen({ zona: z }), z.slice(0, 12)).not.toThrow()
    for (const z of hostiles) expect(salen({ zona: z }), z.slice(0, 12)).toEqual([])
  })
  it('normalizarFiltros() recorta la zona a 60 y descarta zonas de un solo carácter', () => {
    expect(normalizarFiltros({ zona: 'a'.repeat(5000) })?.zona).toHaveLength(60)
    expect(normalizarFiltros({ zona: 'x' })).toBeNull()
    expect(normalizarFiltros({ zona: '   ' })).toBeNull()
  })
  it('el tipo solo admite [a-z_] de 2 a 30: SQL, HTML y mayúsculas raras se descartan', () => {
    expect(normalizarFiltros({ tipo: "casa'; drop table x;--" })).toBeNull()
    expect(normalizarFiltros({ tipo: '<b>' })).toBeNull()
    expect(normalizarFiltros({ tipo: 'CASA' })?.tipo).toBe('casa')
  })
  it('la contaminación de prototipo no se cuela como filtro', () => {
    const entrada = JSON.parse('{"__proto__":{"op":"venta","zona":"hack"},"constructor":{"prototype":{"op":"renta"}}}')
    expect(normalizarFiltros(entrada)).toBeNull()
    expect(({} as Record<string, unknown>).zona).toBeUndefined()
  })
})

describe('números y tipos inesperados', () => {
  it('NaN, Infinity, negativos, cero, notación científica y hex no producen filtros absurdos', () => {
    for (const v of [NaN, Infinity, -1, 0, '-5', '0', '1e999', 'abc', '', null, undefined, {}, [], true]) {
      expect(normalizarFiltros({ pmin: v }), String(v)).toBeNull()
    }
  })
  it('documentado: «0x10» y «1e3» se leen como número (Number() los acepta): 16 y 1000', () => {
    expect(normalizarFiltros({ pmin: '0x10' })?.pmin).toBe(16)
    expect(normalizarFiltros({ pmin: '1e3' })?.pmin).toBe(1000)
  })
  it('mínimo > máximo se intercambia; el tope de recámaras es 20 y de superficie 100 millones', () => {
    expect(normalizarFiltros({ pmin: 9, pmax: 3 })).toMatchObject({ pmin: 3, pmax: 9 })
    expect(normalizarFiltros({ rec: 21 })).toBeNull()
    expect(normalizarFiltros({ smax: 100_000_001 })).toBeNull()
  })
  it('CORREGIDO (28-oct, decisión del dueño): `op=Venta`, `op=VENTA` y `op=venta` significan LO MISMO (antes «Venta» se ignoraba en silencio y la página creía que había un filtro activo)', () => {
    expect(normalizarFiltros({ op: 'Venta' })).toEqual({ op: 'venta' })
    expect(normalizarFiltros({ op: 'VENTA', zona: 'leon' })).toEqual({ op: 'venta', zona: 'leon' })
    expect(normalizarFiltros({ op: '  Renta ' })).toEqual({ op: 'renta' })
    expect(normalizarFiltros({ op: 'alquiler' })).toBeNull()   // un valor desconocido sigue sin significar nada
  })
  it('amueblado y mascotas solo se conservan si la operación es renta', () => {
    expect(normalizarFiltros({ op: 'venta', amu: 1, zona: 'leon' })).toEqual({ op: 'venta', zona: 'leon' })
    expect(normalizarFiltros({ op: 'renta', amu: '1', masc: true })).toEqual({ op: 'renta', amu: 1, masc: 1 })
  })
})

describe('combinaciones y exclusiones', () => {
  it('operación + tipo + rango + zona a la vez', () => {
    expect(salen({ op: 'venta', tipo: 'nave', pmin: 5_000_000, pmax: 9_000_000, zona: 'buenaventura' })).toEqual(['VB-2026-00005'])
    expect(salen({ op: 'venta', tipo: 'nave', pmax: 1_000_000 })).toEqual([])
  })
  it('una propiedad sin precio, sin superficie o sin recámaras NO entra cuando se filtra por ese dato', () => {
    const l = [{ ...base, folio: 'X1', precio: null }, { ...base, folio: 'X2', metros: null }, { ...base, folio: 'X3', recamaras: null }]
    expect(salen({ pmin: 1 }, l as never)).toEqual(['X2', 'X3'])
    expect(salen({ smin: 1 }, l as never)).toEqual(['X1', 'X3'])
    expect(salen({ rec: 1 }, l as never)).toEqual(['X1', 'X2'])
  })
  it('estatus pausada, vendida, rentada y eliminada nunca salen; «depto» cuenta como departamento', () => {
    for (const e of ['pausada', 'vendida', 'rentada', 'eliminada']) expect(coincide({ ...base, estatus: e }, { zona: 'leon' }), e).toBe(false)
    expect(coincide({ ...base, tipo: 'depto' }, { tipo: 'departamento' })).toBe(true)
  })
})

describe('«nuevas» y búsquedas iguales', () => {
  it('«nueva» es estrictamente posterior: publicada en el mismo instante en que se guardó la búsqueda NO cuenta', () => {
    const t = '2026-10-20T12:00:00.000Z'
    const l = [{ ...base, publicada_en: t }, { ...base, publicada_en: '2026-10-20T12:00:00.001Z' }, { ...base, publicada_en: null, created_at: null }]
    expect(contar(l, { zona: 'leon' }, t)).toEqual({ total: 3, nuevas: 1 })
  })
  it('una fecha de referencia ilegible deja «nuevas» en 0 en vez de contarlas todas', () => {
    expect(contar([{ ...base, publicada_en: '2026-10-21' }], { zona: 'leon' }, 'no-es-fecha')).toEqual({ total: 1, nuevas: 0 })
  })
  it('mismaBusqueda ignora acentos, mayúsculas y el orden de las claves', () => {
    expect(mismaBusqueda({ zona: 'León', pmin: 1 }, { pmin: 1, zona: 'leon' })).toBe(true)
    expect(mismaBusqueda({ zona: 'leon', pmin: 1 }, { zona: 'leon', pmin: 2 })).toBe(false)
  })
})

describe('FOLIO: dónde SÍ y dónde NO funciona', () => {
  it('el folio se reconoce escrito como sea («vb 2026 4», «VB-2026-00004», «vb-2026-4»)', () => {
    for (const t of ['vb 2026 4', 'VB-2026-00004', 'vb-2026-4', ' VB_2026_00004 ']) expect(normalizarFolio(t), t).toBe('VB-2026-00004')
    expect(esFolio('hola')).toBe(false)
    expect(esFolio('VB-2026-000045')).toBe(false)                    // 6 dígitos: no es folio
  })
  it('HUECO (confirmado en código): escribir un folio en el buscador de zona da CERO resultados — el folio solo se resuelve como URL directa de la ficha', () => {
    expect(salen({ zona: 'VB-2026-00004' })).toEqual([])             // `coincide` busca en ubicacion/colonia/ciudad, no en folio
    expect(salen({ zona: 'VB-2026' })).toEqual([])
    expect(normalizarFiltros({ zona: 'VB-2026-00004' })?.zona).toBe('VB-2026-00004') // llega a `?zona=`, y de ahí a `coincide`
  })
})
