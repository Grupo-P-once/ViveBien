import { describe, expect, it } from 'vitest'
import { formatoMetros, pesosPorM2, precioPorM2, redondear2 } from '../src/lib/medidas'
import { sanearContenido } from '../src/lib/sanear-propiedad'

describe('precio por m² con 2 decimales', () => {
  it('no redondea a entero: 5,000,000 entre 140 m² es $35,714.29', () => {
    expect(precioPorM2(5_000_000, 140)).toBe(35714.29)
    expect(pesosPorM2(35714.29)).toBe('$35,714.29')
  })
  it('cuadra con el total (a centavos de redondeo)', () => {
    const ppm = precioPorM2(3_250_000, 187.5)!
    expect(Math.abs(ppm * 187.5 - 3_250_000)).toBeLessThan(0.01 * 187.5)
  })
  it('sin precio o sin superficie no inventa un número', () => {
    expect(precioPorM2(0, 100)).toBeNull()
    expect(precioPorM2(1000, 0)).toBeNull()
    expect(precioPorM2(null, 100)).toBeNull()
    expect(precioPorM2(1000, undefined)).toBeNull()
  })
  it('la superficie se muestra con hasta 2 decimales, sin ceros de relleno', () => {
    expect(formatoMetros(140.5)).toBe('140.5')
    expect(formatoMetros(1244)).toBe('1,244')
    expect(redondear2(140.456)).toBe(140.46)
  })
})

describe('el servidor acepta la superficie con 2 decimales', () => {
  it('conserva 140.45 y redondea 140.456', () => {
    const a = sanearContenido({ metros: 140.45 }, { moderador: true }) as { datos?: Record<string, unknown> }
    expect(a.datos?.metros).toBe(140.45)
    const b = sanearContenido({ metros: '140.456' }, { moderador: true }) as { datos?: Record<string, unknown> }
    expect(b.datos?.metros).toBe(140.46)
  })
})
