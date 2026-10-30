import { describe, expect, it } from 'vitest'
import { fechaLarga, montoEnLetra, textoDeConstancia } from '@/lib/contabilidad-constancia'

describe('monto en letra (formato de recibo mexicano)', () => {
  const casos: Array<[number, string]> = [
    [0, 'CERO PESOS 00/100 M.N.'],
    [100, 'UN PESO 00/100 M.N.'],
    [200, 'DOS PESOS 00/100 M.N.'],
    [1_500_00, 'MIL QUINIENTOS PESOS 00/100 M.N.'],
    [100_00, 'CIEN PESOS 00/100 M.N.'],
    [101_00, 'CIENTO UN PESOS 00/100 M.N.'],
    [21_000_00, 'VEINTIÚN MIL PESOS 00/100 M.N.'],
    [40_000_00, 'CUARENTA MIL PESOS 00/100 M.N.'],
    [80_000_00, 'OCHENTA MIL PESOS 00/100 M.N.'],
    [15_00, 'QUINCE PESOS 00/100 M.N.'],
    [29_00, 'VEINTINUEVE PESOS 00/100 M.N.'],
    [35_50, 'TREINTA Y CINCO PESOS 50/100 M.N.'],
    [1_000_000_00, 'UN MILLÓN DE PESOS 00/100 M.N.'],
    [2_000_000_00, 'DOS MILLONES DE PESOS 00/100 M.N.'],
    [1_250_000_00, 'UN MILLÓN DOSCIENTOS CINCUENTA MIL PESOS 00/100 M.N.'],
    [123_456_78, 'CIENTO VEINTITRÉS MIL CUATROCIENTOS CINCUENTA Y SEIS PESOS 78/100 M.N.'],
    [3_100_000_00, 'TRES MILLONES CIEN MIL PESOS 00/100 M.N.'],
    [1_00 + 1, 'UN PESO 01/100 M.N.'],
  ]
  for (const [centavos, esperado] of casos) it(`${centavos} centavos → ${esperado}`, () => expect(montoEnLetra(centavos)).toBe(esperado))
})

describe('fecha larga', () => {
  it('26 de octubre de 2026', () => { expect(fechaLarga('2026-10-26')).toBe('26 de octubre de 2026'); expect(fechaLarga('2026-01-05')).toBe('5 de enero de 2026') })
  it('lo que no es una fecha se devuelve igual (no inventa)', () => { expect(fechaLarga('ayer')).toBe('ayer') })
})

describe('texto de la constancia', () => {
  const base = { folio: 'CP-2026-0001', fechaPago: '2026-10-26', colaborador: 'Agente de Prueba', montoCentavos: 40_000_00, referencia: null, descripcion: 'la renta de la Bodega San Juan Bosco, León', hayComprobante: false }
  it('en efectivo: dice quién entregó a quién, cuánto (con letra), cuándo y que fue en efectivo', () => {
    const t = textoDeConstancia({ ...base, metodo: 'efectivo' })
    expect(t.subtitulo).toBe('Folio CP-2026-0001')
    expect(t.parrafos[0]).toContain('VIVE BIEN hace constar que, con fecha 26 de octubre de 2026, entregó a Agente de Prueba')
    expect(t.parrafos[0]).toContain('$40,000.00')
    expect(t.parrafos[0]).toContain('Cuarenta mil pesos 00/100 m.n.')
    expect(t.parrafos[1]).toBe('El pago se realizó en efectivo.')
    expect(t.firmas).toEqual({ entrego: 'VIVE BIEN', recibio: 'Agente de Prueba' })
    expect(t.datos).toContainEqual(['Forma de pago', 'Efectivo'])
  })
  it('por transferencia: lleva la referencia y dice si el comprobante se anexa o está pendiente', () => {
    const con = textoDeConstancia({ ...base, metodo: 'transferencia', referencia: 'SPEI 998877', hayComprobante: true })
    expect(con.parrafos[1]).toBe('El pago se realizó por transferencia bancaria con referencia SPEI 998877. Se anexa el comprobante de la transferencia.')
    const sin = textoDeConstancia({ ...base, metodo: 'transferencia', referencia: null, hayComprobante: false })
    expect(sin.parrafos[1]).toContain('se anexará cuando se reciba')
    expect(sin.parrafos[1]).not.toContain('referencia')
  })
  it('no afirma nada legal ni fiscal que el sistema no sabe', () => {
    const todo = JSON.stringify(textoDeConstancia({ ...base, metodo: 'efectivo' })).toLowerCase()
    for (const prohibido of ['finiquito', 'liquidación', 'liquidacion', 'única contraprestación', 'rfc', 'razón social', 'factura', 'cfdi', 'iva']) expect(todo, prohibido).not.toContain(prohibido)
  })
})
