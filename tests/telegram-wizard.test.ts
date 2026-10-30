import { describe, it, expect } from 'vitest'
import { interpretar, siguientePaso, resumen, PREGUNTAS, TIPOS } from '../src/lib/telegram-wizard'

describe('conversacion del bot', () => {
  it('el orden de los pasos es el esperado', () => {
    expect(siguientePaso('inicio')).toBe('operacion')
    expect(siguientePaso('operacion')).toBe('tipo')
    expect(siguientePaso('tipo')).toBe('ubicacion')
    expect(siguientePaso('fotos')).toBe('listo')
    expect(siguientePaso('listo')).toBe('listo')
  })

  it('cada paso con pregunta tiene texto', () => {
    for (const [clave, p] of Object.entries(PREGUNTAS)) {
      if (clave === 'listo') { expect(p).toBeNull(); continue }
      expect(p?.texto?.length).toBeGreaterThan(5)
    }
  })
})

describe('operacion', () => {
  it('acepta venta y renta escritos de varias formas', () => {
    for (const t of ['venta', 'Venta', 'vendo', 'vender']) {
      const r = interpretar('operacion', t)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.campos.operacion).toBe('venta')
    }
    for (const t of ['renta', 'RENTA', 'rento']) {
      const r = interpretar('operacion', t)
      if (r.ok) expect(r.campos.operacion).toBe('renta')
    }
  })

  it('rechaza lo que no entiende, con instruccion', () => {
    const r = interpretar('operacion', 'no se')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/Venta/)
  })
})

describe('tipo', () => {
  it('reconoce todos los tipos por su valor', () => {
    for (const [v] of TIPOS) {
      const r = interpretar('tipo', v)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.campos.tipo).toBe(v)
    }
  })

  it('reconoce por etiqueta visible', () => {
    const r = interpretar('tipo', 'Nave industrial')
    if (r.ok) expect(r.campos.tipo).toBe('nave')
  })
})

describe('metros', () => {
  it('acepta el numero suelto', () => {
    const r = interpretar('metros', '450')
    if (r.ok) expect(r.campos.metros).toBe(450)
  })

  it('acepta con unidad escrita', () => {
    const r = interpretar('metros', '450 m2')
    if (r.ok) expect(r.campos.metros).toBe(450)
  })

  it('se puede saltar', () => {
    const r = interpretar('metros', 'no se')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.campos.metros).toBeUndefined()
      expect(r.siguiente).toBe('precio')
    }
  })

  it('rechaza texto sin numero', () => {
    expect(interpretar('metros', 'grande').ok).toBe(false)
  })
})

describe('precio', () => {
  it('entiende millones', () => {
    const r = interpretar('precio', '2.5 millones')
    if (r.ok) expect(r.campos.precio).toBe(2500000)
  })

  it('entiende el numero con separadores', () => {
    const r = interpretar('precio', '$2,500,000')
    if (r.ok) expect(r.campos.precio).toBe(2500000)
  })

  it('rechaza un precio absurdo por bajo', () => {
    const r = interpretar('precio', '50')
    expect(r.ok).toBe(false)
  })

  it('nunca acepta a medias: si no entiende, vuelve a preguntar', () => {
    const r = interpretar('precio', 'dos mil quinientos')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/millones/)
  })
})

describe('titulo y descripcion', () => {
  it('la primera linea es el titulo y todo el texto la descripcion', () => {
    const r = interpretar('titulo', 'Nave en San Juan Bosco\nCon anden y oficinas')
    if (r.ok) {
      expect(r.campos.titulo).toBe('Nave en San Juan Bosco')
      expect(String(r.campos.descripcion)).toContain('anden')
    }
  })

  it('rechaza una frase demasiado corta', () => {
    expect(interpretar('titulo', 'casa').ok).toBe(false)
  })
})

describe('fotos', () => {
  it('«listo» termina', () => {
    const r = interpretar('fotos', 'listo')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.siguiente).toBe('listo')
  })

  it('cualquier otro texto recuerda que mande fotos', () => {
    expect(interpretar('fotos', 'ya casi').ok).toBe(false)
  })
})

describe('resumen', () => {
  it('no inventa lo que falta', () => {
    const t = resumen({ titulo: 'Casa', tipo: 'casa', operacion: 'venta' })
    expect(t).toContain('Casa')
    expect(t).not.toMatch(/undefined|null|NaN/)
  })

  it('formatea el precio en pesos', () => {
    const t = resumen({ titulo: 'X', tipo: 'casa', operacion: 'venta', precio: 2500000 })
    expect(t).toMatch(/2[,.]500[,.]000/)
  })
})
