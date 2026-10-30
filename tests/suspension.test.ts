import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

/**
 * P3-03 (V-1.1.82): una cuenta suspendida no crea ni modifica favoritos ni
 * búsquedas. Se decide en el SERVIDOR.
 *
 * Dos niveles:
 *  1. El núcleo real de autorización (`crearAutorizador`) con dependencias
 *     falsas: sin red, sin Firebase, sin base.
 *  2. Las rutas reales con `exigir` simulado: una cuenta suspendida nunca
 *     llega a la base.
 */

// ── 2 · Simulación del módulo de autorización para las rutas ──
const estado = vi.hoisted(() => ({
  respuesta: null as null | { status: number; error: string },
  uid: 'uid-de-prueba',
  llamadasBase: 0,
  filtros: [] as [string, unknown][],
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  // Un «cliente» de base que registra lo que se le pide y devuelve vacío.
  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit', 'insert', 'delete', 'maybeSingle', 'single']) c[m] = () => c
    c.eq = (col: string, v: unknown) => { estado.filtros.push([col, v]); return c }
    c.then = (ok: (r: { data: unknown; error: null }) => unknown) => ok({ data: [], error: null })
    return c
  }
  return {
    ...real,
    exigir: async () => estado.respuesta
      ? { error: NextResponse.json({ error: estado.respuesta.error }, { status: estado.respuesta.status }) }
      : { perfil: { uid: estado.uid, email: null, emailVerified: true, rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null } },
    supabaseAdmin: () => {
      estado.llamadasBase++
      return { from: () => cadena() }
    },
  }
})

import { crearAutorizador } from '../src/lib/auth-server'
import * as favoritos from '../src/app/api/favoritos/route'
import * as busquedas from '../src/app/api/busquedas/route'

// ── 1 · El núcleo real ──
type Perfil = Parameters<Parameters<typeof crearAutorizador>[0]['denegado']>[0]
const perfil = (estadoCuenta: 'activo' | 'suspendido'): Perfil => ({
  uid: 'u1', email: 'x@y.com', emailVerified: true, rol: 'cliente', superAdmin: false, estado: estadoCuenta, nombre: null,
})

function autorizador(p: Perfil | null) {
  const denegados: string[] = []
  const pedirPerfil = vi.fn(async () => p!)
  const a = crearAutorizador({
    verificar: async () => (p ? { uid: p.uid, email: p.email, emailVerified: true } : null),
    perfil: pedirPerfil,
    denegado: async (_perfil, _req, que) => { denegados.push(que) },
  })
  return { a, denegados, pedirPerfil }
}

const req = (metodo: string) => new Request('https://vivebienn.com/api/favoritos', { method: metodo })

describe('núcleo de autorización: cuenta suspendida', () => {
  it('sin sesión: 401 y ni siquiera se busca el perfil', async () => {
    const { a, denegados, pedirPerfil } = autorizador(null)
    const r = await a(req('POST'), () => true, 'cuenta.propia')
    expect(r.error?.status).toBe(401)
    expect(pedirPerfil).not.toHaveBeenCalled()
    expect(denegados).toEqual([])
  })

  it('suspendida que intenta escribir: 403 y queda en la bitácora', async () => {
    for (const metodo of ['POST', 'DELETE', 'PATCH', 'PUT']) {
      const { a, denegados } = autorizador(perfil('suspendido'))
      const r = await a(req(metodo), () => true, 'cuenta.propia')
      expect(r.error?.status, metodo).toBe(403)
      expect(await r.error?.json()).toEqual({ error: 'Tu cuenta está suspendida.' })
      expect(denegados, metodo).toEqual(['cuenta.suspendida:cuenta.propia'])
    }
  })

  it('suspendida que sólo lee: 403, sin ruido en la bitácora', async () => {
    const { a, denegados } = autorizador(perfil('suspendido'))
    expect((await a(req('GET'), () => true, 'cuenta.propia')).error?.status).toBe(403)
    expect(denegados).toEqual([])
  })

  it('la suspensión gana aunque el permiso diga que sí', async () => {
    const { a } = autorizador(perfil('suspendido'))
    expect((await a(req('POST'), () => true, 'cuenta.propia')).perfil).toBeUndefined()
  })

  it('activa: pasa si el permiso dice que sí; si no, 403 con su bitácora', async () => {
    const ok = autorizador(perfil('activo'))
    expect((await ok.a(req('POST'), () => true, 'cuenta.propia')).perfil?.uid).toBe('u1')
    const no = autorizador(perfil('activo'))
    expect((await no.a(req('POST'), () => false, 'panel.admin')).error?.status).toBe(403)
    expect(no.denegados).toEqual(['panel.admin'])
  })
})

// ── Rutas reales ──
beforeEach(() => {
  estado.respuesta = null
  estado.llamadasBase = 0
  estado.filtros = []
})

const conCuerpo = (url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`https://vivebienn.com${url}`, { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined, headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } })

describe('favoritos y búsquedas con una cuenta suspendida', () => {
  const casos: [string, () => Promise<Response>][] = [
    ['GET favoritos', () => favoritos.GET(conCuerpo('/api/favoritos', 'GET'))],
    ['POST favoritos (guardar o quitar)', () => favoritos.POST(conCuerpo('/api/favoritos', 'POST', { propiedadId: 'p-1' }))],
    ['GET búsquedas', () => busquedas.GET(conCuerpo('/api/busquedas', 'GET'))],
    ['POST búsquedas', () => busquedas.POST(conCuerpo('/api/busquedas', 'POST', { filtros: { op: 'venta' } }))],
    ['DELETE búsquedas', () => busquedas.DELETE(conCuerpo('/api/busquedas?id=3', 'DELETE'))],
  ]

  for (const [nombre, llamar] of casos) {
    it(`${nombre}: 403 y la base no se toca`, async () => {
      estado.respuesta = { status: 403, error: 'Tu cuenta está suspendida.' }
      const r = await llamar()
      expect(r.status).toBe(403)
      expect(estado.llamadasBase).toBe(0)
    })
  }

  it('sin sesión: 401 y la base no se toca', async () => {
    estado.respuesta = { status: 401, error: 'Inicia sesión para continuar.' }
    expect((await favoritos.POST(conCuerpo('/api/favoritos', 'POST', { propiedadId: 'p-1' }))).status).toBe(401)
    expect(estado.llamadasBase).toBe(0)
  })

  it('cuenta activa: el uid sale del perfil, nunca del cuerpo', async () => {
    estado.uid = 'uid-real'
    await favoritos.POST(conCuerpo('/api/favoritos', 'POST', { propiedadId: 'p-1', uid: 'uid-ajeno' }))
    await busquedas.DELETE(conCuerpo('/api/busquedas?id=3', 'DELETE'))
    const uids = estado.filtros.filter(([c]) => c === 'uid').map(([, v]) => v)
    expect(uids.length).toBeGreaterThan(0)
    expect(new Set(uids)).toEqual(new Set(['uid-real']))
  })
})
