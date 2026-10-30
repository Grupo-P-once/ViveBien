import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-75 — «Guardar» es de la CUENTA y la base de datos es la única verdad.
 *
 * Corrige D-74 (ID-01/02/05): el corazón del catálogo escribía en localStorage
 * y «Mis guardadas» leía la tabla `favoritos`. Aquí se prueba de punta a punta,
 * SIN datos reales: el almacén del navegador (`crearAlmacen`) → la ruta REAL
 * `/api/favoritos` con su autorizador real → una base falsa en memoria que,
 * a propósito, cede el turno entre operaciones para que las peticiones
 * simultáneas se entrelacen de verdad.
 *
 * Token de prueba: `tok|<uid>|<rol>|<estado>` (así dos cuentas pueden convivir).
 */

const mundo = vi.hoisted(() => ({
  favoritos: [] as Array<{ uid: string; propiedad_id: string; creado_en: string }>,
  propiedades: [] as Array<{ id: string; estado_pub: string }>,
  // Qué operación de la base debe fallar (simula una caída o una política de RLS).
  falla: null as null | 'upsert' | 'delete' | 'leer-favoritos' | 'leer-propiedades',
  upserts: 0,
  deletes: 0,
  denegados: [] as string[],
}))

const cede = () => new Promise<void>((r) => setTimeout(r, Math.floor(Math.random() * 3)))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    let modo: 'select' | 'upsert' | 'delete' = 'select'
    let fila: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    const coincide = (f: Record<string, unknown>) => filtros.every(([k, v]) => f[k] === v)

    const ejecutar = async (): Promise<{ data: unknown[]; error: { message: string } | null }> => {
      await cede()
      const filas = (tabla === 'favoritos' ? mundo.favoritos : mundo.propiedades) as unknown as Array<Record<string, unknown>>
      if (modo === 'select') {
        const clave = tabla === 'favoritos' ? 'leer-favoritos' : 'leer-propiedades'
        if (mundo.falla === clave) return { data: [], error: { message: 'caída' } }
        return { data: filas.filter(coincide), error: null }
      }
      if (modo === 'delete') {
        if (mundo.falla === 'delete') return { data: [], error: { message: 'caída' } }
        await cede()
        mundo.deletes++
        for (let i = filas.length - 1; i >= 0; i--) if (coincide(filas[i])) filas.splice(i, 1)
        return { data: [], error: null }
      }
      // upsert con ignoreDuplicates: si la llave (uid, propiedad_id) ya existe, no hace nada.
      if (mundo.falla === 'upsert') return { data: [], error: { message: 'caída' } }
      await cede()
      mundo.upserts++
      const ya = filas.some((f) => f.uid === fila!.uid && f.propiedad_id === fila!.propiedad_id)
      if (!ya) filas.push({ ...fila!, creado_en: new Date().toISOString() })
      return { data: [], error: null }
    }

    c.select = () => c
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.limit = () => c
    c.upsert = (f: Record<string, unknown>) => { modo = 'upsert'; fila = f; return c }
    c.delete = () => { modo = 'delete'; return c }
    c.maybeSingle = async () => { const r = await ejecutar(); return { data: r.data[0] ?? null, error: r.error } }
    c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => ejecutar().then(ok, ko)
    return c
  }

  // Rol y estado salen del token de prueba (`tok|uid|rol|estado`). El autorizador es el REAL de producción.
  type Quien = { uid: string; email: string; emailVerified: boolean; _rol: string; _estado: string }
  const autorizarConToken = real.crearAutorizador({
    verificar: async (req: Request) => {
      const t = (req.headers.get('authorization') ?? '').replace('Bearer ', '').split('|')
      return t[0] === 'tok' ? ({ uid: t[1], email: `${t[1]}@ejemplo.test`, emailVerified: true, _rol: t[2], _estado: t[3] } as Quien) : null
    },
    perfil: async (u) => {
      const x = u as unknown as Quien
      return { uid: x.uid, email: x.email, emailVerified: true, rol: x._rol, superAdmin: false, estado: x._estado, nombre: null } as unknown as Awaited<ReturnType<typeof real.getPerfil>>
    },
    denegado: async (_p, _r, que) => { mundo.denegados.push(String(que)) },
  })

  return {
    ...real,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t) }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizarConToken(req, (perfil) => puede(perfil, permiso), permiso),
  }
})

import { GET, POST } from '../src/app/api/favoritos/route'
import { crearAlmacen, instantaneaVacia, type Respuesta } from '../src/lib/favoritos/almacen'
import { construirResumenPortal } from '../src/lib/portal/resumen'
import { guardadasVista } from '../src/lib/portal/pantallas'

let ip = 0
const peticion = (token: string | null, cuerpo?: unknown, metodo = cuerpo === undefined ? 'GET' : 'POST') =>
  new Request('https://vivebienn.com/api/favoritos', {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.20.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })

const tok = (uid: string, rol = 'cliente', estado = 'activo') => `tok|${uid}|${rol}|${estado}`
const post = (token: string | null, cuerpo: unknown) => POST(peticion(token, cuerpo))
const ids = async (token: string) => (await (await GET(peticion(token))).json()) as string[]
const filasDe = (uid: string) => mundo.favoritos.filter((f) => f.uid === uid).map((f) => f.propiedad_id).sort()

beforeEach(() => {
  mundo.favoritos = []
  mundo.propiedades = [
    { id: 'pX', estado_pub: 'publicada' },
    { id: 'pY', estado_pub: 'publicada' },
    { id: 'pBorrador', estado_pub: 'borrador' },
  ]
  mundo.falla = null
  mundo.upserts = 0
  mundo.deletes = 0
  mundo.denegados = []
})

// ── La ruta ──────────────────────────────────────────────────────────────

describe('POST /api/favoritos — idempotente y atada a la cuenta', () => {
  it('guardar y quitar (estado deseado), y repetirlos no cambia nada', async () => {
    const A = tok('A')
    expect(await (await post(A, { propiedadId: 'pX', guardado: true })).json()).toEqual({ ok: true, guardado: true })
    expect(filasDe('A')).toEqual(['pX'])

    // guardar otra vez: sigue habiendo UNA fila y responde bien
    const otra = await post(A, { propiedadId: 'pX', guardado: true })
    expect(otra.status).toBe(200)
    expect(filasDe('A')).toEqual(['pX'])

    expect(await (await post(A, { propiedadId: 'pX', guardado: false })).json()).toEqual({ ok: true, guardado: false })
    expect(filasDe('A')).toEqual([])
    // quitar lo que ya no está: también bien
    expect((await post(A, { propiedadId: 'pX', guardado: false })).status).toBe(200)
  })

  it('dos (y cinco) peticiones SIMULTÁNEAS de guardar: todas bien, una sola fila, ningún 500', async () => {
    const A = tok('A')
    const dos = await Promise.all([post(A, { propiedadId: 'pX', guardado: true }), post(A, { propiedadId: 'pX', guardado: true })])
    expect(dos.map((r) => r.status)).toEqual([200, 200])
    const cinco = await Promise.all(Array.from({ length: 5 }, () => post(A, { propiedadId: 'pY', guardado: true })))
    expect(cinco.every((r) => r.status === 200)).toBe(true)
    expect(filasDe('A')).toEqual(['pX', 'pY'])
  })

  it('sin `guardado` (cliente antiguo en caché) alterna, y dos a la vez tampoco dan 500', async () => {
    const A = tok('A')
    expect((await (await post(A, { propiedadId: 'pX' })).json()).guardado).toBe(true)
    expect((await (await post(A, { propiedadId: 'pX' })).json()).guardado).toBe(false)
    const carrera = await Promise.all([post(A, { propiedadId: 'pY' }), post(A, { propiedadId: 'pY' })])
    expect(carrera.every((r) => r.status === 200)).toBe(true)
    expect(filasDe('A').filter((x) => x === 'pY').length).toBeLessThanOrEqual(1)
  })

  it('propiedad inexistente o no publicada: no se guarda (404); quitar una huérfana sí se permite', async () => {
    const A = tok('A')
    expect((await post(A, { propiedadId: 'no-existe', guardado: true })).status).toBe(404)
    expect((await post(A, { propiedadId: 'pBorrador', guardado: true })).status).toBe(404)
    expect(filasDe('A')).toEqual([])

    mundo.favoritos.push({ uid: 'A', propiedad_id: 'ya-no-existe', creado_en: '2026-01-01T00:00:00Z' })
    expect((await post(A, { propiedadId: 'ya-no-existe', guardado: false })).status).toBe(200)
    expect(filasDe('A')).toEqual([])
  })

  it('entradas inválidas: 400 y nada escrito', async () => {
    const A = tok('A')
    for (const cuerpo of [
      {}, { propiedadId: '' }, { propiedadId: 42 }, { propiedadId: 'con espacio', guardado: true },
      { propiedadId: 'x'.repeat(121), guardado: true }, { propiedadId: "p'; drop table favoritos;--", guardado: true },
      { propiedadId: 'pX', guardado: 'si' }, { propiedadId: 'pX', guardado: 1 },
    ]) {
      expect((await post(A, cuerpo)).status, JSON.stringify(cuerpo)).toBe(400)
    }
    expect(mundo.favoritos).toEqual([])
    expect(mundo.upserts + mundo.deletes).toBe(0)
  })

  it('error de la base: 500 con mensaje claro y SIN estado a medias (RLS/caída no se disfrazan de 200)', async () => {
    const A = tok('A')
    mundo.falla = 'upsert'
    const r = await post(A, { propiedadId: 'pX', guardado: true })
    expect(r.status).toBe(500)
    expect((await r.json()).error).toMatch(/No pudimos guardarla/)
    expect(filasDe('A')).toEqual([])

    mundo.falla = null
    await post(A, { propiedadId: 'pX', guardado: true })
    mundo.falla = 'delete'
    const q = await post(A, { propiedadId: 'pX', guardado: false })
    expect(q.status).toBe(500)
    expect(filasDe('A')).toEqual(['pX']) // sigue guardada: no se dijo «quitada» sin quitarla

    mundo.falla = 'leer-propiedades'
    expect((await post(A, { propiedadId: 'pY', guardado: true })).status).toBe(500)
    mundo.falla = 'leer-favoritos'
    expect((await GET(peticion(A))).status).toBe(500)
  })

  it('sin sesión: 401; cuenta suspendida: 403 y no escribe', async () => {
    expect((await post(null, { propiedadId: 'pX', guardado: true })).status).toBe(401)
    expect((await GET(peticion(null))).status).toBe(401)
    const r = await post(tok('S', 'cliente', 'suspendido'), { propiedadId: 'pX', guardado: true })
    expect(r.status).toBe(403)
    expect(mundo.favoritos).toEqual([])
  })

  it('CLIENTE, PUBLICADOR y ADMIN usan la misma tabla y la misma lógica', async () => {
    for (const [uid, rol] of [['c1', 'cliente'], ['p1', 'publicador'], ['a1', 'admin']] as const) {
      expect((await post(tok(uid, rol), { propiedadId: 'pX', guardado: true })).status, rol).toBe(200)
      expect(await ids(tok(uid, rol))).toEqual(['pX'])
      expect(filasDe(uid)).toEqual(['pX'])
    }
  })

  it('usuario A y usuario B no se ven ni se tocan (el uid sale del token, no del cuerpo)', async () => {
    const A = tok('A'), B = tok('B')
    await post(A, { propiedadId: 'pX', guardado: true })
    expect(await ids(B)).toEqual([])
    await post(B, { propiedadId: 'pY', guardado: true })
    expect(await ids(A)).toEqual(['pX'])
    expect(await ids(B)).toEqual(['pY'])

    // B intenta quitar la de A mandando el id y hasta un `uid` ajeno en el cuerpo
    await post(B, { propiedadId: 'pX', guardado: false, uid: 'A' })
    expect(filasDe('A')).toEqual(['pX'])
    // y guardar «como A»
    await post(B, { propiedadId: 'pX', guardado: true, uid: 'A' })
    expect(filasDe('A')).toEqual(['pX'])
    expect(filasDe('B')).toEqual(['pX', 'pY'])
  })
})

// ── «Mis guardadas» y el contador leen lo mismo que escribe el corazón ───────

describe('lo que se guarda es lo que enseñan «Mis guardadas» y el contador', () => {
  it('el resumen del portal (contador e ids) y la lista salen de las filas de `favoritos`', async () => {
    const A = tok('A')
    await post(A, { propiedadId: 'pX', guardado: true })
    await post(A, { propiedadId: 'pY', guardado: true })
    const filas = mundo.favoritos.filter((f) => f.uid === 'A')
    const resumen = construirResumenPortal({ perfil: null, propiedades: [], favoritos: filas, busquedas: [], solicitudes: [], citas: [] })
    expect(resumen.tarjetas.guardadas).toBe(2)
    expect([...resumen.guardadas].sort()).toEqual(['pX', 'pY'])

    await post(A, { propiedadId: 'pX', guardado: false })
    const despues = mundo.favoritos.filter((f) => f.uid === 'A')
    const r2 = construirResumenPortal({ perfil: null, propiedades: [], favoritos: despues, busquedas: [], solicitudes: [], citas: [] })
    expect(r2.tarjetas.guardadas).toBe(1)
    expect(r2.guardadas).toEqual(['pY'])
    expect(guardadasVista(despues, [])).toEqual([]) // sin la propiedad publicada no se inventa una tarjeta
  })
})

// ── El almacén del navegador ─────────────────────────────────────────────

/** `fetch` que entra por la ruta real. Cuenta cuántas peticiones hay a la vez. */
function servidor() {
  const e = { enVuelo: 0, maximo: 0, total: 0, cuerpos: [] as unknown[] }
  const fetchFalso = async (ruta: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Respuesta> => {
    e.enVuelo++; e.maximo = Math.max(e.maximo, e.enVuelo); e.total++
    try {
      expect(ruta).toBe('/api/favoritos')
      const token = (init.headers.Authorization ?? '').replace('Bearer ', '')
      const cuerpo = init.body ? JSON.parse(init.body) : undefined
      if (cuerpo !== undefined) e.cuerpos.push(cuerpo)
      const r = init.method === 'GET' ? await GET(peticion(token)) : await POST(peticion(token, cuerpo))
      return { ok: r.ok, status: r.status, json: () => r.json() }
    } finally {
      e.enVuelo--
    }
  }
  return { e, fetchFalso }
}

function navegador(srv: ReturnType<typeof servidor>, sesion: { token: string | null } = { token: null }) {
  const limpiezas = vi.fn()
  const almacen = crearAlmacen({ token: async () => sesion.token, fetch: srv.fetchFalso, limpiarRastros: limpiezas })
  return { almacen, sesion, limpiezas }
}

const espera = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 2))
  expect(cond()).toBe(true)
}

describe('el almacén: estado inicial, guardar, quitar, refresh', () => {
  it('estado inicial: sin cuenta no hay guardadas, no se llama a ningún servidor y guardar pide entrar', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv)
    expect(almacen.instantanea()).toEqual(instantaneaVacia())
    expect(almacen.instantanea().ids.size).toBe(0)
    await expect(almacen.establecer('pX', true)).rejects.toThrow(/Entra a tu cuenta/)
    expect(srv.e.total).toBe(0)
  })

  it('guardar: se ve al instante, queda en la base, y tras un refresh (otro almacén) sigue guardada', async () => {
    const srv = servidor()
    const { almacen, sesion } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    expect(almacen.instantanea().ids.has('pX')).toBe(false)

    const hecho = almacen.establecer('pX', true)
    expect(almacen.instantanea().ids.has('pX')).toBe(true) // optimista, antes de que conteste el servidor
    await hecho
    expect(filasDe('A')).toEqual(['pX'])
    expect(srv.e.cuerpos).toEqual([{ propiedadId: 'pX', guardado: true }]) // estado deseado, no «alternar»

    // F5: un almacén nuevo, misma cuenta
    const recargado = navegador(servidor(), sesion).almacen
    recargado.cambiarUsuario('A')
    await espera(() => recargado.instantanea().cargado)
    expect([...recargado.instantanea().ids]).toEqual(['pX'])
  })

  it('quitar: queda quitada en la base y tras un refresh sigue quitada', async () => {
    const srv = servidor()
    const { almacen, sesion } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await almacen.establecer('pX', true)
    await almacen.establecer('pY', true)
    const quitando = almacen.establecer('pX', false)
    expect(almacen.instantanea().ids.has('pX')).toBe(false)
    await quitando
    expect(filasDe('A')).toEqual(['pY'])

    const recargado = navegador(servidor(), sesion).almacen
    recargado.cambiarUsuario('A')
    await espera(() => recargado.instantanea().cargado)
    expect([...recargado.instantanea().ids]).toEqual(['pY'])
  })
})

describe('el almacén: cambio de cuenta (logout/login, A → B → A)', () => {
  it('B no ve lo de A; A recupera sólo lo suyo; al salir se limpian los rastros antiguos', async () => {
    const srv = servidor()
    const { almacen, sesion, limpiezas } = navegador(srv)

    sesion.token = tok('A')
    almacen.cambiarUsuario('A')
    await almacen.establecer('pX', true)
    expect([...almacen.instantanea().ids]).toEqual(['pX'])

    // logout: al instante, sin esperar a nadie, no queda nada de A
    sesion.token = null
    almacen.cambiarUsuario(null)
    expect(almacen.instantanea().ids.size).toBe(0)
    expect(almacen.instantanea().uid).toBeNull()
    expect(limpiezas).toHaveBeenCalled()

    // login de B
    sesion.token = tok('B')
    almacen.cambiarUsuario('B')
    expect(almacen.instantanea().ids.size).toBe(0) // en ningún instante se ve lo de A
    await espera(() => almacen.instantanea().cargado)
    expect(almacen.instantanea().ids.has('pX')).toBe(false)
    await almacen.establecer('pY', true)
    expect([...almacen.instantanea().ids]).toEqual(['pY'])

    // logout de B, login de A
    sesion.token = null
    almacen.cambiarUsuario(null)
    sesion.token = tok('A')
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    expect([...almacen.instantanea().ids]).toEqual(['pX'])
    expect(almacen.instantanea().ids.has('pY')).toBe(false)
    expect(filasDe('A')).toEqual(['pX'])
    expect(filasDe('B')).toEqual(['pY'])
  })

  it('una respuesta que llega tarde de la cuenta anterior NO contamina a la nueva', async () => {
    const srv = servidor()
    const { almacen, sesion } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    const enCamino = almacen.establecer('pX', true).catch(() => {})
    // cambia de cuenta antes de que conteste
    sesion.token = tok('B')
    almacen.cambiarUsuario('B')
    await enCamino
    await espera(() => almacen.instantanea().cargado)
    expect(almacen.instantanea().ids.size).toBe(0)
    expect(almacen.instantanea().uid).toBe('B')
    expect(filasDe('B')).toEqual([])
  })

  it('cambiarUsuario con el mismo uid no reinicia nada (varias tarjetas lo llaman a la vez)', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    almacen.cambiarUsuario('A')
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    expect(srv.e.total).toBe(1) // una lectura, no tres
  })
})

describe('el almacén: doble clic, dos pestañas y fallos', () => {
  it('doble clic (guardar y enseguida quitar): una petición a la vez, gana lo último que se quiso', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    const a = almacen.establecer('pX', true)
    const b = almacen.establecer('pX', false)
    await Promise.all([a, b])
    expect(srv.e.maximo).toBe(1)
    expect(filasDe('A')).toEqual([])
    expect(almacen.instantanea().ids.has('pX')).toBe(false)

    // tres clics: guardar, quitar, guardar → queda guardada
    const t = [almacen.establecer('pY', true), almacen.establecer('pY', false), almacen.establecer('pY', true)]
    await Promise.all(t)
    expect(srv.e.maximo).toBe(1)
    expect(filasDe('A')).toEqual(['pY'])
    expect(almacen.instantanea().ids.has('pY')).toBe(true)
  })

  it('dos pestañas guardan lo mismo a la vez: ambas terminan bien y hay una sola fila', async () => {
    const srv = servidor()
    const sesion = { token: tok('A') as string | null }
    const t1 = navegador(srv, sesion).almacen
    const t2 = navegador(srv, sesion).almacen
    t1.cambiarUsuario('A'); t2.cambiarUsuario('A')
    await espera(() => t1.instantanea().cargado && t2.instantanea().cargado)
    await Promise.all([t1.establecer('pX', true), t2.establecer('pX', true)])
    expect(filasDe('A')).toEqual(['pX'])
    expect(t1.instantanea().ids.has('pX')).toBe(true)
    expect(t2.instantanea().ids.has('pX')).toBe(true)
    // una guarda y la otra quita a la vez: las dos acaban sin error (el servidor es idempotente)
    await expect(Promise.all([t1.establecer('pX', false), t2.establecer('pX', true)])).resolves.toBeDefined()
  })

  it('error de la API: el corazón vuelve a como estaba y se rechaza con el mensaje', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    mundo.falla = 'upsert'
    const p = almacen.establecer('pX', true)
    expect(almacen.instantanea().ids.has('pX')).toBe(true)
    await expect(p).rejects.toThrow('No pudimos guardarla.')
    expect(almacen.instantanea().ids.has('pX')).toBe(false)
    expect(filasDe('A')).toEqual([])

    // y una guardada que no se pudo quitar sigue guardada
    mundo.falla = null
    await almacen.establecer('pX', true)
    mundo.falla = 'delete'
    await expect(almacen.establecer('pX', false)).rejects.toThrow('No pudimos quitarla.')
    expect(almacen.instantanea().ids.has('pX')).toBe(true)
  })

  it('propiedad inexistente: rechaza con el mensaje del servidor y no queda guardada', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await expect(almacen.establecer('fantasma', true)).rejects.toThrow(/no está disponible/)
    expect(almacen.instantanea().ids.has('fantasma')).toBe(false)
  })

  it('si la lectura inicial falla no inventa una lista vacía «cargada»', async () => {
    const srv = servidor()
    const { almacen } = navegador(srv, { token: tok('A') })
    mundo.falla = 'leer-favoritos'
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().error !== '')
    expect(almacen.instantanea().cargado).toBe(false)
    expect(almacen.instantanea().error).toMatch(/No pudimos cargar/)
  })

  it('sesión caducada (token nulo) al guardar: rechaza y deja todo como estaba', async () => {
    const srv = servidor()
    const { almacen, sesion } = navegador(srv, { token: tok('A') })
    almacen.cambiarUsuario('A')
    await espera(() => almacen.instantanea().cargado)
    sesion.token = null
    await expect(almacen.establecer('pX', true)).rejects.toThrow(/sesión terminó/)
    expect(almacen.instantanea().ids.has('pX')).toBe(false)
  })

  it('CLIENTE y PUBLICADOR: el mismo almacén, la misma tabla', async () => {
    for (const [uid, rol] of [['c9', 'cliente'], ['p9', 'publicador']] as const) {
      const srv = servidor()
      const { almacen } = navegador(srv, { token: tok(uid, rol) })
      almacen.cambiarUsuario(uid)
      await almacen.establecer('pX', true)
      expect(filasDe(uid), rol).toEqual(['pX'])
    }
  })
})
