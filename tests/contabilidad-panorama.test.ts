import { describe, expect, it } from 'vitest'
import { construirLineas, type MovimientoContable } from '@/lib/contabilidad'
import { construirPanorama, etiquetaDeTipo, grupoDeGasto, panoramaParaIA, type DatosDePropiedad } from '@/lib/contabilidad-panorama'
import type { OperacionComision } from '@/lib/comision-resumen'

/**
 * Panorama de comisiones: un caso calculado A MANO (en pesos) para comprobar cada cifra.
 *  Operaciones: O1 venta de una casa (p1) $100,000, colaborador $30,000, gastos «Publicidad» $2,000 y «Notaría» $1,000 · O2 renta de una bodega (p2) $30,000 · O3 venta de una casa (p3)
 *  $60,000, gasto «Fotografía» $1,000 · O4 anulada (p4, no cuenta).
 *  Gastos externos: g1 Meta Ads $5,000 sin propiedad · g2 lonas $3,000 en p1 con devolución de $1,000 · g3 oficina $800 sin propiedad · g4 publicidad $4,000 en p9 (terreno, sin cierre).
 */
const HOY = '2026-10-25'
const op = (s: Partial<OperacionComision> & { id: string; propiedad_id: string }): OperacionComision => ({
  tipo: 'venta', base_centavos: 0, total_centavos: 0, vivebien_centavos: 0, colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'confirmada',
  creado_en: '2026-09-01T10:00:00Z', fecha_cierre: '2026-09-01', propiedad_folio: null, propiedad_titulo: null, gastos: [], ...s,
})
const mov = (s: Partial<MovimientoContable> & { id: string }): MovimientoContable => ({
  fecha: '2026-09-02', sentido: 'sale', clase: 'gasto', monto_centavos: 0, categoria: 'otro', cuenta_id: null, propiedad_id: null, operacion_id: null, concepto: 'Gasto de prueba', referencia: null,
  reverso_de: null, motivo: null, creado_por: 'super@vb.mx', creado_en: '2026-09-02T10:00:00Z', ...s,
})
const OPERACIONES = [
  op({ id: 'o1', propiedad_id: 'p1', propiedad_titulo: 'Casa Cañada 1', total_centavos: 10_000_000, colaborador_centavos: 3_000_000, reparto_estado: 'liberable', fecha_cierre: '2026-09-01', gastos: [{ concepto: 'Publicidad', monto_centavos: 200_000 }, { concepto: 'Notaría', monto_centavos: 100_000 }] }),
  op({ id: 'o2', propiedad_id: 'p2', propiedad_titulo: 'Bodega Centro', tipo: 'renta', total_centavos: 3_000_000, fecha_cierre: '2026-09-05' }),
  op({ id: 'o3', propiedad_id: 'p3', propiedad_titulo: 'Casa Cañada 2', total_centavos: 6_000_000, fecha_cierre: '2026-08-10', gastos: [{ concepto: 'Fotografía', monto_centavos: 100_000 }] }),
  op({ id: 'o4', propiedad_id: 'p4', propiedad_titulo: 'Nave anulada', total_centavos: 9_000_000, estado: 'anulada' }),
]
const MOVIMIENTOS = [
  mov({ id: 'g1', monto_centavos: 500_000, categoria: 'publicidad_digital', concepto: 'Meta Ads campaña' }),
  mov({ id: 'g2', monto_centavos: 300_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', concepto: 'Lonas' }),
  mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 100_000, categoria: 'publicidad_impresa', propiedad_id: 'p1', reverso_de: 'g2', motivo: 'Lona de mala calidad', concepto: 'Devolución de lonas' }),
  mov({ id: 'g3', monto_centavos: 80_000, categoria: 'oficina', concepto: 'Papelería' }),
  mov({ id: 'g4', monto_centavos: 400_000, categoria: 'publicidad_digital', propiedad_id: 'p9', concepto: 'Campaña terreno', fecha: '2026-09-10' }),
]
const PROPS: Record<string, DatosDePropiedad> = {
  p1: { tipo: 'casa', subtipo: null, operacion: 'venta', colonia: 'Cañada', ciudad: 'León' }, p2: { tipo: 'bodega', subtipo: null, operacion: 'renta', colonia: 'Centro', ciudad: 'León' },
  p3: { tipo: 'casa', subtipo: null, operacion: 'venta', colonia: 'Cañada', ciudad: 'León' }, p4: { tipo: 'nave', subtipo: null, operacion: 'venta', colonia: 'Silao', ciudad: 'Silao' },
  p9: { tipo: 'terreno', subtipo: null, operacion: 'venta', colonia: 'Silao', ciudad: 'Silao' },
}
const lineas = construirLineas({ operaciones: OPERACIONES, movimientos: MOVIMIENTOS, etiquetasDePropiedad: { p9: 'Terreno Silao' } })
const P = construirPanorama(lineas, PROPS, { hoy: HOY, formato: (c) => `$${c / 100}` })
const pesos = (c: number) => c / 100

describe('totales: cada cifra calculada a mano', () => {
  it('comisión, colaborador, comisión neta, gastos y utilidad de la empresa', () => {
    const t = P.totales
    expect([t.cierres, pesos(t.comision), pesos(t.colaborador), pesos(t.comisionNeta)]).toEqual([3, 190_000, 30_000, 160_000])
    expect(pesos(t.promocion)).toBe(14_000) // 2,000 + 1,000 de las operaciones + 5,000 Meta + 3,000 − 1,000 lonas + 4,000 terreno
    expect(pesos(t.otrosGastos)).toBe(1_800) // notaría 1,000 + papelería 800
    expect(pesos(t.gastos)).toBe(15_800)
    expect(pesos(P.utilidadDeLaEmpresa)).toBe(144_200)
    expect(t.margen).toBe(75.9) // 144,200 / 190,000
    expect(t.retorno).toBe(10.13) // 160,000 / 15,800
    expect(t.retornoDePromocion).toBe(11.43) // 160,000 / 14,000
    expect(pesos(t.ticket)).toBe(63_333.33)
  })
  it('lo anulado no suma: la operación anulada y su nave no aparecen', () => {
    expect(P.propiedades.find((p) => p.propiedadId === 'p4')).toBeUndefined()
    expect(P.porTipoDePropiedad.find((t) => t.clave === 'nave')).toBeUndefined()
  })
  it('el gasto general es el que no está ligado a una propiedad, por grupo', () => {
    expect(pesos(P.gastoGeneral.total)).toBe(5_800)
    expect(P.gastoGeneral.porGrupo.map((g) => [g.grupo, pesos(g.monto)])).toEqual([['promocion', 5_000], ['administracion', 800]])
  })
})

describe('qué tipo de propiedad trae más dinero y cuál rinde más por peso', () => {
  it('por tipo: casa, bodega y terreno con sus cifras, ordenados por comisión', () => {
    expect(P.porTipoDePropiedad.map((t) => t.clave)).toEqual(['casa', 'bodega', 'terreno'])
    const casa = P.porTipoDePropiedad[0]
    expect([casa.cierres, casa.propiedades, pesos(casa.comision), pesos(casa.colaborador), pesos(casa.promocion), pesos(casa.otrosGastos), pesos(casa.utilidad)]).toEqual([2, 2, 160_000, 30_000, 5_000, 1_000, 124_000])
    expect(casa.parteDelIngreso).toBe(84.2)
    expect(casa.retorno).toBe(21.67) // 130,000 / 6,000
    const bodega = P.porTipoDePropiedad[1]
    expect([bodega.cierres, pesos(bodega.comision), pesos(bodega.utilidad), bodega.retorno]).toEqual([1, 30_000, 30_000, null])
    const terreno = P.porTipoDePropiedad[2]
    expect([terreno.cierres, pesos(terreno.comision), pesos(terreno.promocion), pesos(terreno.utilidad)]).toEqual([0, 0, 4_000, -4_000])
  })
  it('venta contra renta: solo ingresos, con su ticket y su parte', () => {
    expect(P.porOperacion.map((o) => [o.clave, o.cierres, pesos(o.comision), pesos(o.colaborador), pesos(o.comisionNeta), pesos(o.ticket), o.parteDelIngreso])).toEqual([
      ['venta', 2, 160_000, 30_000, 130_000, 80_000, 84.2], ['renta', 1, 30_000, 0, 30_000, 30_000, 15.8],
    ])
  })
  it('por zona: Cañada concentra la comisión', () => {
    expect(P.porZona[0]).toMatchObject({ etiqueta: 'Cañada', propiedades: 2 })
    expect(pesos(P.porZona[0].comision)).toBe(160_000)
  })
  it('propiedades: la que más promoción gasta, la que mejor retorno tiene y la que pierde', () => {
    expect(P.masPromocion[0]).toMatchObject({ propiedadId: 'p9' })
    expect(pesos(P.masPromocion[0].promocion)).toBe(4_000)
    const p1 = P.propiedades.find((p) => p.propiedadId === 'p1')!
    expect([pesos(p1.comision), pesos(p1.colaborador), pesos(p1.promocion), pesos(p1.otrosGastos), pesos(p1.utilidad)]).toEqual([100_000, 30_000, 4_000, 1_000, 65_000]) // lonas netas 2,000 + publicidad 2,000
    expect(P.mejorRetorno[0].propiedadId).toBe('p3') // 60,000 / 1,000
    expect(P.peorRetorno[0].propiedadId).toBe('p9') // 0 / 4,000
    expect(P.propiedades.at(-1)).toMatchObject({ propiedadId: 'p9' })
  })
  it('la serie mensual separa venta y renta y cuadra con la utilidad', () => {
    const sep = P.mensual.find((m) => m.mes === '2026-09')!
    const ago = P.mensual.find((m) => m.mes === '2026-08')!
    expect([pesos(sep.venta), pesos(sep.renta), pesos(ago.venta)]).toEqual([100_000, 30_000, 60_000])
    expect(P.mensual).toHaveLength(12)
    for (const m of P.mensual) expect(m.utilidad).toBe(m.venta + m.renta - m.colaborador - m.promocion - m.otrosGastos)
  })
  it('gasto por grupo: promoción domina y las partes suman 100 %', () => {
    expect(P.gastosPorGrupo[0]).toMatchObject({ grupo: 'promocion', parte: 88.6 })
    expect(Math.round(P.gastosPorGrupo.reduce((s, g) => s + g.parte, 0))).toBe(100)
  })
})

describe('lecturas y comprobaciones', () => {
  it('lecturas con su cifra: tipo que más deja, propiedades que pierden, gasto sin cierre, retorno de promoción y concentración', () => {
    const ids = P.lecturas.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['tipo-que-mas-deja', 'propiedades-que-pierden', 'gasto-sin-cierre', 'retorno-de-promocion', 'gasto-general', 'concentracion']))
    expect(P.lecturas.find((l) => l.id === 'tipo-que-mas-deja')!.titulo).toBe('«Casa» es el tipo que más comisión aporta: 84.2 % del ingreso')
    expect(P.lecturas.find((l) => l.id === 'gasto-sin-cierre')!.titulo).toContain('$4000 sin retorno todavía')
    expect(P.lecturas.find((l) => l.id === 'tipo-que-mas-deja')!.detalle).toContain('de 2 propiedades')
  })
  it('la comparación «dónde conviene invertir» pide al menos dos tipos con retorno y avisa si la muestra es chica', () => {
    // casa tiene retorno; bodega no gastó nada → solo un tipo comparable: no hay comparación
    expect(P.lecturas.some((l) => l.id === 'donde-conviene-invertir')).toBe(false)
    const l2 = construirLineas({
      operaciones: [op({ id: 'a', propiedad_id: 'a', total_centavos: 10_000_000, gastos: [{ concepto: 'Publicidad', monto_centavos: 500_000 }] }), op({ id: 'b', propiedad_id: 'b', total_centavos: 4_000_000, gastos: [{ concepto: 'Publicidad', monto_centavos: 1_000_000 }] })],
      movimientos: [],
    })
    const p2 = construirPanorama(l2, { a: { tipo: 'nave', subtipo: null, operacion: null, colonia: null, ciudad: null }, b: { tipo: 'local', subtipo: null, operacion: null, colonia: null, ciudad: null } }, { hoy: HOY })
    const l = p2.lecturas.find((x) => x.id === 'donde-conviene-invertir')!
    expect(l.titulo).toBe('Donde más rinde cada peso: «Nave industrial» (20×) frente a «Local comercial» (4×)')
    expect(l.detalle).toContain('menos de 3 cierres')
  })
  it('las comprobaciones cuadran, y avisan lo que no: gasto sin ligar y muestra chica', () => {
    const c = Object.fromEntries(P.calidad.map((x) => [x.id, x]))
    expect(c['suma-por-tipo'].ok).toBe(true)
    expect(c['suma-por-operacion'].ok).toBe(true)
    expect(c['suma-de-gastos'].ok).toBe(true)
    expect(c['tipo-conocido'].ok).toBe(true)
    expect(c['gasto-ligado'].ok).toBe(false) // $5,800 de $12,800 de gasto externo sin propiedad = 45 %
    expect(c['gasto-ligado'].detalle).toContain('45 %')
    expect(c['muestra'].ok).toBe(false)
    expect(c['muestra'].detalle).toContain('Solo 3 cierres')
  })
  it('un cierre sin el tipo de su propiedad se agrupa como «Sin tipo registrado» y se avisa', () => {
    const p = construirPanorama(lineas, { ...PROPS, p2: { tipo: null, subtipo: null, operacion: null, colonia: null, ciudad: null } }, { hoy: HOY })
    expect(p.porTipoDePropiedad.map((t) => t.etiqueta)).toContain('Sin tipo registrado')
    expect(p.calidad.find((x) => x.id === 'tipo-conocido')).toMatchObject({ ok: false })
    expect(p.calidad.find((x) => x.id === 'suma-por-tipo')!.ok).toBe(true) // aun sin tipo, nada se pierde
  })
  it('sin datos: todo en cero y sin lecturas inventadas', () => {
    const v = construirPanorama([], {}, { hoy: HOY })
    expect(v.totales).toMatchObject({ cierres: 0, comision: 0, gastos: 0, utilidad: 0, margen: null, retorno: null })
    expect(v.lecturas).toEqual([])
    expect(v.porTipoDePropiedad).toEqual([])
  })
  it('el rango de fechas recorta: solo septiembre deja fuera la comisión de agosto', () => {
    const p = construirPanorama(lineas, PROPS, { hoy: HOY, rango: { desde: '2026-09-01', hasta: '2026-09-30' } })
    expect(pesos(p.totales.comision)).toBe(130_000)
    expect(p.totales.cierres).toBe(2)
  })
})

describe('clasificación de gastos y datos para la IA', () => {
  it('el gasto de una operación se reconoce como promoción por su concepto', () => {
    const g = (concepto: string) => grupoDeGasto({ clase: 'gasto_operacion', categoria: 'gasto_operacion', concepto: `${concepto} · Casa` })
    for (const c of ['Publicidad', 'Fotografía profesional', 'Lonas', 'Campaña de Meta Ads', 'Video con dron', 'Promoción']) expect(g(c), c).toBe('promocion')
    for (const c of ['Notaría', 'Avalúo', 'Gestoría', 'Comida']) expect(g(c), c).toBe('otros_de_operacion')
    expect(grupoDeGasto({ clase: 'gasto', categoria: 'comision_externa', concepto: 'x' })).toBe('comision_externa')
    expect(grupoDeGasto({ clase: 'gasto', categoria: 'oficina', concepto: 'x' })).toBe('administracion')
    expect(grupoDeGasto({ clase: 'comision', categoria: 'comision', concepto: 'x' })).toBeNull()
    expect(grupoDeGasto({ clase: 'devolucion', categoria: 'ingreso_extra', concepto: 'x' })).toBeNull() // devolver un ingreso extra no es un gasto
  })
  it('las etiquetas de tipo', () => { expect(etiquetaDeTipo('nave')).toBe('Nave industrial'); expect(etiquetaDeTipo('galera')).toBe('Galera'); expect(etiquetaDeTipo('sin_dato')).toBe('Sin tipo registrado') })
  it('lo que va a la IA son cifras en pesos enteros y nombres de negocio; sin correos ni motivos', () => {
    const r = panoramaParaIA(P, 'Últimos 3 meses', HOY)
    const t = JSON.stringify(r)
    expect(r.totales_mxn).toMatchObject({ cierres: 3, comision: 190_000, comision_neta: 160_000, promocion: 14_000, utilidad: 144_200, gasto_general_sin_propiedad: 5_800 })
    expect(r.por_tipo_de_propiedad[0]).toMatchObject({ nombre: 'Casa', comision_mxn: 160_000, retorno_por_peso: 21.67, parte_del_ingreso_pct: 84.2 })
    expect(r.comprobaciones.some((c) => c.cuadra === false)).toBe(true)
    expect(t).not.toMatch(/@/)
    expect(t).not.toContain('mala calidad') // el motivo de la devolución no sale
    expect(t).not.toContain('super@vb.mx')
  })
})
