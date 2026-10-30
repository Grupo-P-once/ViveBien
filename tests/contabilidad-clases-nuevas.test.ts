import { describe, expect, it } from 'vitest'
import { prepararMovimiento } from '@/lib/contabilidad-servidor'

/** Validación del servidor para las dos clases nuevas (migración 53): la aportación a una empresa del grupo y el pago al colaborador. */
const base = { monto_pesos: '40000', fecha: '2026-10-26', concepto: 'Aportación de capital a ANDAX', clave_idempotencia: 'mov-clases-nuevas-001' }
const OP = '4c68eb9b-7cba-4590-a629-1d6e45c520ce'

describe('prepararMovimiento: aportación a una empresa del grupo', () => {
  it('no pide categoría: queda la fija, aunque el navegador mande otra', () => {
    const r = prepararMovimiento({ ...base, clase: 'aportacion_grupo', categoria: 'oficina' }, 'super@vb.mx')
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.datos).toMatchObject({ clase: 'aportacion_grupo', monto_centavos: 4_000_000, categoria: 'aportacion_grupo' })
  })
  it('sigue exigiendo monto, fecha real y un concepto sin datos personales', () => {
    expect(prepararMovimiento({ ...base, clase: 'aportacion_grupo', monto_pesos: '0' }, 'x@vb.mx')).toMatchObject({ ok: false })
    expect(prepararMovimiento({ ...base, clase: 'aportacion_grupo', fecha: '2999-01-01' }, 'x@vb.mx')).toMatchObject({ ok: false })
    expect(prepararMovimiento({ ...base, clase: 'aportacion_grupo', concepto: 'Aportación a ana@correo.mx' }, 'x@vb.mx')).toMatchObject({ ok: false })
  })
  it('un gasto no puede usar la categoría reservada de la aportación ni del pago', () => {
    // la base de datos lo vuelve a rechazar; aquí la categoría del gasto debe ser una de las conocidas
    expect(prepararMovimiento({ ...base, clase: 'gasto', categoria: 'aportacion_grupo' }, 'x@vb.mx')).toMatchObject({ ok: false })
    expect(prepararMovimiento({ ...base, clase: 'gasto', categoria: 'pago_colaborador' }, 'x@vb.mx')).toMatchObject({ ok: false })
  })
})

describe('prepararMovimiento: pago al colaborador', () => {
  it('exige la operación a la que corresponde', () => {
    expect(prepararMovimiento({ ...base, clase: 'pago_colaborador', concepto: 'Pago en efectivo al colaborador' }, 'x@vb.mx')).toMatchObject({ ok: false, error: expect.stringMatching(/operación/i) })
    expect(prepararMovimiento({ ...base, clase: 'pago_colaborador', concepto: 'Pago en efectivo al colaborador', operacion_id: 'no-es-uuid' }, 'x@vb.mx')).toMatchObject({ ok: false })
  })
  it('con operación válida queda con su categoría fija y su operación', () => {
    const r = prepararMovimiento({ ...base, clase: 'pago_colaborador', concepto: 'Pago en efectivo al colaborador', operacion_id: OP, categoria: 'oficina' }, 'super@vb.mx')
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.datos).toMatchObject({ clase: 'pago_colaborador', categoria: 'pago_colaborador', operacion_id: OP, monto_centavos: 4_000_000 })
  })
  it('una clase desconocida se rechaza', () => {
    expect(prepararMovimiento({ ...base, clase: 'retiro_de_socios' }, 'x@vb.mx')).toMatchObject({ ok: false })
  })
})
