import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

/**
 * Apertura escalonada del portal (D-27.5, V-1.1.82).
 */
const estado = vi.hoisted(() => ({
  flags: { portalCliente: false, portalClienteInterno: false } as Record<string, boolean>,
  auth: null as null | { status: number } | { rol: string; superAdmin: boolean },
  exigirLlamado: 0,
}))

vi.mock('@/lib/config/flags-servidor', async (original) => {
  const real = await original<typeof import('../src/lib/config/flags-servidor')>()
  // `normalizarFlags` es puro y, desde D-42, vive en `config/flags`.
  const { normalizarFlags } = await import('../src/lib/config/flags')
  return { ...real, leerFlags: async () => normalizarFlags(estado.flags) }
})
vi.mock('@/lib/auth-server', async (original) => ({
  ...(await original<typeof import('../src/lib/auth-server')>()),
  exigir: async () => {
    estado.exigirLlamado++
    const a = estado.auth
    if (a && 'status' in a) return { error: NextResponse.json({ error: 'x' }, { status: a.status }) }
    return { perfil: { uid: 'u', email: null, emailVerified: true, rol: a?.rol ?? 'cliente', superAdmin: a?.superAdmin ?? false, estado: 'activo', nombre: null } }
  },
}))

import { aperturaDelPortal, portalAbiertoPara } from '../src/lib/portal/apertura'
import { FLAGS_APAGADOS } from '../src/lib/config/flags'
import { GET as acceso } from '../src/app/api/portal/acceso/route'

const cliente = { rol: 'cliente' }
const publicador = { rol: 'publicador' }
const admin = { rol: 'admin', superAdmin: false }
const superAdmin = { rol: 'admin', superAdmin: true }

describe('regla de apertura (pura)', () => {
  it('por defecto (flags apagados): nadie', () => {
    expect(aperturaDelPortal(FLAGS_APAGADOS)).toBe('nadie')
    for (const q of [cliente, publicador, admin, superAdmin]) expect(portalAbiertoPara(FLAGS_APAGADOS, q)).toBe(false)
  })

  it('matriz flags × papel', () => {
    const casos: [{ portalCliente: boolean; portalClienteInterno: boolean }, boolean[]][] = [
      //                                                  cliente publicador admin super
      [{ portalCliente: false, portalClienteInterno: false }, [false, false, false, false]],
      [{ portalCliente: false, portalClienteInterno: true }, [false, false, true, true]],
      [{ portalCliente: true, portalClienteInterno: false }, [true, true, true, true]],
      [{ portalCliente: true, portalClienteInterno: true }, [true, true, true, true]],
    ]
    for (const [f, esperado] of casos) {
      expect([cliente, publicador, admin, superAdmin].map((q) => portalAbiertoPara(f, q)), JSON.stringify(f)).toEqual(esperado)
    }
  })

  it('sin sesión, nunca', () => {
    expect(portalAbiertoPara({ portalCliente: true, portalClienteInterno: true }, null)).toBe(false)
  })
})

describe('la puerta de las APIs del portal (GET /api/portal/acceso)', () => {
  beforeEach(() => {
    estado.flags = { portalCliente: false, portalClienteInterno: false }
    estado.auth = null
    estado.exigirLlamado = 0
  })
  const pedir = () => acceso(new Request('https://vivebienn.com/api/portal/acceso'))

  it('cerrado: 404 sin leer siquiera la sesión', async () => {
    expect((await pedir()).status).toBe(404)
    expect(estado.exigirLlamado).toBe(0)
  })

  it('etapa interna: un cliente recibe 404; admin y super admin, 200', async () => {
    estado.flags.portalClienteInterno = true
    estado.auth = { rol: 'cliente', superAdmin: false }
    expect((await pedir()).status).toBe(404)
    estado.auth = { rol: 'publicador', superAdmin: false }
    expect((await pedir()).status).toBe(404)
    estado.auth = { rol: 'admin', superAdmin: false }
    expect((await pedir()).status).toBe(200)
    estado.auth = { rol: 'admin', superAdmin: true }
    expect((await pedir()).status).toBe(200)
  })

  it('etapa interna: sin sesión 401; suspendida 403 (lo decide exigir)', async () => {
    estado.flags.portalClienteInterno = true
    estado.auth = { status: 401 }
    expect((await pedir()).status).toBe(401)
    estado.auth = { status: 403 }
    expect((await pedir()).status).toBe(403)
  })

  it('abierto a todos: un cliente entra', async () => {
    estado.flags.portalCliente = true
    estado.auth = { rol: 'cliente', superAdmin: false }
    expect((await pedir()).status).toBe(200)
  })
})

describe('todo el portal usa la misma puerta', () => {
  const API = join(__dirname, '..', 'src/app/api/portal')
  const rutas = (d: string): string[] => readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? rutas(p) : n === 'route.ts' ? [p] : []
  })

  it('cada API de /api/portal pasa por exigirPortal, y ninguna por el flag suelto', () => {
    const lista = rutas(API)
    expect(lista.length).toBeGreaterThanOrEqual(2)
    for (const p of lista) {
      const codigo = readFileSync(p, 'utf8')
      const manejadores = (codigo.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []).length
      expect((codigo.match(/await exigirPortal\(req\)/g) ?? []).length, p).toBeGreaterThanOrEqual(manejadores)
      expect(codigo, p).not.toMatch(/flagEncendido\('portalCliente'\)/)
    }
  })

  it('el layout sólo cierra del todo cuando no hay ningún flag', () => {
    const layout = readFileSync(join(__dirname, '..', 'src/app/portal/layout.tsx'), 'utf8')
    expect(layout).toMatch(/if \(aperturaDelPortal\(await leerFlags\(\)\) === 'nadie'\) notFound\(\)/)
    expect(layout).toMatch(/robots: \{ index: false, follow: false \}/)
  })
})
