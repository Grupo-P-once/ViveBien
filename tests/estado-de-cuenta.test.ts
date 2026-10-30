import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.87 · Etapa 1 — El estado de la cuenta cierra por lista blanca.
 *
 * Antes de la migración 25, `resolverPerfil` normalizaba cualquier valor que
 * no fuera `suspendido` ni `pendiente` a **`activo`**. En cuanto la base
 * admite `eliminada`, esa línea convierte una lápida en una cuenta viva: el
 * fallo se abre solo.
 *
 * Aquí se prueba la regla pura, el autorizador REAL con sus dependencias
 * inyectadas, y las tres rutas que hasta ahora se saltaban la barrera.
 *
 * Nada de esto borra cuentas: la eliminación todavía no está implementada.
 */

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; estado: string; rol: string },
  denegados: [] as string[],
}))

vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  // Una cadena de Supabase permisiva: aquí no se prueba la consulta, se prueba
  // la puerta. Devuelve vacío para todo y acepta cualquier escritura.
  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'ilike', 'upsert', 'update', 'insert', 'gte', 'lt', 'in']) {
      c[m] = () => c
    }
    c.maybeSingle = async () => ({ data: null, error: null })
    c.single = async () => ({ data: null, error: null })
    c.then = (r: (v: unknown) => unknown) => r({ data: [], error: null })
    return c
  }

  // EL MISMO autorizador de producción, con los dos extremos inyectados.
  const autorizar = real.crearAutorizador({
    verificar: async () => (mundo.sesion ? { uid: mundo.sesion.uid, email: 'quien@ejemplo.test', emailVerified: true } : null),
    perfil: async (u) => ({
      ...u,
      rol: mundo.sesion!.rol as 'cliente' | 'publicador' | 'admin',
      superAdmin: false,
      estado: mundo.sesion!.estado as never,
      nombre: null,
    }),
    denegado: async (_p, _req, que) => { mundo.denegados.push(que) },
  })

  return {
    ...real,
    supabaseAdmin: () => ({ from: () => cadena() }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      autorizar(req, (perfil) => puede(perfil, permiso), permiso),
  }
})

import { ESTADOS_QUE_ENTRAN, resolverPerfil, revisarEstado } from '../src/lib/auth-server'
import { GET as me, PATCH as mePatch } from '../src/app/api/usuarios/me/route'
import { GET as leads } from '../src/app/api/leads/route'
import { POST as firma } from '../src/app/api/medios/firma/route'

const QUIEN = { uid: 'u-1', email: 'quien@ejemplo.test', emailVerified: true }
const pet = (metodo = 'GET', cuerpo?: unknown) =>
  new Request('https://vivebienn.com/api/x', {
    method: metodo,
    headers: { authorization: 'Bearer da-igual', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })

beforeEach(() => {
  mundo.sesion = null
  mundo.denegados = []
})

describe('resolverPerfil: lista blanca, no lista negra', () => {
  const estado = (fila: Record<string, unknown> | null) => resolverPerfil(QUIEN, fila).estado

  it('SIN FILA vale como activa: si no, nadie podría registrarse', () => {
    expect(estado(null)).toBe('activo')
    expect(resolverPerfil(QUIEN, null).rol).toBe('cliente')
  })

  it('los cuatro estados que guarda la base se respetan tal cual', () => {
    for (const e of ['activo', 'suspendido', 'pendiente', 'eliminada']) {
      expect(estado({ estado: e }), e).toBe(e)
    }
  })

  it('EL FALLO QUE SE CIERRA: una cuenta eliminada NO se resuelve como activa', () => {
    expect(estado({ estado: 'eliminada' })).toBe('eliminada')
    expect(estado({ estado: 'eliminada' })).not.toBe('activo')
  })

  it('un estado desconocido NO se normaliza a activo', () => {
    for (const e of ['borrada', 'ELIMINADA', 'activa', '', 'cancelada']) {
      expect(estado({ estado: e }), e).toBe('desconocido')
    }
  })

  it('una fila con el estado corrupto (no texto) también es desconocido', () => {
    for (const e of [123, null, true, {}, []]) {
      expect(estado({ estado: e }), JSON.stringify(e)).toBe('desconocido')
    }
    expect(estado({ rol: 'cliente' })).toBe('desconocido')
  })

  it('el rol sigue decidiéndose igual que antes', () => {
    expect(resolverPerfil(QUIEN, { rol: 'super_admin', estado: 'activo' })).toMatchObject({ rol: 'admin', superAdmin: true })
    expect(resolverPerfil(QUIEN, { rol: 'publicador', estado: 'activo' })).toMatchObject({ rol: 'publicador', superAdmin: false })
    expect(resolverPerfil(QUIEN, { rol: 'inventado', estado: 'activo' })).toMatchObject({ rol: 'cliente' })
  })
})

describe('revisarEstado: quién entra y qué se le dice', () => {
  it('sólo entran activo y pendiente', () => {
    expect([...ESTADOS_QUE_ENTRAN].sort()).toEqual(['activo', 'pendiente'])
    expect(revisarEstado('activo')).toBeNull()
    expect(revisarEstado('pendiente')).toBeNull()
  })

  it('eliminada: 403, y a la bitácora SIEMPRE', () => {
    expect(revisarEstado('eliminada')).toMatchObject({ status: 403, que: 'cuenta.eliminada', bitacora: 'siempre' })
  })

  it('suspendida: 403, a la bitácora sólo en escrituras (como hasta ahora)', () => {
    expect(revisarEstado('suspendido')).toMatchObject({ status: 403, que: 'cuenta.suspendida', bitacora: 'escrituras' })
  })

  it('desconocido: 503 y NO a la bitácora — es nuestro fallo, no suyo', () => {
    expect(revisarEstado('desconocido')).toMatchObject({ status: 503, bitacora: 'nunca' })
  })

  it('ningún mensaje filtra datos de la cuenta', () => {
    for (const e of ['eliminada', 'suspendido', 'desconocido'] as const) {
      expect(revisarEstado(e)!.mensaje).not.toMatch(/@|uid|u-1/)
    }
  })
})

describe('las tres rutas que se saltaban la barrera', () => {
  const rutas: Array<[string, (r: Request) => Promise<Response>, string, unknown]> = [
    ['/api/usuarios/me (GET)', (r) => me(r), 'GET', undefined],
    ['/api/usuarios/me (PATCH)', (r) => mePatch(r), 'PATCH', { nombre: 'Quien' }],
    ['/api/leads', (r) => leads(r), 'GET', undefined],
    ['/api/medios/firma', (r) => firma(r), 'POST', {}],
  ]

  for (const [nombre, llamar, metodo, cuerpo] of rutas) {
    describe(nombre, () => {
      it('sin sesión → 401', async () => {
        mundo.sesion = null
        expect((await llamar(pet(metodo, cuerpo))).status).toBe(401)
      })

      it('CUENTA ELIMINADA → 403, y queda en la bitácora', async () => {
        mundo.sesion = { uid: 'u-1', estado: 'eliminada', rol: 'cliente' }
        const res = await llamar(pet(metodo, cuerpo))
        expect(res.status).toBe(403)
        expect((await res.json()).error).toMatch(/eliminada/i)
        expect(mundo.denegados.some((d) => d.startsWith('cuenta.eliminada:'))).toBe(true)
      })

      it('cuenta suspendida → sigue bloqueada (403)', async () => {
        mundo.sesion = { uid: 'u-1', estado: 'suspendido', rol: 'cliente' }
        const res = await llamar(pet(metodo, cuerpo))
        expect(res.status).toBe(403)
        expect((await res.json()).error).toMatch(/suspendida/i)
      })

      it('estado desconocido → 503, sin bitácora', async () => {
        mundo.sesion = { uid: 'u-1', estado: 'vete-a-saber', rol: 'cliente' }
        const res = await llamar(pet(metodo, cuerpo))
        expect(res.status).toBe(503)
        expect(mundo.denegados).toEqual([])
      })

      it('cuenta ACTIVA: pasa la puerta (el comportamiento de siempre)', async () => {
        mundo.sesion = { uid: 'u-1', estado: 'activo', rol: 'cliente' }
        const res = await llamar(pet(metodo, cuerpo))
        expect([401, 403, 503]).not.toContain(res.status)
      })
    })
  }
})

describe('la firma de Cloudinary, que es lo que más duele', () => {
  it('una cuenta eliminada NO consigue firma de subida', async () => {
    mundo.sesion = { uid: 'u-1', estado: 'eliminada', rol: 'publicador' }
    const res = await firma(pet('POST', { proposito: 'perfil', nombre: 'foto.jpg' }))
    expect(res.status).toBe(403)
    const cuerpo = await res.json()
    expect(cuerpo.signature).toBeUndefined()
    expect(cuerpo.apiKey).toBeUndefined()
    expect(JSON.stringify(cuerpo)).not.toMatch(/cloudinary/i)
  })

  it('y tampoco una suspendida', async () => {
    mundo.sesion = { uid: 'u-1', estado: 'suspendido', rol: 'publicador' }
    const res = await firma(pet('POST', { proposito: 'perfil', nombre: 'foto.jpg' }))
    expect(res.status).toBe(403)
    expect((await res.json()).signature).toBeUndefined()
  })
})
