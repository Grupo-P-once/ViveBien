import { describe, it, expect } from 'vitest'
import { filasDeFotos, piesDe, MAXIMO_PIE } from '../src/lib/fotos'

describe('filasDeFotos', () => {
  it('la primera es la portada y el orden sigue al array', () => {
    const filas = filasDeFotos('casa-1', ['a.jpg', 'b.jpg', 'c.jpg'])
    expect(filas.map(f => [f.orden, f.es_principal])).toEqual([[0, true], [1, false], [2, false]])
  })

  it('el pie pertenece a la imagen: al reordenar, se va con ella', () => {
    const pies = { 'b.jpg': 'Salón de eventos' }
    const antes = filasDeFotos('casa-1', ['a.jpg', 'b.jpg'], pies)
    const despues = filasDeFotos('casa-1', ['b.jpg', 'a.jpg'], pies)
    expect(antes.find(f => f.url === 'b.jpg')?.pie).toBe('Salón de eventos')
    expect(despues.find(f => f.url === 'b.jpg')?.pie).toBe('Salón de eventos')
    expect(despues[0].es_principal).toBe(true)
    expect(despues[0].url).toBe('b.jpg')
  })

  it('un pie vacío o en blanco es null, no una cadena vacía', () => {
    const filas = filasDeFotos('casa-1', ['a.jpg', 'b.jpg'], { 'a.jpg': '   ', 'b.jpg': '' })
    expect(filas.map(f => f.pie)).toEqual([null, null])
  })

  it('recorta un pie demasiado largo', () => {
    const filas = filasDeFotos('casa-1', ['a.jpg'], { 'a.jpg': 'x'.repeat(500) })
    expect(filas[0].pie).toHaveLength(MAXIMO_PIE)
  })

  it('la misma URL repetida entra una sola vez: dos portadas romperían el índice único', () => {
    const filas = filasDeFotos('casa-1', ['a.jpg', 'a.jpg', 'b.jpg'])
    expect(filas).toHaveLength(2)
    expect(filas.filter(f => f.es_principal)).toHaveLength(1)
  })

  it('sin fotos, sin filas', () => {
    expect(filasDeFotos('casa-1', [])).toEqual([])
  })

  it('ignora huecos vacíos en el array', () => {
    expect(filasDeFotos('casa-1', ['', 'a.jpg'])).toHaveLength(1)
  })
})

describe('piesDe', () => {
  it('rescata los pies existentes por URL', () => {
    expect(piesDe([{ url: 'a.jpg', pie: 'Fachada' }, { url: 'b.jpg', pie: null }])).toEqual({ 'a.jpg': 'Fachada' })
  })
})
