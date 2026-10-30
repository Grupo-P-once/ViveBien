import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CSP } from '../src/lib/csp'

/**
 * R-05 (D-62): la CSP ya no permite `unsafe-eval` (medido: 0 violaciones en 17 páginas con y sin él) y puede aplicarse con `CSP_MODO=bloquear`.
 * NO se declara cerrada: el bloqueo real sigue desactivado por defecto hasta validar el inicio de sesión con Google en staging.
 */
describe('política de contenido', () => {
  const dir = (n: string) => CSP.split('; ').find((d) => d.startsWith(n + ' ')) ?? ''
  it('script-src sin unsafe-eval; con los orígenes medidos', () => {
    expect(dir('script-src')).not.toContain("'unsafe-eval'")
    expect(dir('script-src')).toContain("'self'")
    expect(dir('script-src')).toContain('https://www.googletagmanager.com')
  })
  it('directivas de contención intactas', () => {
    for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", 'upgrade-insecure-requests']) expect(CSP).toContain(d)
    expect(dir('form-action')).toContain('https://accounts.google.com')
    expect(CSP).not.toMatch(/\*\s|[ ;]\*[;\s]|http:\/\/\*/) // sin comodines totales ni http
  })
})

describe('cabecera: informe por defecto, bloqueo por variable', () => {
  const cfg = readFileSync(path.join(__dirname, '..', 'next.config.ts'), 'utf8')
  afterEach(() => { vi.unstubAllEnvs() })
  it('next.config.ts elige el nombre de la cabecera con CSP_MODO', () => {
    expect(cfg).toMatch(/process\.env\.CSP_MODO === "bloquear" \? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"/)
  })
  it('sin la variable NO se bloquea nada (producción no cambia hasta que se decida)', async () => {
    vi.stubEnv('CSP_MODO', '')
    vi.resetModules()
    const m = (await import('../next.config')).default
    const cab = (await (m.headers as () => Promise<Array<{ headers: Array<{ key: string }> }>>)())[0].headers.map((h) => h.key)
    expect(cab).toContain('Content-Security-Policy-Report-Only')
    expect(cab).not.toContain('Content-Security-Policy')
  })
  it('con CSP_MODO=bloquear se aplica de verdad', async () => {
    vi.stubEnv('CSP_MODO', 'bloquear')
    vi.resetModules()
    const m = (await import('../next.config')).default
    const cab = (await (m.headers as () => Promise<Array<{ headers: Array<{ key: string }> }>>)())[0].headers.map((h) => h.key)
    expect(cab).toContain('Content-Security-Policy')
    expect(cab).not.toContain('Content-Security-Policy-Report-Only')
  })
})
