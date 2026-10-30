import { describe, it, expect } from 'vitest'
import { problemaConArchivo, repartirArchivos, mover, idYoutube, urlYoutube } from '../src/lib/multimedia'

const MB = 1024 * 1024
const jpg = (name = 'a.jpg', size = 1 * MB) => ({ name, type: 'image/jpeg', size })

describe('problemaConArchivo', () => {
  it('acepta JPG, PNG y WebP dentro del tamaño', () => {
    expect(problemaConArchivo(jpg())).toBeNull()
    expect(problemaConArchivo({ type: 'image/png', size: MB })).toBeNull()
    expect(problemaConArchivo({ type: 'image/webp', size: MB })).toBeNull()
  })
  it('rechaza un PDF o un HEIC diciendo cuál', () => {
    expect(problemaConArchivo({ name: 'plano.pdf', type: 'application/pdf', size: MB })).toMatch(/plano\.pdf/)
    expect(problemaConArchivo({ name: 'IMG_1.heic', type: 'image/heic', size: MB })).toMatch(/JPG, PNG o WebP/)
  })
  it('rechaza lo que pasa de 5 MB y dice cuánto pesa', () => {
    expect(problemaConArchivo(jpg('grande.jpg', 8.4 * MB))).toMatch(/8\.4 MB/)
  })
})

describe('repartirArchivos', () => {
  it('separa los válidos de los que no', () => {
    const r = repartirArchivos([jpg('a.jpg'), { name: 'x.pdf', type: 'application/pdf', size: 1 }], 0)
    expect(r.validos.map(a => a.name)).toEqual(['a.jpg'])
    expect(r.problemas).toHaveLength(1)
  })
  it('respeta el tope contando las que ya hay, y lo dice', () => {
    const r = repartirArchivos([jpg('1'), jpg('2'), jpg('3')], 48, 50)
    expect(r.validos).toHaveLength(2)
    expect(r.problemas[0]).toMatch(/descartan 1/)
  })
  it('con el tope lleno no sube nada', () => {
    expect(repartirArchivos([jpg()], 50, 50).validos).toHaveLength(0)
  })
})

describe('mover', () => {
  it('sube y baja una posición', () => {
    expect(mover(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(mover(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })
  it('fuera de rango devuelve la misma lista, sin romperla', () => {
    expect(mover(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(mover(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(mover(['a', 'b'], 5, -1)).toEqual(['a', 'b'])
  })
  it('no modifica la original', () => {
    const l = ['a', 'b']
    mover(l, 0, 1)
    expect(l).toEqual(['a', 'b'])
  })
})

describe('idYoutube', () => {
  const ID = 'dQw4w9WgXcQ'
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `  https://youtu.be/${ID}  `,
  ])('reconoce %s', (u) => {
    expect(idYoutube(u)).toBe(ID)
  })

  it.each([
    'https://vimeo.com/123456',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=corto',
    'javascript:alert(1)',
    'no es una url',
    'https://www.youtube.com/@canal',
  ])('rechaza %s', (u) => {
    expect(idYoutube(u)).toBeNull()
  })

  it('guarda una sola forma canónica', () => {
    expect(urlYoutube(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})
