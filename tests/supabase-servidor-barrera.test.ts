import { afterEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { clienteServidor, OPCIONES_SERVIDOR } from '../src/lib/supabase-servidor'

/**
 * R-01 / QA-001 (D-62): los clientes de Supabase del SERVIDOR no deben arrancar el temporizador de auto-refresco de sesión
 * (retenía ~30–80 KB por petición dinámica). Barrera en tres capas: (1) estructura: solo la fábrica llama a `createClient`;
 * (2) opciones exactas; (3) COMPORTAMIENTO: con el cliente real no se registra ningún `setInterval` (con control positivo:
 * el cliente por defecto sí lo registra, así que la prueba discrimina).
 */
const SRC = path.join(__dirname, '..', 'src')
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/')

describe('estructura: una sola fábrica', () => {
  const todos = archivos(SRC)
  const sinComentarios = (f: string) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')
  it('createClient( solo aparece en la fábrica del servidor y en el cliente del NAVEGADOR (con o sin espacio)', () => {
    const usos = todos.filter((f) => /\bcreateClient\s*\(/.test(sinComentarios(f))).map(rel)
    expect(usos.sort()).toEqual(['lib/supabase-servidor.ts', 'lib/supabase.ts'])
  })
  it('el paquete de Supabase solo se importa como VALOR en esos dos archivos (nada de alias ni createClient as x); import type sí', () => {
    const valor = /^\s*import\s+(?!type\b)[^;\n]*from\s+['"]@supabase\/(supabase-js|ssr)['"]/m
    const usos = todos.filter((f) => valor.test(sinComentarios(f))).map(rel)
    expect(usos.sort()).toEqual(['lib/supabase-servidor.ts', 'lib/supabase.ts'])
    expect(todos.filter((f) => /require\(['"]@supabase\//.test(sinComentarios(f)))).toEqual([])
  })
  it('ningún módulo de servidor importa el cliente del navegador (lib/supabase)', () => {
    const servidor = todos.filter((f) => /^(app\/api\/|app\/sitemap|lib\/(auth-server|ficha-servidor|ayuda\/consultas))/.test(rel(f)))
    expect(servidor.length).toBeGreaterThan(40)
    for (const f of servidor) expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/from ['"](@\/lib\/supabase|\.\.?\/(\.\.\/)?supabase)['"]/)
  })
  it('el cliente del navegador conserva su configuración por defecto (necesita su sesión)', () => {
    expect(readFileSync(path.join(SRC, 'lib', 'supabase.ts'), 'utf8')).toMatch(/createClient\(supabaseUrl, supabaseAnonKey\)/)
  })
})

describe('opciones exactas', () => {
  it('sin auto-refresco, sin persistencia, sin sesión en la URL', () => {
    expect(OPCIONES_SERVIDOR).toEqual({ auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  })
})

describe('comportamiento: el cliente de servidor no deja temporizadores', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const URL_ = 'http://localhost:54321'
  const CLAVE = 'clave-de-prueba'
  const esperar = () => new Promise((r) => setTimeout(r, 120))

  it('CONTROL POSITIVO: el cliente por defecto SÍ registra un setInterval de auto-refresco', async () => {
    const espia = vi.spyOn(globalThis, 'setInterval')
    const c = createClient(URL_, CLAVE)
    await esperar()
    expect(espia.mock.calls.length).toBeGreaterThan(0)
    await c.auth.stopAutoRefresh()
  })
  it('clienteServidor NO registra ningún setInterval (50 clientes)', async () => {
    const espia = vi.spyOn(globalThis, 'setInterval')
    for (let i = 0; i < 50; i++) clienteServidor(URL_, CLAVE)
    await esperar()
    expect(espia.mock.calls.length).toBe(0)
  })
})
