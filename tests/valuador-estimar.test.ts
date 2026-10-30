import { describe, it, expect } from 'vitest'
import { estimar, medianaPonderada, redondear, grupoDeTipo, type Anuncio, type Entrada } from '../src/lib/valuador/estimar'
import { validarEntrada } from '../src/lib/valuador/validar'

/** Un anuncio de prueba (casa en venta en León) con precio por m² controlado. */
let n = 0
const anuncio = (o: Partial<Anuncio> & { ppm?: number; m?: number }): Anuncio => {
  const m = o.m ?? 150
  const ppm = o.ppm ?? 25000
  n += 1
  return { id: `a${n}`, slug: `casa-${n}`, titulo: `Casa ${n}`, tipo: 'casa', operacion: 'venta', precio: Math.round(ppm * m), moneda: 'MXN', colonia: 'Campestre', ciudad: 'León', metros: m, recamaras: 3, banos: 2, estatus: 'disponible', estado_pub: 'publicada', ...o }
}
const entrada: Entrada = { operacion: 'venta', tipo: 'casa', colonia: 'Campestre', metros: 150, recamaras: 3, banos: 2 }

describe('valuador · estimación por comparables', () => {
  it('con menos comparables de los necesarios NO inventa una cifra', () => {
    const r = estimar(entrada, [anuncio({}), anuncio({})])
    expect(r.estado).toBe('insuficiente')
    expect(r).not.toHaveProperty('rango')
    if (r.estado === 'insuficiente') { expect(r.comparables_encontrados).toBe(2); expect(r.minimo_requerido).toBe(3); expect(r.motivo).toMatch(/necesitan al menos 3/) }
  })

  it('con comparables de la misma colonia da un rango ordenado, redondeado y con confianza alta', () => {
    const cat = [24000, 25000, 25500, 26000, 24500, 25200, 25800].map((ppm) => anuncio({ ppm }))
    const r = estimar(entrada, cat)
    expect(r.estado).toBe('estimado')
    if (r.estado !== 'estimado') return
    expect(r.rango.min).toBeLessThanOrEqual(r.rango.central)
    expect(r.rango.central).toBeLessThanOrEqual(r.rango.max)
    expect(r.rango.central).toBeGreaterThan(3_400_000); expect(r.rango.central).toBeLessThan(4_000_000)
    for (const v of Object.values(r.rango)) expect(v % 10000).toBe(0)           // venta ≥ 1 M: a decenas de miles
    expect(r.confianza.nivel).toBe('alto')
    expect(r.comparables.length).toBeLessThanOrEqual(8)
    expect(r.comparables[0].parecido).toContain('misma colonia')
    expect(r.faltantes.join(' ')).not.toMatch(/colonia/)
  })

  it('separa venta y renta, no mezcla monedas ni anuncios ocultos o de otra ciudad', () => {
    const buenos = [24000, 25000, 26000].map((ppm) => anuncio({ ppm }))
    const ruido = [
      anuncio({ operacion: 'renta', ppm: 200 }), anuncio({ moneda: 'USD', ppm: 1000 }), anuncio({ ciudad: 'Guadalajara', ppm: 60000 }),
      anuncio({ estatus: 'pausada', ppm: 90000 }), anuncio({ estado_pub: 'borrador', ppm: 90000 }), anuncio({ tipo: 'departamento', ppm: 90000 }),
    ]
    const r = estimar(entrada, [...buenos, ...ruido])
    expect(r.estado).toBe('estimado')
    if (r.estado === 'estimado') { expect(r.total_considerados).toBe(3); expect(r.rango.central).toBeLessThan(4_000_000) }
  })

  it('descarta precios por m² atípicos y lo dice', () => {
    const cat = [25000, 25500, 26000, 24500, 25200, 25800].map((ppm) => anuncio({ ppm }))
    cat.push(anuncio({ ppm: 250000 }))   // un error de captura: 10× el mercado
    const r = estimar(entrada, cat)
    expect(r.estado).toBe('estimado')
    if (r.estado === 'estimado') { expect(r.descartados_atipicos).toBe(1); expect(r.factores.join(' ')).toMatch(/descartaron 1 anuncio/); expect(r.rango.max).toBeLessThan(4_200_000) }
  })

  it('terrenos, naves, locales y oficinas exigen 5 comparables y su confianza nunca es alta', () => {
    const terr = (ppm: number) => anuncio({ tipo: 'terreno', ppm, m: 300 })
    const e: Entrada = { operacion: 'venta', tipo: 'terreno', colonia: 'Campestre', metros: 300 }
    expect(estimar(e, [1, 2, 3, 4].map((i) => terr(3000 + i * 50))).estado).toBe('insuficiente')
    const r = estimar(e, [1, 2, 3, 4, 5, 6, 7].map((i) => terr(3000 + i * 20)))
    expect(r.estado).toBe('estimado')
    if (r.estado === 'estimado') expect(r.confianza.nivel).not.toBe('alto')
  })

  it('sin colonia compara con toda la ciudad, lo avisa y baja la confianza', () => {
    const cat = [24000, 25000, 25500, 26000, 24500, 25200, 25800].map((ppm) => anuncio({ ppm }))
    const r = estimar({ ...entrada, colonia: null }, cat)
    expect(r.estado).toBe('estimado')
    if (r.estado !== 'estimado') return
    expect(r.confianza.nivel).not.toBe('alto')
    expect(r.faltantes.join(' ')).toMatch(/colonia/)
    expect(r.confianza.motivos.join(' ')).toMatch(/no se indicó colonia/)
  })

  it('los comparables que se enseñan solo llevan datos públicos del anuncio (sin dueño, teléfono ni correo)', () => {
    const cat = [24000, 25000, 25500, 26000].map((ppm) => anuncio({ ppm }))
    const r = estimar(entrada, cat)
    expect(r.estado).toBe('estimado')
    if (r.estado !== 'estimado') return
    expect(Object.keys(r.comparables[0]).sort()).toEqual(['colonia', 'etiqueta', 'id', 'metros', 'parecido', 'ppm', 'precio', 'similitud', 'slug'])
  })

  it('es determinista: la misma entrada y los mismos anuncios dan el mismo resultado', () => {
    const cat = [24000, 25000, 25500, 26000, 24500].map((ppm) => anuncio({ ppm }))
    expect(JSON.stringify(estimar(entrada, cat))).toBe(JSON.stringify(estimar(entrada, cat)))
  })

  it('utilidades: mediana ponderada, redondeo y agrupación de tipos', () => {
    expect(medianaPonderada([1, 2, 3], [1, 1, 1])).toBe(2)
    expect(medianaPonderada([1, 2, 3], [10, 1, 1])).toBe(1)
    expect(redondear(3_512_345, 'venta')).toBe(3_510_000)
    expect(redondear(450_300, 'venta')).toBe(450_000)
    expect(redondear(18_760, 'renta')).toBe(18_800)
    expect(grupoDeTipo('local')).toBe('comercial'); expect(grupoDeTipo('bodega')).toBe('nave'); expect(grupoDeTipo('yate')).toBeNull()
  })
})

describe('valuador · validación en el servidor', () => {
  const ok = { operacion: 'venta', tipo: 'casa', colonia: '  Campestre  ', metros: '150,5', recamaras: '3', banos: 2 }
  it('normaliza una entrada válida', () => {
    const v = validarEntrada(ok)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entrada).toEqual({ operacion: 'venta', tipo: 'casa', colonia: 'Campestre', metros: 150.5, recamaras: 3, banos: 2 })
  })
  it.each([
    [{ ...ok, operacion: 'permuta' }, 'operacion'], [{ ...ok, tipo: 'yate' }, 'tipo'], [{ ...ok, metros: 5 }, 'metros'], [{ ...ok, metros: 'abc' }, 'metros'],
    [{ ...ok, metros: 999999 }, 'metros'], [{ ...ok, colonia: 'x'.repeat(81) }, 'colonia'], [{ ...ok, recamaras: 99 }, 'recamaras'], [{ ...ok, banos: -1 }, 'banos'], [null, 'operacion'],
  ])('rechaza con mensaje claro y el campo: %j', (cuerpo, campo) => {
    const v = validarEntrada(cuerpo)
    expect(v.ok).toBe(false)
    if (!v.ok) { expect(v.campo).toBe(campo); expect(v.error.length).toBeGreaterThan(10) }
  })
  it('la colonia, las recámaras y los baños son opcionales', () => {
    const v = validarEntrada({ operacion: 'renta', tipo: 'departamento', metros: 80 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entrada).toMatchObject({ colonia: null, recamaras: null, banos: null })
  })
})
