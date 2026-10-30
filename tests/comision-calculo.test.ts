import { describe, expect, it } from 'vitest'
import { calcularComision, centavosDePesos, pesosDeCentavos, REGLAS, REGLA_BORRADOR_2026_10_24 } from '../src/lib/comision-calculo'
import type { EstadoAcreditacion } from '../src/lib/comision-calculo'
import { estadoAcreditacion, puedeVerificar, sanearFolio } from '../src/lib/comision-acreditacion'

const verificado = { participa: true, acreditacion: 'verificado' as const, atribuible: true }

describe('regla versionada', () => {
  it('es un borrador y no decide el IVA', () => {
    expect(REGLA_BORRADOR_2026_10_24.estado).toBe('borrador')
    expect(REGLA_BORRADOR_2026_10_24.tratamientoIva).toBe('pendiente_contador')
    expect(REGLAS[REGLA_BORRADOR_2026_10_24.version]).toBe(REGLA_BORRADOR_2026_10_24)
    expect(Object.isFrozen(REGLA_BORRADOR_2026_10_24)).toBe(true)
  })
})

describe('venta: 3.5 % del precio final firmado', () => {
  it('sin colaborador, todo es de VIVE BIEN', () => {
    const r = calcularComision({ operacion: 'venta', baseCentavos: 500_000_000 })
    expect(r).toMatchObject({ ok: true, totalCentavos: 17_500_000, viveBienCentavos: 17_500_000, colaboradorCentavos: 0, colaboradorRetenidoCentavos: 0, retencion: 'sin_colaborador', antesDeImpuestos: true })
  })
  it('con colaborador verificado y atribuible: 50/50 de la comisión total (no es un 50 % adicional)', () => {
    const r = calcularComision({ operacion: 'venta', baseCentavos: 500_000_000, colaborador: verificado })
    expect(r).toMatchObject({ ok: true, totalCentavos: 17_500_000, viveBienCentavos: 8_750_000, colaboradorCentavos: 8_750_000, retencion: null })
  })
  it('el reparto suma exactamente el total, también con centavos impares (el sobrante queda en VIVE BIEN)', () => {
    const r = calcularComision({ operacion: 'venta', baseCentavos: 300, colaborador: verificado })
    expect(r).toMatchObject({ ok: true, totalCentavos: 11, colaboradorCentavos: 5, viveBienCentavos: 6 })
    if (r.ok) expect(r.viveBienCentavos + r.colaboradorCentavos + r.colaboradorRetenidoCentavos).toBe(r.totalCentavos)
  })
  it('suma siempre el total en muchos precios', () => {
    for (let base = 1; base < 5000; base += 7) {
      const r = calcularComision({ operacion: 'venta', baseCentavos: base * 137, colaborador: verificado })
      if (r.ok) expect(r.viveBienCentavos + r.colaboradorCentavos + r.colaboradorRetenidoCentavos).toBe(r.totalCentavos)
    }
  })
})

describe('renta: un mes de renta base', () => {
  it('cobra un mes y lo reparte por mitad', () => {
    const r = calcularComision({ operacion: 'renta', baseCentavos: 2_800_000, colaborador: verificado })
    expect(r).toMatchObject({ ok: true, totalCentavos: 2_800_000, colaboradorCentavos: 1_400_000, viveBienCentavos: 1_400_000 })
  })
})

describe('el reparto al colaborador se retiene si no está todo comprobado', () => {
  const caso = (c: { acreditacion?: EstadoAcreditacion; atribuible?: boolean }) => calcularComision({ operacion: 'renta', baseCentavos: 2_800_000, colaborador: { ...verificado, ...c } })
  it.each(['sin_folio', 'pendiente', 'no_coincide', 'vencido'] as const)('acreditación %s retiene la parte', (acreditacion) => {
    expect(caso({ acreditacion })).toMatchObject({ ok: true, colaboradorCentavos: 0, colaboradorRetenidoCentavos: 1_400_000, viveBienCentavos: 1_400_000, retencion: 'acreditacion_no_verificada' })
  })
  it('una operación no atribuible a VIVE BIEN no libera', () => {
    expect(caso({ atribuible: false })).toMatchObject({ ok: true, colaboradorCentavos: 0, colaboradorRetenidoCentavos: 1_400_000, retencion: 'operacion_no_atribuible' })
  })
  it('el total que paga el cliente no cambia con o sin colaborador', () => {
    const sin = calcularComision({ operacion: 'renta', baseCentavos: 2_800_000 })
    const con = caso({})
    expect(sin.ok && con.ok && con.totalCentavos === sin.totalCentavos).toBe(true)
  })
})

describe('entradas inválidas', () => {
  it.each([0, -5, 1.5, NaN, Infinity, 5e11])('rechaza la base %s', (b) => {
    expect(calcularComision({ operacion: 'venta', baseCentavos: b }).ok).toBe(false)
  })
  it('rechaza una operación desconocida', () => {
    expect(calcularComision({ operacion: 'traspaso' as never, baseCentavos: 100 }).ok).toBe(false)
  })
  it('una comisión menor a un centavo no se acepta', () => {
    expect(calcularComision({ operacion: 'venta', baseCentavos: 1 }).ok).toBe(false)
  })
})

describe('pesos y centavos', () => {
  it('convierte sin errores de punto flotante', () => {
    expect(centavosDePesos('5,000,000')).toBe(500_000_000)
    expect(centavosDePesos('$28,000.50')).toBe(2_800_050)
    expect(centavosDePesos('0.1')).toBe(10)
    expect(centavosDePesos(19.99)).toBe(1999)
  })
  it.each(['', 'abc', '1e5', '10.999', '-3', '0', '1,2,3x'])('rechaza %j', (v) => expect(centavosDePesos(v)).toBeNull())
  it('formatea para mostrar', () => {
    expect(pesosDeCentavos(17_500_000)).toContain('175,000')
  })
})

describe('acreditación', () => {
  const hoy = '2026-10-24'
  const base = { folio: 'ABC-123', resultado: 'coincide' as const, vigenteHasta: '2027-01-10', verificadoPor: 'admin@x.mx' }
  it('sin folio nunca es verificado', () => {
    expect(estadoAcreditacion(null, hoy)).toBe('sin_folio')
    expect(estadoAcreditacion({ ...base, folio: '  ' }, hoy)).toBe('sin_folio')
    expect(estadoAcreditacion({ ...base, folio: null }, hoy)).toBe('sin_folio')
  })
  it('con folio y sin revisión está pendiente', () => {
    expect(estadoAcreditacion({ ...base, resultado: null, verificadoPor: null }, hoy)).toBe('pendiente')
    expect(estadoAcreditacion({ ...base, verificadoPor: null }, hoy)).toBe('pendiente')
  })
  it('verificado solo con coincidencia, revisor y vigencia', () => {
    expect(estadoAcreditacion(base, hoy)).toBe('verificado')
    expect(estadoAcreditacion({ ...base, vigenteHasta: null }, hoy)).toBe('pendiente')
    expect(estadoAcreditacion({ ...base, vigenteHasta: 'mañana' }, hoy)).toBe('pendiente')
    expect(estadoAcreditacion({ ...base, vigenteHasta: '2026-10-24' }, hoy)).toBe('verificado')
  })
  it('vencido y no coincide', () => {
    expect(estadoAcreditacion({ ...base, vigenteHasta: '2026-10-23' }, hoy)).toBe('vencido')
    expect(estadoAcreditacion({ ...base, resultado: 'no_coincide' }, hoy)).toBe('no_coincide')
  })
  it('si la fecha de hoy no es válida, nunca verifica', () => {
    expect(estadoAcreditacion(base, 'hoy')).toBe('pendiente')
  })
  it('solo el equipo verifica y nunca lo suyo', () => {
    expect(puedeVerificar({ actorUid: 'a', esEquipo: true, duenoUid: 'b', aportoUid: 'b' })).toBe(true)
    expect(puedeVerificar({ actorUid: 'a', esEquipo: false })).toBe(false)
    expect(puedeVerificar({ actorUid: null, esEquipo: true })).toBe(false)
    expect(puedeVerificar({ actorUid: 'a', esEquipo: true, duenoUid: 'a' })).toBe(false)
    expect(puedeVerificar({ actorUid: 'a', esEquipo: true, aportoUid: 'a' })).toBe(false)
  })
  it('el folio es opcional y se sanea', () => {
    expect(sanearFolio(undefined)).toEqual({ ok: true, folio: null })
    expect(sanearFolio('   ')).toEqual({ ok: true, folio: null })
    expect(sanearFolio(' GTO-123/45 ')).toEqual({ ok: true, folio: 'GTO-123/45' })
    expect(sanearFolio('a').ok).toBe(false)
    expect(sanearFolio('<script>').ok).toBe(false)
    expect(sanearFolio(42).ok).toBe(false)
  })
})
