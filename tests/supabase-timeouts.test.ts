import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { clienteServidor, TIMEOUTS_MS } from '../src/lib/supabase-servidor'
import { conPresupuesto, PRESUPUESTO_FICHA_MS } from '../src/lib/ficha-servidor'
import { instantanea, reiniciarMetricas } from '../src/lib/metricas'

/**
 * R-06 / QA-006 (D-62): las consultas a Supabase del servidor tienen tiempo límite REAL (la conexión se aborta) y la ficha tiene un
 * presupuesto total. ANTES: con la base «colgada» la petición no respondía en 45 s; con la lenta (3 s) la ficha tardaba 6 s.
 * Se usa un servidor HTTP real (no un doble del cliente) para probar que el corte ocurre en la red.
 */
let modo: 'colgado' | 'lento' | 'ok' = 'ok'
let cerradas = 0
let servidor: http.Server
let URL_: string

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    req.on('close', () => { if (!res.writableEnded) cerradas++ })
    if (modo === 'colgado') return // nunca responde
    const responder = () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify([{ id: 1 }])) }
    if (modo === 'lento') setTimeout(responder, 150)
    else responder()
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  URL_ = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
afterAll(() => { servidor.closeAllConnections?.(); servidor.close() })
afterEach(() => { modo = 'ok'; cerradas = 0; reiniciarMetricas(); vi.restoreAllMocks() })

describe('cliente de servidor con tiempo límite', () => {
  it('base COLGADA: responde con error dentro del límite (no se queda esperando) y aborta la conexión', async () => {
    modo = 'colgado'
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t0 = Date.now()
    const { data, error } = await clienteServidor(URL_, 'k', { timeoutMs: 300 }).from('propiedades').select('id,email').eq('id', 'x')
    const ms = Date.now() - t0
    expect(data).toBeNull()
    expect(error?.message).toMatch(/timeout|abort/i)
    expect(ms).toBeGreaterThanOrEqual(550) // dos intentos de 300 ms: la lectura se repite UNA vez
    expect(ms).toBeLessThan(3000)
    await new Promise((r) => setTimeout(r, 50))
    expect(cerradas).toBe(2) // el servidor vio cerrarse las dos conexiones: se abortaron de verdad
    expect(instantanea().contadores['supabase.timeout.prueba']).toBe(2)
    expect(instantanea().contadores['supabase.reintento.prueba']).toBe(1)
    // El log lleva la RUTA, nunca la consulta (puede traer datos de la persona) ni claves.
    const linea = String(aviso.mock.calls[0][0])
    expect(linea).toContain('/rest/v1/propiedades')
    expect(linea).not.toMatch(/select=|email|id=eq|k$/)
  })
  it('REINTENTO: si el primer intento se corta y el segundo responde, la lectura funciona (un tropiezo de red no llega a la persona)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    modo = 'colgado'
    const c = clienteServidor(URL_, 'k', { timeoutMs: 300 })
    const pedido = c.from('t').select('*')
    setTimeout(() => { modo = 'ok' }, 150) // la base «vuelve» antes del segundo intento
    const { data, error } = await pedido
    expect(error).toBeNull()
    expect(data).toEqual([{ id: 1 }])
    expect(instantanea().contadores['supabase.timeout.prueba']).toBe(1)
    expect(instantanea().contadores['supabase.reintento.prueba']).toBe(1)
  })
  it('una ESCRITURA nunca se reintenta (no es idempotente)', async () => {
    modo = 'ok'
    let llamadas = 0
    const original = globalThis.fetch
    globalThis.fetch = (async () => { llamadas++; throw new TypeError('fetch failed') }) as typeof fetch
    try {
      const { error } = await clienteServidor(URL_, 'k', { timeoutMs: 300 }).from('t').insert({ a: 1 })
      expect(error).not.toBeNull()
      expect(llamadas).toBe(1)
    } finally { globalThis.fetch = original }
  })
  it('base LENTA pero dentro del límite: funciona', async () => {
    modo = 'lento'
    const { data, error } = await clienteServidor(URL_, 'k', { timeoutMs: 1500 }).from('t').select('*')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: 1 }])
    expect(instantanea().contadores['supabase.timeout.prueba']).toBeUndefined()
  })
  it('base más lenta que el límite: error, y RECUPERACIÓN inmediata cuando vuelve', async () => {
    modo = 'lento'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = clienteServidor(URL_, 'k', { timeoutMs: 60 })
    expect((await c.from('t').select('*')).error).not.toBeNull()
    modo = 'ok'
    const r = await c.from('t').select('*')
    expect(r.error).toBeNull()
    expect(r.data).toEqual([{ id: 1 }])
  })
  it('los tiempos por tipo: lectura pública corta, API/RPC más holgada', () => {
    expect(TIMEOUTS_MS.publico).toBeLessThanOrEqual(5000)
    expect(TIMEOUTS_MS.api).toBeGreaterThan(TIMEOUTS_MS.publico)
    expect(TIMEOUTS_MS.api).toBeLessThanOrEqual(15000)
  })
})

describe('presupuesto total de la ficha', () => {
  afterEach(() => { vi.useRealTimers() })
  it('si la lectura nunca termina, a los 6,5 s devuelve error (la página cae a su respaldo del navegador)', async () => {
    vi.useFakeTimers()
    let listo = false
    const p = conPresupuesto(new Promise(() => {})).then((r) => { listo = true; return r })
    await vi.advanceTimersByTimeAsync(PRESUPUESTO_FICHA_MS - 100)
    expect(listo).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(await p).toEqual({ estado: 'error', mensaje: 'tiempo agotado' })
    expect(instantanea().contadores['ficha.lectura_fallida']).toBe(1)
  })
  it('si responde a tiempo devuelve lo suyo y no deja el temporizador vivo', async () => {
    vi.useFakeTimers()
    const r = await conPresupuesto(Promise.resolve({ estado: 'no-existe' as const }))
    expect(r).toEqual({ estado: 'no-existe' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('estructura: toda lectura PÚBLICA (clave anónima) usa el límite corto', () => {
  const SRC = path.join(__dirname, '..', 'src')
  // E-35: `app/api/admin/propiedades/route.ts` salió de esta lista: ya no lee con la clave pública (solo administradores, clave de servicio).
  // SEC-7 (29-oct-2026): `app/api/ayuda/feedback/route.ts` salió de esta lista: es una ESCRITURA y ya no usa la clave pública (clave de servicio;
  // lo exigen las pruebas SEC-7 de e35-fronteras y la migración 61).
  const archivos = ['app/api/catalogo/route.ts', 'lib/ayuda/consultas.ts', 'lib/ficha-servidor.ts']
  it.each(archivos)('%s pasa «publico» a clienteServidor', (a) => {
    const t = readFileSync(path.join(SRC, a), 'utf8')
    expect(t).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY!,\s*'publico'/)
  })
})

describe('Codex L1 (R-06): las ESCRITURAS no se cortan en el cliente', () => {
  it('un POST lento NO se aborta aunque pase del límite (resultado desconocido = riesgo de duplicar)', async () => {
    modo = 'lento'
    const c = clienteServidor(URL_, 'k', { timeoutMs: 40 })
    const r = await c.from('t').insert({ a: 1 })
    expect(r.error).toBeNull() // el servidor de pruebas responde 200 a los 150 ms; con corte habría fallado a los 40 ms
    expect(instantanea().contadores['supabase.timeout.prueba']).toBeUndefined()
  })
})
