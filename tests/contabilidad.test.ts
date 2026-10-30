import { describe, expect, it } from 'vitest'
import {
  celdaCsv, construirLineas, diarioACsv, filtrarDiario, gastosHormiga, normalizarConcepto, porCategoria, porCuenta, porPropiedad, recomendaciones, serieMensual, totales,
  type CuentaDeGasto, type MovimientoContable,
} from '@/lib/contabilidad'
import type { OperacionComision } from '@/lib/comision-resumen'

const HOY = '2026-10-25'
let c = 0
const op = (s: Partial<OperacionComision> = {}): OperacionComision => ({
  id: `op-${++c}`, propiedad_id: 'p1', tipo: 'venta', base_centavos: 300_000_000, total_centavos: 12_000_000, vivebien_centavos: 6_000_000, colaborador_centavos: 5_000_000, colaborador_retenido_centavos: 1_000_000,
  reparto_estado: 'liberable', estado: 'confirmada', creado_en: '2026-10-05T10:00:00Z', fecha_cierre: '2026-10-05', propiedad_folio: 'VB-2026-00006', propiedad_titulo: 'Nave Mandujano', gastos: [], ...s,
})
const mov = (s: Partial<MovimientoContable> = {}): MovimientoContable => ({
  id: `m-${++c}`, fecha: '2026-10-10', sentido: 'sale', clase: 'gasto', monto_centavos: 150_000, categoria: 'publicidad_impresa', cuenta_id: null, propiedad_id: null, operacion_id: null,
  concepto: 'Lonas El Juanito', referencia: null, reverso_de: null, motivo: null, creado_por: 'super@vb.mx', creado_en: '2026-10-10T10:00:00Z', ...s,
})
const CUENTAS: CuentaDeGasto[] = [
  { id: 'c-meta', nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', notas: null, activa: true, creado_en: '2026-01-05T00:00:00Z' },
  { id: 'c-lonas', nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa', identificador: null, notas: null, activa: true, creado_en: '2026-02-01T00:00:00Z' },
]

describe('construirLineas · el diario une operaciones y movimientos', () => {
  it('una operación cobrada deja tres líneas: entra la comisión, sale el colaborador (liberable + retenida) y salen sus gastos', () => {
    const l = construirLineas({ operaciones: [op({ gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }] })], movimientos: [] })
    expect(l.map((x) => [x.clase, x.sentido, x.monto, x.estado])).toEqual(expect.arrayContaining([
      ['comision', 'entra', 12_000_000, 'cobrado'], ['colaborador', 'sale', 6_000_000, 'comprometido'], ['gasto_operacion', 'sale', 400_000, 'registrado'],
    ]))
    expect(l).toHaveLength(3)
    expect(l.find((x) => x.clase === 'colaborador')?.concepto).toContain('retenida')
  })
  it('una operación por cobrar es «por cobrar»; sin colaborador ni gastos solo deja el ingreso', () => {
    const l = construirLineas({ operaciones: [op({ estado: 'registrada', colaborador_centavos: 0, colaborador_retenido_centavos: 0 })], movimientos: [] })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ clase: 'comision', estado: 'por_cobrar', vigente: true })
  })
  it('una operación anulada sale marcada y no cuenta', () => {
    const l = construirLineas({ operaciones: [op({ estado: 'anulada' })], movimientos: [] })
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ estado: 'anulado', vigente: false })
    expect(totales(l).entra).toBe(0)
  })
  it('un movimiento anulado y su contra-asiento se compensan: ninguno suma, los dos se ven', () => {
    const g = mov({ id: 'g1', monto_centavos: 50_000 })
    const a = mov({ id: 'a1', clase: 'anulacion', sentido: 'entra', monto_centavos: 50_000, reverso_de: 'g1', motivo: 'Se capturó dos veces' })
    const l = construirLineas({ operaciones: [], movimientos: [g, a] })
    expect(l).toHaveLength(2)
    expect(l.every((x) => !x.vigente && x.estado === 'anulado')).toBe(true)
    expect(totales(l)).toMatchObject({ entra: 0, sale: 0, neto: 0 })
  })
  it('tolera operaciones anteriores a la migración 47 (sin gastos) o con gastos mal formados', () => {
    const l = construirLineas({ operaciones: [op({ gastos: undefined }), op({ gastos: 'basura' as never }), op({ gastos: [{ concepto: 'x', monto_centavos: 'no' as never }] })], movimientos: [] })
    expect(l.filter((x) => x.clase === 'gasto_operacion')).toHaveLength(0)
  })
  it('ordena de la más reciente a la más antigua y etiqueta la propiedad de un gasto con la de sus operaciones', () => {
    const l = construirLineas({ operaciones: [op({ fecha_cierre: '2026-09-01' })], movimientos: [mov({ fecha: '2026-10-20', propiedad_id: 'p1' })] })
    expect(l[0].fecha).toBe('2026-10-20')
    expect(l[0].propiedadEtiqueta).toBe('Nave Mandujano')
  })
})

describe('totales y serie mensual', () => {
  const lineas = construirLineas({
    operaciones: [op({ gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }] }), op({ estado: 'registrada', total_centavos: 2_800_000, vivebien_centavos: 2_800_000, colaborador_centavos: 0, colaborador_retenido_centavos: 0, tipo: 'renta', fecha_cierre: '2026-09-10', propiedad_id: 'p2', propiedad_titulo: 'Bodega San Juan' })],
    movimientos: [mov({ id: 'g1', monto_centavos: 150_000 }), mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 50_000, reverso_de: 'g1', motivo: 'Lona de mala calidad' }), mov({ clase: 'ingreso_extra', sentido: 'entra', categoria: 'ingreso_extra', monto_centavos: 30_000, concepto: 'Reembolso' })],
  })
  it('separa lo cobrado de lo por cobrar y los gastos de sus devoluciones', () => {
    const t = totales(lineas)
    expect(t.comisionCobrada).toBe(12_000_000)
    expect(t.comisionPorCobrar).toBe(2_800_000)
    expect(t.colaboradores).toBe(6_000_000)
    expect(t.gastosDeOperacion).toBe(400_000)
    expect(t.gastosExternos).toBe(150_000)
    expect(t.devoluciones).toBe(50_000)
    expect(t.gastosExternosNetos).toBe(100_000)
    expect(t.ingresosExtra).toBe(30_000)
    expect(t.entra).toBe(12_000_000 + 2_800_000 + 50_000 + 30_000)
    expect(t.sale).toBe(6_000_000 + 400_000 + 150_000)
    expect(t.neto).toBe(t.entra - t.sale)
  })
  it('un rango de fechas filtra', () => {
    expect(totales(lineas, { desde: '2026-10-01', hasta: '2026-10-31' }).comisionPorCobrar).toBe(0)
    expect(totales(lineas, { desde: '2026-09-01', hasta: '2026-09-30' }).comisionPorCobrar).toBe(2_800_000)
  })
  it('la serie trae 12 meses, el último es el de hoy, y entra − sale = neto en cada mes', () => {
    const s = serieMensual(lineas, HOY)
    expect(s).toHaveLength(12)
    expect(s.at(-1)?.mes).toBe('2026-10')
    for (const p of s) expect(p.entra - p.sale).toBe(p.neto)
    expect(s.at(-1)?.gastos).toBe(400_000 + 150_000 - 50_000)
    expect(s.find((p) => p.mes === '2026-09')?.comisiones).toBe(2_800_000)
  })
})

describe('por categoría, por cuenta y por propiedad', () => {
  const lineas = construirLineas({
    operaciones: [op({ gastos: [{ concepto: 'Fotografía', monto_centavos: 300_000 }] })],
    movimientos: [
      mov({ id: 'g1', monto_centavos: 500_000, categoria: 'publicidad_digital', cuenta_id: 'c-meta', concepto: 'Meta Ads campaña' }),
      mov({ id: 'g2', monto_centavos: 200_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p1' }),
      mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 80_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p1', reverso_de: 'g2', motivo: 'Lona de mala calidad' }),
      mov({ id: 'g3', monto_centavos: 90_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p9', concepto: 'Lona sin cierre' }),
    ],
  })
  it('categorías de mayor a menor, netas de devoluciones, con parte y acumulado que cierra en 100 %', () => {
    const f = porCategoria(lineas)
    expect(f.map((x) => x.categoria)).toEqual(['publicidad_digital', 'gasto_operacion', 'publicidad_impresa'])
    expect(f[2]).toMatchObject({ bruto: 290_000, devuelto: 80_000, neto: 210_000 })
    expect(f.at(-1)?.acumulada).toBe(100)
    expect(f.reduce((s, x) => s + x.parte, 0)).toBeGreaterThan(99.5)
  })
  it('cuentas: gasto neto, número de cargos y última fecha; una cuenta sin movimientos sale con cero', () => {
    const f = porCuenta(lineas, [...CUENTAS, { ...CUENTAS[0], id: 'c-vacia', nombre: 'Sin uso' }])
    expect(f.find((x) => x.cuentaId === 'c-lonas')).toMatchObject({ bruto: 290_000, devuelto: 80_000, neto: 210_000, n: 2, ultimaFecha: '2026-10-10' })
    expect(f.find((x) => x.cuentaId === 'c-vacia')).toMatchObject({ neto: 0, n: 0, ultimaFecha: null })
    expect(f[0].cuentaId).toBe('c-meta')
  })
  it('propiedades: lo que deja = comisión − colaborador − gastos de operación − gastos ligados; sin comisión es «sin cierre»', () => {
    const f = porPropiedad(lineas)
    const p1 = f.find((x) => x.propiedadId === 'p1')!
    expect(p1).toMatchObject({ comision: 12_000_000, colaborador: 6_000_000, gastosDeOperacion: 300_000, gastosLigados: 120_000, neto: 12_000_000 - 6_000_000 - 300_000 - 120_000, situacion: 'deja' })
    expect(f.find((x) => x.propiedadId === 'p9')).toMatchObject({ comision: 0, gastosLigados: 90_000, situacion: 'sin_cierre' })
  })
  it('una propiedad cuyos gastos superan lo que deja «pierde»', () => {
    const l = construirLineas({ operaciones: [op({ total_centavos: 1_000_000, vivebien_centavos: 1_000_000, colaborador_centavos: 0, colaborador_retenido_centavos: 0 })], movimientos: [mov({ propiedad_id: 'p1', monto_centavos: 1_500_000 })] })
    expect(porPropiedad(l)[0]).toMatchObject({ situacion: 'pierde', neto: -500_000 })
  })
})

describe('gastos hormiga', () => {
  const g = (fecha: string, extra: Partial<MovimientoContable> = {}) => mov({ fecha, monto_centavos: 29_900, concepto: 'Suscripción de diseño', cuenta_id: null, ...extra })
  it('tres cargos pequeños en 90 días del mismo lugar son un gasto hormiga, con su proyección anual y cada cuántos días', () => {
    const l = construirLineas({ operaciones: [], movimientos: [g('2026-08-26'), g('2026-09-25'), g('2026-10-25')] })
    const h = gastosHormiga(l, HOY)
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ n: 3, total: 89_700, promedio: 29_900, ultimaFecha: '2026-10-25' })
    expect(h[0].cadaDias).toBe(30)
    expect(h[0].anualProyectado).toBe(Math.round((89_700 / 90) * 365))
  })
  it('agrupa por cuenta aunque el concepto cambie, y por concepto normalizado si no hay cuenta', () => {
    const porCuenta = gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-09-01', { cuenta_id: 'c-meta', concepto: 'A' }), g('2026-09-15', { cuenta_id: 'c-meta', concepto: 'B' }), g('2026-10-01', { cuenta_id: 'c-meta', concepto: 'C' })] }), HOY)
    expect(porCuenta).toHaveLength(1)
    const porTexto = gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-09-01', { concepto: 'Lonas Juanito #1' }), g('2026-09-15', { concepto: 'LONAS  juanito 2' }), g('2026-10-01', { concepto: 'Lónas Juanito' })] }), HOY)
    expect(porTexto).toHaveLength(1)
  })
  it('no es hormiga: menos de 3 cargos, cargos grandes, fuera de la ventana, anulados o de operación', () => {
    expect(gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-09-25'), g('2026-10-25')] }), HOY)).toEqual([])
    expect(gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-08-26', { monto_centavos: 200_000 }), g('2026-09-25', { monto_centavos: 200_000 }), g('2026-10-25', { monto_centavos: 200_000 })] }), HOY)).toEqual([])
    expect(gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-06-01'), g('2026-06-15'), g('2026-07-01')] }), HOY)).toEqual([])
    const a = g('2026-10-25', { id: 'x1' })
    const anul = mov({ id: 'x2', clase: 'anulacion', sentido: 'entra', monto_centavos: 29_900, reverso_de: 'x1', motivo: 'Cargo duplicado' })
    expect(gastosHormiga(construirLineas({ operaciones: [], movimientos: [g('2026-08-26'), g('2026-09-25'), a, anul] }), HOY)).toEqual([])
    expect(gastosHormiga(construirLineas({ operaciones: [op({ gastos: [1, 2, 3].map(() => ({ concepto: 'Foto', monto_centavos: 1000 })) })], movimientos: [] }), HOY)).toEqual([])
  })
  it('el umbral y el mínimo se pueden cambiar; ordena por lo que cuesta al año', () => {
    const l = construirLineas({ operaciones: [], movimientos: [g('2026-09-01', { concepto: 'Barato' }), g('2026-09-10', { concepto: 'Barato' }), g('2026-09-20', { concepto: 'Barato' }), g('2026-09-01', { concepto: 'Caro uno', monto_centavos: 120_000 }), g('2026-09-10', { concepto: 'Caro uno', monto_centavos: 120_000 }), g('2026-09-20', { concepto: 'Caro uno', monto_centavos: 120_000 })] })
    expect(gastosHormiga(l, HOY).map((h) => h.nombre)).toEqual(['Caro uno', 'Barato'])
    expect(gastosHormiga(l, HOY, { umbral: 50_000 }).map((h) => h.nombre)).toEqual(['Barato'])
    expect(gastosHormiga(l, HOY, { minimo: 4 })).toEqual([])
  })
  it('normalizar quita acentos, dígitos y signos', () => { expect(normalizarConcepto('  Lónas  El-Juanito #12 ')).toBe('lonas el juanito') })
})

describe('recomendaciones', () => {
  const f = (centavos: number) => `$${Math.round(centavos / 100)}`
  it('con poco movimiento no inventa nada', () => { expect(recomendaciones(construirLineas({ operaciones: [], movimientos: [] }), [], HOY, undefined, f)).toEqual([]) })
  it('avisa cuando los gastos se llevan mucho de la comisión y cuando una categoría concentra el gasto', () => {
    const l = construirLineas({ operaciones: [op({ total_centavos: 1_000_000, vivebien_centavos: 1_000_000, colaborador_centavos: 0, colaborador_retenido_centavos: 0 })], movimientos: [mov({ monto_centavos: 500_000, categoria: 'publicidad_digital' }), mov({ monto_centavos: 100_000, categoria: 'oficina', concepto: 'Papelería' })] })
    const r = recomendaciones(l, CUENTAS, HOY, undefined, f)
    expect(r.find((x) => x.id === 'gasto-vs-ingreso')?.titulo).toBe('Los gastos se llevan el 60 % de la comisión')
    expect(r.find((x) => x.id === 'concentracion')?.titulo).toContain('Publicidad digital')
  })
  it('hormiga, propiedades sin cierre, devoluciones repetidas, comisión vieja por cobrar y cuentas dormidas', () => {
    const l = construirLineas({
      operaciones: [op({ estado: 'registrada', fecha_cierre: '2026-08-01', propiedad_id: 'pX', propiedad_titulo: 'Casa vieja', colaborador_centavos: 0, colaborador_retenido_centavos: 0 })],
      movimientos: [
        mov({ fecha: '2026-08-26', monto_centavos: 29_900, concepto: 'Suscripción', cuenta_id: null }), mov({ fecha: '2026-09-25', monto_centavos: 29_900, concepto: 'Suscripción' }), mov({ fecha: '2026-10-25', monto_centavos: 29_900, concepto: 'Suscripción' }),
        mov({ id: 'gx', monto_centavos: 80_000, propiedad_id: 'p77', cuenta_id: 'c-lonas', concepto: 'Lona terreno' }),
        mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 10_000, cuenta_id: 'c-lonas', reverso_de: 'gx', motivo: 'Lona rota al instalar' }),
        mov({ id: 'd2', clase: 'devolucion', sentido: 'entra', monto_centavos: 10_000, cuenta_id: 'c-lonas', reverso_de: 'gx', motivo: 'Segunda lona rota' }),
      ],
    })
    const ids = recomendaciones(l, CUENTAS, HOY, undefined, f).map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['hormiga', 'sin-cierre', 'devoluciones-c-lonas', 'por-cobrar', 'cuentas-dormidas']))
    expect(recomendaciones(l, CUENTAS, HOY, undefined, f).find((x) => x.id === 'cuentas-dormidas')?.titulo).toBe('1 cuenta de gasto activa sin movimientos en 90 días')
  })
})

describe('diario: filtros y CSV', () => {
  const lineas = construirLineas({ operaciones: [op()], movimientos: [mov({ concepto: 'Lonas El Juanito', cuenta_id: 'c-lonas', referencia: 'F-118' }), mov({ concepto: 'Meta Ads', categoria: 'publicidad_digital', cuenta_id: 'c-meta', fecha: '2026-09-01' })] })
  it('filtra por tipo, categoría, cuenta, fechas y texto (sin acentos ni mayúsculas; también por referencia)', () => {
    expect(filtrarDiario(lineas, { sentido: 'entra' }).every((l) => l.sentido === 'entra')).toBe(true)
    expect(filtrarDiario(lineas, { cuentaId: 'c-meta' })).toHaveLength(1)
    expect(filtrarDiario(lineas, { categoria: 'publicidad_digital' })).toHaveLength(1)
    expect(filtrarDiario(lineas, { desde: '2026-10-01' }).some((l) => l.fecha < '2026-10-01')).toBe(false)
    expect(filtrarDiario(lineas, { texto: 'LÓNAS' })).toHaveLength(1)
    expect(filtrarDiario(lineas, { texto: 'f-118' })).toHaveLength(1)
    expect(filtrarDiario(lineas, { texto: 'nada' })).toEqual([])
  })
  it('las anuladas se pueden ocultar', () => {
    const l = construirLineas({ operaciones: [op({ estado: 'anulada' })], movimientos: [] })
    expect(filtrarDiario(l, {})).toHaveLength(1)
    expect(filtrarDiario(l, { incluirAnuladas: false })).toHaveLength(0)
  })
  it('CSV: encabezado, entra en positivo y sale en negativo, comillas escapadas y fórmulas neutralizadas', () => {
    const l = construirLineas({ operaciones: [], movimientos: [mov({ concepto: '=HYPERLINK("http://x")', monto_centavos: 12_345 }), mov({ concepto: 'Con "comillas", y coma', clase: 'ingreso_extra', sentido: 'entra', categoria: 'ingreso_extra', monto_centavos: 500 })] })
    const csv = diarioACsv(l, CUENTAS)
    const filas = csv.split('\r\n')
    expect(filas[0]).toBe('Fecha,Entra/Sale,Tipo,Categoría,Concepto,Cuenta,Propiedad,Referencia,Estado,Cuenta en totales,Monto (MXN)')
    expect(filas.some((x) => x.includes("'=HYPERLINK") && x.endsWith(',-123.45'))).toBe(true) // el importe negativo es un número: sin apóstrofo, para que Excel lo sume
    expect(filas.some((x) => x.includes('"Con ""comillas"", y coma"') && x.endsWith('5.00'))).toBe(true)
  })
  it('celdaCsv neutraliza = + - @ al inicio, pero un importe negativo es un número y no se toca', () => { expect(celdaCsv('-1500.00')).toBe('-1500.00'); expect(celdaCsv(-5)).toBe('-5'); expect(celdaCsv('1500.00')).toBe('1500.00'); for (const v of ['=1+1', '+52', '-2+3', '-cmd|x', '--5', '@x', '\tx']) expect(celdaCsv(v).replace(/^"/, '').startsWith("'")).toBe(true); expect(celdaCsv('normal')).toBe('normal'); expect(celdaCsv(null)).toBe('') })
})

describe('correcciones posibles', () => {
  const g = mov({ id: 'g1', monto_centavos: 100_000 })
  const dv = mov({ id: 'd1', clase: 'devolucion', sentido: 'entra', monto_centavos: 30_000, reverso_de: 'g1', motivo: 'Lona de mala calidad' })
  it('un gasto se puede devolver (lo que queda) y anular; después de una devolución parcial queda menos', async () => {
    const { correccionesPosibles } = await import('@/lib/contabilidad')
    const solo = construirLineas({ operaciones: [], movimientos: [g] })
    expect(correccionesPosibles(solo[0], solo)).toEqual({ devolver: true, anular: true, restante: 100_000 })
    const con = construirLineas({ operaciones: [], movimientos: [g, dv] })
    expect(correccionesPosibles(con.find((l) => l.id === 'mov:g1')!, con)).toEqual({ devolver: true, anular: true, restante: 70_000 })
    expect(correccionesPosibles(con.find((l) => l.id === 'mov:d1')!, con)).toEqual({ devolver: false, anular: true, restante: 30_000 })
  })
  it('lo devuelto por completo, lo anulado y lo que viene de una operación no se corrigen aquí', async () => {
    const { correccionesPosibles } = await import('@/lib/contabilidad')
    const todo = construirLineas({ operaciones: [op()], movimientos: [g, { ...dv, monto_centavos: 100_000 }, mov({ id: 'a9', clase: 'anulacion', sentido: 'entra', monto_centavos: 5, reverso_de: 'x9', motivo: 'Se capturó mal' })] })
    expect(correccionesPosibles(todo.find((l) => l.id === 'mov:g1')!, todo)).toEqual({ devolver: false, anular: false, restante: 0 })
    expect(correccionesPosibles(todo.find((l) => l.id === 'mov:a9')!, todo).anular).toBe(false)
    expect(correccionesPosibles(todo.find((l) => l.origen === 'comision')!, todo).anular).toBe(false)
  })
})

describe('periodos, sugerencia de categoría y resumen para la IA', () => {
  it('los periodos arrancan en el día 1 del mes que toca', async () => {
    const { rangoDePeriodo } = await import('@/lib/contabilidad')
    expect(rangoDePeriodo('mes', '2026-10-25')).toEqual({ desde: '2026-10-01', hasta: '2026-10-25' })
    expect(rangoDePeriodo('tres_meses', '2026-10-25')).toEqual({ desde: '2026-08-01', hasta: '2026-10-25' })
    expect(rangoDePeriodo('doce_meses', '2026-10-25')).toEqual({ desde: '2025-11-01', hasta: '2026-10-25' })
    expect(rangoDePeriodo('todo', '2026-10-25')).toEqual({})
  })
  it('sugiere la categoría por el concepto (sin acentos ni mayúsculas) y se queda callada si no sabe', async () => {
    const { sugerirCategoria } = await import('@/lib/contabilidad')
    const casos: Array<[string, string | null]> = [
      ['Lonas El Juanito', 'publicidad_impresa'], ['Volantes para la colonia', 'publicidad_impresa'], ['Campaña de Meta Ads', 'publicidad_digital'], ['Sesión de FOTOGRAFÍA', 'fotografia_video'],
      ['Notaría y avalúo', 'gestoria_legal'], ['Suscripción Canva', 'software_suscripciones'], ['Gasolina a Silao', 'transporte'], ['Papelería', 'oficina'], ['Honorarios del diseñador', 'honorarios_externos'],
      ['xyz', null], ['', null], ['Compra varia', null],
    ]
    for (const [c, esperado] of casos) expect(sugerirCategoria(c), c).toBe(esperado)
  })
  it('el resumen para la IA son cifras en pesos enteros: sin correos, motivos ni el texto libre de los conceptos', async () => {
    const { resumenParaIA } = await import('@/lib/contabilidad')
    const lineas = construirLineas({
      operaciones: [op()],
      movimientos: [mov({ concepto: 'Pago al cliente Juan Pérez por su lona', cuenta_id: 'c-lonas', referencia: 'F-9', motivo: null }), mov({ id: 'd', clase: 'devolucion', sentido: 'entra', monto_centavos: 1000, reverso_de: 'x', motivo: 'Secreto del motivo largo' })],
    })
    const r = resumenParaIA(lineas, CUENTAS, HOY, {}, 'Todo')
    const texto = JSON.stringify(r)
    expect(r.totales_mxn.entra).toBe(120_000 + 10)
    expect(texto).not.toContain('Juan Pérez')
    expect(texto).not.toContain('Secreto')
    expect(texto).not.toMatch(/@/)
    expect(Object.keys(r)).toEqual(['periodo', 'hoy', 'totales_mxn', 'gasto_por_categoria', 'gasto_por_cuenta', 'gastos_hormiga', 'propiedades', 'alertas_calculadas'])
  })
})
