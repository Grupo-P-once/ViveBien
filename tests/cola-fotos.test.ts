import { describe, expect, it } from 'vitest'
import { agregarSinDuplicar, plazasLibres, procesarCarga, MOTIVO_SIN_RED } from '../src/lib/publicador/cola-fotos'

/**
 * Cola de subida de fotos (15-oct-2026, E-48): estado por archivo, reintento solo del fallido, sin carreras con quitar/reordenar y respetando
 * el tope. Sin red ni Cloudinary: `subir` es un doble.
 */
describe('agregarSinDuplicar', () => {
  it('añade al final, sin duplicar, sin pasar del tope y sin tocar la lista original', () => {
    const base = ['a', 'b']
    expect(agregarSinDuplicar(base, 'c', 5)).toEqual({ lista: ['a', 'b', 'c'], agregada: true })
    expect(base).toEqual(['a', 'b'])
    expect(agregarSinDuplicar(base, 'a', 5)).toEqual({ lista: ['a', 'b'], agregada: false })
    expect(agregarSinDuplicar(base, 'c', 2)).toEqual({ lista: ['a', 'b'], agregada: false })
  })
})

describe('plazasLibres', () => {
  it('cuenta lo guardado MÁS lo que está subiendo', () => {
    expect(plazasLibres(3, 0, 50)).toBe(47)
    expect(plazasLibres(3, 4, 50)).toBe(43)
    expect(plazasLibres(48, 5, 50)).toBe(0)
    expect(plazasLibres(60, 0, 50)).toBe(0)
  })
})

describe('procesarCarga', () => {
  it('éxito: agrega la URL a la lista ACTUAL y lo informa', async () => {
    let lista: string[] = ['x']
    const r = await procesarCarga({
      archivo: 'f1',
      subir: async () => ({ ok: true as const, url: 'https://c/f1.jpg' }),
      agregar: (u) => { const a = agregarSinDuplicar(lista, u, 10); lista = a.lista; return a.agregada },
    })
    expect(r).toEqual({ estado: 'ok', agregada: true })
    expect(lista).toEqual(['x', 'https://c/f1.jpg'])
  })

  it('fallo: devuelve el motivo y NO toca la lista; subir que lanza se trata como fallo', async () => {
    let tocada = false
    const agregar = () => { tocada = true; return true }
    const mal = await procesarCarga({ archivo: 'f', subir: async () => ({ ok: false as const, motivo: 'Archivo demasiado grande' }), agregar })
    expect(mal).toEqual({ estado: 'error', motivo: 'Archivo demasiado grande' })
    const lanza = await procesarCarga({ archivo: 'f', subir: async () => { throw new Error('boom') }, agregar })
    expect(lanza).toEqual({ estado: 'error', motivo: MOTIVO_SIN_RED })
    expect(tocada).toBe(false)
  })

  it('sin carreras: quitar una foto MIENTRAS otra sube no se pisa (la lista se lee al terminar, no al empezar)', async () => {
    let lista = ['a', 'b', 'c']
    let terminar: () => void = () => {}
    const sube = procesarCarga({
      archivo: 'nueva',
      subir: () => new Promise((res) => { terminar = () => res({ ok: true as const, url: 'nueva-url' }) }),
      agregar: (u) => { const r = agregarSinDuplicar(lista, u, 50); lista = r.lista; return r.agregada },
    })
    lista = lista.filter((u) => u !== 'b') // la persona quita la foto 'b' mientras sube
    terminar()
    await sube
    expect(lista).toEqual(['a', 'c', 'nueva-url']) // con la copia vieja habría vuelto 'b'
  })

  it('reintento: un fallo parcial no impide subir las demás y el fallido se puede repetir', async () => {
    let lista: string[] = []
    const intentos: Record<string, number> = {}
    const subir = async (f: string) => {
      intentos[f] = (intentos[f] ?? 0) + 1
      return f === 'mala' && intentos[f] === 1 ? { ok: false as const, motivo: 'Cloudinary rechazó la subida' } : { ok: true as const, url: `u-${f}` }
    }
    const agregar = (u: string) => { const r = agregarSinDuplicar(lista, u, 50); lista = r.lista; return r.agregada }
    const resultados = []
    for (const f of ['uno', 'mala', 'tres']) resultados.push(await procesarCarga({ archivo: f, subir, agregar }))
    expect(resultados.map((r) => r.estado)).toEqual(['ok', 'error', 'ok'])
    expect(lista).toEqual(['u-uno', 'u-tres']) // las buenas no se pierden
    expect(await procesarCarga({ archivo: 'mala', subir, agregar })).toEqual({ estado: 'ok', agregada: true })
    expect(lista).toEqual(['u-uno', 'u-tres', 'u-mala'])
  })

  it('no supera el tope aunque terminen más subidas que plazas', async () => {
    let lista = ['a', 'b']
    const agregar = (u: string) => { const r = agregarSinDuplicar(lista, u, 3); lista = r.lista; return r.agregada }
    const a = await procesarCarga({ archivo: 'x', subir: async () => ({ ok: true as const, url: 'x' }), agregar })
    const b = await procesarCarga({ archivo: 'y', subir: async () => ({ ok: true as const, url: 'y' }), agregar })
    expect([a, b]).toEqual([{ estado: 'ok', agregada: true }, { estado: 'ok', agregada: false }])
    expect(lista).toEqual(['a', 'b', 'x'])
  })
})
