import { describe, it, expect } from 'vitest'
import { miniaturaCloudinary, esDeCloudinary } from '../src/lib/cloudinary-url'

const REAL = 'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322868/vivebien/nave/sanjuan/mu04mx1e-u9bqpd.jpg'

describe('miniaturaCloudinary', () => {
  it('mete la transformación justo después de /upload/', () => {
    expect(miniaturaCloudinary(REAL)).toBe(
      'https://res.cloudinary.com/zwsi9aar/image/upload/c_fill,w_48,h_48,dpr_2,f_auto,q_auto/v1789322868/vivebien/nave/sanjuan/mu04mx1e-u9bqpd.jpg',
    )
  })

  it('respeta el tamaño pedido', () => {
    expect(miniaturaCloudinary(REAL, { lado: 96 })).toContain('c_fill,w_96,h_96')
  })

  it('no la duplica si ya la trae', () => {
    const una = miniaturaCloudinary(REAL)!
    expect(miniaturaCloudinary(una)).toBe(una)
  })

  it('una foto que no es de Cloudinary se devuelve intacta', () => {
    expect(miniaturaCloudinary('/propiedades/tzula/1.jpg')).toBe('/propiedades/tzula/1.jpg')
    expect(esDeCloudinary('https://ejemplo.com/image/upload/x.jpg')).toBe(false)
  })

  it('sin foto no inventa una URL', () => {
    expect(miniaturaCloudinary(null)).toBeNull()
    expect(miniaturaCloudinary('')).toBeNull()
  })
})
