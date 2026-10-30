import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Caos controlado del catálogo público (campaña QA, D-62): Supabase lento / 500 / caído → ¿el catálogo degrada con honestidad?
 * Hasta hoy la rama de degradación (`ultimaBuena`, `desactualizado`, 503 sin copia, tiempo límite de 8 s) no tenía ninguna prueba.
 * Se simula el cliente de Supabase; no hay red ni datos reales.
 */
type Resp = { data: unknown[] | null; error: { message: string } | null }
let siguiente: () => Promise<Resp>

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ order: () => ({ limit: () => ({ then: (ok: (r: Resp) => unknown, ko: (e: unknown) => unknown) => siguiente().then(ok, ko) }) }) }) }),
  }),
}))
const avisos: unknown[] = []
vi.mock('@/lib/alertas', () => ({ avisar: async (a: unknown) => { avisos.push(a) } }))

const FILA = (id: string, estatus = 'disponible', estado = 'publicada') => ({ id, estado_pub: estado, estatus, titulo: id })
const ok = (...f: unknown[]) => async () => ({ data: f, error: null }) as Resp
const falla = (m: string) => async () => ({ data: null, error: { message: m } }) as Resp

async function cargar() {
  vi.resetModules() // cada caso con SU propia «última copia buena» en memoria
  return (await import('../src/app/api/catalogo/route')).GET
}

beforeEach(() => { avisos.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('catálogo con Supabase sano', () => {
  it('devuelve solo lo visible (D-59) y no marca desactualizado', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'), FILA('b', 'pausada'), FILA('c', 'vendida'), FILA('d', 'disponible', 'borrador'), FILA('e', 'eliminada'))
    const j = await (await GET()).json()
    // vendida (c) ya no se muestra: el dueño decidió el 26-oct-2026 que lo vendido/rentado sale del sitio
    expect(j.propiedades.map((p: { id: string }) => p.id)).toEqual(['a'])
    expect(j.desactualizado).toBe(false)
  })
})

describe('Supabase falla DESPUÉS de una respuesta buena → copia vieja, dicha con honestidad', () => {
  it('error 500 de la base: sirve la última copia, desactualizado=true, no cacheable, y avisa', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'))
    await GET()
    siguiente = falla('mock 500')
    const r = await GET()
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.desactualizado).toBe(true)
    expect(j.propiedades).toHaveLength(1)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(avisos.length).toBeGreaterThan(0)
  })
  it('base caída (la promesa se rechaza): igual que un error', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'))
    await GET()
    siguiente = () => Promise.reject(new Error('ECONNRESET'))
    const j = await (await GET()).json()
    expect(j.desactualizado).toBe(true)
  })
  it('base colgada: a los 8 s corta y sirve la copia (no deja al visitante esperando)', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'))
    await GET()
    vi.useFakeTimers()
    siguiente = () => new Promise<Resp>(() => {})
    let respondida = false
    const p = GET().then((r) => { respondida = true; return r })
    await vi.advanceTimersByTimeAsync(7900)
    expect(respondida).toBe(false) // todavía esperando: no corta antes del límite
    await vi.advanceTimersByTimeAsync(300)
    const r = await p
    expect(respondida).toBe(true) // corta justo después de los 8 s
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const j = await r.json()
    expect(j.desactualizado).toBe(true)
    expect(j.motivo).toMatch(/tiempo agotado/)
  })
})

describe('Supabase falla SIN copia previa (arranque en frío) → error honesto, nunca una lista vacía con 200', () => {
  it('503 con no-store y avisa', async () => {
    const GET = await cargar()
    siguiente = falla('mock 500')
    const r = await GET()
    expect(r.status).toBe(503)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect((await r.json()).error).toMatch(/No se pudo/)
    expect(avisos.length).toBeGreaterThan(0)
  })
})

describe('recuperación', () => {
  it('cuando la base vuelve, desactualizado vuelve a false y la copia se renueva', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'))
    await GET()
    siguiente = falla('x')
    expect((await (await GET()).json()).desactualizado).toBe(true)
    siguiente = ok(FILA('a'), FILA('nueva'))
    const j = await (await GET()).json()
    expect(j.desactualizado).toBe(false)
    expect(j.propiedades).toHaveLength(2)
  })
})

describe('R-10: lento pero vivo y frescura de la copia', () => {
  it('base lenta (3 s, por debajo del límite de 8 s): espera y entrega datos frescos, NO desactualizado', async () => {
    const GET = await cargar()
    vi.useFakeTimers()
    siguiente = () => new Promise<Resp>((res) => setTimeout(() => res({ data: [FILA('a')], error: null }), 3000))
    const p = GET()
    await vi.advanceTimersByTimeAsync(3100)
    const j = await (await p).json()
    expect(j.desactualizado).toBe(false)
    expect(j.propiedades).toHaveLength(1)
  })
  it('la copia vieja no resucita una propiedad pausada: tras recuperarse, lo despublicado desaparece', async () => {
    const GET = await cargar()
    siguiente = ok(FILA('a'), FILA('b'))
    await GET()
    siguiente = falla('mock 500')
    expect((await (await GET()).json()).propiedades).toHaveLength(2) // copia vieja, avisada como desactualizada
    siguiente = ok(FILA('a'), FILA('b', 'pausada'))
    const j = await (await GET()).json()
    expect(j.desactualizado).toBe(false)
    expect(j.propiedades.map((p: { id: string }) => p.id)).toEqual(['a'])
  })
})
