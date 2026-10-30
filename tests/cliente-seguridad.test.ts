import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CLIENTE — regresiones de seguridad (fase «Cliente + Publicador»).
 *
 *  · Un cliente no puede elevar su rol desde el navegador (PATCH /api/usuarios/me).
 *  · `/api/leads` no entrega `select('*')` a quien no es admin, y sólo lo suyo.
 *  · Un cliente recibe 403 en las APIs de publicador y de administración.
 */

const bd = vi.hoisted(() => ({
  perfil: { uid: 'A', email: 'a@ejemplo.test', emailVerified: true, rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null } as Record<string, unknown>,
  upserts: [] as Array<Record<string, unknown>>,
  selects: [] as string[],
  eqs: [] as Array<[string, unknown]>,
  leads: [
    { id: '1', email: 'a@ejemplo.test', interes: 'Nave de A', mensaje: 'soy A', propiedad_id: 'pA', created_at: '2026-09-01T00:00:00Z' },
    { id: '2', email: 'b@ejemplo.test', interes: 'Casa de B', mensaje: 'soy B', propiedad_id: 'pB', created_at: '2026-09-02T00:00:00Z' },
  ] as Array<Record<string, unknown>>,
  // Solicitudes LIGADAS A LA CUENTA (/api/contacto): una de A y una de B.
  solicitudes: [
    { id: 7, cliente_uid: 'A', propiedad_titulo: 'Casa de A', mensaje: 'por cuenta A', propiedad_id: 'pA', creado_en: '2026-09-05T00:00:00Z' },
    { id: 8, cliente_uid: 'B', propiedad_titulo: 'Casa de B', mensaje: 'por cuenta B', propiedad_id: 'pB', creado_en: '2026-09-06T00:00:00Z' },
  ] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla = 'leads'): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    const filtros: Array<[string, unknown]> = []
    c.select = (cols: string) => { bd.selects.push(cols); return c }
    c.eq = (k: string, v: unknown) => { bd.eqs.push([k, v]); filtros.push([k, v]); return c }
    c.order = () => c
    c.limit = () => c
    c.maybeSingle = async () => ({ data: null, error: null })
    c.upsert = async (f: Record<string, unknown>) => { bd.upserts.push(f); return { error: null } }
    // Como la base: aplica los filtros a filas de DOS cuentas distintas.
    c.then = (r: (v: unknown) => unknown) => r({ data: (tabla === 'solicitudes_contacto' ? bd.solicitudes : bd.leads).filter((f) => filtros.every(([k, v]) => f[k] === v)), error: null })
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: 'A', email: 'a@ejemplo.test', emailVerified: true }),
    perfil: async () => bd.perfil as Awaited<ReturnType<typeof real.getPerfil>>,
    denegado: async () => {},
  })
  return {
    ...real,
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    requireAdmin: (req: Request) => autorizar()(req, (p) => puede(p, 'panel.admin'), 'panel.admin'),
    verifyIdToken: async () => ({ uid: 'A', email: 'a@ejemplo.test', emailVerified: true }),
    getPerfil: async () => bd.perfil,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t) }),
  }
})
vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))

import { PATCH as guardarPerfil } from '../src/app/api/usuarios/me/route'
import { GET as leads } from '../src/app/api/leads/route'
import { GET as adminUsuarios } from '../src/app/api/admin/usuarios/route'
import { GET as publicadorPropiedades } from '../src/app/api/publicador/propiedades/route'

const req = (url: string, init: RequestInit = {}) =>
  new Request(`https://vivebienn.com${url}`, { ...init, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } })

beforeEach(() => {
  bd.perfil = { uid: 'A', email: 'a@ejemplo.test', emailVerified: true, rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null }
  bd.upserts = []; bd.selects = []; bd.eqs = []
})

describe('un cliente no se eleva el rol desde el navegador', () => {
  for (const rol of ['publicador', 'admin', 'super_admin']) {
    it(`PATCH rol=${rol} → 403 y no se escribe`, async () => {
      const r = await guardarPerfil(req('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify({ rol }) }))
      expect(r.status).toBe(403)
      expect(bd.upserts.some((u) => 'rol' in u)).toBe(false)
    })
  }

  it('«superAdmin» o «estado» en el cuerpo no llegan a la base', async () => {
    await guardarPerfil(req('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify({ nombre: 'Ana', superAdmin: true, estado: 'activo', uid: 'B' }) }))
    for (const u of bd.upserts) {
      expect(u).not.toHaveProperty('superAdmin')
      expect(u).not.toHaveProperty('estado')
      expect(u.uid).toBe('A')
    }
  })
})

describe('/api/leads: el cliente ve lo suyo y sólo las columnas que se pintan', () => {
  it('no pide select(*) y filtra por el correo VERIFICADO del token', async () => {
    const r = await leads(req('/api/leads?email=otro@ejemplo.test'))
    expect(r.status).toBe(200)
    // La fila de B existe en la «base» y NO llega a A.
    const filas = await r.json() as Array<Record<string, unknown>>
    // Lo suyo = su consulta por CUENTA (s-7) + su formulario por correo verificado (1), de la más nueva a la más vieja; nada de B.
    expect(filas.map((f) => f.id)).toEqual(['s-7', '1'])
    expect(JSON.stringify(filas)).not.toContain('soy B')
    expect(JSON.stringify(filas)).not.toContain('por cuenta B')
    // Columnas EXPLÍCITAS en las dos lecturas (nunca select(*)); la de la cuenta no trae consentimiento ni teléfono.
    expect([...bd.selects].sort()).toEqual(['id, interes, mensaje, propiedad_id, created_at', 'id, propiedad_titulo, mensaje, propiedad_id, creado_en'])
    expect(bd.selects).not.toContain('*')
    // Los dos filtros salen del TOKEN verificado (uid y correo), nunca de la URL.
    expect(bd.eqs).toContainEqual(['email', 'a@ejemplo.test'])
    expect(bd.eqs).toContainEqual(['cliente_uid', 'A'])
    expect(bd.eqs.some(([, v]) => v === 'otro@ejemplo.test')).toBe(false)
  })

  it('correo sin verificar → lista vacía (aunque exista una solicitud con ese correo)', async () => {
    bd.perfil = { ...bd.perfil, emailVerified: false }
    const r = await leads(req('/api/leads'))
    // Sin correo verificado NO se lee nada por correo; lo que sí ve es lo que hizo con su CUENTA (por uid, no depende del correo).
    const filas = await r.json() as Array<Record<string, unknown>>
    expect(filas.map((f) => f.id)).toEqual(['s-7'])
    expect(bd.eqs.some(([k]) => k === 'email')).toBe(false)
  })

  it('un admin sí recibe todo', async () => {
    bd.perfil = { ...bd.perfil, rol: 'admin' }
    const filas = await (await leads(req('/api/leads'))).json() as unknown[]
    expect(bd.selects).toEqual(['*'])
    expect(filas).toHaveLength(2)
  })
})

describe('un cliente no entra a lo de otros roles', () => {
  it('/api/admin/usuarios → 403', async () => {
    expect((await adminUsuarios(req('/api/admin/usuarios'))).status).toBe(403)
  })
  it('/api/publicador/propiedades → 403', async () => {
    expect((await publicadorPropiedades(req('/api/publicador/propiedades'))).status).toBe(403)
  })
})
