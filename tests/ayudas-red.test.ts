import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { LIMITE_EXTERNO_MS, LIMITE_TERCERO_MS, TERCEROS, acotarTerceros, responderTercero } from '../tests-visual/ayudas-red'

/**
 * Los terceros del navegador de las pruebas no pueden bloquear una página (Etapa 6, bloqueo A: timeouts intermitentes de 30 s).
 * Lógica pura con una «ruta» falsa: sin navegador, sin red. La demostración en navegador real está en `tests-visual/aislamiento-terceros.e2e.ts`.
 */
type RutaFalsa = { fulfill: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn>; fetch: ReturnType<typeof vi.fn> }
const ruta = (): RutaFalsa => ({ fulfill: vi.fn(async () => {}), abort: vi.fn(async () => {}), fetch: vi.fn() })

afterEach(() => { vi.useRealTimers() })

describe('responderTercero', () => {
  it('si el tercero contesta a tiempo, se entrega su respuesta tal cual', async () => {
    const r = ruta()
    const respuesta = { status: () => 200 }
    const res = await responderTercero(r as never, { traer: async () => respuesta as never })
    expect(res).toBe('respondido')
    expect(r.fulfill).toHaveBeenCalledWith({ response: respuesta })
    expect(r.abort).not.toHaveBeenCalled()
  })

  it('si el tercero NO contesta, la petición se corta al límite (nunca queda colgada)', async () => {
    vi.useFakeTimers()
    const r = ruta()
    const p = responderTercero(r as never, { limiteMs: 1500, traer: () => new Promise(() => {}) })
    await vi.advanceTimersByTimeAsync(1499)
    expect(r.abort).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(await p).toBe('cortado')
    expect(r.abort).toHaveBeenCalledWith('timedout')
    expect(r.fulfill).not.toHaveBeenCalled()
  })

  it('si el tercero falla (sin internet, DNS…), también se corta y no se propaga el error', async () => {
    const r = ruta()
    expect(await responderTercero(r as never, { traer: async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED') } })).toBe('cortado')
    expect(r.abort).toHaveBeenCalledOnce()
  })

  it('el límite por defecto es corto (4 s): mucho menos que los 30 s de una prueba', () => {
    expect(LIMITE_TERCERO_MS).toBeLessThanOrEqual(5000)
  })
})

describe('qué se considera «tercero»', () => {
  it('fuentes, Font Awesome, Unsplash y apis.google.com sí; el propio sitio, la réplica local, Cloudinary y Supabase no', () => {
    for (const h of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'images.unsplash.com', 'apis.google.com', 'www.gstatic.com']) expect(TERCEROS.test(h), h).toBe(true)
    for (const h of ['localhost', '127.0.0.1', 'vivebienn.com', 'res.cloudinary.com', 'abc.supabase.co', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'api.open-meteo.com']) expect(TERCEROS.test(h), h).toBe(false)
  })
})

describe('acotarTerceros: además de los terceros conocidos, TODO lo externo tiene límite', () => {
  type Predicado = (u: URL) => boolean
  const registrar = async () => {
    const rutas: Predicado[] = []
    const page = { route: vi.fn(async (pred: Predicado) => { rutas.push(pred) }) }
    await acotarTerceros(page as never)
    return rutas
  }
  it('registra primero la ruta general (la de menor prioridad) y después la de terceros conocidos', async () => {
    const rutas = await registrar()
    expect(rutas).toHaveLength(2)
    const [general, conocidos] = rutas
    // La general cubre lo que `TERCEROS` no enumera: fotos, mapas, el iframe de Firebase, YouTube, teselas (vistos sin respuesta en la corrida sobre a0bb9fe).
    for (const h of ['res.cloudinary.com', 'www.google.com', 'maps.googleapis.com', 'maps.gstatic.com', 'vivebien-84685.firebaseapp.com', 'i.ytimg.com', 'a.tile.openstreetmap.org', 'identitytoolkit.googleapis.com', 'cdnjs.cloudflare.com']) {
      expect(general(new URL(`https://${h}/x`)), h).toBe(true)
    }
    // Lo local nunca se intercepta: el propio sitio y la réplica de Supabase.
    for (const u of ['http://localhost:3131/x', 'http://127.0.0.1:54399/rest/v1/x', 'http://[::1]:3130/x']) expect(general(new URL(u)), u).toBe(false)
    // El contrato de `TERCEROS` NO cambió: Cloudinary sigue sin ser «tercero conocido».
    expect(conocidos(new URL('https://cdnjs.cloudflare.com/x'))).toBe(true)
    expect(conocidos(new URL('https://res.cloudinary.com/x'))).toBe(false)
  })
  it('el límite general es más holgado que el de los terceros conocidos pero sigue muy por debajo de los 30 s de una prueba', () => {
    expect(LIMITE_EXTERNO_MS).toBeGreaterThan(LIMITE_TERCERO_MS)
    expect(LIMITE_EXTERNO_MS).toBeLessThanOrEqual(15_000)
  })
})

describe('el límite está puesto donde se vio el problema', () => {
  const leer = (r: string) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  it('prepararPaginaPublica (axe-cierre) y guardados acotan los terceros ANTES de registrar el resto de rutas', () => {
    const ayudas = leer('tests-visual/ayudas.ts')
    expect(ayudas).toMatch(/await acotarTerceros\(page\)/)
    expect(ayudas.indexOf('acotarTerceros(page)')).toBeLessThan(ayudas.indexOf("page.route('**/api/eventos'"))
    const guardados = leer('tests-visual/guardados.e2e.ts')
    expect(guardados).toMatch(/await acotarTerceros\(page\)/)
    expect(guardados.indexOf('acotarTerceros(page)')).toBeLessThan(guardados.indexOf("page.route('**/securetoken.googleapis.com/**'"))
  })
})
