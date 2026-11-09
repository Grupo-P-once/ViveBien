import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** `llamarApi` espera a que Firebase termine de restaurar la sesión antes de pedir el token (regresión del gate del 7-nov-2026: «Inicia sesión» falso al abrir la pantalla). */

const auth: { currentUser: null | { getIdToken: () => Promise<string> }; authStateReady?: () => Promise<void> } = { currentUser: null }
vi.mock('@/lib/firebase', () => ({ auth }))

const respuesta = () => new Response(JSON.stringify({ citas: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => { vi.resetModules(); auth.currentUser = null; delete auth.authStateReady })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('llamarApi · sesión que aún se está restaurando', () => {
  it('espera a authStateReady y usa el token cuando la sesión aparece', async () => {
    const fetchMock = vi.fn(async () => respuesta())
    vi.stubGlobal('fetch', fetchMock)
    auth.authStateReady = async () => { await Promise.resolve(); auth.currentUser = { getIdToken: async () => 'tok-sintetico' } }
    const { llamarApi } = await import('../src/lib/citas/cliente')
    const r = await llamarApi('/api/citas?x=1')
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const cab = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(cab.Authorization).toBe('Bearer tok-sintetico')
  })

  it('si la sesión no aparece devuelve 401 recuperable SIN tocar la red', async () => {
    const fetchMock = vi.fn(async () => respuesta())
    vi.stubGlobal('fetch', fetchMock)
    auth.authStateReady = async () => {}
    const { llamarApi } = await import('../src/lib/citas/cliente')
    const r = await llamarApi('/api/citas?x=1')
    expect(r).toMatchObject({ ok: false, status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si Firebase nunca decide, no se cuelga: corta a los 5 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => respuesta()))
    auth.authStateReady = () => new Promise<void>(() => {})
    const { llamarApi } = await import('../src/lib/citas/cliente')
    const p = llamarApi('/api/citas?x=1')
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toMatchObject({ ok: false, status: 401 })
  })

  it('con la sesión ya lista no espera nada', async () => {
    const listo = vi.fn(async () => {})
    auth.authStateReady = listo
    auth.currentUser = { getIdToken: async () => 'tok' }
    vi.stubGlobal('fetch', vi.fn(async () => respuesta()))
    const { llamarApi } = await import('../src/lib/citas/cliente')
    expect((await llamarApi('/api/citas?x=1')).ok).toBe(true)
    expect(listo).not.toHaveBeenCalled()
  })
})
