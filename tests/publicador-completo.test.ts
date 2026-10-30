import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUBLICADOR sobre el Property Core — recorre las rutas REALES (base simulada que imita a PostgREST y a las funciones SQL):
 *
 *  · el ciclo de vida del publicador NORMAL: crear → borrador → revisión → cambios solicitados → revisión → publicada;
 *  · el ASOCIADO: publica directo y corrige lo ya publicado, según sus capacidades;
 *  · el SERVIDOR valida el contenido (lista blanca, valores, orígenes de medios), limita las escrituras y los borradores;
 *  · nadie toca lo ajeno ni se escala por URL/API.
 * (La validación del navegador es comodidad; esto es lo que de verdad protege.)
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo' } as Record<string, unknown> },
  usuarios: [] as Array<Record<string, unknown>>,
  props: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  denegados: [] as string[],
  /** Lo que de verdad llega a Supabase en cada insert/update de `propiedades`. */
  escrituras: [] as Array<{ tipo: 'insert' | 'update'; payload: Record<string, unknown> }>,
  borradoFalla: false,
}))

const NUBE = 'nube-prueba'
const foto = (n: number | string) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/prop/${n}.jpg`
const FOTOS_OK = ['1', '2', '3', '4', '5', '6'].map(foto)
const CONTENIDO = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio y cochera para dos autos.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180, fotos: FOTOS_OK,
}

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    let cambios: Record<string, unknown> | null = null
    let fila: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    const filas = () => (tabla === 'propiedades' ? mundo.props : tabla === 'usuarios' ? mundo.usuarios : [])
      .filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloConteo = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.order = () => c
    let borrando = false
    c.delete = () => { borrando = true; return c }
    c.update = (f: Record<string, unknown>) => { cambios = f; if (tabla === 'propiedades') mundo.escrituras.push({ tipo: 'update', payload: { ...f } }); return c }
    c.insert = (f: Record<string, unknown>) => { fila = f; if (tabla === 'propiedades') mundo.escrituras.push({ tipo: 'insert', payload: { ...f } }); return c }
    c.maybeSingle = async () => ({ data: filas()[0] ? { ...filas()[0] } : null, error: null })
    c.then = (r: (v: unknown) => unknown) => {
      if (borrando && mundo.borradoFalla) return r({ data: null, error: { message: 'delete falló' } })
      if (borrando) { const quitadas = filas(); mundo.props = mundo.props.filter((p) => !quitadas.includes(p)); return r({ data: quitadas.map((f) => ({ id: f.id })), error: null }) }
      if (fila) { if (tabla === 'propiedades') mundo.props.push({ folio: `VB-2026-${String(mundo.props.length + 1).padStart(5, '0')}`, ...fila }); return r({ data: null, error: null }) }
      if (cambios) {
        const afectadas = filas()
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
      rpc: async (fn: string, a: Parameters<typeof propiedadCambiarEstado>[2]) =>
        fn === 'propiedad_cambiar_estado' ? propiedadCambiarEstado(mundo.props, mundo.auditoria, a) : { data: null, error: { message: `rpc inesperada ${fn}` } },
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
import * as rutaEditar from '../src/app/api/admin/propiedades/[id]/route'
import * as rutaPublicador from '../src/app/api/publicador/propiedades/route'
import * as rutaEstado from '../src/app/api/propiedades/[id]/estado/route'
import * as rutaAlta from '../src/app/api/admin/propiedades/route'
const { PATCH: editar, GET: leer, DELETE: borrar } = rutaEditar
import { POST as crear, GET as listar } from '../src/app/api/publicador/propiedades/route'
import { CAMPOS_DE_CONTENIDO, CAMPOS_SOLO_MODERADOR, diferenciasDeContenido, esUrlDeNuestraNube, sanearContenido, sanearPies } from '../src/lib/sanear-propiedad'
import { MAXIMO_BORRADORES_POR_CUENTA } from '../src/lib/publicacion'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const como = (uid: string, fila: Record<string, unknown>) => ({ uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { estado: 'activo', ...fila } })
const normal = (uid = 'A') => como(uid, { rol: 'publicador', tipo_publicador: 'publicador' })
const asociado = (uid = 'B') => como(uid, { rol: 'publicador', tipo_publicador: 'asociado' })
const admin = () => como('ADM', { rol: 'admin' })
const fila = (id: string) => mundo.props.find((p) => p.id === id)!
const usuario = (uid: string, rol = 'publicador', tipo = 'publicador') => ({ uid, email: `${uid.toLowerCase()}@ejemplo.test`, rol, estado: 'activo', nombre: uid, telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: tipo, permisos_override: {} })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', NUBE)
  mundo.sesion = normal()
  mundo.auditoria = []
  mundo.denegados = []
  mundo.escrituras = []
  mundo.borradoFalla = false
  mundo.props = []
  mundo.usuarios = [usuario('A'), usuario('B', 'publicador', 'asociado'), usuario('C'), usuario('ADM', 'admin')]
})

// ───────────────────────────── la validación del servidor (pura) ─────────────────────────────
describe('sanearContenido: lista blanca + valores', () => {
  const sanear = (e: Record<string, unknown>, o: Partial<Parameters<typeof sanearContenido>[1]> = {}) => sanearContenido(e, { moderador: false, actuales: null, nube: NUBE, ...o })

  it('sólo pasan columnas de CONTENIDO; lo demás se descarta (dueño, estado, folio, contactos, flags, campos inventados)', () => {
    const r = sanear({
      titulo: 'Casa', precio: 10,
      owner_id: 'B', created_by: 'B', publicador_id: 'B', mostrar_publicador: true, contacto_publico: '4771', estado_pub: 'publicada', folio: 'VB-1', slug: 'x',
      completitud: 100, vistas: 9, whatsapp: '1', telefono: '2', revisado_por: 'adm', nota_moderacion: 'ok', publicada_en: 'x', gestion: 'requiere_gestion', estatus: 'vendida',
    })
    expect(Object.keys(r.datos).sort()).toEqual(['precio', 'titulo'])
    expect(r.descartados.sort()).toEqual([
      'completitud', 'contacto_publico', 'created_by', 'estado_pub', 'estatus', 'folio', 'gestion', 'mostrar_publicador', 'nota_moderacion',
      'owner_id', 'publicada_en', 'publicador_id', 'revisado_por', 'slug', 'telefono', 'vistas', 'whatsapp',
    ])
    expect(r.errores).toEqual([])
  })

  it('el catálogo de contenido NO incluye nada que decida dueño, estado, identidad pública ni contacto', () => {
    for (const prohibida of ['owner_id', 'estado_pub', 'folio', 'slug', 'completitud', 'whatsapp', 'telefono', 'revisado_por', 'nota_moderacion', 'vistas', 'estatus', 'gestion']) {
      expect(CAMPOS_DE_CONTENIDO as readonly string[]).not.toContain(prohibida)
    }
  })

  it('quien modera añade `estatus` y `gestion` (cerrado), nunca dueño ni estado', () => {
    const r = sanear({ estatus: 'pausada', gestion: 'requiere_gestion', owner_id: 'X', estado_pub: 'publicada' }, { moderador: true })
    expect(r.datos).toEqual({ estatus: 'pausada', gestion: 'requiere_gestion' })
    expect(r.descartados.sort()).toEqual(['estado_pub', 'owner_id'])
    expect(sanear({ gestion: 'otra' }, { moderador: true }).errores).toHaveLength(1)
  })

  it.each([
    [{ tipo: 'castillo' }], [{ operacion: 'trueque' }], [{ precio: -1 }], [{ precio: 'mucho' }], [{ precio: 1e12 }], [{ precio: Number.NaN }],
    [{ metros: -5 }], [{ recamaras: 2.5 }], [{ recamaras: 5000 }], [{ banos: 'x' }], [{ lat: 91 }], [{ lng: -181 }], [{ moneda: 'EUR' }], [{ precision_ubicacion: 'rara' }],
    [{ titulo: 'x'.repeat(300) }], [{ descripcion: 'x'.repeat(5001) }], [{ titulo: 123 }], [{ precio_incluye_iva: 'si' }],
    [{ amenidades: 'piscina' }], [{ amenidades: ['x'.repeat(100)] }], [{ extras: 'texto' }], [{ extras: [1] }], [{ extras: { grande: 'x'.repeat(21_000) } }],
  ])('valor no válido %j → error y no se guarda', (entrada) => {
    const r = sanear(entrada as Record<string, unknown>)
    expect(r.errores.length).toBeGreaterThan(0)
    expect(Object.keys(r.datos)).toEqual([])
  })

  it('valores buenos se normalizan (cadenas numéricas → número; vacío → null; listas nulas → [])', () => {
    const r = sanear({ precio: '2500000', metros: '738.6', recamaras: '4', lat: 21.1, lng: -101.7, subtipo: '', cp: null, tipo: 'nave', operacion: 'renta', fotos: null, amenidades: [] })
    expect(r.errores).toEqual([])
    expect(r.datos).toMatchObject({ precio: 2_500_000, metros: 738.6, recamaras: 4, lat: 21.1, lng: -101.7, subtipo: null, cp: null, tipo: 'nave', operacion: 'renta', fotos: [], amenidades: [] })
  })

  it('un valor VIEJO que ya tenía la propiedad no se rechaza si no se toca (datos anteriores a las reglas)', () => {
    expect(sanear({ tipo: 'nave industrial' }, { actuales: { tipo: 'nave industrial' } }).errores).toEqual([])
    expect(sanear({ tipo: 'nave industrial' }, { actuales: { tipo: 'casa' } }).errores).toHaveLength(1)
  })

  describe('medios', () => {
    it('fotos y planos de un publicador: sólo de NUESTRA cuenta de Cloudinary, https, sin repetir', () => {
      expect(sanear({ fotos: FOTOS_OK }).errores).toEqual([])
      expect(sanear({ fotos: [foto(1), foto(1)] }).datos.fotos).toEqual([foto(1)])
      for (const mala of [
        'https://evil.example/x.jpg', `http://res.cloudinary.com/${NUBE}/x.jpg`, 'https://res.cloudinary.com/otra-nube/x.jpg',
        `https://res.cloudinary.com.evil.example/${NUBE}/x.jpg`, 'javascript:alert(1)', 'data:image/png;base64,AAA', '1', '', 7,
      ]) {
        expect(sanear({ fotos: [foto(1), mala] }).errores, String(mala)).toHaveLength(1)
        expect(sanear({ planos: [mala] }).errores, `planos ${String(mala)}`).toHaveLength(1)
      }
    })
    it('sin nombre de nube configurado, un publicador sólo conserva lo que ya tenía (falla cerrado)', () => {
      expect(sanear({ fotos: [foto(1)] }, { nube: null }).errores).toHaveLength(1)
      expect(sanear({ fotos: [foto(1)] }, { nube: null, actuales: { fotos: [foto(1)] } }).errores).toEqual([])
    })
    it('una foto ya existente (aunque sea de otro origen, datos viejos) se conserva; una nueva ajena no', () => {
      const vieja = 'https://otro.example/vieja.jpg'
      expect(sanear({ fotos: [vieja, foto(2)] }, { actuales: { fotos: [vieja] } }).errores).toEqual([])
      expect(sanear({ fotos: [vieja, 'https://otro.example/nueva.jpg'] }, { actuales: { fotos: [vieja] } }).errores).toHaveLength(1)
    })
    it('topes: 50 fotos, 20 planos, 10 videos', () => {
      expect(sanear({ fotos: Array.from({ length: 51 }, (_, i) => foto(i)) }).errores).toHaveLength(1)
      expect(sanear({ fotos: Array.from({ length: 50 }, (_, i) => foto(i)) }).errores).toEqual([])
      expect(sanear({ planos: Array.from({ length: 21 }, (_, i) => foto(i)) }).errores).toHaveLength(1)
      expect(sanear({ videos: Array.from({ length: 11 }, (_, i) => `https://www.youtube.com/watch?v=aaaaaaaaaa${i % 10}`) }).errores).toHaveLength(1)
    })
    it('videos de un publicador: sólo YouTube en su forma canónica', () => {
      const ok = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      expect(sanear({ videos: [ok] }).errores).toEqual([])
      for (const mala of ['https://evil.example/v.mp4', 'javascript:alert(1)', 'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ']) {
        expect(sanear({ videos: [mala] }).errores, mala).toHaveLength(1)
      }
    })
    it('un administrador conserva su libertad de origen (https), pero no la de javascript: ni texto suelto', () => {
      expect(sanear({ fotos: ['https://otro.example/x.jpg'] }, { moderador: true }).errores).toEqual([])
      expect(sanear({ fotos: ['javascript:alert(1)'] }, { moderador: true }).errores).toHaveLength(1)
      expect(sanear({ fotos: ['no es url'] }, { moderador: true }).errores).toHaveLength(1)
    })
    it('Cloudinary: sin credenciales ni puerto, y sólo entregas de lo SUBIDO (nunca /fetch/ ni otras formas)', () => {
      for (const mala of [
        `https://user:pass@res.cloudinary.com/${NUBE}/image/upload/v1/x.jpg`, `https://res.cloudinary.com:8443/${NUBE}/image/upload/v1/x.jpg`,
        `https://res.cloudinary.com/${NUBE}/image/fetch/https://evil.example/x.jpg`, `https://res.cloudinary.com/${NUBE}/image/private/x.jpg`,
        `https://res.cloudinary.com/${NUBE}/x.jpg`, `https://res.cloudinary.com/${NUBE}/image/upload`,
      ]) {
        expect(esUrlDeNuestraNube(mala, NUBE), mala).toBe(false)
      }
      for (const buena of [`https://res.cloudinary.com/${NUBE}/image/upload/v1/x.jpg`, `https://res.cloudinary.com/${NUBE}/raw/upload/v1/plano.pdf`, `https://res.cloudinary.com/${NUBE}/video/upload/v1/v.mp4`]) {
        expect(esUrlDeNuestraNube(buena, NUBE), buena).toBe(true)
      }
    })
    it('esUrlDeNuestraNube', () => {
      expect(esUrlDeNuestraNube(foto(1), NUBE)).toBe(true)
      expect(esUrlDeNuestraNube(foto(1), 'otra')).toBe(false)
      expect(esUrlDeNuestraNube(foto(1), '')).toBe(false)
      expect(esUrlDeNuestraNube('no-url', NUBE)).toBe(false)
    })
  })
})

// ───────────────────────────── PUBLICADOR NORMAL ─────────────────────────────
describe('PUBLICADOR normal: crear → borrador → revisión → cambios → publicada, sin publicar solo', () => {
  it('el ciclo completo, con observaciones visibles, bloqueos y bitácora', async () => {
    // crear (nace borrador, suyo, con UUID)
    const c = await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))
    expect(c.status).toBe(200)
    const { id } = await c.json()
    expect(fila(id)).toMatchObject({ owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })

    // guardar borrador / subir imágenes (las que firma Cloudinary para nuestra nube)
    expect((await editar(R(`/api/admin/propiedades/${id}`, { ...CONTENIDO, titulo: 'Casa en León' }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id).fotos).toEqual(FOTOS_OK)

    // NO publica solo
    const solo = await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'publicada' }), ctx(id))
    expect(solo.status).toBe(403)
    expect(fila(id).estado_pub).toBe('borrador')

    // envía a revisión
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'en_revision' }), ctx(id))).status).toBe(200)
    expect(fila(id).estado_pub).toBe('en_revision')

    // en revisión no se edita (ni se suben cambios por la API)
    expect((await editar(R(`/api/admin/propiedades/${id}`, { precio: 1 }, 'PATCH'), ctx(id))).status).toBe(409)

    // el admin pide cambios (la nota es obligatoria) y el publicador la VE
    mundo.sesion = admin()
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'cambios_solicitados' }), ctx(id))).status).toBe(400)
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'cambios_solicitados', nota: 'Faltan fotos del jardín.' }), ctx(id))).status).toBe(200)
    mundo.sesion = normal()
    const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<Record<string, unknown>>
    expect(lista.find((p) => p.id === id)).toMatchObject({ estado_pub: 'cambios_solicitados', nota_moderacion: 'Faltan fotos del jardín.' })
    expect(JSON.stringify(lista)).not.toMatch(/adm@ejemplo|revisado_por"\s*:\s*"adm/)   // ni el correo del revisor

    // corrige y reenvía
    expect((await editar(R(`/api/admin/propiedades/${id}`, { descripcion: 'Descripción corregida con más detalle para el anuncio.' }, 'PATCH'), ctx(id))).status).toBe(200)
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'en_revision' }), ctx(id))).status).toBe(200)

    // el admin publica; ya publicada, el publicador normal no la toca
    mundo.sesion = admin()
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'publicada' }), ctx(id))).status).toBe(200)
    mundo.sesion = normal()
    expect((await editar(R(`/api/admin/propiedades/${id}`, { precio: 1 }, 'PATCH'), ctx(id))).status).toBe(409)
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'borrador' }), ctx(id))).status).toBe(403)

    // bitácora: toda TRANSICIÓN deja una huella, en orden y sin huecos (las ediciones de contenido son otra acción)
    expect(mundo.auditoria.filter((a) => a.entidadId === id && !['propiedad.crear', 'propiedad.editar'].includes(String(a.accion))).map((a) => a.accion)).toEqual([
      'propiedad.en_revision', 'propiedad.cambios_solicitados', 'propiedad.en_revision', 'propiedad.publicada',
    ])
  })

  it('rechazada: ve el motivo, puede volver a borrador y corregir; nunca salta a publicada', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'en_revision', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    mundo.sesion = admin()
    expect((await cambiarEstado(R('/api/propiedades/p1/estado', { estado: 'rechazada', nota: 'Las fotos no corresponden al inmueble.' }), ctx('p1'))).status).toBe(200)
    mundo.sesion = normal()
    const ficha = (await (await leer(R('/api/admin/propiedades/p1', undefined, 'GET'), ctx('p1'))).json()) as { propiedad: Record<string, unknown> }
    expect(ficha.propiedad).toMatchObject({ estado_pub: 'rechazada', nota_moderacion: 'Las fotos no corresponden al inmueble.' })
    expect((await cambiarEstado(R('/api/propiedades/p1/estado', { estado: 'publicada' }), ctx('p1'))).status).toBe(403)
    expect((await cambiarEstado(R('/api/propiedades/p1/estado', { estado: 'borrador' }), ctx('p1'))).status).toBe(200)
    expect((await editar(R('/api/admin/propiedades/p1', { precio: 2_000_000 }, 'PATCH'), ctx('p1'))).status).toBe(200)
  })

  it('retirar el envío mientras nadie lo revisa: en_revision → borrador', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'en_revision', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    expect((await cambiarEstado(R('/api/propiedades/p1/estado', { estado: 'borrador' }), ctx('p1'))).status).toBe(200)
  })
})

// ───────────────────────────── PUBLICADOR ASOCIADO ─────────────────────────────
describe('PUBLICADOR asociado: publicación directa y corrección de lo publicado, según sus capacidades', () => {
  beforeEach(() => { mundo.sesion = asociado() })

  it('publica directo su borrador completo (queda dicho que fue sin revisión) y luego corrige lo publicado', async () => {
    const { id } = await (await crear(R('/api/publicador/propiedades', CONTENIDO))).json()
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'publicada' }), ctx(id))).status).toBe(200)
    expect(fila(id).estado_pub).toBe('publicada')
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'propiedad.publicada', despues: { sinRevision: true } })
    // editar_publicadas (por defecto del asociado): corrige sin devolverla a borrador
    expect((await editar(R(`/api/admin/propiedades/${id}`, { precio: 2_400_000 }, 'PATCH'), ctx(id))).status).toBe(200)
    expect(fila(id)).toMatchObject({ precio: 2_400_000, estado_pub: 'publicada' })
  })

  it('con el override editar_publicadas=false ya no corrige lo publicado (capacidades independientes)', async () => {
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'publicada', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    mundo.sesion = asociado()
    mundo.sesion.fila.permisos_override = { editar_publicadas: false }
    expect((await editar(R('/api/admin/propiedades/pB', { precio: 1 }, 'PATCH'), ctx('pB'))).status).toBe(409)
  })

  it('con el override publicar_sin_revision=false se comporta como normal: sólo a revisión', async () => {
    mundo.sesion = asociado()
    mundo.sesion.fila.permisos_override = { publicar_sin_revision: false }
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    expect((await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'publicada' }), ctx('pB'))).status).toBe(403)
    expect((await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'en_revision' }), ctx('pB'))).status).toBe(200)
  })

  it('un publicador normal con el override publicar_sin_revision=true SÍ publica (la modalidad no es la autoridad, la capacidad sí)', async () => {
    mundo.sesion = normal('A')
    mundo.sesion.fila.permisos_override = { publicar_sin_revision: true }
    mundo.props = [{ id: 'pA', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    expect((await cambiarEstado(R('/api/propiedades/pA/estado', { estado: 'publicada' }), ctx('pA'))).status).toBe(200)
  })

  it('publicar directo NO se salta lo mínimo: incompleto → 400, y no se publica', async () => {
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO, fotos: [foto(1)] }]
    const r = await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'publicada' }), ctx('pB'))
    expect(r.status).toBe(400)
    expect(fila('pB').estado_pub).toBe('borrador')
  })

  it('NO puede dejar publicada con «fotos» inventadas: la API de edición las rechaza (no cuentan para el mínimo)', async () => {
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', titulo: 'x' }]
    const falsa = await editar(R('/api/admin/propiedades/pB', { ...CONTENIDO, fotos: ['1', '2', '3', '4', '5'] }, 'PATCH'), ctx('pB'))
    expect(falsa.status).toBe(400)
    const ajena = await editar(R('/api/admin/propiedades/pB', { ...CONTENIDO, fotos: ['a', 'b', 'c', 'd', 'e'].map((x) => `https://evil.example/${x}.jpg`) }, 'PATCH'), ctx('pB'))
    expect(ajena.status).toBe(400)
    expect(fila('pB').fotos).toBeUndefined()
    expect((await cambiarEstado(R('/api/propiedades/pB/estado', { estado: 'publicada' }), ctx('pB'))).status).toBe(400)
  })
})

// ───────────────────────────── SEGURIDAD ─────────────────────────────
describe('seguridad: contenido, límites, IDOR y escalamiento', () => {
  it('POST: datos no válidos → 400 y NO se inserta nada', async () => {
    for (const cuerpo of [{ tipo: 'castillo' }, { precio: -5 }, { fotos: ['https://evil.example/x.jpg'] }, { lat: 200 }]) {
      const r = await crear(R('/api/publicador/propiedades', cuerpo))
      expect(r.status, JSON.stringify(cuerpo)).toBe(400)
    }
    expect(mundo.props).toHaveLength(0)
  })

  it('POST/PATCH: los campos de dueño, identidad pública y contacto del cuerpo se ignoran y quedan registrados', async () => {
    const c = await crear(R('/api/publicador/propiedades', {
      titulo: 'Casa', owner_id: 'B', created_by: 'B', publicador_id: 'B', mostrar_publicador: true, contacto_publico: '4771112233', folio: 'VB-1999-99999', slug: 'mia', estado_pub: 'publicada', gestion: 'requiere_gestion',
    }))
    expect(c.status).toBe(200)
    const { id } = await c.json()
    const f = fila(id)
    expect(f).toMatchObject({ owner_id: 'A', estado_pub: 'borrador' })
    for (const k of ['created_by', 'publicador_id', 'mostrar_publicador', 'contacto_publico', 'slug', 'gestion']) expect(f[k], k).toBeUndefined()
    expect(f.folio).not.toBe('VB-1999-99999')
    expect(mundo.denegados.some((d) => d.startsWith('propiedad.campos_no_permitidos:'))).toBe(true)
    expect(mundo.denegados.some((d) => d.startsWith('propiedad.campos:'))).toBe(true)

    await editar(R(`/api/admin/propiedades/${id}`, { titulo: 'Otra', owner_id: 'B', publicador_id: 'B', mostrar_publicador: true, gestion: 'requiere_gestion', estatus: 'vendida' }, 'PATCH'), ctx(id))
    expect(fila(id)).toMatchObject({ owner_id: 'A', estatus: 'disponible', titulo: 'Otra' })
    expect(fila(id).publicador_id).toBeUndefined()
    expect(fila(id).gestion).toBeUndefined()
  })

  it('PATCH con valores inválidos → 400 y la propiedad no cambia', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    for (const cuerpo of [{ precio: 'gratis' }, { tipo: 'x' }, { extras: 'z' }, { fotos: [foto(1), 'https://evil.example/y.jpg'] }]) {
      expect((await editar(R('/api/admin/propiedades/p1', cuerpo, 'PATCH'), ctx('p1'))).status, JSON.stringify(cuerpo)).toBe(400)
    }
    expect(fila('p1')).toMatchObject({ precio: 2_500_000, tipo: 'casa' })
  })

  it('PATCH conserva las fotos que la propiedad YA tenía aunque sean de otro origen (datos anteriores), y deja añadir las nuestras', async () => {
    const vieja = 'https://otro.example/vieja.jpg'
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO, fotos: [vieja] }]
    expect((await editar(R('/api/admin/propiedades/p1', { fotos: [vieja, foto(9)] }, 'PATCH'), ctx('p1'))).status).toBe(200)
    expect(fila('p1').fotos).toEqual([vieja, foto(9)])
  })

  it('un admin puede poner medios de otro origen (https) y datos sin sentido siguen rechazados', async () => {
    mundo.sesion = admin()
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    expect((await editar(R('/api/admin/propiedades/p1', { fotos: ['https://otro.example/x.jpg'] }, 'PATCH'), ctx('p1'))).status).toBe(200)
    expect((await editar(R('/api/admin/propiedades/p1', { precio: -1 }, 'PATCH'), ctx('p1'))).status).toBe(400)
    expect((await editar(R('/api/admin/propiedades/p1', { gestion: 'requiere_gestion', estatus: 'pausada' }, 'PATCH'), ctx('p1'))).status).toBe(200)
    expect(fila('p1')).toMatchObject({ gestion: 'requiere_gestion', estatus: 'pausada' })
  })

  it('tope de borradores abiertos por cuenta (un script no llena la base); un admin no lo tiene', async () => {
    for (let i = 0; i < MAXIMO_BORRADORES_POR_CUENTA; i++) mundo.props.push({ id: `b${i}`, owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })
    mundo.props.push({ id: 'pub', owner_id: 'A', estado_pub: 'publicada', estatus: 'disponible' }, { id: 'ajeno', owner_id: 'C', estado_pub: 'borrador', estatus: 'disponible' })
    const r = await crear(R('/api/publicador/propiedades', { titulo: 'Una más' }))
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/borradores abiertos/)
    expect(mundo.props.filter((p) => p.owner_id === 'A')).toHaveLength(MAXIMO_BORRADORES_POR_CUENTA + 1)
    // publicar o enviar uno libera el cupo
    mundo.props.find((p) => p.id === 'b0')!.estado_pub = 'en_revision'
    expect((await crear(R('/api/publicador/propiedades', { titulo: 'Ahora sí' }))).status).toBe(200)
    // las de otra cuenta no cuentan; un admin tampoco tiene el tope
    mundo.sesion = admin()
    expect((await crear(R('/api/publicador/propiedades', { titulo: 'Admin' }))).status).toBe(200)
  })

  it('tope de escrituras: pasado el límite, 429 con Retry-After (y no se escribe)', async () => {
    mundo.sesion = normal('RL')
    mundo.usuarios.push(usuario('RL'))
    mundo.props = [{ id: 'pRL', owner_id: 'RL', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    let ultimo = 200
    let cabecera: string | null = null
    for (let i = 0; i < 245; i++) {
      const r = await editar(R('/api/admin/propiedades/pRL', { titulo: `T${i}` }, 'PATCH'), ctx('pRL'))
      ultimo = r.status
      if (r.status === 429) { cabecera = r.headers.get('retry-after'); break }
    }
    expect(ultimo).toBe(429)
    expect(Number(cabecera)).toBeGreaterThan(0)
    const antes = fila('pRL').titulo
    const otra = await editar(R('/api/admin/propiedades/pRL', { titulo: 'después del tope' }, 'PATCH'), ctx('pRL'))
    expect(otra.status).toBe(429)
    expect(fila('pRL').titulo).toBe(antes)
  })

  it('IDOR por URL/API: leer, editar, mover y firmar lo ajeno → 403; el listado sólo trae lo suyo', async () => {
    mundo.props = [
      { id: 'pA', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO },
      { id: 'pC', owner_id: 'C', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00002', ...CONTENIDO },
    ]
    const r = await Promise.all([
      leer(R('/api/admin/propiedades/pC', undefined, 'GET'), ctx('pC')),
      editar(R('/api/admin/propiedades/pC', { precio: 1 }, 'PATCH'), ctx('pC')),
      cambiarEstado(R('/api/propiedades/pC/estado', { estado: 'en_revision' }), ctx('pC')),
    ])
    expect(r.map((x) => x.status)).toEqual([403, 403, 403])
    expect(fila('pC')).toMatchObject({ precio: 2_500_000, estado_pub: 'borrador', owner_id: 'C' })
    const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<Record<string, unknown>>
    expect(lista.map((p) => p.id)).toEqual(['pA'])
  })

  it('escalamiento: un publicador no revisa (aprobar, rechazar, pedir cambios) ni siquiera lo suyo, ni toca estatus/gestion', async () => {
    mundo.props = [{ id: 'pA', owner_id: 'A', estado_pub: 'en_revision', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    for (const estado of ['publicada', 'rechazada', 'cambios_solicitados']) {
      expect((await cambiarEstado(R('/api/propiedades/pA/estado', { estado, nota: 'una nota suficientemente larga' }), ctx('pA'))).status, estado).toBe(403)
    }
    expect(fila('pA').estado_pub).toBe('en_revision')
  })

  it('un CLIENTE no entra a nada de esto (403) y una cuenta suspendida tampoco', async () => {
    mundo.sesion = como('C', { rol: 'cliente' })
    expect((await crear(R('/api/publicador/propiedades', { titulo: 'x' }))).status).toBe(403)
    mundo.sesion = como('C', { rol: 'publicador', estado: 'suspendido' })
    expect((await crear(R('/api/publicador/propiedades', { titulo: 'x' }))).status).toBeGreaterThanOrEqual(403)
    expect(mundo.props).toHaveLength(0)
  })
})

// ───────────────────────────── el asistente real no se rompe ─────────────────────────────
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('el asistente de publicación sólo escribe columnas que el servidor acepta', () => {
  it('toda clave que el editor manda con guardar({…}) está en la lista blanca de contenido (si no, se perdería en silencio)', () => {
    const fuente = readFileSync(path.join(__dirname, '..', 'src', 'app', 'publicador', 'propiedades', '[id]', 'editar', 'page.tsx'), 'utf8')
    const claves = new Set<string>()
    for (const m of fuente.matchAll(/guardar\(\{([^}]*)\}\)/g)) {
      for (const k of m[1].matchAll(/(?:^|,)\s*([a-z_]+)\s*:/g)) claves.add(k[1])
    }
    expect(claves.size).toBeGreaterThan(8)   // la extracción funciona (precio, titulo, fotos…)
    const fuera = [...claves].filter((k) => !(CAMPOS_DE_CONTENIDO as readonly string[]).includes(k))
    expect(fuera).toEqual([])
  })

  it('y la lista blanca cubre todas las columnas editables de la tabla que el panel y el asistente usan', () => {
    // columnas de `propiedades` (verificadas en producción) que NO son del servidor ni de moderación: son exactamente el contenido
    const contenidoEnLaBase = ['titulo', 'tipo', 'subtipo', 'operacion', 'precio', 'moneda', 'precio_incluye_iva', 'mantenimiento', 'ubicacion', 'calle', 'colonia', 'ciudad', 'estado_dir', 'cp', 'lat', 'lng', 'precision_ubicacion', 'metros', 'recamaras', 'banos', 'altura_libre', 'andenes', 'descripcion', 'fotos', 'videos', 'planos', 'amenidades', 'extras']
    expect([...CAMPOS_DE_CONTENIDO].sort()).toEqual([...contenidoEnLaBase].sort())
  })
})

// ───────────────────────────── lo que REALMENTE llega a Supabase ─────────────────────────────
const HOSTIL = {
  // contenido legítimo
  titulo: 'Casa en León', precio: 1_000_000, tipo: 'casa', operacion: 'venta',
  // todo lo que un publicador podría intentar colar
  role: 'admin', rol: 'super_admin', tipo_publicador: 'asociado', permisos_override: { publicar_sin_revision: true },
  owner_id: 'B', created_by: 'B', publicador_id: 'B', mostrar_publicador: true, contacto_publico: '4771112233',
  whatsapp: '4771112233', email: 'otro@x.test', telefono: '4771112233', folio: 'VB-1999-99999', slug: 'mi-url',
  estado_pub: 'publicada', estatus: 'vendida', publicada_en: '2020-01-01T00:00:00Z', revision: 'aprobada', audit: { x: 1 },
  created_at: '2000-01-01T00:00:00Z', updated_at: '2000-01-01T00:00:00Z', revisado_por: 'adm@x.test', nota_moderacion: 'aprobada',
  completitud: 100, vistas: 99999, gestion: 'requiere_gestion', id: 'otro-id',
}
const PERMITIDAS_ALTA = new Set<string>([...CAMPOS_DE_CONTENIDO, 'id', 'owner_id', 'estado_pub', 'estatus', 'completitud'])
const PERMITIDAS_EDICION = new Set<string>([...CAMPOS_DE_CONTENIDO, 'completitud'])

describe('«quitar el campo del body» no basta: se comprueba qué llega a Supabase', () => {
  it('ALTA (publicador): el insert sólo lleva contenido válido + lo que pone el servidor; con valores del servidor, no del body', async () => {
    const r = await crear(R('/api/publicador/propiedades', HOSTIL))
    expect(r.status).toBe(200)
    const ins = mundo.escrituras.find((e) => e.tipo === 'insert')!.payload
    expect(Object.keys(ins).filter((k) => !PERMITIDAS_ALTA.has(k))).toEqual([])
    expect(ins).toMatchObject({ owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })
    expect(ins.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ins.id).not.toBe('otro-id')
    expect(ins.completitud).toBeLessThan(100)
    for (const k of ['rol', 'role', 'tipo_publicador', 'permisos_override', 'created_by', 'publicador_id', 'mostrar_publicador', 'contacto_publico', 'whatsapp', 'email', 'telefono', 'folio', 'slug', 'publicada_en', 'revision', 'audit', 'created_at', 'updated_at', 'revisado_por', 'nota_moderacion', 'vistas', 'gestion']) {
      expect(ins, k).not.toHaveProperty(k)
    }
  })

  it('EDICIÓN (publicador): el update sólo lleva contenido válido y completitud; nada de estado, dueño, estatus ni contactos', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    const r = await editar(R('/api/admin/propiedades/p1', HOSTIL, 'PATCH'), ctx('p1'))
    expect(r.status).toBe(200)
    const upd = mundo.escrituras.filter((e) => e.tipo === 'update').map((e) => e.payload)
    expect(upd.length).toBeGreaterThan(0)
    for (const p of upd) expect(Object.keys(p).filter((k) => !PERMITIDAS_EDICION.has(k)), JSON.stringify(Object.keys(p))).toEqual([])
    expect(fila('p1')).toMatchObject({ owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001' })
  })

  it('EDICIÓN (admin): además estatus y gestion, pero NUNCA dueño, estado, folio, slug ni contadores', async () => {
    mundo.sesion = admin()
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    const r = await editar(R('/api/admin/propiedades/p1', HOSTIL, 'PATCH'), ctx('p1'))
    expect(r.status).toBe(200)
    const permitidas = new Set<string>([...PERMITIDAS_EDICION, ...CAMPOS_SOLO_MODERADOR])
    for (const p of mundo.escrituras.filter((e) => e.tipo === 'update').map((e) => e.payload)) expect(Object.keys(p).filter((k) => !permitidas.has(k))).toEqual([])
    expect(fila('p1')).toMatchObject({ owner_id: 'A', estado_pub: 'borrador', folio: 'VB-2026-00001', estatus: 'vendida', gestion: 'requiere_gestion' })
  })
})

describe('superficie HTTP: sólo existen los métodos previstos; PUT/DELETE del publicador no existen o se niegan', () => {
  const verbos = (m: Record<string, unknown>) => Object.keys(m).filter((k) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(k)).sort()
  it('las rutas de escritura de propiedades exponen sólo lo previsto (lo demás lo rechaza Next con 405)', () => {
    expect(verbos(rutaPublicador)).toEqual(['GET', 'POST'])
    expect(verbos(rutaEditar)).toEqual(['DELETE', 'GET', 'PATCH'])
    expect(verbos(rutaEstado)).toEqual(['POST'])
    expect(verbos(rutaAlta)).toEqual(['GET', 'POST'])
  })

  it('DELETE (borrado definitivo) es sólo de la casa: un publicador no borra ni lo suyo ni lo ajeno', async () => {
    mundo.props = [
      { id: 'pA', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO },
      { id: 'pC', owner_id: 'C', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00002', ...CONTENIDO },
    ]
    for (const id of ['pA', 'pC']) expect((await borrar(R(`/api/admin/propiedades/${id}`, undefined, 'DELETE'), ctx(id))).status, id).toBe(403)
    expect(mundo.props.map((p) => p.id)).toEqual(['pA', 'pC'])
  })
})

describe('pies de foto', () => {
  it('sanearPies: sólo un objeto plano de URLs https → texto corto', () => {
    expect(sanearPies(undefined)).toEqual({ ok: true })
    expect(sanearPies({ [foto(1)]: 'Fachada' })).toEqual({ ok: true, pies: { [foto(1)]: 'Fachada' } })
    for (const mala of [null, 'texto', ['a'], 7, { x: 'sin url' }, { [foto(1)]: 5 }, { [foto(1)]: 'x'.repeat(401) }, { 'javascript:alert(1)': 'x' }, Object.fromEntries(Array.from({ length: 80 }, (_, i) => [foto(i), 'x']))]) {
      expect(sanearPies(mala), JSON.stringify(mala)?.slice(0, 40)).toEqual({ ok: false })
    }
  })

  it('PATCH: pies mal formados → 400 y no se escribe nada; buenos → 200 y NUNCA llegan como columna de propiedades', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    expect((await editar(R('/api/admin/propiedades/p1', { pies: 'oops' }, 'PATCH'), ctx('p1'))).status).toBe(400)
    expect((await editar(R('/api/admin/propiedades/p1', { pies: { [foto(1)]: 5 } }, 'PATCH'), ctx('p1'))).status).toBe(400)
    expect(mundo.escrituras).toEqual([])
    expect((await editar(R('/api/admin/propiedades/p1', { pies: { [foto(1)]: 'Fachada principal' } }, 'PATCH'), ctx('p1'))).status).toBe(200)
    for (const e of mundo.escrituras) expect(e.payload).not.toHaveProperty('pies')
  })
})

describe('auditoría de la edición: antes → después donde importa, sin datos personales ni volcados', () => {
  it('editar una propiedad PUBLICADA deja qué cambió (antes/después), quién y cuál', async () => {
    mundo.sesion = asociado()
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'publicada', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    const r = await editar(R('/api/admin/propiedades/pB', { precio: 2_400_000, fotos: [...FOTOS_OK.slice(0, 5)], titulo: 'Casa remodelada en León' }, 'PATCH'), ctx('pB'))
    expect(r.status).toBe(200)
    const a = mundo.auditoria.at(-1)!
    expect(a).toMatchObject({ accion: 'propiedad.editar', entidadId: 'pB' })
    expect((a as { actor: { uid: string } }).actor.uid).toBe('B')
    expect(a.antes).toEqual({ precio: 2_500_000, fotos: { n: 6 }, titulo: { n: 12 } })   // el texto libre NO se vuelca: sólo su longitud
    expect(a.despues as Record<string, unknown>).toMatchObject({ precio: 2_400_000, fotos: { n: 5 }, titulo: { n: 23 } })
    expect(JSON.stringify({ antes: a.antes, despues: a.despues })).not.toMatch(/res\.cloudinary\.com|@ejemplo\.test|4771112233/)   // ni las URLs de las fotos ni contactos en el detalle
  })

  it('un borrador que se autoguarda NO lleva detalle (serían miles de filas); sólo los campos tocados', async () => {
    mundo.props = [{ id: 'p1', owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO }]
    await editar(R('/api/admin/propiedades/p1', { precio: 1_900_000 }, 'PATCH'), ctx('p1'))
    const a = mundo.auditoria.at(-1)!
    expect(a.antes).toBeUndefined()
    expect(a.despues).toMatchObject({ campos: ['precio'] })
    expect(a.despues).not.toHaveProperty('precio')
  })

  it('diferenciasDeContenido: sólo lo que cambió; textos largos recortados; listas por cantidad; objetos sin volcar', () => {
    const d = diferenciasDeContenido({ precio: 1, titulo: 'a'.repeat(300), extras: { a: 1 }, fotos: [1, 2], tipo: 'casa' }, { precio: 1, titulo: 'b'.repeat(300), extras: { a: 2 }, fotos: [1, 2, 3], tipo: 'casa' })
    expect(Object.keys(d.antes).sort()).toEqual(['extras', 'fotos', 'titulo'])
    expect(d.antes.titulo).toEqual({ n: 300 })
    expect(d.antes.fotos).toEqual({ n: 2 })
    expect(d.despues.fotos).toEqual({ n: 3 })
    expect(d.despues.extras).toBe('[objeto]')
  })
})

describe('mensajes de error legibles', () => {
  it('el publicador lee «Precio», no `precio`', async () => {
    const r = await crear(R('/api/publicador/propiedades', { precio: -1, fotos: ['https://evil.example/x.jpg'] }))
    expect(r.status).toBe(400)
    const { error } = await r.json()
    expect(error).toMatch(/Precio: número fuera de rango/)
    expect(error).toMatch(/Fotos: sólo imágenes subidas desde el asistente/)
    expect(error).not.toMatch(/precio:|fotos:/)
  })
})

describe('la bitácora no guarda datos personales ni texto libre (Codex L2 P1)', () => {
  it('descripción con teléfono/correo, calle y coordenadas: sólo longitud o marcador', async () => {
    mundo.sesion = asociado()
    mundo.props = [{ id: 'pB', owner_id: 'B', estado_pub: 'publicada', estatus: 'disponible', folio: 'VB-2026-00001', ...CONTENIDO, calle: 'Calle vieja 1', lat: 21.1, lng: -101.7 }]
    const nueva = 'Llámame al 477 123 4567 o escribe a dueno.privado@correo.example, vivo en Calle Secreta 99.'
    const r = await editar(R('/api/admin/propiedades/pB', { descripcion: nueva, calle: 'Calle Secreta 99', lat: 21.2, lng: -101.8, precio: 3_000_000 }, 'PATCH'), ctx('pB'))
    expect(r.status).toBe(200)
    const a = mundo.auditoria.at(-1)!
    const detalle = JSON.stringify({ antes: a.antes, despues: a.despues })
    expect(detalle).not.toMatch(/477|4567|dueno\.privado|correo\.example|Calle Secreta|Calle vieja|21\.2|-101\.8|21\.1/)
    expect(a.despues).toMatchObject({ precio: 3_000_000, descripcion: { n: nueva.length }, calle: { n: 16 }, lat: '[coordenadas]', lng: '[coordenadas]' })
  })

  it('diferenciasDeContenido: texto libre y coordenadas nunca en claro; un enumerado corto sí', () => {
    const d = diferenciasDeContenido({ titulo: 'a', tipo: 'casa', lat: 1 }, { titulo: 'dueño 4771234567', tipo: 'nave', lat: 2, descripcion: 'x@y.com' })
    expect(JSON.stringify(d)).not.toMatch(/4771234567|x@y\.com|dueño/)
    expect(d.antes).toMatchObject({ tipo: 'casa', lat: '[coordenadas]' })
    expect(d.despues).toMatchObject({ tipo: 'nave', titulo: { n: 16 }, descripcion: { n: 7 } })
  })
})

describe('tope de borradores bajo concurrencia (Codex L2 P2)', () => {
  it('peticiones PARALELAS con 29 abiertos no dejan más de 30: las que se pasan se revierten con 409', async () => {
    for (let i = 0; i < MAXIMO_BORRADORES_POR_CUENTA - 1; i++) mundo.props.push({ id: `b${i}`, owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => crear(R('/api/publicador/propiedades', { titulo: 'Paralela' }))))
    const abiertas = mundo.props.filter((p) => p.owner_id === 'A' && ['borrador', 'cambios_solicitados', 'rechazada'].includes(String(p.estado_pub))).length
    expect(abiertas).toBeLessThanOrEqual(MAXIMO_BORRADORES_POR_CUENTA)
    expect(respuestas.every((r) => r.status === 200 || r.status === 409)).toBe(true)
    expect(respuestas.filter((r) => r.status === 409).length).toBeGreaterThan(0)
  })
})

describe('si la reversa del tope falla, se dice (no se finge un 409 limpio)', () => {
  it('con el borrado caído: 503 explícito y registro en el servidor', async () => {
    for (let i = 0; i < MAXIMO_BORRADORES_POR_CUENTA; i++) mundo.props.push({ id: `b${i}`, owner_id: 'A', estado_pub: 'borrador', estatus: 'disponible' })
    // 30 abiertos: el conteo previo ya lo frena (409); para llegar a la reversa se simula la carrera: 29 al contar, 31 al re-contar
    mundo.props = mundo.props.slice(0, MAXIMO_BORRADORES_POR_CUENTA - 1)
    mundo.borradoFalla = true
    const extra = vi.spyOn(console, 'error').mockImplementation(() => {})
    const antesDeInsertar = mundo.props.length
    // dos altas paralelas con 29: ambas pasan el conteo previo, ambas se pasan del tope al re-contar
    const rs = await Promise.all([crear(R('/api/publicador/propiedades', { titulo: 'a' })), crear(R('/api/publicador/propiedades', { titulo: 'b' }))])
    expect(rs.map((r) => r.status).sort()).toEqual([503, 503])
    expect(extra).toHaveBeenCalled()
    expect(mundo.props.length).toBeGreaterThan(antesDeInsertar)
    extra.mockRestore()
  })
})
