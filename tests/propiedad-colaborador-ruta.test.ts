import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `PUT /api/propiedades/[id]/colaborador` (migración 57): solo el equipo, solo un colaborador ACTIVO del directorio, necesita el origen guardado y falla cerrado sin la migración.
 * Y el GET de `/interno` solo entrega el directorio (sin teléfono ni correo) al equipo: el dueño publicador no recibe nada, ni el id dentro de `origen`.
 */
type Perfil = { uid: string; email: string; rol: string; superAdmin: boolean }
const UUID_C = '11111111-1111-4111-8111-111111111111'
const estado = vi.hoisted(() => ({
  perfil: null as null | Perfil,
  esDueno: false,
  origen: { data: { propiedad_id: 'p1', colaborador_id: null } as unknown, error: null as null | { message: string; code?: string } },
  colaborador: { data: { id: '11111111-1111-4111-8111-111111111111', activo: true } as unknown, error: null as null | { message: string } },
  lista: [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Laura Mendoza', empresa: 'Inmobiliaria Bajío', activo: true, telefono: '4771234567', correo: 'laura@x.mx' }, { id: '22222222-2222-4222-8222-222222222222', nombre: 'Casas del Norte', empresa: null, activo: false, telefono: null, correo: null }] as unknown[],
  updates: [] as Array<Record<string, unknown>>,
  bitacora: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  const tabla = (nombre: string) => {
    const c: Record<string, unknown> = {
      select: () => c, order: () => c, limit: () => c, eq: () => c,
      update: (v: Record<string, unknown>) => { estado.updates.push(v); return c },
      maybeSingle: () => Promise.resolve(nombre === 'propiedad_origen' ? estado.origen : nombre === 'colaboradores' ? estado.colaborador : nombre === 'propiedades' ? { data: { id: 'p1', owner_id: estado.esDueno ? 'dueno-1' : null }, error: null } : { data: null, error: null }),
      then: (res: (v: unknown) => unknown) => res(nombre === 'colaboradores' ? { data: estado.lista, error: null } : nombre === 'propiedad_notas' ? { data: [], error: null } : { data: null, error: null }),
    }
    return c
  }
  return {
    ...real,
    exigir: async (_req: Request, permiso: string) => (estado.perfil && puede(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({ from: tabla }),
  }
})
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { estado.bitacora.push(e) } }))
vi.mock('@/lib/portal/exigir-portal', () => ({ portalCerradoParaEscribir: async () => null }))

const SUPER: Perfil = { uid: 'su-n', email: 'super@vb.mx', rol: 'admin', superAdmin: true }
const ADMIN: Perfil = { uid: 'ad-n', email: 'admin@vb.mx', rol: 'admin', superAdmin: false }
const PUBLICADOR: Perfil = { uid: 'dueno-1', email: 'dueno@vb.mx', rol: 'publicador', superAdmin: false }
const put = (cuerpo: unknown) => new Request('https://vb.test/api/propiedades/p1/colaborador', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const ctx = { params: Promise.resolve({ id: 'p1' }) }

beforeEach(() => {
  estado.perfil = ADMIN; estado.esDueno = false; estado.updates = []; estado.bitacora = []
  estado.origen = { data: { propiedad_id: 'p1', colaborador_id: null }, error: null }
  estado.colaborador = { data: { id: UUID_C, activo: true }, error: null }
})

describe('PUT /api/propiedades/[id]/colaborador', () => {
  it('el equipo liga un colaborador activo del directorio y queda en la bitácora SOLO con ids', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/colaborador/route')
    const r = await PUT(put({ colaborador_id: UUID_C }), ctx)
    expect(r.status).toBe(200)
    expect(estado.updates[0]).toMatchObject({ colaborador_id: UUID_C })
    expect(estado.bitacora[0]).toMatchObject({ accion: 'propiedad.colaborador_ligado', antes: { colaborador_id: null }, despues: { colaborador_id: UUID_C } })
    expect(JSON.stringify(estado.bitacora)).not.toMatch(/Laura|laura@|4771234567/)
  })
  it('se puede quitar (null)', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/colaborador/route')
    expect((await PUT(put({ colaborador_id: null }), ctx)).status).toBe(200)
    expect(estado.updates[0]).toMatchObject({ colaborador_id: null })
  })
  it('un publicador (aunque sea el dueño) y una sesión ausente NO pueden', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/colaborador/route')
    estado.perfil = PUBLICADOR
    expect((await PUT(put({ colaborador_id: UUID_C }), ctx)).status).toBe(403)
    estado.perfil = null
    expect((await PUT(put({ colaborador_id: UUID_C }), ctx)).status).toBe(401)
    expect(estado.updates).toEqual([])
  })
  it('rechaza lo que no es un id del directorio, a un colaborador desactivado o inexistente, y sin origen guardado', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/colaborador/route')
    expect((await PUT(put({ colaborador_id: 'cualquier-cosa' }), ctx)).status).toBe(400)
    expect((await PUT(put({}), ctx)).status).toBe(400)
    estado.colaborador = { data: null, error: null }
    expect((await PUT(put({ colaborador_id: UUID_C }), ctx)).status).toBe(404)
    estado.colaborador = { data: { id: UUID_C, activo: false }, error: null }
    expect((await PUT(put({ colaborador_id: UUID_C }), ctx)).status).toBe(409)
    estado.origen = { data: null, error: null }
    const r = await PUT(put({ colaborador_id: UUID_C }), ctx)
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('sin_origen')
    expect(estado.updates).toEqual([])
  })
  it('falla CERRADO (503) si la migración 57 no está aplicada', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/colaborador/route')
    estado.origen = { data: null, error: { message: 'column propiedad_origen.colaborador_id does not exist', code: '42703' } }
    const r = await PUT(put({ colaborador_id: UUID_C }), ctx)
    expect(r.status).toBe(503)
    expect(estado.updates).toEqual([])
  })
})

describe('GET /api/propiedades/[id]/interno · directorio', () => {
  const get = () => new Request('https://vb.test/api/propiedades/p1/interno')
  it('el equipo recibe el directorio ACTIVO (id, nombre, empresa), sin teléfono ni correo, y el ligado', async () => {
    const { GET } = await import('../src/app/api/propiedades/[id]/interno/route')
    estado.origen = { data: { propiedad_id: 'p1', origen_tipo: 'trato_directo', colaborador_id: UUID_C }, error: null }
    const r = await GET(get(), ctx)
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.colaboradores).toEqual([{ id: UUID_C, nombre: 'Laura Mendoza', empresa: 'Inmobiliaria Bajío' }])
    expect(j.colaborador).toEqual({ id: UUID_C, nombre: 'Laura Mendoza', empresa: 'Inmobiliaria Bajío' })
    expect(j.puedeCrearColaborador).toBe(false) // un admin que no es Super Admin no crea
    expect(JSON.stringify(j)).not.toMatch(/4771234567|laura@x\.mx/)
    expect(j.origen.colaborador_id).toBeUndefined()
    estado.perfil = SUPER
    expect((await (await GET(get(), ctx)).json()).puedeCrearColaborador).toBe(true)
  })
  it('el dueño publicador no recibe NADA del directorio (ni el id dentro de origen)', async () => {
    const { GET } = await import('../src/app/api/propiedades/[id]/interno/route')
    estado.perfil = PUBLICADOR; estado.esDueno = true
    estado.origen = { data: { propiedad_id: 'p1', origen_tipo: 'trato_directo', colaborador_id: UUID_C }, error: null }
    const j = await (await GET(get(), ctx)).json()
    expect(j.colaboradores).toBeUndefined(); expect(j.colaborador).toBeUndefined(); expect(j.puedeCrearColaborador).toBeUndefined()
    expect(JSON.stringify(j)).not.toContain(UUID_C)
  })
})
