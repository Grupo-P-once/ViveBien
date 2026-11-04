import { describe, expect, it } from 'vitest'
import { calcularDesdeEntrada, cuerpoDeAjustes, descripcionDeComision, entradaInicial, leerGastos, type ContextoDeCalculo, type EntradaCalculadora } from '@/lib/comision-formulario'

const CTX: ContextoDeCalculo = { participaEnOrigen: false, acreditacion: 'sin_folio', atribuible: false }
const CTX_AGENTE: ContextoDeCalculo = { participaEnOrigen: true, acreditacion: 'verificado', atribuible: true }
const e = (cambios: Partial<EntradaCalculadora> = {}): EntradaCalculadora => ({ ...entradaInicial('venta', '3000000', false), ...cambios })
const pesos = (c: number) => `$${c / 100}`

describe('calculadora de cierres · lectura de lo escrito', () => {
  it('sin precio todavía no es un error: está incompleta', () => {
    const r = calcularDesdeEntrada(e({ base: '' }), CTX)
    expect(r).toMatchObject({ calculo: null, error: null, incompleto: true, listo: false })
  })
  it('la regla por defecto: 3.5 % de 3 millones = $105,000, no ajustada, no pide motivo', () => {
    const r = calcularDesdeEntrada(e(), CTX)
    expect(r.calculo?.totalCentavos).toBe(10_500_000)
    expect(r).toMatchObject({ separaDeLaRegla: false, motivoValido: true, listo: true })
  })
  it('cambiar el porcentaje recalcula y pide motivo hasta que se escribe', () => {
    expect(calcularDesdeEntrada(e({ pct: '4' }), CTX)).toMatchObject({ separaDeLaRegla: true, motivoValido: false, listo: false })
    const ok = calcularDesdeEntrada(e({ pct: '4', motivo: 'Se negoció 4 % con el propietario' }), CTX)
    expect(ok.calculo?.totalCentavos).toBe(12_000_000)
    expect(ok.listo).toBe(true)
  })
  it('acepta coma decimal y un motivo de solo espacios no vale', () => {
    expect(calcularDesdeEntrada(e({ pct: '3,25', motivo: '          ' }), CTX)).toMatchObject({ separaDeLaRegla: true, motivoValido: false })
  })
  it('renta: meses editables', () => {
    const r = calcularDesdeEntrada(e({ tipo: 'renta', base: '28000', meses: '1.5', motivo: 'Contrato a dos años: mes y medio' }), CTX)
    expect(r.calculo?.totalCentavos).toBe(4_200_000)
    expect(descripcionDeComision(r.calculo!, pesos)).toBe('1.5 meses de renta ($28000 al mes)')
  })
  it('errores claros para lo ilegible', () => {
    expect(calcularDesdeEntrada(e({ base: 'mucho' }), CTX).error).toMatch(/pesos/)
    expect(calcularDesdeEntrada(e({ pct: 'x' }), CTX).error).toMatch(/porcentaje/)
    expect(calcularDesdeEntrada(e({ pct: '40' }), CTX).error).toMatch(/entre 3 % y 4 %/)
    expect(calcularDesdeEntrada(e({ tipo: 'renta', meses: '5' }), CTX).error).toMatch(/meses/)
  })
})

describe('calculadora de cierres · comisión compartida y gastos', () => {
  it('con agente verificado y atribuible, 50/50 sin pedir motivo si el origen ya decía que hay agente', () => {
    const r = calcularDesdeEntrada(e({ comparte: true }), CTX_AGENTE)
    expect(r.calculo?.colaboradorCentavos).toBe(5_250_000)
    expect(r.calculo?.viveBienCentavos).toBe(5_250_000)
    expect(r).toMatchObject({ separaDeLaRegla: false, listo: true })
  })
  it('60/40 pide motivo; sin acreditación verificada la parte queda retenida', () => {
    const sinMotivo = calcularDesdeEntrada(e({ comparte: true, colPct: '60' }), CTX_AGENTE)
    expect(sinMotivo.listo).toBe(false)
    const r = calcularDesdeEntrada(e({ comparte: true, colPct: '40', motivo: 'El agente trajo al comprador' }), { ...CTX_AGENTE, acreditacion: 'pendiente' })
    expect(r.calculo?.colaboradorCentavos).toBe(0)
    expect(r.calculo?.colaboradorRetenidoCentavos).toBe(4_200_000)
  })
  it('decir que SÍ se comparte cuando el origen no lo dice (o que NO cuando sí) es separarse de la regla', () => {
    expect(calcularDesdeEntrada(e({ comparte: true }), CTX).separaDeLaRegla).toBe(true)
    expect(calcularDesdeEntrada(e({ comparte: false }), CTX_AGENTE).separaDeLaRegla).toBe(true)
  })
  it('los gastos salen de la parte de VIVE BIEN y dejan el neto; filas vacías se ignoran', () => {
    const r = calcularDesdeEntrada(e({ gastos: [{ id: 'a', concepto: 'Fotografía', monto: '1,500' }, { id: 'b', concepto: '', monto: '' }, { id: 'c', concepto: 'Publicidad', monto: '2500.50' }] }), CTX)
    expect(r.calculo?.gastosCentavos).toBe(400_050)
    expect(r.calculo?.netoViveBienCentavos).toBe(10_500_000 - 400_050)
  })
  it('un gasto a medias, ilegible o mayor que la parte de VIVE BIEN es un error', () => {
    expect(leerGastos([{ id: 'a', concepto: 'Foto', monto: '' }])).toMatchObject({ ok: false })
    expect(leerGastos([{ id: 'a', concepto: '', monto: '100' }])).toMatchObject({ ok: false })
    expect(leerGastos([{ id: 'a', concepto: 'Foto', monto: 'cien' }])).toMatchObject({ ok: false })
    expect(calcularDesdeEntrada(e({ gastos: [{ id: 'a', concepto: 'Todo', monto: '999999' }] }), CTX).error).toMatch(/mayores que la parte de VIVE BIEN/)
  })
})

describe('calculadora de cierres · lo que se manda al servidor', () => {
  it('solo términos del trato: nada de importes calculados', () => {
    const cuerpo = cuerpoDeAjustes(e({ comparte: true, colPct: '60', pct: '4', motivo: ' Se negoció ', gastos: [{ id: 'a', concepto: 'Foto', monto: '1500' }] }), true)
    expect(cuerpo).toEqual({ comision_pct: '4', comparte: true, colaborador_pct: '60', gastos: [{ concepto: 'Foto', monto_pesos: '1500.00' }], ajuste_motivo: 'Se negoció' })
    for (const prohibida of ['total', 'centavos', 'vivebien', 'neto']) expect(JSON.stringify(Object.keys(cuerpo))).not.toContain(prohibida)
  })
  it('una renta manda meses y no porcentaje; sin colaborador no manda reparto ni motivo si no hace falta', () => {
    expect(cuerpoDeAjustes(e({ tipo: 'renta', meses: '1' }), false)).toEqual({ renta_meses: '1', comparte: false, gastos: [] })
  })
})

describe('escala de lo habitual', () => {
  it('debajo, dentro (incluidos los extremos) y encima', async () => {
    const { posicionEnEscala, ESCALAS } = await import('@/lib/comision-formulario')
    expect(posicionEnEscala(2.5, ESCALAS.venta)).toBe('debajo')
    expect(posicionEnEscala(3, ESCALAS.venta)).toBe('habitual')
    expect(posicionEnEscala(4, ESCALAS.venta)).toBe('habitual') // 3-nov-2026: el rango aprobado termina en 4 % (antes 5 %)
    expect(posicionEnEscala(4.01, ESCALAS.venta)).toBe('encima')
    expect(posicionEnEscala(0.5, ESCALAS.renta)).toBe('debajo')
    expect(posicionEnEscala(1.5, ESCALAS.renta)).toBe('habitual')
  })
})
