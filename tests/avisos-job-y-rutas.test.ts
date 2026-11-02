import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'

// Todo correo reserva cupo en el libro (migración 62 REAL en PGlite): ningún envío de prueba se salta la cuenta del plan gratuito.
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))
let libro: Libro
beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
beforeEach(async () => { await libro.vaciar() })
afterAll(async () => { await libro?.cerrar() })
import { crearBase, type Fila } from './dobles/supabase-memoria'

// MKT-60: estas pruebas ejercitan el camino con la compuerta común ENCENDIDA; el camino apagado lo cubre tests/correo-compuerta-envio.test.ts.
process.env.CORREO_ENVIO = '1'

/**
 * La tarea de avisos a clientes y las rutas del portal (28-oct-2026): contactos, notificaciones, preferencias y baja en un clic.
 * Supabase y Resend DE MEMORIA: nada sale a la red. Se prueba lo que importa: idempotencia, consentimiento, aislamiento entre personas y que lo fallido se reintente sin duplicar.
 */
type Perfil = { uid: string; email: string; rol: string; superAdmin: boolean }
const estado = vi.hoisted(() => ({ perfil: null as null | { uid: string; email: string; rol: string; superAdmin: boolean }, base: null as null | ReturnType<typeof import('./dobles/supabase-memoria').crearBase>, bitacora: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => estado.base }))
vi.mock('@/lib/portal/exigir-portal', async () => {
  const { NextResponse } = await import('next/server')
  return { exigirPortal: async () => (estado.perfil ? { perfil: estado.perfil } : { error: NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 }) }) }
})
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { estado.bitacora.push(e) } }))

const ANA: Perfil = { uid: 'u-ana', email: 'ana@ejemplo.invalid', rol: 'cliente', superAdmin: false }
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
const prop = (id: string, sobre: Fila = {}): Fila => ({ id, titulo: `Casa ${id}`, tipo: 'casa', operacion: 'venta', precio: 3_000_000, precio_incluye_iva: false, moneda: 'MXN', ubicacion: 'León', colonia: 'Cañada', ciudad: 'León', metros: 200, recamaras: 3, banos: 2, altura_libre: null, andenes: null, estatus: 'disponible', estado_pub: 'publicada', slug: `casa-${id}`, folio: `VB-2026-0000${id.length}`, fotos: [], publicada_en: hace(1), created_at: hace(1), extras: null, ...sobre })
const POST = (url: string, cuerpo: unknown) => new Request(`https://vb.test${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const GET = (url: string) => new Request(`https://vb.test${url}`)

let enviados: Array<{ to: string[]; subject: string; text: string; html: string; headers?: Record<string, string> }> = []
let resendOk = true
beforeEach(() => {
  process.env.RESEND_API_KEY = 're_prueba'; process.env.CRON_SECRET = 'secreto-de-prueba-largo-123456'
  enviados = []; resendOk = true; estado.perfil = ANA; estado.bitacora = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    if (String(url).includes('api.resend.com')) { if (!resendOk) return new Response('', { status: 500 }); enviados.push(JSON.parse(init.body)); return new Response('{"id":"re_1"}', { status: 200 }) }
    throw new Error('red no permitida en la prueba')
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('tarea de avisos a clientes', () => {
  const base = () => crearBase({
    usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }, { uid: 'u-luis', email: 'luis@ejemplo.invalid', nombre: 'Luis', estado: 'activo' }, { uid: 'u-baja', email: null, nombre: null, estado: 'eliminada' }],
    propiedades: [prop('a'), prop('b', { publicada_en: hace(0.5), created_at: hace(0.5) }), prop('terreno', { tipo: 'terreno' })],
    busquedas_guardadas: [
      { id: 1, uid: 'u-ana', nombre: 'Casas en León', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null },
      { id: 2, uid: 'u-luis', nombre: 'Sin avisos', filtros: { op: 'venta', tipo: 'casa' }, alertas: false, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null },
      { id: 3, uid: 'u-ana', nombre: 'Semanal reciente', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'semanal', creado_en: hace(30), avisada_en: hace(2) },
    ],
    preferencias_notificacion: [{ uid: 'u-ana', correo_alertas: true, correo_legal: true }],
    legal_aceptaciones: [],
    notificaciones: [],
  }, { unicas: { notificaciones: ['uid', 'clave'] } }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })

  it('crea un aviso por propiedad nueva SOLO para búsquedas con avisos y a las que les toca; manda UN correo con baja en un clic', async () => {
    estado.base = base()
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r).toMatchObject({ busquedasRevisadas: 1, notificacionesNuevas: 2, correosEnviados: 1, correosFallidos: 0 })
    const ns = estado.base!.tablas.notificaciones
    expect(ns.map((n) => [n.uid, n.propiedad_id]).sort()).toEqual([['u-ana', 'a'], ['u-ana', 'b']])
    expect(estado.base!.tablas.busquedas_guardadas.find((b) => b.id === 1)!.avisada_en).toBeTruthy()
    expect(estado.base!.tablas.busquedas_guardadas.find((b) => b.id === 3)!.avisada_en).not.toBeNull() // la semanal reciente no se tocó
    expect(enviados).toHaveLength(1)
    expect(enviados[0].to).toEqual(['ana@ejemplo.invalid'])
    expect(enviados[0].subject).toContain('2 propiedades nuevas')
    expect(enviados[0].html).toMatch(/\/api\/avisos\/baja\?t=/)
    expect(enviados[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(ns.every((n) => n.correo_enviado_en)).toBe(true)
  })

  it('IDEMPOTENTE: repetir la tarea no duplica avisos ni correos', async () => {
    estado.base = base()
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    await avisosDeClientes()
    const r2 = await avisosDeClientes()
    expect(r2).toMatchObject({ notificacionesNuevas: 0, correosEnviados: 0 })
    expect(estado.base!.tablas.notificaciones).toHaveLength(2)
    expect(enviados).toHaveLength(1)
  })

  it('SIN consentimiento no se manda correo (el aviso queda en la bandeja)', async () => {
    estado.base = base(); estado.base.tablas.preferencias_notificacion[0].correo_alertas = false
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r.notificacionesNuevas).toBe(2); expect(r.correosEnviados).toBe(0); expect(enviados).toEqual([])
    expect(estado.base.tablas.notificaciones.every((n) => !n.correo_enviado_en)).toBe(true)
  })

  it('si Resend falla NO se marca como enviado y se reintenta al día siguiente SIN duplicar avisos', async () => {
    estado.base = base(); resendOk = false
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r1 = await avisosDeClientes()
    expect(r1).toMatchObject({ correosEnviados: 0, correosFallidos: 1 })
    expect(estado.base.tablas.notificaciones.every((n) => !n.correo_enviado_en)).toBe(true)
    resendOk = true
    // «Al día siguiente»: el envío fallido de la primera corrida ya tiene más de 10 minutos en el libro y se puede reintentar con su misma clave.
    await libro.pg.exec("update public.correo_envios set creado_en = now() - interval '11 minutes'")
    const r2 = await avisosDeClientes()
    expect(r2).toMatchObject({ notificacionesNuevas: 0, correosEnviados: 1, correosFallidos: 0 })
    expect(estado.base.tablas.notificaciones).toHaveLength(2)
  })

  it('cambio de Términos: avisa a quien aceptó una versión anterior (bandeja + correo de servicio) y no a quien ya la aceptó', async () => {
    estado.base = base(); estado.base.tablas.busquedas_guardadas.length = 0
    const { VERSIONES } = await import('../src/lib/aceptacion-legal')
    estado.base.tablas.legal_aceptaciones.push({ uid: 'u-ana', documento: 'terminos', version: '2020-01-01' }, { uid: 'u-luis', documento: 'terminos', version: VERSIONES.terminos })
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r.legalesNuevas).toBe(1)
    expect(estado.base.tablas.notificaciones[0]).toMatchObject({ uid: 'u-ana', tipo: 'legal' })
    expect(enviados).toHaveLength(1); expect(enviados[0].subject).toContain('Términos')
  })

  it('el aviso legal por correo se puede apagar (sigue en la bandeja) y una cuenta eliminada no recibe nada', async () => {
    estado.base = base(); estado.base.tablas.busquedas_guardadas.length = 0
    estado.base.tablas.preferencias_notificacion[0].correo_legal = false
    estado.base.tablas.legal_aceptaciones.push({ uid: 'u-ana', documento: 'privacidad', version: '2020-01-01' }, { uid: 'u-baja', documento: 'privacidad', version: '2020-01-01' })
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    await avisosDeClientes()
    expect(estado.base.tablas.notificaciones.map((n) => n.uid).sort()).toEqual(['u-ana', 'u-baja'])
    expect(enviados).toEqual([])
  })

  it('sin llave de Resend no se envía nada y no se rompe', async () => {
    delete process.env.RESEND_API_KEY
    estado.base = base()
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r.notificacionesNuevas).toBe(2); expect(enviados).toEqual([])
  })

  // FALLA CERRADA (30-oct-2026): los valores por omisión ACTIVADOS solo valen si la lectura salió bien y la persona no tiene elección guardada.
  it('si fallan LAS DOS lecturas de preferencias (con y sin correo_precio) NO se manda ningún correo y no se usan los valores por omisión', async () => {
    estado.base = crearBase({
      usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }],
      propiedades: [prop('a')],
      busquedas_guardadas: [{ id: 1, uid: 'u-ana', nombre: 'Casas en León', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null }],
      legal_aceptaciones: [{ uid: 'u-ana', documento: 'privacidad', version: '2020-01-01' }],
      notificaciones: [],
    }, { unicas: { notificaciones: ['uid', 'clave'] }, sinTabla: ['preferencias_notificacion'] }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })
    const consultas: string[] = []
    const desde = estado.base.from.bind(estado.base)
    estado.base.from = ((n: string) => { if (n === 'preferencias_notificacion') consultas.push(n); return desde(n) }) as typeof estado.base.from
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    err.mockRestore()
    expect(consultas.length).toBe(2) // se intentaron las dos: con y sin la columna de precio
    expect(r.omitido).toBe('sin_preferencias')
    expect(r.correosEnviados).toBe(0)
    expect(enviados).toEqual([]) // el emisor ni se llamó: ninguna petición a Resend
    expect(await libro.usados()).toBe(0) // y no se reservó cupo
  })

  it('cuenta NUEVA sin fila de preferencias y SIN acción afirmativa (sin búsqueda con «Avisarme», sin campana de precio): no recibe NINGÚN correo, aunque los avisos vengan activados por omisión', async () => {
    estado.base = crearBase({
      usuarios: [{ uid: 'u-nueva', email: 'nueva@ejemplo.invalid', nombre: 'Nueva', estado: 'activo' }],
      propiedades: [prop('a')],
      busquedas_guardadas: [{ id: 1, uid: 'u-nueva', nombre: 'Sin avisos', filtros: { op: 'venta', tipo: 'casa' }, alertas: false, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null }],
      legal_aceptaciones: [],
      cliente_avisos_precio: [],
      notificaciones: [],
    }, { unicas: { notificaciones: ['uid', 'clave'] } }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    const r = await avisosDeClientes()
    expect(r.correosEnviados).toBe(0)
    expect(enviados).toEqual([])
  })

  it('una elección GUARDADA se respeta (apagado = no se manda) y el valor por omisión solo aplica a quien no tiene fila', async () => {
    estado.base = base()
    estado.base.tablas.preferencias_notificacion[0].correo_alertas = false // Ana eligió apagar
    estado.base.tablas.busquedas_guardadas.push({ id: 9, uid: 'u-luis', nombre: 'Luis sí', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null }) // Luis no tiene fila
    const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
    await avisosDeClientes()
    expect(enviados.map((e) => e.to[0])).toEqual(['luis@ejemplo.invalid'])
  })
})

describe('POST/GET /api/portal/contactos', () => {
  const montar = () => { estado.base = crearBase({ propiedades: [prop('a', { titulo: 'Nave Mandujano', folio: 'VB-2026-00006' }), prop('borrador', { estado_pub: 'borrador' })], cliente_contactos: [] }, {}, { cliente_contactos: () => ({ creado_en: new Date().toISOString() }) }) }
  it('anota el contacto con el título y el folio de ESE momento, a nombre de la sesión (el cuerpo no manda de quién es)', async () => {
    montar()
    const { POST: post } = await import('../src/app/api/portal/contactos/route')
    const r = await post(POST('/api/portal/contactos', { propiedadId: 'a', canal: 'whatsapp', uid: 'u-luis' }))
    expect(r.status).toBe(201)
    expect(estado.base!.tablas.cliente_contactos[0]).toMatchObject({ uid: 'u-ana', propiedad_id: 'a', propiedad_titulo: 'Nave Mandujano', propiedad_folio: 'VB-2026-00006', canal: 'whatsapp', destino: 'vivebien' })
  })
  it('un doble clic (mismo canal y propiedad en 60 s) no duplica; otro canal sí se anota', async () => {
    montar()
    const { POST: post } = await import('../src/app/api/portal/contactos/route')
    await post(POST('/x', { propiedadId: 'a', canal: 'telefono' }))
    expect((await (await post(POST('/x', { propiedadId: 'a', canal: 'telefono' }))).json()).duplicado).toBe(true)
    await post(POST('/x', { propiedadId: 'a', canal: 'correo' }))
    expect(estado.base!.tablas.cliente_contactos).toHaveLength(2)
  })
  it('rechaza canal inventado, propiedad inexistente o sin publicar, y sin sesión', async () => {
    montar()
    const { POST: post } = await import('../src/app/api/portal/contactos/route')
    expect((await post(POST('/x', { propiedadId: 'a', canal: 'paloma' }))).status).toBe(400)
    expect((await post(POST('/x', { propiedadId: 'no-existe', canal: 'correo' }))).status).toBe(404)
    expect((await post(POST('/x', { propiedadId: 'borrador', canal: 'correo' }))).status).toBe(404)
    expect((await post(POST('/x', { propiedadId: 'a<script>', canal: 'correo' }))).status).toBe(400)
    estado.perfil = null
    expect((await post(POST('/x', { propiedadId: 'a', canal: 'correo' }))).status).toBe(401)
    expect(estado.base!.tablas.cliente_contactos).toHaveLength(0)
  })
  it('GET devuelve SOLO lo de la persona de la sesión, sin uid, y con la ruta si la propiedad sigue publicada', async () => {
    estado.base = crearBase({ propiedades: [prop('a')], cliente_contactos: [
      { id: 1, uid: 'u-ana', propiedad_id: 'a', propiedad_titulo: 'Casa a', propiedad_folio: 'VB-1', canal: 'whatsapp', destino: 'vivebien', creado_en: hace(1) },
      { id: 2, uid: 'u-luis', propiedad_id: 'a', propiedad_titulo: 'Casa a', propiedad_folio: 'VB-1', canal: 'correo', destino: 'vivebien', creado_en: hace(1) },
      { id: 3, uid: 'u-ana', propiedad_id: 'borrada', propiedad_titulo: 'Casa vieja', propiedad_folio: null, canal: 'telefono', destino: 'vivebien', creado_en: hace(2) },
    ] })
    const { GET: leer } = await import('../src/app/api/portal/contactos/route')
    const j = await (await leer(GET('/x'))).json() as { contactos: Array<Record<string, unknown>> }
    expect(j.contactos.map((c) => c.id)).toEqual([1, 3])
    expect(JSON.stringify(j)).not.toMatch(/u-ana|u-luis|"uid"/)
    expect(j.contactos[0].ruta).toMatch(/^\/propiedades\//); expect(j.contactos[1].ruta).toBeNull()
  })
  it('sin la migración 58 responde 503 al anotar y lista vacía al leer (no rompe la pantalla)', async () => {
    estado.base = crearBase({ propiedades: [prop('a')] }, { sinTabla: ['cliente_contactos'] })
    const { POST: post, GET: leer } = await import('../src/app/api/portal/contactos/route')
    expect((await post(POST('/x', { propiedadId: 'a', canal: 'correo' }))).status).toBe(503)
    expect((await (await leer(GET('/x'))).json()).contactos).toEqual([])
  })
})

describe('notificaciones y preferencias', () => {
  it('cada persona ve y marca SOLO lo suyo', async () => {
    estado.base = crearBase({ notificaciones: [
      { id: 1, uid: 'u-ana', tipo: 'sistema', titulo: 'De Ana', cuerpo: null, enlace: null, busqueda_id: null, propiedad_id: null, creada_en: hace(1), leida_en: null },
      { id: 2, uid: 'u-luis', tipo: 'sistema', titulo: 'De Luis', cuerpo: null, enlace: null, busqueda_id: null, propiedad_id: null, creada_en: hace(1), leida_en: null },
    ] })
    const { GET: leer, POST: marcar } = await import('../src/app/api/portal/notificaciones/route')
    const j = await (await leer(GET('/x'))).json()
    expect(j.notificaciones.map((n: Fila) => n.titulo)).toEqual(['De Ana']); expect(j.sinLeer).toBe(1)
    await marcar(POST('/x', { ids: [2] }))            // intenta marcar el aviso de Luis
    expect(estado.base!.tablas.notificaciones.find((n) => n.id === 2)!.leida_en).toBeNull()
    await marcar(POST('/x', {}))
    expect(estado.base!.tablas.notificaciones.find((n) => n.id === 1)!.leida_en).toBeTruthy()
    expect(estado.base!.tablas.notificaciones.find((n) => n.id === 2)!.leida_en).toBeNull()
    expect((await marcar(POST('/x', { ids: ['x'] }))).status).toBe(400)
  })
  it('preferencias: sin elegir = alertas, precio y legal ACTIVADOS (decisión del dueño, 30-oct-2026); apagar y volver a encender guarda la fecha del consentimiento y la bitácora', async () => {
    estado.base = crearBase({ preferencias_notificacion: [] })
    const { GET: leer, PUT } = await import('../src/app/api/portal/preferencias/route')
    expect(await (await leer(GET('/x'))).json()).toEqual({ correoAlertas: true, correoLegal: true, correoPrecio: true, consentimientoEn: null, consentimientoPrecioEn: null })
    const off = await (await PUT(new Request('https://vb.test/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correoAlertas: false }) }))).json()
    expect(off.correoAlertas).toBe(false)
    expect(estado.bitacora[0]).toMatchObject({ accion: 'cuenta.avisos_correo_desactivados' })
    const r = await PUT(new Request('https://vb.test/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correoAlertas: true }) }))
    const j = await r.json()
    expect(j.correoAlertas).toBe(true); expect(j.consentimientoEn).toBeTruthy()
    expect(estado.bitacora[1]).toMatchObject({ accion: 'cuenta.avisos_correo_activados' })
  })
  it('preferencias rechaza valores que no son sí/no y cuerpos vacíos', async () => {
    estado.base = crearBase({ preferencias_notificacion: [] })
    const { PUT } = await import('../src/app/api/portal/preferencias/route')
    const mandar = (c: unknown) => PUT(new Request('https://vb.test/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }))
    expect((await mandar({ correoAlertas: 'si' })).status).toBe(400)
    expect((await mandar({})).status).toBe(400)
  })
})

describe('baja de avisos en un clic', () => {
  it('GET solo muestra el botón (un escáner de correo no apaga nada); POST con token válido APAGA; token alterado o ajeno no cambia nada', async () => {
    estado.base = crearBase({ preferencias_notificacion: [{ uid: 'u-ana', correo_alertas: true, correo_legal: true, consentimiento_alertas_en: hace(3) }, { uid: 'u-luis', correo_alertas: true, correo_legal: true, consentimiento_alertas_en: hace(3) }] })
    const { crearTokenDeBaja } = await import('../src/lib/avisos-token')
    const { GET: ver, POST: bajar } = await import('../src/app/api/avisos/baja/route')
    const t = crearTokenDeBaja('u-ana')!
    const g = await ver(GET(`/api/avisos/baja?t=${t}`))
    expect(g.status).toBe(200); expect(await g.text()).toContain('<button')
    expect(estado.base.tablas.preferencias_notificacion.find((p) => p.uid === 'u-ana')!.correo_alertas).toBe(true)

    await bajar(POST(`/api/avisos/baja?t=${t}`, {}))
    expect(estado.base.tablas.preferencias_notificacion.find((p) => p.uid === 'u-ana')!.correo_alertas).toBe(false)
    expect(estado.base.tablas.preferencias_notificacion.find((p) => p.uid === 'u-luis')!.correo_alertas).toBe(true)

    const falso = `${t.split('.')[0]}.${'A'.repeat(43)}`                               // firma inventada
    const ajeno = `${Buffer.from('u-luis').toString('base64url')}.${t.split('.')[1]}`   // firma de Ana con el uid de Luis
    for (const malo of [falso, ajeno, 'basura', '']) { await bajar(POST(`/api/avisos/baja?t=${malo}`, {})) }
    expect(estado.base.tablas.preferencias_notificacion.find((p) => p.uid === 'u-luis')!.correo_alertas).toBe(true)
  })
  it('sin secreto configurado no hay token (falla cerrado)', async () => {
    delete process.env.CRON_SECRET; delete process.env.AVISOS_SECRETO
    const { crearTokenDeBaja, verificarTokenDeBaja } = await import('../src/lib/avisos-token')
    expect(crearTokenDeBaja('u-ana')).toBeNull()
    expect(verificarTokenDeBaja('x.y')).toEqual({ ok: false })
  })
  it('la página de baja lleva política de contenido estricta y no se indexa', async () => {
    const { GET: ver } = await import('../src/app/api/avisos/baja/route')
    const g = await ver(GET('/api/avisos/baja?t=basura'))
    expect(g.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(g.headers.get('x-robots-tag')).toBe('noindex')
  })
})

// MKT-60: con la compuerta común apagada la tarea diaria sigue creando los avisos del portal, pero NO manda ningún correo ni toca el libro.
describe('tarea de avisos a clientes — compuerta CORREO_ENVIO apagada', () => {
  const base = () => crearBase({
    usuarios: [{ uid: 'u-ana', email: 'ana@ejemplo.invalid', nombre: 'Ana', estado: 'activo' }],
    propiedades: [prop('b', { publicada_en: hace(0.5), created_at: hace(0.5) })],
    busquedas_guardadas: [{ id: 1, uid: 'u-ana', nombre: 'Casas en León', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null }],
    preferencias_notificacion: [{ uid: 'u-ana', correo_alertas: true, correo_legal: true }],
    legal_aceptaciones: [],
    notificaciones: [],
  }, { unicas: { notificaciones: ['uid', 'clave'] } }, { notificaciones: () => ({ creada_en: new Date().toISOString() }) })

  for (const v of [undefined, '', '0']) {
    it(`CORREO_ENVIO=${JSON.stringify(v)}: avisos en el portal sí, correos no (queda pendiente para cuando se encienda)`, async () => {
      const antes = process.env.CORREO_ENVIO
      if (v === undefined) delete process.env.CORREO_ENVIO; else process.env.CORREO_ENVIO = v
      try {
        estado.base = base()
        const { avisosDeClientes } = await import('../src/lib/avisos-cliente-servidor')
        const r = await avisosDeClientes()
        expect(r).toMatchObject({ notificacionesNuevas: 1, correosEnviados: 0, correosFallidos: 0, omitido: 'envio_apagado' })
        expect(enviados).toEqual([])
        expect(await libro.usados()).toBe(0)
        expect(estado.base!.tablas.notificaciones[0].correo_enviado_en ?? null).toBeNull()
      } finally { if (antes === undefined) delete process.env.CORREO_ENVIO; else process.env.CORREO_ENVIO = antes }
    })
  }
})
