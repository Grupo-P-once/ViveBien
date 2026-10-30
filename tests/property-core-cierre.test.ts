import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUBLICADOR + PROPERTY CORE — cierre. Recorre las rutas REALES con una base simulada que imita a PostgREST
 * (el filtro de un UPDATE se evalúa antes de escribir y devuelve las filas afectadas):
 *
 *  · revisar (rechazar / pedir cambios) exige la nota EN EL SERVIDOR;
 *  · una transición no pisa a otra que ocurrió entretanto (409), ni una edición a un cambio de estado;
 *  · `estatus` es un conjunto cerrado y su cambio queda con antes/después;
 *  · las altas nuevas llevan un UUID como clave técnica (separada del folio y del slug);
 *  · un publicador no llega a lo ajeno ni escala por URL/API.
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo' } as Record<string, unknown> },
  usuarios: [] as Array<Record<string, unknown>>,
  props: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  denegados: [] as string[],
  /** Se ejecuta justo DESPUÉS de que la ruta lee la propiedad: simula que otra persona la cambia entretanto. */
  alLeerPropiedad: null as null | (() => void),
  /** Simula que la llamada a la función falla (base caída, migración ausente…). */
  rpcFalla: null as null | { code?: string; message: string },
}))

const COMPLETA = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180,
  fotos: ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `https://res.cloudinary.com/x/${n}.jpg`),
}
const propiedad = (id: string, owner: string, estado: string, extra: Record<string, unknown> = {}) =>
  ({ id, owner_id: owner, estado_pub: estado, estatus: 'disponible', folio: 'VB-2026-00001', ...COMPLETA, ...extra })

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    let cambios: Record<string, unknown> | null = null
    let fila: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    const filas = () => (tabla === 'propiedades' ? mundo.props : tabla === 'usuarios' ? mundo.usuarios : [])
      .filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloConteo = true; return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.insert = (f: Record<string, unknown>) => { fila = f; return c }
    c.maybeSingle = async () => {
      const r = filas()[0] ?? null
      const copia = r ? { ...r } : null
      if (tabla === 'propiedades' && mundo.alLeerPropiedad) { const h = mundo.alLeerPropiedad; mundo.alLeerPropiedad = null; h() }
      return { data: copia, error: null }
    }
    c.then = (r: (v: unknown) => unknown) => {
      if (fila) { if (tabla === 'propiedades') mundo.props.push(fila); return r({ data: null, error: null }) }
      if (cambios) {
        const afectadas = filas() // el filtro se evalúa ANTES de escribir, como PostgREST
        for (const f of afectadas) Object.assign(f, cambios)
        return r({ data: afectadas.map((f) => ({ id: f.id })), error: null })
      }
      if (soloConteo) return r({ data: null, error: null, count: filas().length })
      return r({ data: filas(), error: null })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      // `propiedad_cambiar_estado` (migración 33): cambio + bitácora en UNA transacción. Mismo comportamiento que el SQL (ver tests/dobles).
      rpc: async (fn: string, a: Parameters<typeof propiedadCambiarEstado>[2]) => {
        if (fn !== 'propiedad_cambiar_estado') return { data: null, error: { message: `rpc inesperada ${fn}` } }
        if (mundo.rpcFalla) return { data: null, error: mundo.rpcFalla }
        return propiedadCambiarEstado(mundo.props, mundo.auditoria, a)
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async (_p: unknown, _r: unknown, que: string) => { mundo.denegados.push(que) },
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) } }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'
import { POST as cambiarEstado } from '../src/app/api/propiedades/[id]/estado/route'
import { PATCH as editarPropiedad, GET as leerPropiedad } from '../src/app/api/admin/propiedades/[id]/route'
import { POST as crearBorrador, GET as listarPropias } from '../src/app/api/publicador/propiedades/route'
import { ESTATUS_COMERCIALES, esEstatusComercial, notaDeRevisionValida } from '../src/lib/publicacion'
import { idPresentable } from '../src/lib/slug'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const comoPublicador = (uid = 'A', extra: Record<string, unknown> = {}) => ({ uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { rol: 'publicador', estado: 'activo', ...extra } })
const comoAdmin = () => ({ uid: 'ADM', email: 'adm@vivebienn.com', fila: { rol: 'admin', estado: 'activo' } })
const estadoDe = (id: string) => mundo.props.find((p) => p.id === id)!.estado_pub

beforeEach(() => {
  mundo.sesion = comoPublicador()
  mundo.auditoria = []
  mundo.denegados = []
  mundo.alLeerPropiedad = null
  mundo.rpcFalla = null
  mundo.usuarios = [
    { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Ana', telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: 'publicador', permisos_override: {} },
    { uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Beto', telefono: '4774445566', whatsapp: '4774445566', tipo_publicador: 'asociado', permisos_override: {} },
    { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin', estado: 'activo', nombre: 'Admin', telefono: '4770000000', whatsapp: '4770000000' },
  ]
  mundo.props = [
    propiedad('pA', 'A', 'borrador'), propiedad('pA-rev', 'A', 'en_revision'), propiedad('pA-pub', 'A', 'publicada'),
    propiedad('pB', 'B', 'borrador'), propiedad('pB-pub', 'B', 'publicada'),
  ]
})

describe('revisión: la nota es del servidor', () => {
  it('rechazar o pedir cambios SIN nota (o con una corta) → 400 y la propiedad no se mueve', async () => {
    mundo.sesion = comoAdmin()
    for (const estado of ['rechazada', 'cambios_solicitados']) {
      for (const nota of [undefined, '', '   ', 'corto', 12345]) {
        const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado, ...(nota === undefined ? {} : { nota }) }), ctx('pA-rev'))
        expect(r.status, `${estado} / ${String(nota)}`).toBe(400)
      }
    }
    expect(estadoDe('pA-rev')).toBe('en_revision')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('con nota válida: se mueve, queda la nota, quién revisó y la bitácora', async () => {
    mundo.sesion = comoAdmin()
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'cambios_solicitados', nota: '  Faltan fotos de la cocina y del baño.  ' }), ctx('pA-rev'))
    expect(r.status).toBe(200)
    const p = mundo.props.find((x) => x.id === 'pA-rev')!
    expect(p.estado_pub).toBe('cambios_solicitados')
    expect(p.nota_moderacion).toBe('Faltan fotos de la cocina y del baño.')
    expect(p.revisado_por).toBe('adm@vivebienn.com')
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'propiedad.cambios_solicitados', entidadId: 'pA-rev', antes: { estado_pub: 'en_revision' } })
  })

  it('aprobar no exige nota; publicar queda auditado', async () => {
    mundo.sesion = comoAdmin()
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'publicada' }), ctx('pA-rev'))
    expect(r.status).toBe(200)
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'propiedad.publicada' })
  })

  it('notaDeRevisionValida (pura)', () => {
    expect(notaDeRevisionValida('rechazada', 'x'.repeat(9)).ok).toBe(false)
    expect(notaDeRevisionValida('rechazada', 'x'.repeat(10))).toEqual({ ok: true, nota: 'x'.repeat(10) })
    expect(notaDeRevisionValida('publicada', undefined)).toEqual({ ok: true, nota: null })
  })
})

describe('concurrencia: lo que se decidió con la pantalla vieja no pisa lo nuevo', () => {
  it('el admin aprueba pero, entretanto, el publicador retiró el envío → 409 y NO queda publicada', async () => {
    mundo.sesion = comoAdmin()
    mundo.alLeerPropiedad = () => { mundo.props.find((p) => p.id === 'pA-rev')!.estado_pub = 'borrador' }
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'publicada' }), ctx('pA-rev'))
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('conflicto')
    expect(estadoDe('pA-rev')).toBe('borrador')
    expect(mundo.auditoria).toHaveLength(0) // no se audita lo que no ocurrió
  })

  it('el publicador edita pero, entretanto, un admin la mandó a revisión → 409 y no se escribe', async () => {
    mundo.alLeerPropiedad = () => { mundo.props.find((p) => p.id === 'pA')!.estado_pub = 'en_revision' }
    const r = await editarPropiedad(R('/api/admin/propiedades/pA', { precio: 1 }, 'PATCH'), ctx('pA'))
    expect(r.status).toBe(409)
    expect(mundo.props.find((p) => p.id === 'pA')!.precio).toBe(2_500_000)
  })

  it('sin carrera todo sigue igual (borrador → en_revision y edición normal)', async () => {
    const a = await cambiarEstado(R('/api/propiedades/pA/estado', { estado: 'en_revision' }), ctx('pA'))
    expect(a.status).toBe(200)
    expect(estadoDe('pA')).toBe('en_revision')
    mundo.sesion = comoPublicador('B')
    const b = await editarPropiedad(R('/api/admin/propiedades/pB', { precio: 123 }, 'PATCH'), ctx('pB'))
    expect(b.status).toBe(200)
    expect(mundo.props.find((p) => p.id === 'pB')!.precio).toBe(123)
  })
})

describe('situación comercial (pausada / archivada): conjunto cerrado y con historial', () => {
  it('el catálogo de estatus es el que usan el panel y las búsquedas', () => {
    expect([...ESTATUS_COMERCIALES].sort()).toEqual(['disponible', 'eliminada', 'pausada', 'rentada', 'vendida'])
    expect(esEstatusComercial('pausada')).toBe(true)
    expect(esEstatusComercial('xyz')).toBe(false)
    expect(esEstatusComercial(null)).toBe(false)
  })

  it('un admin con un valor inventado → 400 y no se guarda', async () => {
    mundo.sesion = comoAdmin()
    for (const v of ['xyz', '', 'PAUSADA', null, 7]) {
      const r = await editarPropiedad(R('/api/admin/propiedades/pA-pub', { estatus: v }, 'PATCH'), ctx('pA-pub'))
      expect(r.status, String(v)).toBe(400)
    }
    expect(mundo.props.find((p) => p.id === 'pA-pub')!.estatus).toBe('disponible')
  })

  it('pausar queda con el antes y el después en la bitácora', async () => {
    mundo.sesion = comoAdmin()
    const r = await editarPropiedad(R('/api/admin/propiedades/pA-pub', { estatus: 'pausada' }, 'PATCH'), ctx('pA-pub'))
    expect(r.status).toBe(200)
    expect(mundo.props.find((p) => p.id === 'pA-pub')!.estatus).toBe('pausada')
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'propiedad.editar', antes: { estatus: 'disponible' }, despues: { estatus: 'pausada' } })
  })

  it('un publicador NO cambia el estatus (se ignora, aunque lo mande a mano)', async () => {
    const r = await editarPropiedad(R('/api/admin/propiedades/pA', { estatus: 'pausada', precio: 5 }, 'PATCH'), ctx('pA'))
    expect(r.status).toBe(200)
    const p = mundo.props.find((x) => x.id === 'pA')!
    expect(p.estatus).toBe('disponible')
    expect(p.precio).toBe(5)
  })
})

describe('identidad: UUID técnico, folio público, slug', () => {
  it('una alta nueva lleva un UUID como id; owner y estado los pone el servidor; el folio/slug del cuerpo se ignoran', async () => {
    const r = await crearBorrador(R('/api/publicador/propiedades', { titulo: 'Casa nueva', folio: 'VB-1999-99999', slug: 'mi-url', owner_id: 'B', estado_pub: 'publicada', id: 'otro' }))
    expect(r.status).toBe(200)
    const { id } = await r.json()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const fila = mundo.props.find((p) => p.id === id)!
    expect(fila).toMatchObject({ owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })
    expect(fila.folio).toBeUndefined() // lo asigna la base (trigger), nunca el cuerpo
    expect(fila.slug).toBeUndefined()
    expect(fila.id).not.toBe('otro')
  })

  it('dos altas seguidas no comparten ni se parecen (no enumerable)', async () => {
    const a = (await (await crearBorrador(R('/api/publicador/propiedades', {}))).json()).id as string
    const b = (await (await crearBorrador(R('/api/publicador/propiedades', {}))).json()).id as string
    expect(a).not.toBe(b)
    expect(a).not.toMatch(/^borrador-/)
  })

  it('un UUID nunca se toma por una dirección pública presentable', () => {
    expect(idPresentable('3f2b8a52-9c4e-4a77-8d51-2f6a1e0c9b10')).toBe(false)
    expect(idPresentable('borrador-mf3k8x2p')).toBe(false)
    expect(idPresentable('casa-en-la-canada-leon')).toBe(true)
  })
})

describe('IDOR y escalamiento (servidor como autoridad)', () => {
  it('lo ajeno: leer, editar y mover → 403 y queda registrado', async () => {
    const l = await leerPropiedad(R('/api/admin/propiedades/pB', undefined, 'GET'), ctx('pB'))
    const e = await editarPropiedad(R('/api/admin/propiedades/pB', { precio: 1 }, 'PATCH'), ctx('pB'))
    const m = await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'en_revision' }), ctx('pB'))
    expect([l.status, e.status, m.status]).toEqual([403, 403, 403])
    expect(mundo.denegados.filter((d) => d.startsWith('propiedad.ajena:pB'))).toHaveLength(3)
    expect(mundo.props.find((p) => p.id === 'pB')).toMatchObject({ precio: 2_500_000, estado_pub: 'borrador' })
  })

  it('su listado trae SOLO lo suyo y sin el correo del revisor ni el contacto interno', async () => {
    mundo.props.find((p) => p.id === 'pA-pub')!.revisado_por = 'rev@vivebienn.com'
    mundo.props.find((p) => p.id === 'pA-pub')!.whatsapp = '4770000000'
    const r = await listarPropias(R('/api/publicador/propiedades', undefined, 'GET'))
    const filas = (await r.json()) as Array<Record<string, unknown>>
    expect(filas.every((f) => f.owner_id === 'A')).toBe(true)
    expect(filas.length).toBe(3)
    expect(JSON.stringify(filas)).not.toMatch(/rev@vivebienn\.com|4770000000/)
  })

  it('un publicador normal no se publica a sí mismo (403); un asociado sí, sólo borrador → publicada', async () => {
    const n = await cambiarEstado(R('/api/propiedades/pA/estado', { estado: 'publicada' }), ctx('pA'))
    expect(n.status).toBe(403)
    expect(estadoDe('pA')).toBe('borrador')
    mundo.sesion = comoPublicador('B', { tipo_publicador: 'asociado' })
    const a = await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'publicada' }), ctx('pB'))
    expect(a.status).toBe(200)
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'propiedad.publicada', despues: { sinRevision: true } })
  })

  it('nadie escala por la ruta: ni aprobar su propia revisión, ni rechazar, ni pedir cambios', async () => {
    for (const estado of ['publicada', 'rechazada', 'cambios_solicitados']) {
      const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado, nota: 'una nota suficientemente larga' }), ctx('pA-rev'))
      expect(r.status, estado).toBe(403)
    }
    expect(estadoDe('pA-rev')).toBe('en_revision')
  })

  it('en revisión nadie edita (ni con editar_publicadas); publicada sólo con la capacidad', async () => {
    const rev = await editarPropiedad(R('/api/admin/propiedades/pA-rev', { precio: 1 }, 'PATCH'), ctx('pA-rev'))
    expect(rev.status).toBe(409)
    const pub = await editarPropiedad(R('/api/admin/propiedades/pA-pub', { precio: 1 }, 'PATCH'), ctx('pA-pub'))
    expect(pub.status).toBe(409)
    mundo.sesion = comoPublicador('A', { permisos_override: { editar_publicadas: true } })
    mundo.usuarios[0].permisos_override = { editar_publicadas: true }
    const con = await editarPropiedad(R('/api/admin/propiedades/pA-pub', { precio: 1 }, 'PATCH'), ctx('pA-pub'))
    expect(con.status).toBe(200)
    const aun = await editarPropiedad(R('/api/admin/propiedades/pA-rev', { precio: 1 }, 'PATCH'), ctx('pA-rev'))
    expect(aun.status).toBe(409)
  })

  it('los campos reservados del cuerpo se ignoran (folio, slug, dueño, estado, contadores)', async () => {
    const r = await editarPropiedad(R('/api/admin/propiedades/pA', { folio: 'VB-1999-99999', slug: 'x', owner_id: 'B', estado_pub: 'publicada', vistas: 9999, titulo: 'Nuevo título' }, 'PATCH'), ctx('pA'))
    expect(r.status).toBe(200)
    const p = mundo.props.find((x) => x.id === 'pA')!
    expect(p).toMatchObject({ folio: 'VB-2026-00001', owner_id: 'A', estado_pub: 'borrador', titulo: 'Nuevo título' })
    expect(p.slug).toBeUndefined()
    expect(p.vistas).toBeUndefined()
    expect(mundo.denegados.some((d) => d.startsWith('propiedad.campos:'))).toBe(true)
  })
})

describe('atomicidad en la ruta (migración 33): el cambio y su bitácora son la misma llamada', () => {
  it('si la función falla (base caída), NO cambia nada y se dice: 503, sin estado nuevo ni bitácora a medias', async () => {
    mundo.sesion = comoAdmin()
    mundo.rpcFalla = { code: 'XX000', message: 'connection terminated' }
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'publicada' }), ctx('pA-rev'))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/no se hizo nada/)
    expect(estadoDe('pA-rev')).toBe('en_revision')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('si la migración 33 falta: 503 que lo dice y no se cambia nada (falla cerrado)', async () => {
    mundo.sesion = comoAdmin()
    mundo.rpcFalla = { code: 'PGRST202', message: 'Could not find the function public.propiedad_cambiar_estado' }
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'publicada' }), ctx('pA-rev'))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/migración 33/)
    expect(estadoDe('pA-rev')).toBe('en_revision')
  })

  it('toda transición exitosa deja EXACTAMENTE una huella, escrita por la misma llamada', async () => {
    mundo.sesion = comoAdmin()
    const r = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'cambios_solicitados', nota: 'Faltan fotos de la cocina' }), ctx('pA-rev'))
    expect(r.status).toBe(200)
    expect(mundo.auditoria).toHaveLength(1)
    expect(mundo.auditoria[0]).toMatchObject({
      accion: 'propiedad.cambios_solicitados', entidad: 'propiedades', entidadId: 'pA-rev',
      actor: { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin' },
      antes: { estado_pub: 'en_revision' }, despues: { estado_pub: 'cambios_solicitados', nota: 'Faltan fotos de la cocina' },
    })
  })

  it('las mismas reglas de siempre: nota corta 400, ajena 403, sin capacidad 403 — y nada llega a la función', async () => {
    mundo.sesion = comoAdmin()
    mundo.rpcFalla = { message: 'NO DEBE LLAMARSE' }
    const corta = await cambiarEstado(R('/api/propiedades/pA-rev/estado', { estado: 'rechazada', nota: 'corta' }), ctx('pA-rev'))
    expect(corta.status).toBe(400)
    mundo.sesion = comoPublicador()
    const sinCapacidad = await cambiarEstado(R('/api/propiedades/pA/estado', { estado: 'publicada' }), ctx('pA'))
    const ajena = await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'en_revision' }), ctx('pB'))
    expect([sinCapacidad.status, ajena.status]).toEqual([403, 403])
    expect(estadoDe('pA')).toBe('borrador')
  })
})
