import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * V-1.1.87 · D-43 — `POST /api/cuenta/eliminar` y su `GET` de estado.
 *
 * Se recorre la ruta REAL con el autorizador REAL: sólo se simulan sus dos
 * extremos —el token de Firebase y la base— y las dos llamadas a Firebase
 * Admin, que aquí son un doble que falla a voluntad.
 *
 * **No se borra ninguna cuenta**: `deleteUser` nunca llega a Firebase.
 */

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; estado: string; rol: string; authTime: number | null },
  // Lo que devuelve la función SQL de la migración 26.
  rpc: { resultado: 'bloqueada', estado_proceso: undefined as string | undefined },
  rpcLanza: null as null | string,
  firebase: { revoke: 'ok' as 'ok' | 'falla', delete: 'ok' as 'ok' | 'falla' | 'no-existe' },
  llamadasFirebase: [] as string[],
  llamadasRpc: [] as Array<Record<string, unknown>>,
  escrituras: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  filaBaja: null as null | { estado: string; intentos: number },
}))

vi.mock('@/lib/auditoria', () => ({
  registrar: async (x: Record<string, unknown>) => { mundo.auditoria.push(x) },
}))

vi.mock('@/lib/firebase-admin', () => ({
  revocarSesiones: async (uid: string) => {
    mundo.llamadasFirebase.push(`revoke:${uid}`)
    return mundo.firebase.revoke === 'ok' ? { ok: true, yaNoExistia: false } : { ok: false, codigo: 'ECONNRESET' }
  },
  borrarIdentidad: async (uid: string) => {
    mundo.llamadasFirebase.push(`delete:${uid}`)
    if (mundo.firebase.delete === 'no-existe') return { ok: true, yaNoExistia: true }
    return mundo.firebase.delete === 'ok' ? { ok: true, yaNoExistia: false } : { ok: false, codigo: 'auth/internal-error' }
  },
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c
    // `update(...).eq(...).in('estado', ANTERIORES[estado])`: la escritura sólo
    // se aplica si el proceso no ha avanzado ya por otro lado.
    c.update = (f: Record<string, unknown>) => {
      mundo.escrituras.push(f)
      const u: Record<string, unknown> = {}
      for (const m of ['eq', 'in', 'select']) u[m] = () => u
      u.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ estado: f.estado }], error: null }).then(ok)
      return u
    }
    c.maybeSingle = async () => ({ data: mundo.filaBaja, error: null })
    return c
  }

  const autorizar = real.crearAutorizador({
    verificar: async () => (mundo.sesion
      ? { uid: mundo.sesion.uid, email: 'quien@ejemplo.invalid', emailVerified: true, authTime: mundo.sesion.authTime }
      : null),
    perfil: async (u) => ({
      ...u,
      rol: mundo.sesion!.rol as 'cliente' | 'publicador' | 'admin',
      superAdmin: mundo.sesion!.rol === 'admin',
      estado: mundo.sesion!.estado as never,
      nombre: null,
    }),
    denegado: async () => {},
  })

  return {
    ...real,
    supabaseAdmin: () => ({
      from: () => cadena(),
      rpc: async (nombre: string, args: Record<string, unknown>) => {
        mundo.llamadasRpc.push({ nombre, ...args })
        if (mundo.rpcLanza) return { data: null, error: { code: mundo.rpcLanza } }
        return { data: { resultado: mundo.rpc.resultado, estado_proceso: mundo.rpc.estado_proceso }, error: null }
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { POST } from '../src/app/api/cuenta/eliminar/route'
import { GET as estado } from '../src/app/api/cuenta/eliminar/estado/route'
import { reautenticacionReciente } from '../src/lib/cuentas/baja'

const ahoraSeg = () => Math.floor(Date.now() / 1000)
const pet = (cuerpo?: unknown, metodo = 'POST') =>
  new Request('https://vivebienn.com/api/cuenta/eliminar', {
    method: metodo,
    headers: { authorization: 'Bearer da-igual', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })

/**
 * Una sesión válida. El `uid` es DISTINTO en cada llamada a propósito: el
 * limitador de peticiones vive en memoria del proceso y se comparte entre
 * pruebas, así que reutilizar el mismo `uid` haría que una prueba gastara el
 * cupo de la siguiente y devolviera 429 donde se espera otra cosa.
 */
let n = 0
const sesionBuena = (extra: Partial<typeof mundo.sesion> = {}) => {
  const uid = `u-${++n}`
  mundo.sesion = { uid, estado: 'activo', rol: 'cliente', authTime: ahoraSeg(), ...(extra as object) }
  return mundo.sesion.uid
}

beforeEach(() => {
  mundo.sesion = null
  mundo.rpc = { resultado: 'bloqueada', estado_proceso: undefined }
  mundo.rpcLanza = null
  mundo.firebase = { revoke: 'ok', delete: 'ok' }
  mundo.llamadasFirebase = []
  mundo.llamadasRpc = []
  mundo.escrituras = []
  mundo.auditoria = []
  mundo.filaBaja = null
})

describe('la puerta', () => {
  it('sin sesión → 401, y no se toca nada', async () => {
    const r = await POST(pet())
    expect(r.status).toBe(401)
    expect(mundo.llamadasRpc).toEqual([])
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('token inválido → 401 (el verificador no devuelve usuario)', async () => {
    mundo.sesion = null
    expect((await POST(pet())).status).toBe(401)
  })

  it('cuenta ya eliminada → 403 cuenta.eliminada', async () => {
    sesionBuena({ estado: 'eliminada' })
    const r = await POST(pet())
    expect(r.status).toBe(403)
    expect((await r.json()).error).toMatch(/eliminada/i)
    expect(mundo.llamadasRpc).toEqual([])
  })

  it('cuenta suspendida → 403', async () => {
    sesionBuena({ estado: 'suspendido' })
    expect((await POST(pet())).status).toBe(403)
  })

  it('EL uid DEL CUERPO se rechaza, aunque sea el propio', async () => {
    sesionBuena()
    for (const cuerpo of [{ uid: 'otra-persona' }, { uid: 'u-1' }, { uid: null }]) {
      mundo.llamadasRpc = []
      const r = await POST(pet(cuerpo))
      expect(r.status).toBe(400)
      expect((await r.json()).codigo).toBe('uid_no_permitido')
      expect(mundo.llamadasRpc).toEqual([])
    }
  })

  it('el uid que llega a la función SQL es SIEMPRE el del token', async () => {
    sesionBuena({ uid: 'u-del-token' })
    await POST(pet({ motivo: 'ya no lo uso' }))
    expect(mundo.llamadasRpc[0]).toMatchObject({ nombre: 'baja_de_cuenta', p_uid: 'u-del-token' })
  })
})

describe('la reautenticación reciente', () => {
  it('la regla pura: sólo pasan los últimos 5 minutos', () => {
    const t = Date.now()
    expect(reautenticacionReciente(Math.floor(t / 1000), t)).toBe(true)
    expect(reautenticacionReciente(Math.floor(t / 1000) - 60, t)).toBe(true)
    expect(reautenticacionReciente(Math.floor(t / 1000) - 301, t)).toBe(false)
    expect(reautenticacionReciente(null, t)).toBe(false)
    expect(reautenticacionReciente(undefined, t)).toBe(false)
    // Un `auth_time` del futuro es tan sospechoso como uno viejo.
    expect(reautenticacionReciente(Math.floor(t / 1000) + 3600, t)).toBe(false)
  })

  it('auth_time de hace 30 min → 428 y NO se ejecuta nada', async () => {
    sesionBuena({ authTime: ahoraSeg() - 30 * 60 })
    const r = await POST(pet())
    expect(r.status).toBe(428)
    expect((await r.json()).codigo).toBe('reautenticacion_requerida')
    expect(mundo.llamadasRpc).toEqual([])
    expect(mundo.llamadasFirebase).toEqual([])
    expect(mundo.escrituras).toEqual([])
  })

  it('sin auth_time en el token → 428 (falla cerrado)', async () => {
    sesionBuena({ authTime: null })
    expect((await POST(pet())).status).toBe(428)
  })

  it('auth_time de hace 1 min → pasa', async () => {
    sesionBuena({ authTime: ahoraSeg() - 60 })
    expect((await POST(pet())).status).toBe(200)
  })
})

describe('el tope de peticiones', () => {
  it('la sexta en una hora → 429, y las cinco primeras pasan', async () => {
    const codigos: number[] = []
    for (let i = 0; i < 6; i++) {
      sesionBuena({ uid: 'u-tope' })
      codigos.push((await POST(pet())).status)
    }
    expect(codigos.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(codigos[5]).toBe(429)
  })

  it('un rechazo por reautenticación NO gasta cupo', async () => {
    for (let i = 0; i < 10; i++) {
      sesionBuena({ uid: 'u-sin-reauth', authTime: ahoraSeg() - 3600 })
      expect((await POST(pet())).status).toBe(428)
    }
    // Con la reautenticación al día, el cupo sigue entero.
    sesionBuena({ uid: 'u-sin-reauth' })
    expect((await POST(pet())).status).toBe(200)
  })
})

describe('los cuatro resultados de la función SQL', () => {
  it('bloqueada → 200, completada y puede registrarse de nuevo', async () => {
    sesionBuena()
    const r = await POST(pet())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'completada', puedeRegistrarseDeNuevo: true, requiereReintento: false })
  })

  it('ya_eliminada → no repite el cierre y responde coherente', async () => {
    sesionBuena()
    mundo.rpc = { resultado: 'ya_eliminada', estado_proceso: 'completada' }
    const r = await POST(pet())
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ estado: 'completada', puedeRegistrarseDeNuevo: true })
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('ultimo_super_admin → 409 y NO se toca Firebase', async () => {
    sesionBuena({ rol: 'admin' })
    mundo.rpc = { resultado: 'ultimo_super_admin', estado_proceso: undefined }
    const r = await POST(pet())
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('ultimo_super_admin')
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('no_existe → 409 y NO se toca Firebase', async () => {
    sesionBuena()
    mundo.rpc = { resultado: 'no_existe', estado_proceso: undefined }
    const r = await POST(pet())
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('sin_cuenta')
    expect(mundo.llamadasFirebase).toEqual([])
  })

  it('la RPC falla ANTES del commit → 500 genérico, sin Firebase', async () => {
    sesionBuena()
    mundo.rpcLanza = '57014'
    const r = await POST(pet())
    expect(r.status).toBe(500)
    const j = await r.json()
    expect(j.codigo).toBe('fallo_interno')
    expect(JSON.stringify(j)).not.toMatch(/57014|postgres|supabase/i)
    expect(mundo.llamadasFirebase).toEqual([])
  })
})

describe('Firebase', () => {
  it('revoca ANTES de borrar', async () => {
    sesionBuena({ uid: 'u-orden' })
    await POST(pet())
    expect(mundo.llamadasFirebase).toEqual(['revoke:u-orden', 'delete:u-orden'])
  })

  it('user-not-found al borrar cuenta como ÉXITO', async () => {
    sesionBuena()
    mundo.firebase.delete = 'no-existe'
    const r = await POST(pet())
    expect(await r.json()).toMatchObject({ estado: 'completada', puedeRegistrarseDeNuevo: true })
  })

  it('revoke ERROR → proceso en error, sin prometer el correo, y NO se borra', async () => {
    const uid = sesionBuena()
    mundo.firebase.revoke = 'falla'
    const r = await POST(pet())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'error', puedeRegistrarseDeNuevo: false, requiereReintento: true })
    expect(mundo.llamadasFirebase).toEqual([`revoke:${uid}`])
    expect(mundo.escrituras.some((e) => e.estado === 'error' && e.ultimo_error === 'ECONNRESET')).toBe(true)
  })

  it('delete ERROR → igual, y la cuenta NO se reabre', async () => {
    sesionBuena()
    mundo.firebase.delete = 'falla'
    const r = await POST(pet())
    expect(await r.json()).toEqual({ estado: 'error', puedeRegistrarseDeNuevo: false, requiereReintento: true })
    expect(mundo.escrituras.some((e) => e.estado === 'error' && e.ultimo_error === 'auth/internal-error')).toBe(true)
    // Nada vuelve a poner la cuenta activa.
    expect(mundo.escrituras.some((e) => e.estado === 'activo' || e.estado === 'solicitada')).toBe(false)
  })

  /**
   * FAIL-SAFE ante un estado incoherente. **No es un flujo de producción.**
   *
   * Esta combinación —una sesión cuyo perfil dice `activo` y una función SQL que
   * responde `ya_eliminada`— no puede darse por el camino normal: `exigir` corta
   * con 403 a una cuenta `eliminada` mucho antes de llegar a la RPC. Se prueba
   * porque describe una **incoherencia** entre lo que se leyó del perfil y lo
   * que hay en la base (una lectura vieja, una fila que cambió entre medias), y
   * lo que importa es qué hace el endpoint cuando el suelo no es el esperado:
   * no reabre nada, no vuelve a cerrar nada, y se limita a terminar el trabajo
   * de Firebase que quedaba pendiente.
   *
   * El camino REAL para empujar una baja atascada es la operación
   * administrativa (`tests/baja-reintento-admin.test.ts`), no este endpoint:
   * su dueña ya no puede entrar por aquí.
   */
  it('FAIL-SAFE · perfil `activo` + RPC `ya_eliminada`: no reabre, sólo termina lo pendiente', async () => {
    const uid = sesionBuena()
    mundo.firebase.delete = 'falla'
    expect((await (await POST(pet())).json()).estado).toBe('error')

    mundo.firebase.delete = 'ok'
    mundo.rpc = { resultado: 'ya_eliminada', estado_proceso: 'error' }
    mundo.llamadasFirebase = []
    const r = await POST(pet())

    expect(await r.json()).toMatchObject({ estado: 'completada', puedeRegistrarseDeNuevo: true })
    expect(mundo.llamadasFirebase).toEqual([`revoke:${uid}`, `delete:${uid}`])
    // La guarda: ni un segundo cierre ni una reapertura.
    expect(mundo.llamadasRpc.filter((l) => l.nombre === 'baja_de_cuenta')).toHaveLength(2)
    expect(mundo.escrituras.some((e) => ['activo', 'solicitada', 'bloqueada'].includes(String(e.estado)))).toBe(false)
  })

  it('el contador de intentos sube', async () => {
    sesionBuena()
    mundo.firebase.delete = 'falla'
    mundo.filaBaja = { estado: 'bloqueada', intentos: 2 }
    await POST(pet())
    expect(mundo.escrituras.find((e) => e.estado === 'error')?.intentos).toBe(3)
  })
})

describe('la bitácora y lo que NO sale', () => {
  it('audita sin PII y SIN el correo (que la función SQL acaba de retirar)', async () => {
    sesionBuena()
    await POST(pet({ motivo: 'me mudo a otra ciudad' }))
    expect(mundo.auditoria.length).toBeGreaterThan(0)
    for (const a of mundo.auditoria) {
      expect((a.actor as { email: unknown }).email).toBeNull()
      expect(JSON.stringify(a)).not.toMatch(/@ejemplo|me mudo|Bearer/)
    }
    expect(mundo.auditoria.map((a) => a.accion)).toContain('cuenta.baja_iniciada')
    expect(mundo.auditoria.map((a) => a.accion)).toContain('cuenta.baja_completada')
  })

  it('ninguna respuesta lleva token, correo ni detalles internos', async () => {
    const casos: Array<[() => void, unknown]> = [
      [() => sesionBuena({ authTime: ahoraSeg() - 9999 }), undefined],
      [() => { sesionBuena(); mundo.rpc = { resultado: 'ultimo_super_admin', estado_proceso: undefined } }, undefined],
      [() => { sesionBuena(); mundo.rpcLanza = 'PGRST301' }, undefined],
      [() => sesionBuena(), { uid: 'x' }],
    ]
    for (const [preparar, cuerpo] of casos) {
      preparar()
      const texto = await (await POST(pet(cuerpo))).text()
      expect(texto).not.toMatch(/Bearer|da-igual|@ejemplo|PGRST|postgres|firebase-admin/i)
    }
  })
})

describe('el GET de estado', () => {
  it('sin sesión → 401', async () => {
    mundo.sesion = null
    expect((await estado(pet(undefined, 'GET'))).status).toBe(401)
  })

  it('no acepta ningún uid: siempre habla de la sesión', async () => {
    sesionBuena({ uid: 'u-mio' })
    const req = new Request('https://vivebienn.com/api/cuenta/eliminar/estado?uid=u-de-otro', {
      headers: { authorization: 'Bearer x' },
    })
    const r = await estado(req)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(JSON.stringify(j)).not.toContain('u-de-otro')
    expect(JSON.stringify(j)).not.toContain('u-mio')
  })

  it('cuenta activa sin baja → activa', async () => {
    sesionBuena()
    expect(await (await estado(pet(undefined, 'GET'))).json())
      .toEqual({ estado: 'activa', puedeRegistrarseDeNuevo: false, requiereReintento: false })
  })

  it('no devuelve `ultimo_error` ni fechas', async () => {
    sesionBuena()
    mundo.filaBaja = { estado: 'error', intentos: 3 }
    const j = await (await estado(pet(undefined, 'GET'))).json()
    expect(Object.keys(j).sort()).toEqual(['estado', 'puedeRegistrarseDeNuevo', 'requiereReintento'])
  })
})
