import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.88 · D-43 — EL REINTENTO ADMINISTRATIVO.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTA OPERACIÓN
 *
 * Si la baja cierra la cuenta en la base y Firebase falla justo después, el
 * proceso se queda en `error`. La persona ya no puede empujarlo: `exigir` corta
 * con 403 a una cuenta `eliminada`, así que ni su propio `POST` ni su `GET` de
 * estado llegan a ningún sitio. Sin una salida, esa identidad se queda viva en
 * Firebase para siempre y esa persona NO puede volver a registrarse con su
 * correo, porque Google le devolvería el UID anterior. Eso rompería la promesa
 * central de D-35.
 *
 * La salida es esta operación de administración. Lo que aquí se prueba, más
 * que lo que hace, es **lo que no puede hacer jamás**:
 *
 *   · no vuelve a ejecutar la función SQL de la baja,
 *   · no escribe en `usuarios`: una cuenta eliminada no vuelve a estar activa,
 *   · no acepta un uid cualquiera,
 *   · no enseña la PII que la baja acaba de retirar.
 * ─────────────────────────────────────────────────────────────
 *
 * Se recorren las rutas REALES con el autorizador REAL. Sólo se simulan sus
 * extremos: el token, la base y las dos llamadas a Firebase Admin.
 * **No se borra ninguna cuenta**: `deleteUser` nunca sale de este proceso.
 */

type Fila = Record<string, unknown>

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; rol: string; superAdmin: boolean; estado: string },
  usuarios: new Map<string, Record<string, unknown>>(),
  bajas: new Map<string, Record<string, unknown>>(),
  firebase: { revoke: 'ok' as 'ok' | 'falla', delete: 'ok' as 'ok' | 'falla' | 'no-existe' },
  llamadasFirebase: [] as string[],
  llamadasRpc: [] as Array<Record<string, unknown>>,
  /** Cualquier escritura sobre `usuarios`. Tiene que quedarse SIEMPRE vacía. */
  escriturasUsuarios: [] as Array<Record<string, unknown>>,
  /** Todo estado que llega a escribirse en `bajas_de_cuenta`, en orden. */
  historial: [] as string[],
  /** Si está puesta, `borrarIdentidad` se queda colgada hasta que se suelte. */
  retenerBorrado: null as null | Promise<void>,
  auditoria: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auditoria', () => ({
  registrar: async (x: Record<string, unknown>) => { mundo.auditoria.push(x) },
}))

vi.mock('@/lib/firebase-admin', () => ({
  revocarSesiones: async (uid: string) => {
    mundo.llamadasFirebase.push(`revoke:${uid}`)
    return mundo.firebase.revoke === 'ok' ? { ok: true } : { ok: false, codigo: 'ECONNRESET' }
  },
  borrarIdentidad: async (uid: string) => {
    mundo.llamadasFirebase.push(`delete:${uid}`)
    // Un Firebase lentísimo: la llamada se queda en vuelo. El resultado se lee
    // AL VOLVER, que es cuando de verdad se sabe (R-3).
    const espera = mundo.retenerBorrado
    if (espera) await espera
    if (mundo.firebase.delete === 'no-existe') return { ok: true, yaNoExistia: true }
    return mundo.firebase.delete === 'ok'
      ? { ok: true, yaNoExistia: false }
      : { ok: false, codigo: 'auth/internal-error' }
  },
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  /** `cols` de PostgREST → sólo esas columnas, como en la base de verdad. */
  const proyectar = (cols: string, f: Fila): Fila => {
    if (!cols || cols === '*') return { ...f }
    const o: Fila = {}
    for (const c of cols.split(',').map((s) => s.trim())) o[c] = f[c] ?? null
    return o
  }

  /**
   * El `.or()` que usa el arriendo, tal cual lo escribe la ruta:
   * `ultimo_intento_en.is.null,ultimo_intento_en.lt.<instante>`.
   * El valor lleva puntos dentro (los milisegundos del ISO), así que se
   * recompone después de partir.
   */
  const cumpleOr = (expr: string) => (f: Fila) =>
    expr.split(',').some((t) => {
      const [col, op, ...resto] = t.split('.')
      const val = resto.join('.')
      const v = (f[col] ?? null) as string | null
      if (op === 'is') return val === 'null' ? v === null : String(v) === val
      if (op === 'lt') return v !== null && v < val
      throw new Error(`operador de PostgREST no simulado: ${op}`)
    })

  const tabla = (nombre: string) => {
    const filtros: Array<(f: Fila) => boolean> = []
    let cols = '*'
    let cambios: Fila | null = null
    let devuelve = false
    let orden: null | { col: string; asc: boolean } = null
    let tope: number | null = null

    const fuente = () => (nombre === 'usuarios' ? mundo.usuarios : mundo.bajas)
    const elegidas = () => [...fuente().values()].filter((f) => filtros.every((p) => p(f)))

    const ejecutar = () => {
      let filas = elegidas()
      if (cambios) {
        // La cuenta NUNCA se toca desde aquí. Se anota para poder afirmarlo.
        if (nombre === 'usuarios') mundo.escriturasUsuarios.push({ ...cambios })
        for (const f of filas) {
          Object.assign(f, cambios)
          if (nombre === 'bajas_de_cuenta' && cambios.estado) mundo.historial.push(String(cambios.estado))
        }
        return { data: devuelve ? filas.map((f) => proyectar(cols, f)) : null, error: null }
      }
      if (orden) {
        const { col, asc } = orden
        filas = [...filas].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
      }
      if (tope !== null) filas = filas.slice(0, tope)
      return { data: filas.map((f) => proyectar(cols, f)), error: null }
    }

    const c: Record<string, unknown> = {
      select: (x?: string) => { cols = x ?? '*'; if (cambios) devuelve = true; return c },
      eq: (col: string, val: unknown) => { filtros.push((f) => f[col] === val); return c },
      neq: (col: string, val: unknown) => { filtros.push((f) => f[col] !== val); return c },
      in: (col: string, vals: unknown[]) => { filtros.push((f) => vals.includes(f[col])); return c },
      or: (expr: string) => { filtros.push(cumpleOr(expr)); return c },
      order: (col: string, o?: { ascending?: boolean }) => { orden = { col, asc: o?.ascending !== false }; return c },
      limit: (n: number) => { tope = n; return c },
      update: (campos: Fila) => { cambios = campos; return c },
      maybeSingle: async () => {
        const f = elegidas()[0]
        return { data: f ? proyectar(cols, f) : null, error: null }
      },
      // La cadena se puede esperar directamente, como en PostgREST.
      then: (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) =>
        Promise.resolve().then(ejecutar).then(ok, mal),
    }
    return c
  }

  const autorizar = real.crearAutorizador({
    verificar: async () => (mundo.sesion
      ? {
        uid: mundo.sesion.uid,
        email: 'admin@ejemplo.invalid',
        emailVerified: true,
        authTime: Math.floor(Date.now() / 1000),
      }
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
    supabaseAdmin: () => ({
      from: (nombre: string) => tabla(nombre),
      /**
       * La función de la migración 26, resumida a su contrato. Su
       * comportamiento real (atomicidad, guardas, concurrencia) se prueba
       * contra PostgreSQL en `tests/migracion-26-funcion.test.ts` y
       * `tests/baja-fallo-firebase.test.ts`. Aquí sólo hace falta que exista
       * para poder afirmar que el REINTENTO **no la llama**.
       */
      rpc: async (nombre: string, args: Record<string, unknown>) => {
        mundo.llamadasRpc.push({ nombre, ...args })
        const uid = args.p_uid as string
        const u = mundo.usuarios.get(uid)
        if (!u) return { data: { resultado: 'no_existe' }, error: null }
        if (u.estado === 'eliminada') {
          return {
            data: { resultado: 'ya_eliminada', estado_proceso: mundo.bajas.get(uid)?.estado },
            error: null,
          }
        }
        Object.assign(u, { estado: 'eliminada', email: null, nombre: null, telefono: null, rol: 'cliente' })
        mundo.bajas.set(uid, {
          uid,
          estado: 'bloqueada',
          intentos: 0,
          ultimo_intento_en: null,
          ultimo_error: null,
          solicitada_en: '2026-09-24T10:00:00.000Z',
          bloqueada_en: '2026-09-24T10:00:00.000Z',
          firebase_eliminada_en: null,
          procesada_en: null,
          completada_en: null,
          motivo: 'ya no lo uso',
          auth_time: '2026-09-24T09:59:00.000Z',
          solicitada_por: 'titular',
        })
        return { data: { resultado: 'bloqueada' }, error: null }
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { POST as reintentar } from '../src/app/api/admin/bajas/[uid]/reintentar/route'
import { GET as listar } from '../src/app/api/admin/bajas/route'
import { POST as darseDeBaja } from '../src/app/api/cuenta/eliminar/route'
import { NO_REINTENTABLES, REINTENTABLES } from '../src/lib/cuentas/reintento'

const pet = (url = 'https://vivebienn.com/api/admin/bajas') =>
  new Request(url, { method: 'POST', headers: { authorization: 'Bearer da-igual' } })

const llamar = (uid: string) => reintentar(pet(), { params: Promise.resolve({ uid }) })

/** Una sesión de administración. Distinta cada vez, por el tope en memoria. */
let n = 0
const comoAdmin = (extra: Partial<NonNullable<typeof mundo.sesion>> = {}) => {
  mundo.sesion = { uid: `admin-${++n}`, rol: 'admin', superAdmin: false, estado: 'activo', ...extra }
}

/** Una cuenta viva, con su PII puesta. */
const cuentaViva = (uid: string, rol = 'cliente') => {
  mundo.usuarios.set(uid, {
    uid, rol, estado: 'activo',
    email: 'quien@ejemplo.invalid', nombre: 'Nombre Ficticio', telefono: '4770000001',
  })
  return uid
}

/** Deja una baja en el estado que se quiera, sin pasar por la baja real. */
const bajaEn = (uid: string, estado: string, extra: Record<string, unknown> = {}) => {
  mundo.usuarios.set(uid, { uid, rol: 'cliente', estado: 'eliminada', email: null, nombre: null, telefono: null })
  mundo.bajas.set(uid, {
    uid, estado, intentos: 1, ultimo_intento_en: null, ultimo_error: 'ECONNRESET',
    solicitada_en: '2026-09-24T10:00:00.000Z', bloqueada_en: '2026-09-24T10:00:00.000Z',
    firebase_eliminada_en: null, procesada_en: null, completada_en: null,
    motivo: 'me mudo de ciudad', auth_time: '2026-09-24T09:59:00.000Z', solicitada_por: 'titular',
    ...extra,
  })
  return uid
}

const baja = (uid: string) => mundo.bajas.get(uid) as Record<string, unknown>
const cuenta = (uid: string) => mundo.usuarios.get(uid) as Record<string, unknown>

beforeEach(() => {
  mundo.sesion = null
  mundo.usuarios = new Map()
  mundo.bajas = new Map()
  mundo.firebase = { revoke: 'ok', delete: 'ok' }
  mundo.llamadasFirebase = []
  mundo.llamadasRpc = []
  mundo.escriturasUsuarios = []
  mundo.historial = []
  mundo.retenerBorrado = null
  mundo.auditoria = []
})

// ── 1 · LA SITUACIÓN QUE HAY QUE REPARAR ───────────────────────────────────

describe('la baja se cierra en local y Firebase falla', () => {
  it('la cuenta queda ELIMINADA y el proceso en `error`, listo para el reintento', async () => {
    const uid = cuentaViva('u-1')
    mundo.sesion = { uid, rol: 'cliente', superAdmin: false, estado: 'activo' }
    mundo.firebase.delete = 'falla'

    const r = await darseDeBaja(new Request('https://vivebienn.com/api/cuenta/eliminar', {
      method: 'POST',
      headers: { authorization: 'Bearer da-igual', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))

    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ estado: 'error', puedeRegistrarseDeNuevo: false, requiereReintento: true })
    expect(cuenta(uid).estado).toBe('eliminada')
    expect(cuenta(uid).email).toBeNull()
    expect(baja(uid).estado).toBe('error')
    expect(baja(uid).ultimo_error).toBe('auth/internal-error')
  })
})

// ── 2 · EL REINTENTO QUE FUNCIONA ──────────────────────────────────────────

describe('el reintento autorizado', () => {
  it('termina la limpieza cuando Firebase vuelve a responder', async () => {
    const uid = bajaEn('u-2', 'error')
    comoAdmin()

    const r = await llamar(uid)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'completada', terminada: true, requiereReintento: false })

    expect(mundo.llamadasFirebase).toEqual([`revoke:${uid}`, `delete:${uid}`])
    expect(baja(uid).estado).toBe('completada')
    expect(baja(uid).ultimo_error).toBeNull()
    expect(baja(uid).completada_en).not.toBeNull()
  })

  it('`user-not-found` cuenta como ÉXITO: el paso ya estaba hecho', async () => {
    const uid = bajaEn('u-3', 'error')
    mundo.firebase.delete = 'no-existe'
    comoAdmin()

    expect((await llamar(uid)).status).toBe(200)
    expect(baja(uid).estado).toBe('completada')
  })

  it('desde `bloqueada` también llama a Firebase; desde `firebase_eliminada` ya no', async () => {
    comoAdmin()
    const a = bajaEn('u-4a', 'bloqueada')
    expect((await llamar(a)).status).toBe(200)
    expect(mundo.llamadasFirebase).toEqual([`revoke:${a}`, `delete:${a}`])

    mundo.llamadasFirebase = []
    comoAdmin()
    const b = bajaEn('u-4b', 'firebase_eliminada')
    expect((await llamar(b)).status).toBe(200)
    expect(baja(b).estado).toBe('completada')
    // Firebase ya estaba hecho: volver a borrar no aporta nada.
    expect(mundo.llamadasFirebase).toEqual([])
  })
})

// ── 3 · EL REINTENTO QUE VUELVE A FALLAR ───────────────────────────────────

describe('si Firebase vuelve a fallar', () => {
  it('el proceso se queda en `error`, con un intento más y un código corto', async () => {
    const uid = bajaEn('u-5', 'error', { intentos: 2 })
    mundo.firebase.delete = 'falla'
    comoAdmin()

    const r = await llamar(uid)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'error', terminada: false, requiereReintento: true })

    expect(baja(uid).estado).toBe('error')
    expect(baja(uid).intentos).toBe(3)
    expect(baja(uid).ultimo_error).toBe('auth/internal-error')
    // Un código, no un mensaje: nada de PII ni de detalles del motor.
    expect(String(baja(uid).ultimo_error)).toMatch(/^[\w.\-/]{1,60}$/)
  })

  it('fallar en revocar tampoco avanza el proceso ni intenta borrar', async () => {
    const uid = bajaEn('u-6', 'error')
    mundo.firebase.revoke = 'falla'
    comoAdmin()

    expect((await llamar(uid)).status).toBe(200)
    expect(mundo.llamadasFirebase).toEqual([`revoke:${uid}`])
    expect(baja(uid).estado).toBe('error')
    expect(baja(uid).ultimo_error).toBe('ECONNRESET')
  })

  it('el proceso NO se reabre: nunca vuelve a `solicitada` ni a `bloqueada`', async () => {
    const uid = bajaEn('u-7', 'error')
    mundo.firebase.delete = 'falla'
    comoAdmin()
    await llamar(uid)
    expect(baja(uid).intentos).toBe(2)

    // Justo después, el arriendo lo impide: no se reintenta a ciegas en bucle.
    comoAdmin()
    expect((await llamar(uid)).status).toBe(409)
    expect(baja(uid).intentos).toBe(2)

    // Pasado el arriendo sí, y sigue sin reabrirse nada.
    baja(uid).ultimo_intento_en = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    comoAdmin()
    await llamar(uid)

    expect(baja(uid).estado).toBe('error')
    expect(baja(uid).intentos).toBe(3)
    expect(cuenta(uid).estado).toBe('eliminada')
  })
})

// ── 4 · LO QUE EL REINTENTO NO PUEDE HACER ─────────────────────────────────

describe('lo que el reintento no puede hacer', () => {
  it('NUNCA reabre la cuenta: `usuarios` no se toca ni al fallar ni al acertar', async () => {
    const bien = bajaEn('u-8', 'error')
    comoAdmin()
    await llamar(bien)

    const mal = bajaEn('u-9', 'error')
    mundo.firebase.delete = 'falla'
    comoAdmin()
    await llamar(mal)

    for (const uid of [bien, mal]) {
      expect(cuenta(uid).estado).toBe('eliminada')
      expect(cuenta(uid).email).toBeNull()
      expect(cuenta(uid).rol).toBe('cliente')
    }
    expect(mundo.escriturasUsuarios).toEqual([])
  })

  it('NO vuelve a ejecutar la baja SQL', async () => {
    const uid = bajaEn('u-10', 'error')
    comoAdmin()
    await llamar(uid)
    expect(mundo.llamadasRpc).toEqual([])
  })

  it('una baja inexistente se rechaza con 404 y sin tocar Firebase', async () => {
    comoAdmin()
    const r = await llamar('no-existe-este-uid')
    expect(r.status).toBe(404)
    expect((await r.json()).codigo).toBe('sin_registro')
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('una baja YA COMPLETADA se rechaza con 409', async () => {
    const uid = bajaEn('u-11', 'completada')
    comoAdmin()
    const r = await llamar(uid)
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('ya_completada')
    expect(mundo.llamadasFirebase).toEqual([])
    expect(baja(uid).estado).toBe('completada')
  })

  it('`solicitada` no se reintenta: no consta que la cuenta esté cerrada', async () => {
    const uid = bajaEn('u-12', 'solicitada')
    comoAdmin()
    const r = await llamar(uid)
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('sin_paso_pendiente')
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('un uid ARBITRARIO no sirve: si la cuenta no consta eliminada, no se toca Firebase', async () => {
    // Una cuenta viva a la que alguien le inventa un registro de baja.
    const uid = cuentaViva('u-13')
    mundo.bajas.set(uid, { uid, estado: 'error', intentos: 0, ultimo_intento_en: null })
    comoAdmin()

    const r = await llamar(uid)
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('cuenta_no_eliminada')
    expect(mundo.llamadasFirebase).toEqual([])
    expect(cuenta(uid).estado).toBe('activo')
    expect(cuenta(uid).email).toBe('quien@ejemplo.invalid')
    expect(mundo.auditoria.at(-1)).toMatchObject({ accion: 'cuenta.baja_reintento_rechazado' })
  })

  it('las listas de estados son coherentes y cubren todo el ciclo', () => {
    expect([...REINTENTABLES, ...NO_REINTENTABLES].sort()).toEqual(
      ['bloqueada', 'completada', 'datos_procesados', 'error', 'firebase_eliminada', 'solicitada'])
    expect(REINTENTABLES).not.toContain('solicitada')
    expect(REINTENTABLES).not.toContain('completada')
  })
})

// ── 5 · QUIÉN PUEDE ────────────────────────────────────────────────────────

describe('quién puede reintentar', () => {
  it('sin sesión → 401', async () => {
    bajaEn('u-14', 'error')
    const r = await llamar('u-14')
    expect(r.status).toBe(401)
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('un cliente → 403', async () => {
    const uid = bajaEn('u-15', 'error')
    comoAdmin({ rol: 'cliente' })
    const r = await llamar(uid)
    expect(r.status).toBe(403)
    expect(mundo.llamadasFirebase).toEqual([])
    expect(baja(uid).estado).toBe('error')
  })

  it('un publicador → 403', async () => {
    const uid = bajaEn('u-16', 'error')
    comoAdmin({ rol: 'publicador' })
    expect((await llamar(uid)).status).toBe(403)
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('un admin cuya propia cuenta no está en regla → 403', async () => {
    const uid = bajaEn('u-17', 'error')
    comoAdmin({ estado: 'suspendido' })
    expect((await llamar(uid)).status).toBe(403)
    comoAdmin({ estado: 'eliminada' })
    expect((await llamar(uid)).status).toBe(403)
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('un super admin sí puede', async () => {
    const uid = bajaEn('u-18', 'error')
    comoAdmin({ superAdmin: true })
    expect((await llamar(uid)).status).toBe(200)
  })

  it('queda constancia de QUIÉN reintentó', async () => {
    const uid = bajaEn('u-19', 'error')
    comoAdmin()
    await llamar(uid)
    const apunte = mundo.auditoria.find((a) => a.accion === 'cuenta.baja_reintento')
    // El correo del administrador SÍ se guarda: es su operación, y no tiene
    // nada que ver con la PII que la baja retiró de la persona eliminada.
    expect(apunte).toMatchObject({
      accion: 'cuenta.baja_reintento',
      entidad: 'cuenta',
      entidadId: uid,
      actor: { uid: mundo.sesion!.uid, email: 'admin@ejemplo.invalid' },
    })
  })
})

// ── 6 · DOS A LA VEZ ───────────────────────────────────────────────────────

describe('dos reintentos simultáneos', () => {
  it('sólo uno avanza; el otro se rechaza y Firebase se llama UNA vez', async () => {
    const uid = bajaEn('u-20', 'error')
    comoAdmin()

    const [a, b] = await Promise.all([llamar(uid), llamar(uid)])
    const codigos = [a.status, b.status].sort()

    expect(codigos).toEqual([200, 409])
    expect(mundo.llamadasFirebase.filter((l) => l.startsWith('delete:'))).toHaveLength(1)
    expect(baja(uid).estado).toBe('completada')
    expect(cuenta(uid).estado).toBe('eliminada')
  })

  it('pasado el arriendo, el reintento se puede retomar', async () => {
    const hace3Min = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const uid = bajaEn('u-21', 'error', { ultimo_intento_en: hace3Min })
    comoAdmin()

    expect((await llamar(uid)).status).toBe(200)
  })

  it('un reintento reciente bloquea el siguiente', async () => {
    const haceUnSegundo = new Date(Date.now() - 1000).toISOString()
    const uid = bajaEn('u-22', 'error', { ultimo_intento_en: haceUnSegundo })
    comoAdmin()

    const r = await llamar(uid)
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('en_curso')
    expect(mundo.llamadasFirebase).toEqual([])
  })
})

// ── R-3 · UN FIREBASE MÁS LENTO QUE EL ARRIENDO ────────────────────────

/**
 * El riesgo que quedó anotado: el arriendo dura 2 minutos, así que un Firebase
 * que tarde más permite que un SEGUNDO reintento entre legítimamente mientras el
 * primero sigue en vuelo. Los dos llaman a `deleteUser`.
 *
 * Lo que tiene que aguantar: `deleteUser` es idempotente (el segundo recibe
 * `user-not-found`, que es éxito), la cuenta sigue eliminada, el proceso NUNCA
 * retrocede de estado, y el resultado final es el mismo para los dos.
 */
describe('R-3 · Firebase tarda más que el arriendo', () => {
  const RANGO: Record<string, number> = {
    solicitada: 0, bloqueada: 1, error: 1, firebase_eliminada: 2, datos_procesados: 3, completada: 4,
  }
  const nuncaRetrocede = () => {
    const r = mundo.historial.map((e) => RANGO[e])
    for (let i = 1; i < r.length; i++) {
      expect(r[i], `retrocedió: ${mundo.historial.join(' → ')}`).toBeGreaterThanOrEqual(r[i - 1])
    }
  }
  const unRespiro = () => new Promise((r) => setTimeout(r, 5))

  it('el primero vuelve tarde y su borrado ya no existe: los dos terminan igual', async () => {
    const uid = bajaEn('u-28', 'error')

    let soltar: () => void = () => {}
    mundo.retenerBorrado = new Promise<void>((r) => { soltar = r })

    comoAdmin()
    const primero = llamar(uid)          // se queda colgado dentro de `deleteUser`
    await unRespiro()
    expect(mundo.llamadasFirebase).toEqual([`revoke:${uid}`, `delete:${uid}`])
    expect(baja(uid).estado).toBe('error')   // todavía no ha avanzado nada

    // Pasan más de dos minutos: el arriendo vence. Mover la marca hacia atrás es
    // exactamente lo que ve la condición SQL cuando avanza el reloj.
    baja(uid).ultimo_intento_en = new Date(Date.now() - 3 * 60 * 1000).toISOString()

    // El segundo entra, borra de verdad y cierra el proceso.
    mundo.retenerBorrado = null
    comoAdmin()
    const segundo = await llamar(uid)
    expect(segundo.status).toBe(200)
    expect(await segundo.json()).toMatchObject({ estado: 'completada', terminada: true })

    // Ahora vuelve el primero: en Firebase ya no queda nada que borrar.
    mundo.firebase.delete = 'no-existe'
    soltar()
    const r = await primero

    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'completada', terminada: true, requiereReintento: false })
    expect(mundo.llamadasFirebase.filter((l) => l.startsWith('delete:'))).toHaveLength(2)
    expect(baja(uid).estado).toBe('completada')
    expect(cuenta(uid).estado).toBe('eliminada')
    expect(mundo.escriturasUsuarios).toEqual([])
    nuncaRetrocede()
  })

  it('el primero vuelve tarde y FALLA: no marca como fallida una baja ya terminada', async () => {
    const uid = bajaEn('u-29', 'error')

    let soltar: () => void = () => {}
    mundo.retenerBorrado = new Promise<void>((r) => { soltar = r })

    comoAdmin()
    const primero = llamar(uid)
    await unRespiro()

    baja(uid).ultimo_intento_en = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    mundo.retenerBorrado = null
    comoAdmin()
    expect((await llamar(uid)).status).toBe(200)
    expect(baja(uid).estado).toBe('completada')

    // El primero vuelve con un fallo de red, tardísimo.
    mundo.firebase.delete = 'falla'
    soltar()
    const r = await primero

    // Lo que NO puede pasar: que una baja terminada vuelva a `error` y que a esa
    // persona se le diga que todavía no puede registrarse.
    expect(baja(uid).estado).toBe('completada')
    expect(baja(uid).ultimo_error).toBeNull()
    expect(await r.json()).toMatchObject({ estado: 'completada', terminada: true, requiereReintento: false })
    expect(cuenta(uid).estado).toBe('eliminada')
    expect(mundo.escriturasUsuarios).toEqual([])
    nuncaRetrocede()
  })

  it('el proceso sólo avanza también en el caso simple: de completada no se vuelve', async () => {
    const uid = bajaEn('u-30', 'firebase_eliminada')
    comoAdmin()
    expect((await llamar(uid)).status).toBe(200)
    expect(mundo.historial).toEqual(['completada'])

    // Un reintento posterior ya no tiene nada que hacer.
    comoAdmin()
    expect((await llamar(uid)).status).toBe(409)
    expect(baja(uid).estado).toBe('completada')
    nuncaRetrocede()
  })
})

// ── 7 · NADA DE PII ────────────────────────────────────────────────────────

describe('la PII que la baja retiró no vuelve por aquí', () => {
  const PROHIBIDO = /ejemplo\.invalid|Nombre Ficticio|4770000001|me mudo de ciudad|auth_time|Bearer/i

  it('la respuesta del reintento no lleva nada personal', async () => {
    const uid = bajaEn('u-23', 'error')
    comoAdmin()
    const texto = await (await llamar(uid)).text()
    expect(texto).not.toMatch(PROHIBIDO)
    expect(JSON.parse(texto)).toEqual({ estado: 'completada', terminada: true, requiereReintento: false })
  })

  it('la lista sólo lleva metadatos de operación', async () => {
    bajaEn('u-24', 'error')
    bajaEn('u-25', 'completada')
    comoAdmin()

    const r = await listar(new Request('https://vivebienn.com/api/admin/bajas', {
      headers: { authorization: 'Bearer da-igual' },
    }))
    expect(r.status).toBe(200)
    const texto = await r.text()
    expect(texto).not.toMatch(PROHIBIDO)

    const { bajas } = JSON.parse(texto) as { bajas: Array<Record<string, unknown>> }
    // Las terminadas no salen: no hay nada que hacer con ellas.
    expect(bajas.map((b) => b.uid)).toEqual(['u-24'])
    expect(Object.keys(bajas[0]).sort()).toEqual([
      'bloqueadaEn', 'completadaEn', 'estado', 'firebaseEliminadaEn',
      'intentos', 'solicitadaEn', 'uid', 'ultimoError', 'ultimoIntentoEn',
    ])
  })

  it('la lista no escribe nada ni llama a la función SQL', async () => {
    bajaEn('u-31', 'error')
    comoAdmin()
    await listar(new Request('https://vivebienn.com/api/admin/bajas', {
      headers: { authorization: 'Bearer da-igual' },
    }))
    expect(mundo.historial).toEqual([])
    expect(mundo.escriturasUsuarios).toEqual([])
    expect(mundo.llamadasRpc).toEqual([])
    expect(mundo.llamadasFirebase).toEqual([])
    expect(cuenta('u-31').estado).toBe('eliminada')
  })

  it('la lista también exige permiso', async () => {
    bajaEn('u-26', 'error')
    const sin = await listar(new Request('https://vivebienn.com/api/admin/bajas'))
    expect(sin.status).toBe(401)

    comoAdmin({ rol: 'cliente' })
    const cliente = await listar(new Request('https://vivebienn.com/api/admin/bajas', {
      headers: { authorization: 'Bearer da-igual' },
    }))
    expect(cliente.status).toBe(403)
  })

  it('la bitácora del reintento tampoco lleva la PII de quien se dio de baja', async () => {
    const uid = bajaEn('u-27', 'error')
    comoAdmin()
    await llamar(uid)

    const propios = mundo.auditoria.filter((a) => String(a.accion).startsWith('cuenta.baja_reintento'))
    expect(propios.length).toBeGreaterThan(0)
    for (const a of propios) {
      // El correo del actor es el del ADMINISTRADOR; lo demás, ni rastro.
      expect(JSON.stringify(a.despues ?? {})).not.toMatch(PROHIBIDO)
      expect(a.entidadId).toBe(uid)
    }
  })
})
