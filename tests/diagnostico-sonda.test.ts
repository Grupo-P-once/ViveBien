import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.90 · D-44 · R-6 y R-7 — La sonda de Identity Toolkit.
 *
 * Ejecuta las dos operaciones REALES de la baja contra un identificador que no
 * es de nadie. Lo que se prueba aquí, más que el camino feliz, es que **no hay
 * forma de apuntarla a una cuenta real** y que **no se escapa ningún secreto**.
 *
 * Sin credencial, sin red y sin tocar ninguna cuenta: los dos extremos —el
 * token y el `fetch`— se inyectan.
 */

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; rol: string; superAdmin: boolean; estado: string },
  /** Lo que devuelve la sonda cuando la ruta la ejecuta de verdad. */
  sonda: { ok: false, pasos: [{ paso: 'token', ok: false, codigo: 'credencial_no_disponible' }] } as {
    ok: boolean; pasos: Array<{ paso: string; ok: boolean; codigo: string }>
  },
  llamadasSonda: 0,
}))

/**
 * Sólo se sustituye `sondarIdentityToolkit`, para poder contar si la ruta llega
 * de verdad hasta ella. `crearSonda` y `generarLocalIdInexistente` siguen siendo
 * los reales: son los que prueban el resto de este archivo.
 */
vi.mock('@/lib/firebase-admin', async (original) => {
  const real = await original<typeof import('../src/lib/firebase-admin')>()
  return {
    ...real,
    sondarIdentityToolkit: async () => {
      mundo.llamadasSonda++
      return mundo.sonda as never
    },
  }
})

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const autorizar = real.crearAutorizador({
    // Igual que el `verifyIdToken` real: la identidad sale de la cabecera
    // `Authorization: Bearer <ID token>`. Sin cabecera no hay sesión, por muy
    // dentro que esté la persona en su navegador.
    verificar: async (req: Request) => ((mundo.sesion && (req.headers.get('authorization') ?? '').startsWith('Bearer '))
      ? { uid: mundo.sesion.uid, email: 'admin@ejemplo.invalid', emailVerified: true, authTime: null }
      : null),
    perfil: async (u) => ({
      ...u,
      rol: mundo.sesion!.rol as 'cliente' | 'publicador' | 'admin',
      superAdmin: mundo.sesion!.superAdmin,
      estado: mundo.sesion!.estado as never,
      nombre: null,
    }),
    denegado: async () => {},
  })
  return {
    ...real,
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { crearSonda, generarLocalIdInexistente, type Acceso } from '../src/lib/firebase-admin'
import { GET } from '../src/app/api/diagnostico/firebase/route'

const TOKEN = 'token-de-mentira-que-no-debe-salir-jamas'
const PROYECTO = 'proyecto-de-prueba'
const UID_QA = 'uRnx8chsgdSNkDbOLju5QkGBr4x1'
const NO_EXISTE = { status: 400, cuerpo: { error: { code: 400, message: 'USER_NOT_FOUND' } } }

const acceso = async (): Promise<Acceso> => ({ token: TOKEN, projectId: PROYECTO })
/** Bytes deterministas, para poder afirmar cosas del identificador generado. */
const bytesFijos = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256)

function fetchQue(responder: (operacion: string) => { status: number; cuerpo?: unknown }) {
  const llamadas: Array<{ operacion: string; cuerpo: Record<string, unknown> }> = []
  const doble = async (url: string, init: RequestInit) => {
    const operacion = url.split('/').pop() as string
    llamadas.push({ operacion, cuerpo: JSON.parse(String(init.body)) })
    const r = responder(operacion)
    return new Response(r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo), { status: r.status })
  }
  return { doble, llamadas }
}

beforeEach(() => {
  mundo.sesion = null
  mundo.llamadasSonda = 0
  mundo.sonda = { ok: false, pasos: [{ paso: 'token', ok: false, codigo: 'credencial_no_disponible' }] }
  vi.restoreAllMocks()
})

describe('el identificador de la sonda', () => {
  it('tiene el formato exacto de Firebase: 28 alfanuméricos', () => {
    for (let i = 0; i < 50; i++) {
      const id = generarLocalIdInexistente((n) => crypto.getRandomValues(new Uint8Array(n)))
      expect(id).toMatch(/^[A-Za-z0-9]{28}$/)
    }
  })

  it('no se repite: lo genera el azar, no una constante', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 100; i++) {
      vistos.add(generarLocalIdInexistente((n) => crypto.getRandomValues(new Uint8Array(n))))
    }
    expect(vistos.size).toBe(100)
  })

  it('NUNCA es el de la cuenta QA ni ningún UID conocido', async () => {
    const f = fetchQue(() => NO_EXISTE)
    await crearSonda(acceso, f.doble, (n) => crypto.getRandomValues(new Uint8Array(n)))()
    for (const l of f.llamadas) {
      expect(l.cuerpo.localId).not.toBe(UID_QA)
      expect(l.cuerpo.localId).toMatch(/^[A-Za-z0-9]{28}$/)
    }
  })
})

describe('el orden protege', () => {
  it('prueba `accounts:update` ANTES que `accounts:delete`', async () => {
    const f = fetchQue(() => NO_EXISTE)
    const r = await crearSonda(acceso, f.doble, bytesFijos)()

    expect(r.ok).toBe(true)
    // Primero el que como mucho cerraría sesiones; el borrado sólo después de
    // que esté demostrado que ese identificador no existe.
    expect(f.llamadas.map((l) => l.operacion)).toEqual(['accounts:update', 'accounts:delete'])
    expect(r.pasos.map((p) => `${p.paso}: ${p.codigo}`)).toEqual([
      'token: OK', 'accounts:update: USER_NOT_FOUND', 'accounts:delete: USER_NOT_FOUND',
    ])
  })

  it('las dos llamadas usan EL MISMO identificador', async () => {
    const f = fetchQue(() => NO_EXISTE)
    await crearSonda(acceso, f.doble, bytesFijos)()
    expect(f.llamadas[0].cuerpo.localId).toBe(f.llamadas[1].cuerpo.localId)
  })

  it('`accounts:update` manda `validSince` en segundos', async () => {
    const f = fetchQue(() => NO_EXISTE)
    await crearSonda(acceso, f.doble, bytesFijos)()
    const v = f.llamadas[0].cuerpo.validSince as string
    expect(v).toMatch(/^\d{10}$/)
    expect(Number(v)).toBeCloseTo(Math.floor(Date.now() / 1000), -1)
  })

  it('si `accounts:update` no dice USER_NOT_FOUND, NO se llega a borrar', async () => {
    const f = fetchQue((op) => (op === 'accounts:update' ? { status: 403, cuerpo: {} } : NO_EXISTE))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await crearSonda(acceso, f.doble, bytesFijos)()
    expect(r.ok).toBe(false)
    expect(f.llamadas.map((l) => l.operacion)).toEqual(['accounts:update'])
    expect(r.pasos.at(-1)).toEqual({ paso: 'accounts:update', ok: false, codigo: 'permiso_denegado' })
  })

  it('un HTTP 200 sobre ese identificador es una ANOMALÍA: se para', async () => {
    // No debería poder pasar nunca. Si pasara, significaría que el
    // identificador existe — y entonces borrar sería destructivo.
    const f = fetchQue(() => ({ status: 200, cuerpo: {} }))
    const r = await crearSonda(acceso, f.doble, bytesFijos)()

    expect(r.ok).toBe(false)
    expect(r.pasos.at(-1)).toEqual({ paso: 'accounts:update', ok: false, codigo: 'respuesta_inesperada' })
    expect(f.llamadas.map((l) => l.operacion)).toEqual(['accounts:update'])
  })

  it('sin credencial no se llama a nadie', async () => {
    const f = fetchQue(() => NO_EXISTE)
    const r = await crearSonda(async () => ({ codigo: 'credencial_no_disponible' }), f.doble, bytesFijos)()

    expect(r.ok).toBe(false)
    expect(r.pasos).toEqual([{ paso: 'token', ok: false, codigo: 'credencial_no_disponible' }])
    expect(f.llamadas).toEqual([])
  })

  it('si el borrado falla, el código que sale es corto y seguro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fetchQue((op) => (op === 'accounts:delete' ? { status: 401, cuerpo: {} } : NO_EXISTE))
    const r = await crearSonda(acceso, f.doble, bytesFijos)()

    expect(r.ok).toBe(false)
    expect(r.pasos.at(-1)).toEqual({ paso: 'accounts:delete', ok: false, codigo: 'credencial_rechazada' })
    for (const p of r.pasos) expect(p.codigo).toMatch(/^[\w.\-/]{1,60}$/)
  })
})

describe('la ruta', () => {
  const pedir = (url: string, conSesion = true) => GET(new Request(url, {
    headers: conSesion ? { authorization: 'Bearer da-igual' } : {},
  }))
  const comoSuperAdmin = () => {
    mundo.sesion = { uid: 'admin-1', rol: 'admin', superAdmin: true, estado: 'activo' }
  }

  it('sin sesión → 401', async () => {
    expect((await pedir('https://vivebienn.com/api/diagnostico/firebase?sonda=1', false)).status).toBe(401)
  })

  it('un admin que no es super admin → 403', async () => {
    mundo.sesion = { uid: 'admin-2', rol: 'admin', superAdmin: false, estado: 'activo' }
    expect((await pedir('https://vivebienn.com/api/diagnostico/firebase?sonda=1')).status).toBe(403)
  })

  it('un cliente → 403', async () => {
    mundo.sesion = { uid: 'cli-1', rol: 'cliente', superAdmin: false, estado: 'activo' }
    expect((await pedir('https://vivebienn.com/api/diagnostico/firebase?sonda=1')).status).toBe(403)
  })

  it('sin `?sonda=1` no se ejecuta la sonda', async () => {
    comoSuperAdmin()
    const j = await (await pedir('https://vivebienn.com/api/diagnostico/firebase')).json()
    expect(j).not.toHaveProperty('sonda')
  })

  it('NO acepta un identificador de fuera: ni por query ni por cabecera', async () => {
    comoSuperAdmin()
    // Se intenta colar el UID de QA y un UID real por todas las vías posibles.
    const j = await (await GET(new Request(
      `https://vivebienn.com/api/diagnostico/firebase?sonda=1&localId=${UID_QA}&uid=${UID_QA}`,
      { headers: { authorization: 'Bearer da-igual', 'x-local-id': UID_QA } },
    ))).json()

    // Sin credencial en el entorno de prueba, la sonda se para en el token; lo
    // que importa es que el uid colado no aparece por ningún lado.
    const texto = JSON.stringify(j)
    expect(texto).not.toContain(UID_QA)
    expect(texto).not.toMatch(/localId/i)
  })

  it('la respuesta NUNCA lleva secretos', async () => {
    comoSuperAdmin()
    const texto = await (await pedir('https://vivebienn.com/api/diagnostico/firebase?sonda=1')).text()

    // Nombrar la variable de entorno SÍ está bien —y hace falta: es lo que el
    // diagnóstico tiene que decirle a quien la puso—. Lo que no puede salir es
    // su CONTENIDO, ni nada derivado de él.
    for (const prohibido of [
      /BEGIN PRIVATE KEY/, /private_key/, /Bearer /, /access_token/i,
      /client_email/, /@[\w.-]*\.iam\.gserviceaccount\.com/, /localId/i, /\bey[A-Za-z0-9_-]{20,}/,
    ]) {
      expect(texto, `la respuesta contiene ${prohibido}`).not.toMatch(prohibido)
    }
    // Y el nombre de la variable, que sí aparece, va solo: sin un `=` detrás.
    expect(texto).not.toMatch(/FIREBASE_SERVICE_ACCOUNT\s*[=:]\s*\S/)
  })

  /**
   * EL 401 QUE SE VIO EN PRODUCCIÓN (25-sep-2026).
   *
   * Escribir la URL en la barra del navegador manda una navegación **sin
   * cabecera `Authorization`**. En este proyecto la sesión de Firebase vive
   * entera en el navegador: no hay cookie, y el servidor sólo sabe quién eres
   * por `Authorization: Bearer <ID token>`. Da igual que estés dentro como
   * Super Admin en otra pestaña — esa petición no lleva identidad.
   */
  it('reproduce el 401: sesión de Super Admin abierta, pero navegación SIN cabecera', async () => {
    comoSuperAdmin()   // la persona está dentro…

    const r = await GET(new Request('https://vivebienn.com/api/diagnostico/firebase?sonda=1'))

    expect(r.status).toBe(401)
    expect((await r.json()).error).toMatch(/Inicia sesión/i)
    // Y lo importante: no es que la sonda fallara, es que NUNCA se ejecutó.
    expect(mundo.llamadasSonda).toBe(0)
  })

  it('con la cabecera correcta, un Super Admin SÍ llega a `sondarIdentityToolkit()`', async () => {
    comoSuperAdmin()
    mundo.sonda = {
      ok: true,
      pasos: [
        { paso: 'token', ok: true, codigo: 'OK' },
        { paso: 'accounts:update', ok: true, codigo: 'USER_NOT_FOUND' },
        { paso: 'accounts:delete', ok: true, codigo: 'USER_NOT_FOUND' },
      ],
    }

    const r = await pedir('https://vivebienn.com/api/diagnostico/firebase?sonda=1')
    expect(r.status).toBe(200)

    expect(mundo.llamadasSonda).toBe(1)
    expect((await r.json()).sonda).toEqual({
      ok: true,
      lineas: ['token OAuth: OK', 'accounts:update: USER_NOT_FOUND', 'accounts:delete: USER_NOT_FOUND'],
    })
  })

  it('el panel llama a la ruta por la vía autenticada, no por la barra del navegador', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fuente = readFileSync(join(process.cwd(), 'src/components/admin/DiagnosticoFirebase.tsx'), 'utf8')

    // `pedir()` de `useSesion` es quien adjunta `Authorization: Bearer <token>`.
    expect(fuente).toMatch(/pedir<Respuesta>\(`\/api\/diagnostico\/firebase/)
    expect(fuente).toMatch(/\?sonda=1/)
    // Y nunca un `fetch` pelado, que saldría sin cabecera.
    expect(fuente).not.toMatch(/\bfetch\(/)
  })

  it('el código fuente de la ruta no puede leer ningún identificador de la petición', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fuente = readFileSync(join(process.cwd(), 'src/app/api/diagnostico/firebase/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // Lo único que se lee de la petición es el interruptor `sonda`.
    const leidos = [...fuente.matchAll(/searchParams\.get\(\s*'([^']+)'/g)].map((m) => m[1])
    expect(leidos).toEqual(['sonda'])
    expect(fuente).not.toMatch(/req\.json\(|\.headers\.get\(/)
  })
})
