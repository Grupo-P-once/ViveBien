import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUBLICADOR — regresiones de seguridad (P1).
 *
 *  · Publicador B no lee, edita, mueve ni borra lo de A (IDOR → 403).
 *  · Mientras está en revisión o publicada, un publicador no la edita (409), en el SERVIDOR.
 *  · No publica directo, no se auto-aprueba, no se asigna dueño ni folio ni slug.
 *  · No recibe el correo del revisor ni el contacto interno.
 *  · Un cliente (rol bajado) o una cuenta suspendida pierden el acceso.
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' } as Record<string, unknown>,
  props: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: unknown; cambios: Record<string, unknown> }>,
  inserts: [] as Array<Record<string, unknown>>,
  borrados: [] as unknown[],
}))

const fila = (id: string, owner: string, estado: string) => ({
  id, owner_id: owner, estado_pub: estado, titulo: `Prop ${id}`, precio: 1000, folio: 'VB-2026-00001',
  revisado_por: 'admin@vivebienn.com', whatsapp: '4778118559', telefono: '477', nota_moderacion: 'revisar fotos',
})

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    let modo: 'select' | 'update' | 'delete' = 'select'
    let cambios: Record<string, unknown> = {}
    const c: Record<string, unknown> = {}
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    const filas = () => (tabla === 'propiedades' ? mundo.props : [])
      .filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloConteo = true; return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.order = () => c
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.update = (f: Record<string, unknown>) => { modo = 'update'; cambios = f; return c }
    c.delete = () => { modo = 'delete'; return c }
    c.insert = async (f: Record<string, unknown>) => { mundo.inserts.push(f); return { error: null } }
    c.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
    c.then = (r: (v: unknown) => unknown) => {
      if (modo === 'update') mundo.updates.push({ id: filtros.find(([k]) => k === 'id')?.[1], cambios })
      if (modo === 'delete') mundo.borrados.push(filtros.find(([k]) => k === 'id')?.[1])
      if (soloConteo) return r({ data: null, error: null, count: filas().length })
      return r({ data: filas(), error: null })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid as string, email: mundo.sesion.email as string, emailVerified: true }),
    perfil: async (u) => ({ ...u, emailVerified: true, nombre: null, ...mundo.sesion }) as Awaited<ReturnType<typeof real.getPerfil>>,
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t) }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { GET as listar, POST as crear } from '../src/app/api/publicador/propiedades/route'
import { GET as leer, PATCH as editar, DELETE as borrar } from '../src/app/api/admin/propiedades/[id]/route'
import { POST as estado } from '../src/app/api/propiedades/[id]/estado/route'
import { fijarFlags, restablecerFlags } from './dobles/flags-portal'

const R = (url: string, init: RequestInit = {}) =>
  new Request(`https://vivebienn.com${url}`, { ...init, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const PUBLICADOR_A = { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' }
const PUBLICADOR_B = { uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', superAdmin: false, estado: 'activo' }
const ADMIN = { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin', superAdmin: false, estado: 'activo' }

beforeEach(() => {
  mundo.sesion = PUBLICADOR_A
  mundo.props = [fila('pA-borrador', 'A', 'borrador'), fila('pA-publicada', 'A', 'publicada'), fila('pA-revision', 'A', 'en_revision'), fila('pB', 'B', 'borrador')]
  mundo.updates = []; mundo.inserts = []; mundo.borrados = []
  restablecerFlags()
})

describe('IDOR entre publicadores', () => {
  it('el listado de A no trae lo de B', async () => {
    const ids = ((await (await listar(R('/api/publicador/propiedades'))).json()) as Array<{ id: string }>).map((p) => p.id)
    expect(ids).toContain('pA-borrador')
    expect(ids).not.toContain('pB')
  })

  it('A no lee la propiedad de B (403)', async () => {
    expect((await leer(R('/x'), ctx('pB'))).status).toBe(403)
  })

  it('A no edita la propiedad de B (403, nada se escribe)', async () => {
    const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ precio: 1 }) }), ctx('pB'))
    expect(r.status).toBe(403)
    expect(mundo.updates).toHaveLength(0)
  })

  it('A no mueve de estado la propiedad de B (403)', async () => {
    const r = await estado(R('/x', { method: 'POST', body: JSON.stringify({ estado: 'en_revision' }) }), ctx('pB'))
    expect(r.status).toBe(403)
    expect(mundo.updates).toHaveLength(0)
  })

  it('A no borra nada: DELETE es sólo de admin (403)', async () => {
    expect((await borrar(R('/x', { method: 'DELETE' }), ctx('pA-borrador'))).status).toBe(403)
    expect(mundo.borrados).toHaveLength(0)
  })

  it('el caso espejo: B tampoco toca lo de A', async () => {
    mundo.sesion = PUBLICADOR_B
    expect((await leer(R('/x'), ctx('pA-borrador'))).status).toBe(403)
  })
})

describe('bloqueo de edición en el servidor', () => {
  for (const id of ['pA-publicada', 'pA-revision']) {
    it(`el dueño no edita ${id} (409): ni precio ni fotos`, async () => {
      const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ precio: 1, fotos: ['http://x/y.jpg'] }) }), ctx(id))
      expect(r.status).toBe(409)
      expect(mundo.updates).toHaveLength(0)
    })
  }

  it('el dueño sí edita su borrador', async () => {
    const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ descripcion: 'Nueva' }) }), ctx('pA-borrador'))
    expect(r.status).toBe(200)
    expect(mundo.updates).toHaveLength(1)
  })

  it('un admin sí puede editar una publicada', async () => {
    mundo.sesion = ADMIN
    const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ descripcion: 'Corrección' }) }), ctx('pA-publicada'))
    expect(r.status).toBe(200)
  })
})

describe('el publicador no se salta a la casa', () => {
  it('no publica directo: borrador → publicada es 403', async () => {
    const r = await estado(R('/x', { method: 'POST', body: JSON.stringify({ estado: 'publicada' }) }), ctx('pA-borrador'))
    expect(r.status).toBe(403)
    expect(mundo.updates).toHaveLength(0)
  })

  it('no se aprueba a sí mismo: en_revision → publicada es 403', async () => {
    const r = await estado(R('/x', { method: 'POST', body: JSON.stringify({ estado: 'publicada' }) }), ctx('pA-revision'))
    expect(r.status).toBe(403)
  })

  it('no se asigna dueño, folio, slug ni estado desde el cuerpo', async () => {
    await crear(R('/api/publicador/propiedades', { method: 'POST', body: JSON.stringify({ titulo: 'Casa', owner_id: 'B', folio: 'VB-2026-99999', slug: 'mia', estado_pub: 'publicada' }) }))
    const f = mundo.inserts[0]
    expect(f.owner_id).toBe('A')
    expect(f.estado_pub).toBe('borrador')
    expect(f.folio).toBeUndefined()
    expect(f.slug).toBeUndefined()
  })

  it('editar tampoco acepta owner_id, folio ni estado_pub', async () => {
    await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ descripcion: 'ok', owner_id: 'B', folio: 'X', estado_pub: 'publicada' }) }), ctx('pA-borrador'))
    const c = mundo.updates[0].cambios
    expect(c).not.toHaveProperty('owner_id')
    expect(c).not.toHaveProperty('folio')
    expect(c).not.toHaveProperty('estado_pub')
  })
})

describe('lo interno no sale hacia el publicador', () => {
  it('ni el listado ni la ficha traen revisado_por, whatsapp ni telefono', async () => {
    const lista = (await (await listar(R('/api/publicador/propiedades'))).json()) as Array<Record<string, unknown>>
    const ficha = (await (await leer(R('/x'), ctx('pA-borrador'))).json()) as { propiedad: Record<string, unknown> }
    for (const p of [...lista, ficha.propiedad]) {
      expect(p).not.toHaveProperty('revisado_por')
      expect(p).not.toHaveProperty('whatsapp')
      expect(p).not.toHaveProperty('telefono')
    }
    // Lo que sí necesita para corregir: el motivo de la moderación y el folio.
    expect(ficha.propiedad.nota_moderacion).toBe('revisar fotos')
    expect(ficha.propiedad.folio).toBe('VB-2026-00001')
  })

  it('un admin sí recibe todo', async () => {
    mundo.sesion = ADMIN
    const lista = (await (await listar(R('/api/publicador/propiedades'))).json()) as Array<Record<string, unknown>>
    expect(lista[0]).toHaveProperty('revisado_por')
  })
})

describe('la puerta', () => {
  it('quien dejó de ser publicador (ahora cliente) recibe 403 en todo', async () => {
    mundo.sesion = { ...PUBLICADOR_A, rol: 'cliente' }
    expect((await listar(R('/x'))).status).toBe(403)
    expect((await leer(R('/x'), ctx('pA-borrador'))).status).toBe(403)
    expect((await editar(R('/x', { method: 'PATCH', body: '{}' }), ctx('pA-borrador'))).status).toBe(403)
  })

  it('cuenta suspendida: 403', async () => {
    mundo.sesion = { ...PUBLICADOR_A, estado: 'suspendido' }
    expect((await listar(R('/x'))).status).toBe(403)
    expect((await editar(R('/x', { method: 'PATCH', body: '{}' }), ctx('pA-borrador'))).status).toBe(403)
  })
})

// ─── R8.6 · el portal CERRADO no deja escribir propiedades a quien publica ───────────────────────────────────────────────────────
// Con `portalCliente` apagado (o en etapa interna y sin ser de la casa) el servidor no deja crear, editar ni mover de estado: la
// pantalla ya no ofrece nada (aviso de «no disponible»), pero una llamada a mano tampoco escribe. Quien administra no depende del portal.
describe('R8.6 · portal cerrado: escrituras de propiedades', () => {
  const ASOCIADO = { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', tipoPublicador: 'asociado', superAdmin: false, estado: 'activo' }
  const escrituras = async () => [
    await crear(R('/api/publicador/propiedades', { method: 'POST', body: JSON.stringify({ titulo: 'Nueva' }) })),
    await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ precio: 2000 }) }), ctx('pA-borrador')),
    await estado(R('/x', { method: 'POST', body: JSON.stringify({ estado: 'en_revision' }) }), ctx('pA-borrador')),
  ]

  const casos: Array<[string, Record<string, unknown>, Partial<Record<'portalCliente' | 'portalClienteInterno', boolean>>]> = [
    ['Publicador con el portal apagado', PUBLICADOR_A, { portalCliente: false }],
    ['Asociado con el portal apagado', ASOCIADO, { portalCliente: false }],
    ['Publicador en etapa interna (solo la casa)', PUBLICADOR_A, { portalCliente: false, portalClienteInterno: true }],
    ['Asociado en etapa interna (solo la casa)', ASOCIADO, { portalCliente: false, portalClienteInterno: true }],
  ]
  for (const [nombre, sesion, flags] of casos) {
    it(`${nombre}: crear, editar y cambiar de estado → 403 «portal_cerrado» y NO se escribe nada`, async () => {
      mundo.sesion = sesion; fijarFlags(flags)
      const r = await escrituras()
      expect(r.map((x) => x.status)).toEqual([403, 403, 403])
      for (const x of r) expect((await x.json()).codigo).toBe('portal_cerrado')
      expect(mundo.inserts).toHaveLength(0)
      expect(mundo.updates).toHaveLength(0)
    })
  }

  it('con el portal abierto a todos, Publicador y Asociado conservan el flujo aprobado (no es 403 por el flag)', async () => {
    for (const sesion of [PUBLICADOR_A, ASOCIADO]) {
      mundo.sesion = sesion; fijarFlags({ portalCliente: true })
      mundo.inserts = []; mundo.updates = []
      const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ precio: 2000 }) }), ctx('pA-borrador'))
      expect(r.status).toBe(200)
      expect(mundo.updates).toHaveLength(1)
    }
  })

  it('quien administra NO depende del portal: con el portal apagado, Admin sigue creando, editando y cambiando estado', async () => {
    mundo.sesion = ADMIN; fijarFlags({ portalCliente: false, portalClienteInterno: false })
    const r = await editar(R('/x', { method: 'PATCH', body: JSON.stringify({ precio: 2000 }) }), ctx('pA-borrador'))
    expect(r.status).toBe(200)
    expect((await estado(R('/x', { method: 'POST', body: JSON.stringify({ estado: 'en_revision' }) }), ctx('pA-borrador'))).status).not.toBe(403)
    expect((await crear(R('/api/publicador/propiedades', { method: 'POST', body: JSON.stringify({ titulo: 'Del admin' }) }))).status).not.toBe(403)
  })

  it('leer no se cierra: la lista del dueño sigue respondiendo (la pantalla es la que no la ofrece)', async () => {
    fijarFlags({ portalCliente: false })
    expect((await listar(R('/api/publicador/propiedades'))).status).toBe(200)
  })

  it('el cuerpo no puede reabrir el portal: ninguna cabecera ni campo cambia el resultado', async () => {
    fijarFlags({ portalCliente: false })
    const r = await crear(R('/api/publicador/propiedades?portal=1', { method: 'POST', body: JSON.stringify({ titulo: 'x', portal: true, portalCliente: true }), headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'x-portal': 'abierto' } }))
    expect(r.status).toBe(403)
    expect(mundo.inserts).toHaveLength(0)
  })
})
