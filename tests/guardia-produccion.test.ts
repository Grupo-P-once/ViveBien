import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { chromium, type Browser } from '@playwright/test'

/**
 * R-15 (D-62 · QA-021 · observación 0008): ninguna prueba automatizada contra PRODUCCIÓN puede generar telemetría ni escrituras por descuido.
 * Se prueba (1) la decisión pura, (2) con un navegador REAL que la petición NI SIQUIERA LLEGA al servidor, (3) que los scripts de k6 solo hacen GET.
 */
const req = createRequire(import.meta.url)
const { decidirPeticion, instalarGuardia, esProduccion } = req('../scripts/qa/guardia-produccion.cjs') as {
  decidirPeticion: (a: Record<string, unknown>) => { permitir: boolean; razon: string }
  instalarGuardia: (ctx: unknown, o: Record<string, unknown>) => { bloqueadas: Array<{ metodo: string; razon: string }>; permitidas: { lecturas: number; otras: number } }
  esProduccion: (b: string) => boolean
}
const PROD = 'https://vivebienn.com'

describe('decisión pura', () => {
  it('reconoce producción (dominio propio y *.vercel.app) y no confunde el entorno aislado', () => {
    expect(esProduccion(PROD)).toBe(true)
    expect(esProduccion('https://www.vivebienn.com')).toBe(true)
    expect(esProduccion('https://vive-bien-abc-grupo-p-once.vercel.app')).toBe(true)
    expect(esProduccion('http://localhost:3140')).toBe(false)
    expect(esProduccion('https://vivebienn.com.evil.test')).toBe(false)
  })
  it('LECTURA permitida contra producción (GET, HEAD, OPTIONS), propia o de terceros', () => {
    for (const metodo of ['GET', 'HEAD', 'OPTIONS']) expect(decidirPeticion({ metodo, url: PROD + '/propiedades', base: PROD }).permitir).toBe(true)
    expect(decidirPeticion({ metodo: 'GET', url: 'https://res.cloudinary.com/x.jpg', base: PROD }).permitir).toBe(true)
  })
  it('TELEMETRÍA propia (POST /api/eventos) BLOQUEADA, y solo se permite a propósito', () => {
    const d = decidirPeticion({ metodo: 'POST', url: PROD + '/api/eventos', base: PROD })
    expect(d.permitir).toBe(false)
    expect(d.razon).toMatch(/telemetría/)
    expect(decidirPeticion({ metodo: 'POST', url: PROD + '/api/eventos', base: PROD, permitirTelemetria: true }).permitir).toBe(true)
  })
  it('ESCRITURA real BLOQUEADA (POST/PUT/PATCH/DELETE) salvo autorización explícita', () => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(decidirPeticion({ metodo, url: PROD + '/api/contacto', base: PROD }).permitir).toBe(false)
    }
    expect(decidirPeticion({ metodo: 'POST', url: PROD + '/api/contacto', base: PROD, escrituraAutorizada: true }).permitir).toBe(true)
  })
  it('balizas y escrituras a TERCEROS bloqueadas (analítica de Google, etc.)', () => {
    expect(decidirPeticion({ metodo: 'POST', url: 'https://www.google-analytics.com/g/collect', base: PROD }).permitir).toBe(false)
  })
  it('contra el entorno AISLADO no restringe (las escrituras no llegan a producción)', () => {
    expect(decidirPeticion({ metodo: 'POST', url: 'http://localhost:3140/api/eventos', base: 'http://localhost:3140' }).permitir).toBe(true)
  })
  it('URL inválida contra producción → bloqueada (falla cerrado)', () => {
    expect(decidirPeticion({ metodo: 'POST', url: 'no-es-una-url', base: PROD }).permitir).toBe(false)
  })
})

describe('con un navegador real: la petición bloqueada NO LLEGA al servidor', () => {
  let servidor: http.Server
  let url = ''
  let browser: Browser | null = null
  const vistas: string[] = []
  beforeAll(async () => {
    servidor = http.createServer((rq, rs) => { vistas.push(`${rq.method} ${rq.url}`); rs.setHeader('content-type', 'text/html'); rs.end('<html><body>ok</body></html>') })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
    try { browser = await chromium.launch() } catch { browser = null }
  }, 60_000)
  afterAll(async () => { await browser?.close(); servidor.closeAllConnections?.(); servidor.close() })

  it('GET pasa; POST /api/eventos y POST genérico se abortan en el navegador (el servidor no los ve)', async (c) => {
    if (!browser) return c.skip() // sin Chromium (npx playwright install chromium) se REPORTA como omitida, no como pasada
    const ctx = await browser.newContext()
    // `produccion: true` hace que el servidor local «sea producción» para la guardia.
    const g = instalarGuardia(ctx, { base: url, produccion: true })
    const p = await ctx.newPage()
    await p.goto(url + '/')
    const r = await p.evaluate(async () => {
      const a = await fetch('/leer').then((x) => x.status).catch(() => 'error')
      const b = await fetch('/api/eventos', { method: 'POST', body: '{}' }).then((x) => x.status).catch(() => 'bloqueada')
      const c = await fetch('/api/contacto', { method: 'POST', body: '{}' }).then((x) => x.status).catch(() => 'bloqueada')
      return { a, b, c }
    })
    expect(r).toEqual({ a: 200, b: 'bloqueada', c: 'bloqueada' })
    expect(vistas.filter((v) => v.startsWith('POST'))).toEqual([]) // NUNCA llegó
    expect(vistas.some((v) => v === 'GET /leer')).toBe(true)
    expect(g.bloqueadas.map((b) => b.metodo)).toEqual(['POST', 'POST'])
    await ctx.close()
  }, 60_000)
})

describe('los scripts de k6 contra producción solo hacen lecturas', () => {
  const dir = path.join(__dirname, 'performance', 'k6')
  const archivos = ['helpers', 'scenarios'].flatMap((d) => readdirSync(path.join(dir, d)).map((f) => path.join(dir, d, f)))
  it.each(archivos.map((a) => path.relative(dir, a)))('%s no usa http.post/put/patch/del', (rel) => {
    expect(readFileSync(path.join(dir, rel), 'utf8')).not.toMatch(/http\.(post|put|patch|del|request|batch)\s*\(/)
  })
  it('los scripts de Playwright de producción instalan la guardia', () => {
    for (const f of ['navegador-web-vitals.mjs', 'csp-violaciones.mjs', 'lcp-causa.mjs']) {
      expect(readFileSync(path.join(__dirname, 'performance', f), 'utf8'), f).toMatch(/guardia-produccion/)
    }
  })
})
