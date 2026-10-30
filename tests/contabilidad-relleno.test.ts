import { describe, expect, it } from 'vitest'
import { extraerJson, fechaValida, interpretarRelleno, montoDeTexto, resumenDeRelleno, sistemaDeRelleno, type ContextoDeRelleno } from '@/lib/contabilidad-relleno'

const ctx: ContextoDeRelleno = {
  hoy: '2026-10-26',
  cuentas: [{ id: 'c1', nombre: 'Meta Ads', identificador: '33839', categoria: 'publicidad_digital' }],
  propiedades: [{ id: 'p1', etiqueta: 'Nave Mandujano · VB-12' }],
}

describe('autollenado: lo que dice el modelo se valida contra lo que existe', () => {
  it('extrae el JSON aunque venga envuelto en Markdown o con una frase antes', () => {
    expect(extraerJson('Claro:\n```json\n{"tipo":"cuenta","nombre":"Lonas"}\n```')).toEqual({ tipo: 'cuenta', nombre: 'Lonas' })
    expect(extraerJson('sin json')).toBeNull()
    expect(extraerJson('{roto')).toBeNull()
  })

  it('un gasto completo: monto, fecha, cuenta (hereda su categoría) y propiedad', () => {
    const r = interpretarRelleno({ tipo: 'movimiento', clase: 'gasto', monto: '$1,500.50', fecha: '2026-10-25', concepto: 'Lonas', cuenta_id: 'c1', propiedad_id: 'p1' }, ctx)
    expect(r).toEqual({ tipo: 'movimiento', campos: { clase: 'gasto', monto: '1500.50', fecha: '2026-10-25', concepto: 'Lonas', cuenta_id: 'c1', categoria: 'publicidad_digital', propiedad_id: 'p1' } })
    expect(resumenDeRelleno(r!, ctx)).toContain('Meta Ads')
  })

  it('descarta ids inventados, categorías que no existen, fechas futuras o imposibles y montos no positivos', () => {
    const r = interpretarRelleno({ tipo: 'movimiento', clase: 'gasto', monto: -5, fecha: '2026-12-01', concepto: 'Algo', categoria: 'inventada', cuenta_id: 'zzz', propiedad_id: 'qqq' }, ctx)
    expect(r).toEqual({ tipo: 'movimiento', campos: { clase: 'gasto', concepto: 'Algo' } })
    expect(fechaValida('2026-02-30', ctx.hoy)).toBeUndefined()
    expect(fechaValida('2026-10-26', ctx.hoy)).toBe('2026-10-26')
    expect(montoDeTexto('12,345.6')).toBe('12345.6')
    expect(montoDeTexto('0')).toBeUndefined()
    expect(montoDeTexto('1e9')).toBeUndefined()
  })

  it('quita correos y teléfonos del concepto', () => {
    const r = interpretarRelleno({ tipo: 'movimiento', clase: 'gasto', concepto: 'Pago a ana@correo.com tel 477 123 4567 por lonas' }, ctx)
    expect(r && r.tipo === 'movimiento' && r.campos.concepto).toBe('Pago a tel por lonas')
  })

  it('un ingreso extra no lleva categoría ni cuenta', () => {
    const r = interpretarRelleno({ tipo: 'movimiento', clase: 'ingreso_extra', monto: 800, concepto: 'Reembolso', categoria: 'otro', cuenta_id: 'c1' }, ctx)
    expect(r).toEqual({ tipo: 'movimiento', campos: { clase: 'ingreso_extra', monto: '800', concepto: 'Reembolso' } })
  })

  it('una cuenta nueva', () => {
    expect(interpretarRelleno({ tipo: 'cuenta', nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa' }, ctx)).toEqual({ tipo: 'cuenta', campos: { nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa' } })
  })

  it('sin nada utilizable devuelve null (la ruta responde «no pude sacar datos»)', () => {
    expect(interpretarRelleno({ tipo: 'ninguno' }, ctx)).toBeNull()
    expect(interpretarRelleno({ tipo: 'movimiento' }, ctx)).toBeNull()
    expect(interpretarRelleno('texto', ctx)).toBeNull()
    expect(interpretarRelleno([], ctx)).toBeNull()
  })

  it('el sistema pide solo JSON, trae la fecha de hoy y no lleva cifras del negocio', () => {
    const s = sistemaDeRelleno(ctx)
    expect(s).toContain('ÚNICAMENTE con un objeto JSON')
    expect(s).toContain('2026-10-26')
    expect(s).not.toMatch(/comisi[óo]n neta|utilidad/i)
  })
})
