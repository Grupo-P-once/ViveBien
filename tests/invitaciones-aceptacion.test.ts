import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Invitaciones de rol (E-30) — la ruta REAL `GET /api/usuarios/me` y el módulo REAL `aplicarInvitacion`, con una base
 * en memoria cuya función `invitacion_aplicar` es un ESPEJO de la migración 32. La regla DE VERDAD (SQL) se prueba contra
 * Postgres real en `migracion-32-invitacion-aplicar.test.ts` con los mismos 15 casos; aquí se prueba la orquestación:
 * qué se manda a la base (correo normalizado, uid, verificado), cómo se interpreta la respuesta y que un fallo nunca
 * deja a nadie fuera ni da una invitación por aplicada.
 *
 * Caso reportado: invitación `super_admin` para `joseponcep@gp-once.com`; la sesión de `joseponcer@vivebienn.com` jamás
 * la consume; la de `joseponcep@gp-once.com`, sí.
 */

type Fila = Record<string, unknown>
const bd = vi.hoisted(() => ({
  usuarios: [] as Fila[],
  invitaciones: [] as Fila[],
  bitacora: [] as Fila[],
  llamadasRpc: [] as Array<Record<string, unknown>>,
  /** El rol no se puede escribir: la función falla y NO deja nada (como la transacción de la base). */
  fallaEscrituraRol: false,
  /** La aceptación de la invitación falla: ídem, todo o nada. */
  fallaAceptacion: false,
  /** Migración 32 sin aplicar. */
  sinFuncion: false,
}))

const RANGO: Record<string, number> = { cliente: 1, publicador: 2, admin: 3, super_admin: 4 }

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const consulta = (tabla: 'usuarios' | 'invitaciones') => {
    const filas = () => (tabla === 'usuarios' ? bd.usuarios : bd.invitaciones)
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'update' | 'upsert' = 'select'
    let cambios: Fila = {}
    let opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {}
    const ejecutar = () => {
      const coinciden = filas().filter((f) => filtros.every((p) => p(f)))
      if (op === 'select') return { data: coinciden, error: null as { message: string } | null }
      if (tabla === 'usuarios' && bd.fallaEscrituraRol) return { data: null, error: { message: 'escritura rechazada (simulada)' } }
      if (op === 'update') { coinciden.forEach((f) => Object.assign(f, cambios)); return { data: null, error: null } }
      const clave = opciones.onConflict ?? 'uid'
      const previa = filas().find((f) => f[clave] === cambios[clave])
      if (previa) { if (!opciones.ignoreDuplicates) Object.assign(previa, cambios) } else filas().push({ ...cambios })
      return { data: null, error: null }
    }
    const c: Record<string, unknown> = {
      select: () => c,
      update: (v: Fila) => { op = 'update'; cambios = v; return c },
      upsert: (v: Fila, o?: typeof opciones) => { op = 'upsert'; cambios = v; opciones = o ?? {}; return c },
      eq: (col: string, v: unknown) => { filtros.push((f) => f[col] === v); return c },
      or: () => c,
      is: () => c,
      order: () => c,
      limit: () => c,
      maybeSingle: async () => {
        const r = ejecutar()
        if (r.error) return { data: null, error: r.error }
        const f = r.data as Fila[]
        return f.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: f[0] ?? null, error: null }
      },
      then: (ok: (v: unknown) => unknown) => ok(ejecutar()),
    }
    return c
  }

  const vacia = () => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'update', 'is', 'lte', 'gte', 'or', 'ilike']) c[m] = () => c
    c.maybeSingle = async () => ({ data: null, error: null })
    c.insert = async () => ({ error: null })
    c.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: null })
    return c
  }

  /** Espejo de `public.invitacion_aplicar` (migración 32). */
  const invitacionAplicar = (a: { p_uid: string; p_email: string; p_email_verificado: boolean }) => {
    bd.llamadasRpc.push(a)
    if (bd.sinFuncion) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.invitacion_aplicar' } }
    const email = (a.p_email ?? '').trim().toLowerCase()
    if (!a.p_uid || !email) return { data: { resultado: 'omitida', motivo: 'sin_correo' }, error: null }
    const inv = bd.invitaciones.filter((i) => i.estado === 'pendiente' && String(i.email).toLowerCase() === email).sort((x, y) => Number(x.id) - Number(y.id))[0]
    if (!inv) return { data: { resultado: 'omitida', motivo: 'invitacion_no_encontrada' }, error: null }
    if (a.p_email_verificado !== true) return { data: { resultado: 'omitida', motivo: 'email_no_verificado' }, error: null }
    const usr = bd.usuarios.find((u) => u.uid === a.p_uid)
    if (usr && ['suspendido', 'eliminada'].includes(String(usr.estado))) return { data: { resultado: 'omitida', motivo: 'cuenta_no_activa' }, error: null }
    if (usr && RANGO[String(inv.rol)] <= (RANGO[String(usr.rol)] ?? 5)) return { data: { resultado: 'omitida', motivo: 'rol_ya_suficiente' }, error: null }
    // Todo o nada: si algo falla, no se cambia NADA.
    if (bd.fallaEscrituraRol || bd.fallaAceptacion) return { data: null, error: { code: 'XX000', message: 'falló una escritura: se revierte todo' } }
    const antes = usr ? (usr.rol as string) : null
    if (usr) usr.rol = inv.rol
    else bd.usuarios.push({ uid: a.p_uid, email, rol: inv.rol, estado: 'activo' })
    Object.assign(inv, { estado: 'aceptada', aceptada_por: a.p_uid, aceptada_en: 'ahora' })
    bd.bitacora.push({ accion: 'invitacion.aplicada', entidadId: a.p_uid, despues: { rol: inv.rol } })
    return { data: { resultado: 'aplicada', rol: inv.rol, antes }, error: null }
  }

  const sesion = (req: Request) => {
    const cab = req.headers.get('authorization')
    return cab ? (JSON.parse(cab.slice(7)) as { uid: string; email: string; emailVerified: boolean }) : null
  }
  const perfilDe = async (u: { uid: string; email: string; emailVerified: boolean }) => real.resolverPerfil(u, bd.usuarios.find((f) => f.uid === u.uid) ?? null)

  return {
    ...real,
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      real.crearAutorizador({
        verificar: async () => sesion(req),
        perfil: async (usr) => perfilDe(usr as { uid: string; email: string; emailVerified: boolean }),
        denegado: async () => {},
      })(req, (p) => puede(p, permiso), permiso),
    getPerfil: async (u: { uid: string; email: string; emailVerified: boolean }) => perfilDe(u),
    supabaseAdmin: () => ({
      from: (t: string) => (t === 'usuarios' || t === 'invitaciones' ? consulta(t) : vacia()),
      rpc: async (fn: string, a: Record<string, unknown>) =>
        fn === 'invitacion_aplicar' ? invitacionAplicar(a as { p_uid: string; p_email: string; p_email_verificado: boolean }) : { data: null, error: { message: 'función desconocida' } },
    }),
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Fila) => { bd.bitacora.push(e) } }))

import { GET as yo } from '../src/app/api/usuarios/me/route'
import { olvidarFlags } from '../src/lib/config/flags-servidor'

type Sesion = { uid: string; email: string; emailVerified: boolean }
const entrar = (s: Sesion) => yo(new Request('https://vivebienn.com/api/usuarios/me', { headers: { authorization: `Bearer ${JSON.stringify(s)}` } }))
const rolEnBase = (uid: string) => bd.usuarios.find((f) => f.uid === uid)?.rol
const invitacion = (email: string) => bd.invitaciones.find((i) => i.email === email)

const INVITADO = 'joseponcep@gp-once.com'
const PRIMERA = 'joseponcer@vivebienn.com'

beforeEach(() => {
  olvidarFlags()
  bd.usuarios = []
  bd.bitacora = []
  bd.llamadasRpc = []
  bd.fallaEscrituraRol = false
  bd.fallaAceptacion = false
  bd.sinFuncion = false
  bd.invitaciones = [{ id: 3, email: INVITADO, rol: 'super_admin', estado: 'pendiente', aceptada_en: null, aceptada_por: null }]
})

describe('1 · cuenta nueva + invitación super_admin', () => {
  it('nace como super_admin, la invitación queda aceptada por ese uid y la respuesta lo dice', async () => {
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-PEPE' })
    expect((await r.json()).superAdmin).toBe(true)
    expect(bd.bitacora.map((b) => b.accion)).toContain('invitacion.aplicada')
  })
})

describe('2 y 3 · cuenta existente + invitación de rango superior', () => {
  it('2 · cliente → super_admin y aceptada', async () => {
    bd.usuarios.push({ uid: 'U-PEPE', email: INVITADO, rol: 'cliente', estado: 'activo' })
    await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(invitacion(INVITADO)?.estado).toBe('aceptada')
  })

  it('3 · publicador → super_admin (y también publicador → admin) y aceptada', async () => {
    bd.usuarios.push({ uid: 'U-PEPE', email: INVITADO, rol: 'publicador', estado: 'activo' })
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(invitacion(INVITADO)?.estado).toBe('aceptada')
    expect((await r.json()).superAdmin).toBe(true)

    bd.invitaciones = [{ id: 9, email: 'otra@x.test', rol: 'admin', estado: 'pendiente' }]
    bd.usuarios.push({ uid: 'U-OTRA', email: 'otra@x.test', rol: 'publicador', estado: 'activo' })
    await entrar({ uid: 'U-OTRA', email: 'otra@x.test', emailVerified: true })
    expect(rolEnBase('U-OTRA')).toBe('admin')
    expect(invitacion('otra@x.test')?.estado).toBe('aceptada')
  })
})

describe('4 · una invitación nunca baja ni iguala un rol', () => {
  it.each([
    ['admin', 'publicador'],
    ['admin', 'cliente'],
    ['publicador', 'publicador'],
    ['super_admin', 'admin'],
  ])('cuenta %s + invitación %s: el rol no cambia y la invitación NO se da por aceptada', async (actual, invitado) => {
    bd.invitaciones = [{ id: 5, email: 'a@x.test', rol: invitado, estado: 'pendiente' }]
    bd.usuarios.push({ uid: 'U-A', email: 'a@x.test', rol: actual, estado: 'activo' })
    await entrar({ uid: 'U-A', email: 'a@x.test', emailVerified: true })
    expect(rolEnBase('U-A')).toBe(actual)
    expect(invitacion('a@x.test')?.estado).toBe('pendiente')
  })
})

describe('5, 6, 7 y 13 · identidad: solo el correo exacto, normalizado', () => {
  it('5 · un correo distinto no consume la invitación', async () => {
    await entrar({ uid: 'U-X', email: 'alguien@otro.test', emailVerified: true })
    expect(rolEnBase('U-X')).toBe('cliente')
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
  })

  it('6 · comparación EXACTA: comodines de LIKE, prefijos y sufijos no coinciden', async () => {
    for (const [i, correo] of ['jose_oncep@gp-once.com', 'joseponcep@gp-once.co', 'joseponcep@gp-once.com.mx', 'xjoseponcep@gp-once.com', 'jose%@gp-once.com', '%@gp-once.com'].entries()) {
      await entrar({ uid: `U-${i}`, email: correo, emailVerified: true })
      expect(rolEnBase(`U-${i}`), correo).toBe('cliente')
    }
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
  })

  it('7 · mayúsculas y espacios en el correo de la sesión se normalizan antes de comparar', async () => {
    await entrar({ uid: 'U-PEPE', email: '  JosePoncep@GP-Once.com ', emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(bd.llamadasRpc[0]).toMatchObject({ p_email: INVITADO, p_uid: 'U-PEPE', p_email_verificado: true })
  })

  it('13 · dos invitaciones para correos distintos no se cruzan', async () => {
    bd.invitaciones.push({ id: 4, email: PRIMERA, rol: 'admin', estado: 'pendiente' })
    await entrar({ uid: 'U-PRIMERA', email: PRIMERA, emailVerified: true })
    expect(rolEnBase('U-PRIMERA')).toBe('admin')
    expect(invitacion(INVITADO)?.estado).toBe('pendiente')
    await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(rolEnBase('U-PRIMERA')).toBe('admin')
  })
})

describe('8 y 9 · atomicidad: nunca «aceptada» sin el rol aplicado', () => {
  it('8 · si no se puede escribir el rol, la invitación sigue pendiente, no hay rol y la persona igual entra (200)', async () => {
    bd.fallaEscrituraRol = true
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-PEPE')).toBeUndefined()
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
    expect(bd.bitacora.map((b) => b.accion)).not.toContain('invitacion.aplicada')
  })

  it('9 · si falla la aceptación, todo se revierte: ni rol nuevo ni invitación consumida (cuenta existente)', async () => {
    bd.usuarios.push({ uid: 'U-PEPE', email: INVITADO, rol: 'publicador', estado: 'activo' })
    bd.fallaAceptacion = true
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-PEPE')).toBe('publicador')
    expect(invitacion(INVITADO)?.estado).toBe('pendiente')
  })

  it('el fallo queda en la bitácora como `invitacion.omitida` / `error_aplicando_rol`, sin datos sensibles', async () => {
    bd.fallaEscrituraRol = true
    await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    const omitida = bd.bitacora.find((b) => b.accion === 'invitacion.omitida')
    expect(omitida).toMatchObject({ despues: { motivo: 'error_aplicando_rol' } })
    expect(JSON.stringify(omitida)).not.toMatch(/Bearer|token|password/i)
  })

  it('con la migración 32 sin aplicar: nadie deja de entrar, no se aplica ninguna invitación y no se llena la bitácora', async () => {
    bd.sinFuncion = true
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-PEPE')).toBe('cliente')               // alta normal
    expect(invitacion(INVITADO)?.estado).toBe('pendiente')
    expect(bd.bitacora).toHaveLength(0)
  })
})

describe('10, 11 y 12 · invitación inexistente, correo sin verificar, ya aceptada', () => {
  it('10 · sin invitación: alta normal como cliente', async () => {
    const r = await entrar({ uid: 'U-X', email: 'sin.invitacion@x.test', emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-X')).toBe('cliente')
  })

  it('11 · correo sin verificar: no se aplica, queda pendiente; al volver verificado, sube', async () => {
    await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: false })
    expect(rolEnBase('U-PEPE')).toBe('cliente')
    expect(invitacion(INVITADO)?.estado).toBe('pendiente')
    await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
  })

  it('12 · invitación ya aceptada: no se vuelve a aplicar a otra cuenta con ese correo', async () => {
    Object.assign(bd.invitaciones[0], { estado: 'aceptada', aceptada_por: 'U-VIEJO' })
    await entrar({ uid: 'U-NUEVO', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-NUEVO')).toBe('cliente')
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-VIEJO' })
  })
})

describe('14 y 15 · el caso reportado', () => {
  it('14 · sesión joseponcer@vivebienn.com: NO consume la invitación de joseponcep@gp-once.com', async () => {
    bd.usuarios.push({ uid: 'U-PRIMERA', email: PRIMERA, rol: 'cliente', estado: 'activo' })
    const r = await entrar({ uid: 'U-PRIMERA', email: PRIMERA, emailVerified: true })
    expect(r.status).toBe(200)
    expect(rolEnBase('U-PRIMERA')).toBe('cliente')
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
    expect(bd.bitacora.map((b) => b.accion)).not.toContain('invitacion.aplicada')
  })

  it('15 · la misma invitación con la sesión de joseponcep@gp-once.com: consume y asigna super_admin (y la primera no cambia)', async () => {
    bd.usuarios.push({ uid: 'U-PRIMERA', email: PRIMERA, rol: 'cliente', estado: 'activo' })
    await entrar({ uid: 'U-PRIMERA', email: PRIMERA, emailVerified: true })
    const r = await entrar({ uid: 'U-PEPE', email: INVITADO, emailVerified: true })
    expect(rolEnBase('U-PEPE')).toBe('super_admin')
    expect(invitacion(INVITADO)).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-PEPE' })
    expect(rolEnBase('U-PRIMERA')).toBe('cliente')
    expect((await r.json()).superAdmin).toBe(true)
  })
})

describe('orquestación', () => {
  it('un Super Admin existente no necesita llamar a la base de invitaciones', async () => {
    bd.usuarios.push({ uid: 'U-SUP', email: 'sup@x.test', rol: 'super_admin', estado: 'activo' })
    await entrar({ uid: 'U-SUP', email: 'sup@x.test', emailVerified: true })
    expect(bd.llamadasRpc).toHaveLength(0)
  })

  it('el código nunca usa `ilike` con el correo de la sesión como patrón para resolver una invitación', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const t = readFileSync(join(__dirname, '..', 'src/lib/invitaciones.ts'), 'utf8')
    expect(t).not.toMatch(/\.ilike\(/)
    const post = readFileSync(join(__dirname, '..', 'src/app/api/admin/invitaciones/route.ts'), 'utf8')
    expect(post).not.toMatch(/\.ilike\('email',\s*email\)/)
    expect(post).not.toMatch(/\.eq\('email', email\)/)
    expect(post).toContain('escaparLike(email)')
  })
})
