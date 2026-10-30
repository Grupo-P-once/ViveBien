import { describe, it, expect } from 'vitest'
import {
  validarPaso,
  esquemaCaracteristicas,
  MINIMO_DESCRIPCION,
  MINIMO_FOTOS,
  SUBTIPOS,
  TIPOS,
  ETIQUETA_TIPO,
} from '../src/lib/esquemas/propiedad'

const DESC = 'a'.repeat(MINIMO_DESCRIPCION)

describe('paso 1.a - operacion y tipo', () => {
  it('exige operacion y tipo', () => {
    const r = validarPaso('tipo', {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores.operacion).toBeTruthy()
      expect(r.errores.tipo).toBeTruthy()
    }
  })

  it('rechaza un tipo inventado', () => {
    expect(validarPaso('tipo', { operacion: 'venta', tipo: 'castillo' }).ok).toBe(false)
  })

  it('acepta lo minimo', () => {
    expect(validarPaso('tipo', { operacion: 'venta', tipo: 'casa' }).ok).toBe(true)
  })

  it('el subtipo es opcional', () => {
    expect(validarPaso('tipo', { operacion: 'renta', tipo: 'nave' }).ok).toBe(true)
  })
})

describe('vocabulario', () => {
  it('cada tipo tiene etiqueta en espaniol', () => {
    for (const t of TIPOS) expect(ETIQUETA_TIPO[t]).toBeTruthy()
  })

  it('cada tipo tiene entrada de subtipos, aunque sea vacia', () => {
    for (const t of TIPOS) expect(Array.isArray(SUBTIPOS[t])).toBe(true)
  })

  it('la lista es corta: no repetimos los 18 de Inmuebles24', () => {
    expect(TIPOS.length).toBeLessThanOrEqual(12)
  })
})

describe('paso 1.b - ubicacion', () => {
  it('exige calle', () => {
    const r = validarPaso('ubicacion', { calle: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.calle).toBeTruthy()
  })

  it('cae a Leon y Guanajuato por defecto', () => {
    const r = validarPaso('ubicacion', { calle: 'Blvd. Adolfo Lopez Mateos 100' })
    expect(r.ok).toBe(true)
  })

  it('rechaza coordenadas imposibles', () => {
    const r = validarPaso('ubicacion', { calle: 'Calle 1', lat: 999, lng: 0 })
    expect(r.ok).toBe(false)
  })
})

describe('paso 1.c - caracteristicas', () => {
  const base = { precio: 2500000, titulo: 'Casa en Jardines del Moral', descripcion: DESC }

  it('acepta lo minimo', () => {
    expect(validarPaso('caracteristicas', base).ok).toBe(true)
  })

  it('un precio de 0 no es un precio', () => {
    const r = validarPaso('caracteristicas', { ...base, precio: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.precio).toBeTruthy()
  })

  it('exige 150 caracteres de descripcion', () => {
    const r = validarPaso('caracteristicas', { ...base, descripcion: 'a'.repeat(149) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.descripcion).toMatch(/150/)
  })

  it('un titulo de tres letras no describe nada', () => {
    expect(validarPaso('caracteristicas', { ...base, titulo: 'Casa' }).ok).toBe(false)
  })

  it('vacio no es cero: un campo opcional en blanco queda sin definir', () => {
    const r = esquemaCaracteristicas.safeParse({ ...base, recamaras: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.recamaras).toBeUndefined()
  })

  it('convierte el numero que llega como cadena', () => {
    const r = esquemaCaracteristicas.safeParse({ ...base, recamaras: '3' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.recamaras).toBe(3)
  })
})

describe('paso 2 - multimedia', () => {
  const foto = (n: number) => ({ url: `https://res.cloudinary.com/x/${n}.jpg` })

  it(`exige ${MINIMO_FOTOS} fotos`, () => {
    const r = validarPaso('multimedia', { fotos: [foto(1), foto(2)] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.fotos).toMatch(String(MINIMO_FOTOS))
  })

  it('acepta cinco', () => {
    const fotos = [1, 2, 3, 4, 5].map(foto)
    expect(validarPaso('multimedia', { fotos }).ok).toBe(true)
  })

  it('rechaza una url que no lo es', () => {
    const fotos = [1, 2, 3, 4].map(foto).concat([{ url: 'no-soy-una-url' }])
    expect(validarPaso('multimedia', { fotos }).ok).toBe(false)
  })
})

describe('el paso de revisar no valida nada propio', () => {
  it('siempre pasa: lo que valida son los pasos anteriores', () => {
    expect(validarPaso('publicar', {}).ok).toBe(true)
  })
})
