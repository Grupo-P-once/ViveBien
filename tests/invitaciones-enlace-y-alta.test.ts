import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'

// Todo correo reserva cupo en el libro (migración 62 REAL en PGlite): ningún envío de prueba se salta la cuenta del plan gratuito.
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))
let libro: Libro
beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
beforeEach(async () => { await libro.vaciar() })
afterAll(async () => { await libro?.cerrar() })

/**
 * E-30 — lo que rodea a la aplicación de la invitación:
 *   · rango de roles (`esAscenso`) y utilidades de correo (`normalizarCorreo`, `escaparLike`);
 *   · el enlace del correo (`?invitado=`) y la pantalla que avisa de una sesión con OTRO correo (solo ayuda: la
 *     seguridad real está en el servidor, que jamás consume una invitación con otro correo);
 *   · `POST /api/admin/invitaciones`: quien ya tiene cuenta puede recibir un ASCENSO; con rol igual o superior, no.
 */

type Fila = Record<string, unknown>
const bd = vi.hoisted(() => ({
  usuarios: [] as Fila[],
  invitaciones: [] as Fila[],
  perfil: { uid: 'SUP', email: 'sup@x.test', rol: 'admin', superAdmin: true, estado: 'activo' } as Record<string, unknown>,
  correos: [] as Array<Record<string, unknown>>,
  /** Gancho: se ejecuta justo antes de un UPDATE sobre invitaciones (para simular una aceptación concurrente). */
  alActualizarInvitacion: null as null | (() => void),
}))

/** LIKE de Postgres con `\` como escape (como PostgREST/ilike). */
const ilike = (valor: string, patron: string) => {
  let re = ''
  for (let i = 0; i < patron.length; i += 1) {
    const c = patron[i]
    if (c === '\\' && i + 1 < patron.length) { re += patron[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    re += c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i').test(valor)
}

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const consulta = (tabla: 'usuarios' | 'invitaciones') => {
    const filas = () => (tabla === 'usuarios' ? bd.usuarios : bd.invitaciones)
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'update' | 'insert' = 'select'
    let valores: Fila = {}
    const ejecutar = () => {
      const f = filas().filter((x) => filtros.every((p) => p(x)))
      if (op === 'update') { bd.alActualizarInvitacion?.(); const g = filas().filter((x) => filtros.every((p) => p(x))); g.forEach((x) => Object.assign(x, valores)); return { data: g, error: null } }
      if (op === 'insert') { const n = { id: filas().length + 100, ...valores }; filas().push(n); return { data: [n], error: null } }
      return { data: f, error: null }
    }
    const c: Record<string, unknown> = {
      select: () => c,
      insert: (v: Fila) => { op = 'insert'; valores = v; return c },
      update: (v: Fila) => { op = 'update'; valores = v; return c },
      eq: (col: string, v: unknown) => { filtros.push((x) => x[col] === v); return c },
      ilike: (col: string, p: string) => { filtros.push((x) => typeof x[col] === 'string' && ilike(x[col] as string, p)); return c },
      limit: () => c,
      order: () => c,
      maybeSingle: async () => { const r = ejecutar(); return r.data.length > 1 ? { data: null, error: { message: 'multiple' } } : { data: r.data[0] ?? null, error: null } },
      then: (ok: (v: unknown) => unknown) => ok(ejecutar()),
    }
    return c
  }
  return {
    ...real,
    requireAdmin: async () => ({ perfil: bd.perfil }),
    registrarIntentoDenegado: async () => {},
    supabaseAdmin: () => ({ from: (t: string) => consulta(t as 'usuarios' | 'invitaciones') }),
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))
vi.mock('@/lib/invitacion-correo', () => ({ enviarInvitacion: async (o: Record<string, unknown>) => { bd.correos.push(o); return { enviado: true } } }))

import { POST } from '../src/app/api/admin/invitaciones/route'
import { esAscenso, RANGO_DE_ROL } from '../src/lib/acceso/roles'
import { escaparLike, normalizarCorreo } from '../src/lib/invitaciones'
import { invitacionDeOtroCorreo, pantallaDeDashboard } from '../src/lib/acceso/destino-dashboard'

// MKT-60: estas pruebas ejercitan el camino con la compuerta común ENCENDIDA; el camino apagado lo cubre tests/correo-compuerta-envio.test.ts.
process.env.CORREO_ENVIO = '1'

const invitar = (cuerpo: Record<string, unknown>) =>
  POST(new Request('https://vivebienn.com/api/admin/invitaciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))

beforeEach(() => {
  bd.usuarios = []
  bd.invitaciones = []
  bd.correos = []
  bd.alActualizarInvitacion = null
  bd.perfil = { uid: 'SUP', email: 'sup@x.test', rol: 'admin', superAdmin: true, estado: 'activo' }
})

describe('rango de roles y utilidades de correo', () => {
  it('cliente < publicador < admin < super_admin', () => {
    expect(Object.entries(RANGO_DE_ROL).sort((a, b) => a[1] - b[1]).map(([r]) => r)).toEqual(['cliente', 'publicador', 'admin', 'super_admin'])
  })

  it.each([
    ['cliente', 'publicador', true], ['publicador', 'admin', true], ['admin', 'super_admin', true], ['cliente', 'super_admin', true],
    ['admin', 'admin', false], ['admin', 'publicador', false], ['super_admin', 'admin', false], ['super_admin', 'super_admin', false],
    ['rol_raro', 'super_admin', false], [undefined, 'admin', false], ['cliente', 'rol_raro', false], ['cliente', undefined, false],
  ])('esAscenso(%s → %s) = %s', (actual, invitado, esperado) => expect(esAscenso(actual, invitado)).toBe(esperado))

  it('normalizarCorreo: trim + minúsculas; vacío si no hay', () => {
    expect(normalizarCorreo('  JosePoncep@GP-Once.com ')).toBe('joseponcep@gp-once.com')
    expect(normalizarCorreo(null)).toBe('')
    expect(normalizarCorreo(undefined)).toBe('')
  })

  it('escaparLike: `_`, `%` y `\\` dejan de ser comodines', () => {
    expect(escaparLike('jose_o%p\\x@x.test')).toBe('jose\\_o\\%p\\\\x@x.test')
    expect(ilike('joseponcep@gp-once.com', escaparLike('jose_oncep@gp-once.com'))).toBe(false)
    expect(ilike('jose_oncep@gp-once.com', escaparLike('jose_oncep@gp-once.com'))).toBe(true)
  })
})

describe('G · el enlace de la invitación y la pantalla del dashboard', () => {
  it('sin `?invitado=` o con el MISMO correo (sin importar mayúsculas): no hay aviso', () => {
    expect(invitacionDeOtroCorreo('', 'a@x.test')).toBeNull()
    expect(invitacionDeOtroCorreo('?invitado=A@X.test', ' a@x.TEST ')).toBeNull()
  })

  it('con OTRO correo: avisa con los dos correos normalizados', () => {
    expect(invitacionDeOtroCorreo('?invitado=joseponcep%40gp-once.com', 'JoseponceR@vivebienn.com')).toEqual({ invitado: 'joseponcep@gp-once.com', actual: 'joseponcer@vivebienn.com' })
  })

  it('un valor que no es un correo, o sin sesión con correo, se ignora', () => {
    expect(invitacionDeOtroCorreo('?invitado=<script>', 'a@x.test')).toBeNull()
    expect(invitacionDeOtroCorreo('?invitado=b@x.test', null)).toBeNull()
  })

  it('el aviso va ANTES que cualquier redirección: una sesión de administrador con el enlace de otra persona no sale disparada a /admin', () => {
    const p = pantallaDeDashboard({ authLoading: false, hayUsuario: true, perfil: { rol: 'admin', superAdmin: true }, busqueda: '?invitado=joseponcep%40gp-once.com', correoSesion: 'joseponcer@vivebienn.com' })
    expect(p).toEqual({ estado: 'invitacion_otro_correo', invitado: 'joseponcep@gp-once.com', actual: 'joseponcer@vivebienn.com' })
  })

  it('con el correo correcto sigue el flujo normal; sin sesión sigue siendo «acceso»; sin el parámetro nada cambia', () => {
    const base = { authLoading: false, perfil: { rol: 'admin', superAdmin: true } as const }
    expect(pantallaDeDashboard({ ...base, hayUsuario: true, busqueda: '?invitado=a%40x.test', correoSesion: 'a@x.test' })).toEqual({ estado: 'redirigir', destino: '/admin' })
    expect(pantallaDeDashboard({ ...base, hayUsuario: false, busqueda: '?invitado=a%40x.test', correoSesion: null })).toEqual({ estado: 'acceso' })
    expect(pantallaDeDashboard({ ...base, hayUsuario: true, busqueda: '', correoSesion: 'a@x.test' })).toEqual({ estado: 'redirigir', destino: '/admin' })
  })

  it('el correo de invitación enlaza con `?invitado=` y pide cerrar la sesión de otro correo (texto real)', async () => {
    vi.resetModules()
    vi.doUnmock('@/lib/invitacion-correo')
    const enviados: Array<{ text: string; html: string }> = []
    vi.stubEnv('RESEND_API_KEY', 're_prueba_no_real')
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => { enviados.push(JSON.parse(init.body)); return { ok: true, text: async () => '' } })
    const { enviarInvitacion } = await vi.importActual<typeof import('../src/lib/invitacion-correo')>('../src/lib/invitacion-correo')
    await enviarInvitacion({ email: 'joseponcep@gp-once.com', rol: 'super_admin', invitadoPor: 'sup@x.test' })
    vi.unstubAllGlobals(); vi.unstubAllEnvs()
    expect(enviados[0].text).toContain('/dashboard?invitado=joseponcep%40gp-once.com')
    expect(enviados[0].text).toMatch(/ciérrala primero/)
    expect(enviados[0].text).toContain('Super Administrador')
    expect(enviados[0].html).toContain('?invitado=joseponcep%40gp-once.com')
  })
})

describe('B · POST /api/admin/invitaciones con una cuenta que YA existe', () => {
  it('un ascenso se acepta (cliente → admin): la invitación se crea y el correo sale', async () => {
    bd.usuarios.push({ uid: 'U-A', email: 'a@x.test', rol: 'cliente', estado: 'activo' })
    const r = await invitar({ email: 'A@X.test ', rol: 'admin' })
    expect(r.status).toBe(200)
    expect(bd.invitaciones).toHaveLength(1)
    expect(bd.invitaciones[0]).toMatchObject({ email: 'a@x.test', rol: 'admin', estado: 'pendiente' })
    expect(bd.correos).toHaveLength(1)
  })

  it.each([['admin', 'admin'], ['admin', 'publicador'], ['super_admin', 'admin'], ['publicador', 'publicador']])(
    'rol actual %s + invitación %s (igual o inferior): 409 y no se crea nada', async (actual, invitado) => {
      bd.usuarios.push({ uid: 'U-A', email: 'a@x.test', rol: actual, estado: 'activo' })
      const r = await invitar({ email: 'a@x.test', rol: invitado })
      expect(r.status).toBe(409)
      expect(bd.invitaciones).toHaveLength(0)
      expect(bd.correos).toHaveLength(0)
    })

  it('una cuenta suspendida no recibe invitaciones: 409', async () => {
    bd.usuarios.push({ uid: 'U-A', email: 'a@x.test', rol: 'cliente', estado: 'suspendido' })
    expect((await invitar({ email: 'a@x.test', rol: 'admin' })).status).toBe(409)
  })

  it('el comodín `_` NO hace que otra cuenta cuente como «ya existe»: a_b@x.test no choca con axb@x.test', async () => {
    bd.usuarios.push({ uid: 'U-A', email: 'axb@x.test', rol: 'admin', estado: 'activo' })
    const r = await invitar({ email: 'a_b@x.test', rol: 'publicador' })
    expect(r.status).toBe(200)
    expect(bd.invitaciones[0]).toMatchObject({ email: 'a_b@x.test' })
  })

  it('reenviar reutiliza la invitación pendiente del MISMO correo exacto, no la de otro parecido', async () => {
    bd.invitaciones.push({ id: 1, email: 'axb@x.test', rol: 'admin', estado: 'pendiente' })
    const r = await invitar({ email: 'a_b@x.test', rol: 'admin' })
    expect(r.status).toBe(200)
    expect(bd.invitaciones).toHaveLength(2)                               // se creó una nueva, no se pisó la otra
    expect(bd.invitaciones.find((i) => i.id === 1)).toMatchObject({ email: 'axb@x.test' })
  })

  it('reenviar encuentra la pendiente aunque esté guardada con otras mayúsculas (no crea una duplicada)', async () => {
    bd.invitaciones.push({ id: 1, email: 'A@X.test', rol: 'publicador', estado: 'pendiente' })
    const r = await invitar({ email: 'a@x.test', rol: 'admin' })
    expect(r.status).toBe(200)
    expect(bd.invitaciones).toHaveLength(1)
    expect(bd.invitaciones[0]).toMatchObject({ rol: 'admin', estado: 'pendiente' })
  })

  it('REENVÍO CONCURRENTE: si la invitación se acepta entre la lectura y la escritura, NO se reabre (409) y no sale el correo', async () => {
    bd.invitaciones.push({ id: 1, email: 'a@x.test', rol: 'admin', estado: 'pendiente' })
    bd.alActualizarInvitacion = () => { bd.invitaciones[0].estado = 'aceptada'; bd.invitaciones[0].aceptada_por = 'U-A' }
    const r = await invitar({ email: 'a@x.test', rol: 'admin' })
    expect(r.status).toBe(409)
    expect(bd.invitaciones[0]).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-A' })
    expect(bd.correos).toHaveLength(0)
  })

  it('el reenvío normal de una pendiente NO escribe `estado` (nunca la «vuelve» pendiente)', async () => {
    bd.invitaciones.push({ id: 1, email: 'a@x.test', rol: 'publicador', estado: 'pendiente' })
    const r = await invitar({ email: 'a@x.test', rol: 'admin' })
    expect(r.status).toBe(200)
    expect(bd.invitaciones).toHaveLength(1)
    expect(bd.invitaciones[0]).toMatchObject({ rol: 'admin', estado: 'pendiente' })
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const t = readFileSync(join(__dirname, '..', 'src/app/api/admin/invitaciones/route.ts'), 'utf8')
    expect(t).toMatch(/update\(fila\)\.eq\('id', previa\.id\)\.eq\('estado', 'pendiente'\)/)
  })

  it('un admin que NO es Super Admin sigue sin poder invitar como administrador (403)', async () => {
    bd.perfil = { uid: 'ADM', email: 'adm@x.test', rol: 'admin', superAdmin: false, estado: 'activo' }
    expect((await invitar({ email: 'nuevo@x.test', rol: 'admin' })).status).toBe(403)
    expect(bd.invitaciones).toHaveLength(0)
  })
})
