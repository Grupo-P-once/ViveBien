import { describe, expect, it } from 'vitest'
import { calcularComision, centesimasDeMeses, LIMITES, porcentajeDePuntosBase, puntosBaseDePorcentaje } from '@/lib/comision-calculo'

/** Ajustes por operación (25-oct-2026): el porcentaje, los meses de renta, el reparto y los gastos se pueden modificar; la regla es el punto de partida. */
const VERIFICADO = { participa: true, acreditacion: 'verificado' as const, atribuible: true }
const venta = (extra: Partial<Parameters<typeof calcularComision>[0]> = {}) => calcularComision({ operacion: 'venta', baseCentavos: 300_000_000, ...extra })

describe('ajustes · sin ajustes todo queda como antes', () => {
  it('3.5 % de 3 millones, sin colaborador, sin gastos, no ajustada', () => {
    const r = venta()
    expect(r.ok && r.totalCentavos).toBe(10_500_000)
    if (r.ok) { expect(r.ajustada).toBe(false); expect(r.comisionPuntosBase).toBe(350); expect(r.gastosCentavos).toBe(0); expect(r.netoViveBienCentavos).toBe(r.viveBienCentavos); expect(r.colaboradorPuntosBase).toBeNull() }
  })
})

describe('ajustes · porcentaje de venta', () => {
  it('4 % y 3.25 % se calculan sobre el precio y se marcan como ajustadas', () => {
    const a = venta({ ajustes: { ventaPuntosBase: 400 } })
    const b = venta({ ajustes: { ventaPuntosBase: 325 } })
    expect(a.ok && a.totalCentavos).toBe(12_000_000)
    expect(b.ok && b.totalCentavos).toBe(9_750_000)
    expect(a.ok && a.ajustada).toBe(true)
  })
  it('escribir el mismo 3.5 % de la regla NO cuenta como ajuste', () => {
    const r = venta({ ajustes: { ventaPuntosBase: 350 } })
    expect(r.ok && r.ajustada).toBe(false)
  })
  it('fuera de 0.5 %–15 % se rechaza', () => {
    for (const bp of [0, 49, 1501, -5, 3.5]) expect(venta({ ajustes: { ventaPuntosBase: bp } }).ok).toBe(false)
  })
})

describe('ajustes · renta', () => {
  const renta = (mesesCent?: number) => calcularComision({ operacion: 'renta', baseCentavos: 2_000_000, ajustes: mesesCent === undefined ? undefined : { rentaMesesCent: mesesCent } })
  it('un mes por defecto; medio mes y mes y medio se calculan exactos', () => {
    expect((renta() as { totalCentavos: number }).totalCentavos).toBe(2_000_000)
    expect((renta(50) as { totalCentavos: number }).totalCentavos).toBe(1_000_000)
    expect((renta(150) as { totalCentavos: number }).totalCentavos).toBe(3_000_000)
  })
  it('fuera de 0.25–3 meses se rechaza', () => { for (const m of [0, 24, 301]) expect(renta(m).ok).toBe(false) })
  it('el porcentaje de venta no afecta una renta', () => {
    const r = calcularComision({ operacion: 'renta', baseCentavos: 2_000_000, ajustes: { ventaPuntosBase: 1000 } })
    expect(r.ok && r.totalCentavos).toBe(2_000_000)
    expect(r.ok && r.ajustada).toBe(false)
  })
})

describe('ajustes · comisión compartida', () => {
  it('60/40: el colaborador recibe el 60 % si está verificado y es atribuible', () => {
    const r = venta({ colaborador: VERIFICADO, ajustes: { colaboradorPuntosBase: 6000 } })
    expect(r.ok && r.colaboradorCentavos).toBe(6_300_000)
    expect(r.ok && r.viveBienCentavos).toBe(4_200_000)
    expect(r.ok && r.ajustada).toBe(true)
  })
  it('0 %: el colaborador participa pero no recibe nada', () => {
    const r = venta({ colaborador: VERIFICADO, ajustes: { colaboradorPuntosBase: 0 } })
    expect(r.ok && r.colaboradorCentavos).toBe(0)
    expect(r.ok && r.viveBienCentavos).toBe(10_500_000)
  })
  it('la parte nunca supera el total y siempre suma exacta (centavo impar para VIVE BIEN)', () => {
    for (const bp of [0, 1, 3333, 5000, 6667, 9999, 10000]) {
      const r = calcularComision({ operacion: 'venta', baseCentavos: 123_456_789, colaborador: VERIFICADO, ajustes: { colaboradorPuntosBase: bp } })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.viveBienCentavos + r.colaboradorCentavos + r.colaboradorRetenidoCentavos).toBe(r.totalCentavos)
    }
  })
  it('sin acreditación verificada la parte pactada queda RETENIDA, no liberada', () => {
    const r = venta({ colaborador: { participa: true, acreditacion: 'pendiente', atribuible: true }, ajustes: { colaboradorPuntosBase: 4000 } })
    expect(r.ok && r.colaboradorCentavos).toBe(0)
    expect(r.ok && r.colaboradorRetenidoCentavos).toBe(4_200_000)
    expect(r.ok && r.retencion).toBe('acreditacion_no_verificada')
  })
  it('un reparto fuera de 0–100 % se rechaza; sin colaborador el reparto ajustado no cuenta', () => {
    expect(venta({ colaborador: VERIFICADO, ajustes: { colaboradorPuntosBase: 10001 } }).ok).toBe(false)
    const r = venta({ ajustes: { colaboradorPuntosBase: 7000 } })
    expect(r.ok && r.ajustada).toBe(false)
    expect(r.ok && r.colaboradorPuntosBase).toBeNull()
  })
})

describe('ajustes · gastos y neto', () => {
  it('los gastos salen de la parte de VIVE BIEN y el neto es lo que queda', () => {
    const r = venta({ colaborador: VERIFICADO, ajustes: { gastos: [{ concepto: 'Fotografía', montoCentavos: 150_000 }, { concepto: 'Publicidad', montoCentavos: 250_000 }] } })
    expect(r.ok && r.gastosCentavos).toBe(400_000)
    expect(r.ok && r.viveBienCentavos).toBe(5_250_000)
    expect(r.ok && r.netoViveBienCentavos).toBe(4_850_000)
    expect(r.ok && r.colaboradorCentavos).toBe(5_250_000)
  })
  it('gastos mayores que la parte de VIVE BIEN, demasiados, sin concepto, con teléfono o con monto inválido: se rechazan', () => {
    expect(venta({ ajustes: { gastos: [{ concepto: 'Todo', montoCentavos: 10_500_001 }] } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: Array.from({ length: LIMITES.gastosMax + 1 }, () => ({ concepto: 'x', montoCentavos: 100 })) } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: [{ concepto: '  ', montoCentavos: 100 }] } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: [{ concepto: 'Pago a 4771234567', montoCentavos: 100 }] } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: [{ concepto: 'yo@correo.mx', montoCentavos: 100 }] } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: [{ concepto: 'Foto', montoCentavos: 0 }] } }).ok).toBe(false)
    expect(venta({ ajustes: { gastos: [{ concepto: 'Foto', montoCentavos: 1.5 }] } }).ok).toBe(false)
  })
})

describe('ajustes · lectura de lo que escribe una persona', () => {
  it('porcentaje: acepta 3.5, 3,5, «3.50 %» y rechaza lo demás', () => {
    expect(puntosBaseDePorcentaje('3.5')).toBe(350)
    expect(puntosBaseDePorcentaje('3,5')).toBe(350)
    expect(puntosBaseDePorcentaje('3.50 %')).toBe(350)
    expect(puntosBaseDePorcentaje(4)).toBe(400)
    for (const malo of ['', 'abc', '3.555', '-1', '1e2', null, undefined]) expect(puntosBaseDePorcentaje(malo)).toBeNull()
  })
  it('meses y ida y vuelta', () => {
    expect(centesimasDeMeses('1.5')).toBe(150)
    expect(centesimasDeMeses('0.25')).toBe(25)
    expect(porcentajeDePuntosBase(350)).toBe('3.5')
    expect(porcentajeDePuntosBase(5000)).toBe('50')
  })
})
