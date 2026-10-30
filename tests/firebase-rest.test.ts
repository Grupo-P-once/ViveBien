import { afterEach, describe, expect, it, vi } from 'vitest'
import { codigoDeIdentityToolkit, crearOperaciones, type Acceso } from '../src/lib/firebase-admin'

/**
 * V-1.1.90 · D-44 — Las dos operaciones de la baja, por Identity Toolkit REST.
 *
 * Sustituyen a `revokeRefreshTokens` y `deleteUser` del SDK, que **no se pueden
 * cargar** en el runtime de Vercel (ver el encabezado de `firebase-admin.ts`).
 * Aquí se prueba cada rama de verdad —éxito, `USER_NOT_FOUND`, 401, 403, red
 * caída, credencial ausente— con un `fetch` inyectado: sin credencial, sin red
 * y **sin tocar ninguna cuenta**.
 *
 * La comprobación contra Google de verdad vive en
 * `scripts/sonda-identity-toolkit.mjs`, que usa un `localId` inexistente.
 */

const TOKEN = 'token-de-mentira-que-no-debe-aparecer-en-ningun-sitio'
const PROYECTO = 'proyecto-de-prueba'
const UID = 'uid-de-prueba-1'

const acceso = async (): Promise<Acceso> => ({ token: TOKEN, projectId: PROYECTO })

/** Un `fetch` de mentira que anota lo que le piden. */
function fetchQue(responder: (url: string) => { status: number; cuerpo?: unknown } | 'revienta') {
  const llamadas: Array<{ url: string; metodo?: string; cuerpo: unknown; cabeceras: Record<string, string> }> = []
  const doble = async (url: string, init: RequestInit) => {
    const r = responder(url)
    llamadas.push({
      url,
      metodo: init.method,
      cuerpo: JSON.parse(String(init.body)),
      cabeceras: init.headers as Record<string, string>,
    })
    if (r === 'revienta') throw Object.assign(new Error('socket'), { code: 'ECONNRESET' })
    return new Response(r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo), { status: r.status })
  }
  return { doble, llamadas }
}

const errorDe = (mensaje: string) => ({ error: { code: 400, message: mensaje } })

/** Captura lo que se escribe en el registro del servidor. */
function espiarConsola() {
  const lineas: string[] = []
  const espia = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    lineas.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
  })
  return { lineas, soltar: () => espia.mockRestore() }
}

afterEach(() => { vi.restoreAllMocks() })

describe('el camino feliz', () => {
  it('borrar: pide accounts:delete con el localId y el token, y responde ok', async () => {
    const f = fetchQue(() => ({ status: 200, cuerpo: { kind: 'identitytoolkit#DeleteAccountResponse' } }))
    const op = crearOperaciones(acceso, f.doble)

    expect(await op.borrarIdentidad(UID)).toEqual({ ok: true, yaNoExistia: false })

    expect(f.llamadas).toHaveLength(1)
    const [l] = f.llamadas
    expect(l.url).toBe(`https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:delete`)
    expect(l.metodo).toBe('POST')
    expect(l.cuerpo).toEqual({ localId: UID })
    expect(l.cabeceras.authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('revocar: pide accounts:update con `validSince` en segundos', async () => {
    const f = fetchQue(() => ({ status: 200, cuerpo: { localId: UID } }))
    const antes = Math.floor(Date.now() / 1000)

    expect(await crearOperaciones(acceso, f.doble).revocarSesiones(UID)).toEqual({ ok: true, yaNoExistia: false })

    const [l] = f.llamadas
    expect(l.url).toMatch(/accounts:update$/)
    const cuerpo = l.cuerpo as { localId: string; validSince: string }
    expect(cuerpo.localId).toBe(UID)
    expect(cuerpo.validSince).toMatch(/^\d+$/)
    // En segundos, no en milisegundos: si alguien se confunde, esto lo caza.
    expect(Number(cuerpo.validSince)).toBeGreaterThanOrEqual(antes)
    expect(Number(cuerpo.validSince)).toBeLessThan(antes + 5)
  })

  it('revocar y luego borrar: dos llamadas, en ese orden', async () => {
    const f = fetchQue(() => ({ status: 200, cuerpo: {} }))
    const op = crearOperaciones(acceso, f.doble)

    expect((await op.revocarSesiones(UID)).ok).toBe(true)
    expect((await op.borrarIdentidad(UID)).ok).toBe(true)
    expect(f.llamadas.map((l) => l.url.split('/').pop())).toEqual(['accounts:update', 'accounts:delete'])
  })
})

describe('`USER_NOT_FOUND` es ÉXITO', () => {
  it('al borrar: la identidad ya no estaba, que es justo lo que se quería', async () => {
    const f = fetchQue(() => ({ status: 400, cuerpo: errorDe('USER_NOT_FOUND') }))
    expect(await crearOperaciones(acceso, f.doble).borrarIdentidad(UID))
      .toEqual({ ok: true, yaNoExistia: true })
  })

  it('al revocar: tampoco es un fallo', async () => {
    const f = fetchQue(() => ({ status: 400, cuerpo: errorDe('USER_NOT_FOUND') }))
    expect(await crearOperaciones(acceso, f.doble).revocarSesiones(UID))
      .toEqual({ ok: true, yaNoExistia: true })
  })

  it('con la explicación detrás también se reconoce', async () => {
    const f = fetchQue(() => ({ status: 400, cuerpo: errorDe('USER_NOT_FOUND : no such user') }))
    expect((await crearOperaciones(acceso, f.doble).borrarIdentidad(UID)).ok).toBe(true)
  })
})

describe('los fallos, cada uno con su código corto', () => {
  const casos: Array<[string, number, unknown, string]> = [
    ['credencial rechazada', 401, { error: { message: 'UNAUTHENTICATED' } }, 'UNAUTHENTICATED'],
    ['401 sin identificador', 401, { error: {} }, 'credencial_rechazada'],
    ['permisos insuficientes', 403, { error: {} }, 'permiso_denegado'],
    ['403 con identificador', 403, { error: { message: 'PERMISSION_DENIED' } }, 'PERMISSION_DENIED'],
    ['petición mal formada', 400, { error: { message: 'INVALID_LOCAL_ID' } }, 'INVALID_LOCAL_ID'],
    ['caída de Google', 503, { error: {} }, 'http_503'],
    ['respuesta que no es JSON', 500, undefined, 'http_500'],
  ]

  for (const [nombre, http, cuerpo, esperado] of casos) {
    it(`${nombre} → ${esperado}`, async () => {
      espiarConsola()
      const f = fetchQue(() => ({ status: http, cuerpo }))
      expect(await crearOperaciones(acceso, f.doble).borrarIdentidad(UID))
        .toEqual({ ok: false, codigo: esperado })
    })
  }

  it('la red se cae → `sin_red`, y no se inventa un éxito', async () => {
    espiarConsola()
    const f = fetchQue(() => 'revienta')
    expect(await crearOperaciones(acceso, f.doble).borrarIdentidad(UID))
      .toEqual({ ok: false, codigo: 'sin_red' })
  })

  it('sin credencial no se llama a nadie', async () => {
    const f = fetchQue(() => ({ status: 200 }))
    const op = crearOperaciones(async () => ({ codigo: 'credencial_no_disponible' }), f.doble)

    expect(await op.revocarSesiones(UID)).toEqual({ ok: false, codigo: 'credencial_no_disponible' })
    expect(await op.borrarIdentidad(UID)).toEqual({ ok: false, codigo: 'credencial_no_disponible' })
    expect(f.llamadas).toEqual([])
  })

  it('fallar al revocar no impide que el proceso lo trate como fallo del paso', async () => {
    espiarConsola()
    const f = fetchQue((url) => (url.endsWith('accounts:update') ? { status: 500, cuerpo: undefined } : { status: 200 }))
    const op = crearOperaciones(acceso, f.doble)
    expect(await op.revocarSesiones(UID)).toEqual({ ok: false, codigo: 'http_500' })
    // Y borrar, por separado, sigue funcionando: son dos operaciones distintas.
    expect((await op.borrarIdentidad(UID)).ok).toBe(true)
  })
})

describe('la traducción de errores, como función pura', () => {
  it('sólo acepta el identificador en MAYÚSCULAS de Identity Toolkit', () => {
    expect(codigoDeIdentityToolkit(400, errorDe('USER_NOT_FOUND'))).toBe('USER_NOT_FOUND')
    expect(codigoDeIdentityToolkit(400, errorDe('TOO_MANY_ATTEMPTS_TRY_LATER'))).toBe('TOO_MANY_ATTEMPTS_TRY_LATER')
  })

  it('un mensaje arbitrario NO se convierte en código: se descarta', () => {
    // Si Google (o cualquiera) devolviera texto libre, no puede acabar en la
    // base ni en la bitácora. Se responde con el HTTP y punto.
    for (const raro of [
      'algo salió mal, mira tu clave privada -----BEGIN PRIVATE KEY-----',
      'Bearer ya29.a0AfH6SMB...',
      'el correo juan@ejemplo.com no existe',
      '',
    ]) {
      expect(codigoDeIdentityToolkit(400, errorDe(raro))).toBe('http_400')
    }
    expect(codigoDeIdentityToolkit(400, null)).toBe('http_400')
    expect(codigoDeIdentityToolkit(400, { error: { message: 123 } })).toBe('http_400')
  })

  it('el código nunca es largo ni raro: sirve para guardarlo tal cual', () => {
    for (const c of [
      codigoDeIdentityToolkit(401, {}), codigoDeIdentityToolkit(403, {}),
      codigoDeIdentityToolkit(500, {}), codigoDeIdentityToolkit(400, errorDe('USER_NOT_FOUND')),
    ]) {
      expect(c).toMatch(/^[\w.\-/]{1,60}$/)
    }
  })
})

describe('ningún secreto sale de aquí', () => {
  it('ni en lo que se devuelve ni en el registro del servidor', async () => {
    const consola = espiarConsola()
    const f = fetchQue(() => ({ status: 403, cuerpo: { error: { message: 'PERMISSION_DENIED' } } }))

    const r = await crearOperaciones(acceso, f.doble).borrarIdentidad(UID)

    expect(JSON.stringify(r)).not.toContain(TOKEN)
    expect(JSON.stringify(r)).not.toMatch(/Bearer/i)
    // El registro SÍ lleva detalle técnico —para eso está— pero nunca el token
    // ni la cabecera de autorización.
    const registro = consola.lineas.join('\n')
    expect(registro).not.toContain(TOKEN)
    expect(registro).not.toMatch(/Bearer/i)
    expect(registro).not.toMatch(/PRIVATE KEY/i)
    // Y sí debe contener algo útil para diagnosticar: eso es lo que faltaba.
    expect(registro).toMatch(/accounts:delete/)
    expect(registro).toMatch(/403/)
    consola.soltar()
  })

  it('el éxito no escribe nada en el registro', async () => {
    const consola = espiarConsola()
    const f = fetchQue(() => ({ status: 200, cuerpo: {} }))
    await crearOperaciones(acceso, f.doble).borrarIdentidad(UID)
    expect(consola.lineas).toEqual([])
    consola.soltar()
  })
})
