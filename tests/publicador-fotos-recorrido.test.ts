import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * RECORRIDO DE LAS IMÁGENES de un anuncio de asociado/publicador (E-48, 15-oct-2026), de punta a punta y SIN servicios reales:
 *
 *   seleccionar archivo → cliente REAL de subida (`subirImagen`) → ruta REAL `/api/medios/firma` → «Cloudinary» simulado que VALIDA la
 *   firma SHA-1 exactamente como lo hace Cloudinary → `secure_url` → cola REAL de fotos + guardador REAL → PATCH REAL del anuncio →
 *   PUBLICAR con la ruta REAL de estado → REABRIR con el listado y la lectura REALES.
 *
 * Demuestra, en local, que una foto que Cloudinary acepta (porque la firma cuadra) es una foto que el servidor guarda, que sigue ahí
 * después de publicar y al reabrir, y que un fallo del servidor nunca borra lo ya guardado. NO demuestra nada sobre la cuenta real de
 * Cloudinary (eso exige un entorno de staging con su propia nube; ver E-48): aquí «Cloudinary» es una función de esta prueba.
 * Todo sintético: ninguna clave, nube ni cuenta real.
 */

const NUBE = 'nube-prueba'
const CLAVE = 'clave-de-prueba'
const SECRETO = 'secreto-de-prueba'

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'B', email: 'b@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'asociado' } as Record<string, unknown> },
  tablas: { propiedades: [] as Array<Record<string, unknown>>, usuarios: [] as Array<Record<string, unknown>>, fotos: [] as Array<Record<string, unknown>> },
  auditoria: [] as Array<Record<string, unknown>>,
  /** Lo que «Cloudinary» aceptó y guardó: public_id → url entregada. */
  nube: new Map<string, string>(),
  /** Cuántas subidas rechazó «Cloudinary» y por qué (firma mala, formato…). */
  rechazos: [] as string[],
}))

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'token-de-prueba' } } }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  type Tabla = keyof typeof mundo.tablas
  const cadena = (nombre: string) => {
    const tabla = nombre as Tabla
    const filtros: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    let cambios: Record<string, unknown> | null = null
    let nuevas: Array<Record<string, unknown>> | null = null
    let borrando = false
    const c: Record<string, unknown> = {}
    const filas = () => (mundo.tablas[tabla] ?? []).filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) soloConteo = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.order = () => c
    c.delete = () => { borrando = true; return c }
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.insert = (f: Record<string, unknown> | Array<Record<string, unknown>>) => { nuevas = Array.isArray(f) ? f : [f]; return c }
    c.maybeSingle = async () => ({ data: filas()[0] ? { ...filas()[0] } : null, error: null })
    c.then = (r: (v: unknown) => unknown) => {
      if (borrando) {
        const quitadas = filas()
        ;(mundo.tablas as Record<string, Array<Record<string, unknown>>>)[nombre] = mundo.tablas[tabla].filter((f) => !quitadas.includes(f))
        return r({ data: quitadas.map((f) => ({ id: f.id })), error: null })
      }
      if (nuevas) {
        for (const n of nuevas) (mundo.tablas[tabla] as Array<Record<string, unknown>>).push(tabla === 'propiedades' ? { folio: `VB-2026-${String(mundo.tablas.propiedades.length + 1).padStart(5, '0')}`, ...n } : { ...n })
        return r({ data: null, error: null })
      }
      if (cambios) { const afectadas = filas(); for (const f of afectadas) Object.assign(f, cambios); return r({ data: afectadas.map((f) => ({ id: f.id })), error: null }) }
      if (soloConteo) return r({ data: null, error: null, count: filas().length })
      return r({ data: filas().map((f) => ({ ...f })), error: null })
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
        fn === 'propiedad_cambiar_estado' ? propiedadCambiarEstado(mundo.tablas.propiedades, mundo.auditoria, a) : { data: null, error: { message: `rpc inesperada ${fn}` } },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) } }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'
import { POST as firmar } from '../src/app/api/medios/firma/route'
import { PATCH as editar, GET as leer } from '../src/app/api/admin/propiedades/[id]/route'
import { POST as crear, GET as listar } from '../src/app/api/publicador/propiedades/route'
import { POST as cambiarEstado } from '../src/app/api/propiedades/[id]/estado/route'
import { subirImagen } from '../src/lib/medios/subir'
import { agregarSinDuplicar, procesarCarga } from '../src/lib/publicador/cola-fotos'
import { crearGuardador } from '../src/lib/publicador/guardador'
import { esUrlDeNuestraNube } from '../src/lib/sanear-propiedad'
import { MINIMO_FOTOS } from '../src/lib/esquemas/propiedad'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const fila = (id: string) => mundo.tablas.propiedades.find((p) => p.id === id)!

const CONTENIDO = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio y cochera para dos autos.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180,
}
const archivo = (n: number) => new File([`bytes-de-imagen-${n}`], `foto-${n}.jpg`, { type: 'image/jpeg' })

/**
 * «Cloudinary»: recibe el POST de subida y hace lo que hace el de verdad con una subida FIRMADA: recalcula la firma
 * SHA-1(parámetros ordenados `k=v` unidos con & + secreto) y, si no cuadra, rechaza. Si cuadra, guarda el recurso y devuelve su `secure_url`
 * con la forma real: `https://res.cloudinary.com/<nube>/image/upload/v<versión>/<public_id>.<formato>`.
 */
function cloudinarySimulado(url: string, fd: FormData): Response {
  const nube = new URL(url).pathname.split('/')[2]
  const campos: Record<string, string> = {}
  for (const [k, v] of fd.entries()) if (k !== 'file') campos[k] = String(v)
  const { signature, api_key: apiKey, ...firmados } = campos
  const texto = Object.keys(firmados).filter((k) => !['cloud_name', 'resource_type'].includes(k)).sort().map((k) => `${k}=${firmados[k]}`).join('&')
  const esperada = createHash('sha1').update(texto + SECRETO).digest('hex')
  const rechazar = (mensaje: string) => { mundo.rechazos.push(mensaje); return Response.json({ error: { message: mensaje } }, { status: 400 }) }
  if (apiKey !== CLAVE) return rechazar('Invalid api_key')
  if (signature !== esperada) return rechazar('Invalid Signature')
  const antiguedad = Date.now() / 1000 - Number(firmados.timestamp)
  if (!Number.isFinite(antiguedad) || antiguedad > 3600) return rechazar('Stale request')
  const archivoSubido = fd.get('file')
  if (!(archivoSubido instanceof File)) return rechazar('Missing file')
  const formato = archivoSubido.name.split('.').pop()!.toLowerCase()
  if (!(firmados.allowed_formats ?? '').split(',').includes(formato)) return rechazar('Format not allowed')
  const publicId = firmados.public_id
  if (!publicId) return rechazar('Missing public_id')
  const secureUrl = `https://res.cloudinary.com/${nube}/image/upload/v1700000000/${publicId}.${formato}`
  mundo.nube.set(publicId, secureUrl)
  return Response.json({ public_id: publicId, asset_folder: firmados.asset_folder, secure_url: secureUrl, format: formato })
}

/** El navegador: `fetch` a nuestra API llama a la ruta real; `fetch` a Cloudinary llama a la simulación. */
function instalarRed() {
  vi.stubGlobal('fetch', async (entrada: string | URL, init?: RequestInit) => {
    const url = String(entrada)
    if (url === '/api/medios/firma') return firmar(R('/api/medios/firma', JSON.parse(String(init?.body)), 'POST'))
    if (url.startsWith('https://api.cloudinary.com/v1_1/')) return cloudinarySimulado(url, init!.body as FormData)
    throw new Error(`petición inesperada en la prueba: ${url}`)
  })
}

/** Lo que hace el asistente: subir → cola → lista ACTUAL → guardador → PATCH real. Devuelve lo necesario para seguir el recorrido. */
async function subirYGuardar(id: string, cuantas: number, inicial: string[] = []) {
  let fotos = [...inicial]
  const patches: Array<Record<string, unknown>> = []
  const g = crearGuardador({
    retardoMs: 5,
    enviar: async (cambios) => {
      patches.push(cambios)
      const res = await editar(R(`/api/admin/propiedades/${id}`, cambios, 'PATCH'), ctx(id))
      if (res.ok) return { ok: true }
      return { ok: false, error: (await res.json().catch(() => ({}))).error ?? 'No se pudo guardar.' }
    },
  })
  for (let i = 0; i < cuantas; i++) {
    const r = await procesarCarga({
      archivo: archivo(i + 1),
      subir: (a) => subirImagen(a, { proposito: 'propiedad', propiedadId: id, clase: 'fotos' }),
      agregar: (url) => {
        const { lista, agregada } = agregarSinDuplicar(fotos, url, 50)
        if (agregada) { fotos = lista; g.guardar({ fotos: lista }) }
        return agregada
      },
    })
    expect(r.estado, `la subida ${i + 1}`).toBe('ok')
  }
  const guardado = await g.vaciar()
  return { fotos, guardado, patches, g }
}

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_API_KEY', CLAVE)
  vi.stubEnv('CLOUDINARY_API_SECRET', SECRETO)
  vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', NUBE)
  instalarRed()
  mundo.sesion = { uid: 'B', email: 'b@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'asociado' } }
  mundo.tablas = {
    propiedades: [],
    usuarios: [{ uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Asociada de prueba', telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: 'asociado', permisos_override: {} }],
    fotos: [],
  }
  mundo.auditoria = []
  mundo.nube = new Map()
  mundo.rechazos = []
})

// Distintas formas en que la variable de la nube puede estar guardada en el entorno: el recorrido debe funcionar con todas (E-48, C3).
describe.each([
  ['limpia', NUBE],
  ['con un espacio al final', `${NUBE} `],
  ['con un salto de línea al final (típico al pegar el valor)', `${NUBE}\n`],
  ['con retorno de carro y salto', `${NUBE}\r\n`],
])('ASOCIADO — recorrido de 5 imágenes con la nube %s', (_nombre, valorDeLaVariable) => {
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', valorDeLaVariable) })

  it('se suben a Cloudinary, se guardan, siguen al publicar y están al reabrir', async () => {
    // 1 · alta del borrador y contenido
    const c = await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))
    expect(c.status).toBe(200)
    const { id } = await c.json()
    expect((await editar(R(`/api/admin/propiedades/${id}`, CONTENIDO, 'PATCH'), ctx(id))).status).toBe(200)

    // 2 · seleccionar 5 imágenes → subida firmada a Cloudinary → guardado
    const { fotos, guardado } = await subirYGuardar(id, MINIMO_FOTOS)
    expect(guardado).toEqual({ ok: true })
    expect(fotos).toHaveLength(MINIMO_FOTOS)

    // 2a · terminaron en «Cloudinary»: cada URL guardada es EXACTAMENTE la que la nube entregó, y la firma había cuadrado
    expect(mundo.rechazos).toEqual([])
    expect(new Set(mundo.nube.values())).toEqual(new Set(fotos))
    for (const url of fotos) {
      expect(url.startsWith(`https://res.cloudinary.com/${NUBE}/image/upload/`)).toBe(true)
      expect(esUrlDeNuestraNube(url, valorDeLaVariable), url).toBe(true)
      expect(url, 'la imagen quedó en la carpeta de ESTE anuncio').toContain(String(id))
    }

    // 2b · asociadas al anuncio: en la fila y en la tabla `fotos`
    expect(fila(id).fotos).toEqual(fotos)
    expect(mundo.tablas.fotos.filter((f) => f.propiedad_id === id).map((f) => f.url).sort()).toEqual([...fotos].sort())

    // 3 · publicar (el asociado publica directo)
    const pub = await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'publicada' }), ctx(id))
    expect(pub.status).toBe(200)
    expect(fila(id).estado_pub).toBe('publicada')
    expect(fila(id).fotos, 'publicar no toca las fotos').toEqual(fotos)

    // 4 · volver a abrir: listado del publicador y lectura del anuncio
    const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<Record<string, unknown>>
    expect(lista.find((p) => p.id === id)).toMatchObject({ estado_pub: 'publicada', fotos })
    const abierto = await (await leer(R(`/api/admin/propiedades/${id}`, undefined, 'GET'), ctx(id))).json()
    expect(abierto.propiedad.fotos).toEqual(fotos)
  })
})

describe('el servidor no pierde lo ya guardado cuando algo sale mal', () => {
  it('una foto NO subida desde el asistente (otro sitio) hace fallar el guardado, avisa y las anteriores siguen guardadas y en cola', async () => {
    const { id } = await (await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))).json()
    await editar(R(`/api/admin/propiedades/${id}`, CONTENIDO, 'PATCH'), ctx(id))
    const { fotos, g } = await subirYGuardar(id, MINIMO_FOTOS)
    expect(fila(id).fotos).toEqual(fotos)

    // alguien intenta guardar una sexta imagen que NO salió de nuestra nube
    g.guardar({ fotos: [...fotos, 'https://otro-sitio.example/foto.jpg'] })
    const r = await g.vaciar()
    expect(r.ok).toBe(false)
    expect(fila(id).fotos, 'lo ya guardado sigue intacto').toEqual(fotos)
    expect(g.hayPendiente(), 'y el cambio rechazado NO se descarta en silencio: queda para reintentar o corregir').toBe(true)
  })

  it('con la firma alterada «Cloudinary» rechaza y la foto no se guarda (el navegador no puede decidir carpeta ni nombre)', async () => {
    const { id } = await (await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))).json()
    vi.stubGlobal('fetch', async (entrada: string | URL, init?: RequestInit) => {
      const url = String(entrada)
      if (url === '/api/medios/firma') return firmar(R('/api/medios/firma', JSON.parse(String(init?.body)), 'POST'))
      const fd = init!.body as FormData
      fd.set('public_id', 'vivebien/otra-carpeta/ajena')   // el navegador cambia el destino firmado
      return cloudinarySimulado(url, fd)
    })
    const r = await subirImagen(archivo(1), { proposito: 'propiedad', propiedadId: id, clase: 'fotos' })
    expect(r).toEqual({ ok: false, motivo: 'Invalid Signature' })
    expect(mundo.nube.size).toBe(0)
  })

  it('un anuncio de OTRA persona no recibe firma: nadie sube fotos a un anuncio ajeno', async () => {
    const { id } = await (await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))).json()
    mundo.sesion = { uid: 'C', email: 'c@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'publicador' } }
    const r = await subirImagen(archivo(1), { proposito: 'propiedad', propiedadId: id, clase: 'fotos' })
    expect(r.ok).toBe(false)
    expect(mundo.nube.size).toBe(0)
  })
})

describe('publicador normal: el mínimo de fotos se cumple de punta a punta', () => {
  it('con 4 fotos no se envía a revisión (400); con 5 sí, y quedan al reabrir', async () => {
    mundo.sesion = { uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', tipo_publicador: 'publicador' } }
    mundo.tablas.usuarios.push({ uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Publicadora de prueba', telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: 'publicador', permisos_override: {} })
    const { id } = await (await crear(R('/api/publicador/propiedades', { titulo: 'Casa nueva' }))).json()
    await editar(R(`/api/admin/propiedades/${id}`, CONTENIDO, 'PATCH'), ctx(id))

    const cuatro = await subirYGuardar(id, MINIMO_FOTOS - 1)
    expect(cuatro.guardado).toEqual({ ok: true })
    const corto = await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'en_revision' }), ctx(id))
    expect(corto.status).toBe(400)
    expect(fila(id).estado_pub).toBe('borrador')
    expect(fila(id).fotos, 'el rechazo no borra las 4').toEqual(cuatro.fotos)

    const cinco = await subirYGuardar(id, 1, cuatro.fotos)
    expect(cinco.fotos).toHaveLength(MINIMO_FOTOS)
    expect((await cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado: 'en_revision' }), ctx(id))).status).toBe(200)
    const abierto = await (await leer(R(`/api/admin/propiedades/${id}`, undefined, 'GET'), ctx(id))).json()
    expect(abierto.propiedad).toMatchObject({ estado_pub: 'en_revision', fotos: cinco.fotos })
  })
})
