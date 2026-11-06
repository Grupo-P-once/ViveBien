import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * V-1.1.83 — Incidente «no puedo entrar con Google».
 * Casos A–M del cierre; lo que necesita navegador real va en
 * scripts/_probar-dominios-google.mjs y en la verificación de producción.
 */

const bd = vi.hoisted(() => ({
  insertados: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
  fila: null as null | Record<string, unknown>,
  perfil: null as null | Record<string, unknown>,
  /** Lo que hay en `configuracion.flags`. `null` = fila ausente (todo apagado). */
  flags: null as null | Record<string, unknown>,
  /** SEC-3: filas anónimas de la bitácora de acceso en la última hora / en 24 h. `'error'` = la consulta del conteo falla. */
  conteoHora: 0 as number | 'error',
  conteoDia: 0 as number | 'error',
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    let ventanaMs = 0
    for (const m of ['select', 'eq', 'order', 'update', 'is', 'lte']) c[m] = () => c
    c.gte = (_col: string, desde: string) => { ventanaMs = Date.now() - Date.parse(desde); return c }
    c.maybeSingle = async () => ({
      data: tabla === 'usuarios' ? bd.fila
        : tabla === 'configuracion' ? (bd.flags ? { valor: bd.flags } : null)
        : null,
      error: null,
    })
    c.insert = async (f: Record<string, unknown>) => { bd.insertados.push({ tabla, ...f }); return { error: null } }
    c.upsert = async (f: Record<string, unknown>) => { bd.upserts.push({ tabla, ...f }); return { error: null } }
    c.then = (r: (v: unknown) => unknown) => {
      if (tabla === 'audit_logs' && ventanaMs > 0) { // el conteo del tope global (SEC-3): ≤ ~1 h → conteoHora; si no, conteoDia
        const v = ventanaMs <= 3_700_000 ? bd.conteoHora : bd.conteoDia
        return r(v === 'error' ? { data: null, count: null, error: { message: 'falla simulada' } } : { data: null, count: v, error: null })
      }
      return r({ data: null, error: null })
    }
    return c
  }
  return {
    ...real,
    // V-1.1.87 (etapa 1): la ruta ya no llama a `verifyIdToken`, sino a
    // `exigir`. Se arma el autorizador REAL con los extremos de esta prueba,
    // para que recorra de verdad sesión → estado → permiso.
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      real.crearAutorizador({ verificar: async (req: Request) => (req.headers.get('authorization') ? { uid: 'u-1', email: 'x@ejemplo.test', emailVerified: true } : null), perfil: async () => bd.perfil as Awaited<ReturnType<typeof real.getPerfil>>, denegado: async () => {} })(
        req, (p) => puede(p, permiso), permiso,
      ),
    verifyIdToken: async (req: Request) => (req.headers.get('authorization') ? { uid: 'u-1', email: 'x@ejemplo.test', emailVerified: true } : null),
    getPerfil: async () => bd.perfil,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t) }),
  }
})
vi.mock('@/lib/firebase', () => ({ auth: { config: {} }, googleProvider: {} }))
vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))

import {
  MENSAJES, MENSAJE_CANCELADO, destinoTrasEntrar, mensajeDeRegistro, mensajeIncrustado, navegadorIncrustado,
  redireccionDisponible, registroValido, resultadoDeError,
} from '../src/lib/acceso/google'
import { crearEntrada, crearRegreso, type DependenciasEntrada } from '../src/lib/acceso/entrar-google'
import { POST as registrarFallo } from '../src/app/api/acceso/registro/route'
import { GET as yo } from '../src/app/api/usuarios/me/route'
import { olvidarFlags } from '../src/lib/config/flags-servidor'

const error = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code })

// ── Agentes reales (copiados de navegadores y apps) ────────────────────────
const UA = {
  chromeEscritorio: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.107 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98 (iPhone15,2; iOS 17_5; es_MX; es; scale=3.00; 1179x2556; 607420519)',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; es_MX; 598323397)',
  facebookIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/459.0.0.39.107;FBBV/583939402;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5]',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 13; moto g(60) Build/T1RD33.116-33-3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.118 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/458.0.0.44.109;]',
  whatsapp: 'Mozilla/5.0 (Linux; Android 12; SM-A125M Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 WhatsApp/2.24.7.81',
  tiktok: 'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.178 Mobile Safari/537.36 trill_330405 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/33.4.5',
  webviewAndroid: 'Mozilla/5.0 (Linux; Android 11; Pixel 5 Build/RQ3A.210805.001.A1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
}

// ── Mensajes ───────────────────────────────────────────────────────────────
describe('4 · ninguna frase enseña códigos ni habla de Firebase', () => {
  const todas = [
    ...Object.values(MENSAJES), MENSAJE_CANCELADO, mensajeIncrustado('Instagram'),
    ...['auth/email-already-in-use', 'auth/invalid-email', 'auth/weak-password', 'auth/network-request-failed', 'x'].map(mensajeDeRegistro),
  ]
  it.each(todas)('%s', (m) => {
    expect(m).not.toMatch(/auth\/|firebase|origin_mismatch|internal-error|popup-blocked|Error \(/i)
    expect(m.length).toBeGreaterThan(20)
  })

  it.each([
    ['F · ventana bloqueada', 'auth/popup-blocked', 'ventana-bloqueada'],
    ['OAuth no disponible', 'auth/operation-not-supported-in-this-environment', 'no-disponible'],
    ['OAuth no disponible (proveedor apagado)', 'auth/operation-not-allowed', 'no-disponible'],
    ['dominio no autorizado (la captura del 22-sep)', 'auth/unauthorized-domain', 'dominio-no-autorizado'],
    ['sesión caducada', 'auth/user-token-expired', 'sesion-caducada'],
    ['sesión caducada (reciente)', 'auth/requires-recent-login', 'sesion-caducada'],
    ['error interno → desconocido', 'auth/internal-error', 'desconocido'],
    ['código que no conocemos', 'auth/algo-nuevo', 'desconocido'],
  ])('%s', (_, codigo, motivo) => {
    const r = resultadoDeError(error(codigo))
    expect(r).toMatchObject({ estado: 'error', motivo })
    if (r.estado === 'error') expect(r.mensaje).not.toContain(codigo)
  })

  it('G · la persona cierra la ventana: no es error', () => {
    for (const c of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']) {
      expect(resultadoDeError(error(c))).toEqual({ estado: 'cancelado' })
    }
  })

  it('un error sin código (o que no es error) → desconocido, sin reventar', () => {
    expect(resultadoDeError(new Error('x'))).toMatchObject({ motivo: 'desconocido' })
    expect(resultadoDeError(null)).toMatchObject({ motivo: 'desconocido' })
  })
})

// ── Navegadores ────────────────────────────────────────────────────────────
describe('C/D/M · navegadores', () => {
  it.each([
    ['instagramIphone', 'Instagram'], ['instagramAndroid', 'Instagram'],
    ['facebookIphone', 'Facebook'], ['facebookAndroid', 'Facebook'],
    ['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['webviewAndroid', 'esta aplicación'],
  ] as const)('M · %s → incrustado (%s)', (k, app) => {
    expect(navegadorIncrustado(UA[k])).toBe(app)
  })

  it.each(['chromeEscritorio', 'safariMac', 'firefox', 'edge', 'safariIphone', 'chromeIphone', 'chromeAndroid', 'samsung'] as const)(
    'C/D · %s → navegador normal', (k) => {
      expect(navegadorIncrustado(UA[k])).toBeNull()
    })

  it('sin agente, nada', () => {
    expect(navegadorIncrustado('')).toBeNull()
    expect(navegadorIncrustado(undefined)).toBeNull()
  })
})

describe('plan B por redirección: sólo con el proxy en el propio dominio', () => {
  it('hoy (authDomain en firebaseapp.com) NO está disponible', () => {
    expect(redireccionDisponible('vivebien-84685.firebaseapp.com', 'vivebienn.com')).toBe(false)
  })
  it('con authDomain = vivebienn.com, sí (y da igual mayúsculas)', () => {
    expect(redireccionDisponible('vivebienn.com', 'VIVEBIENN.com')).toBe(true)
  })
  it('B · en www no (la redirección a vivebienn.com llega antes)', () => {
    expect(redireccionDisponible('vivebienn.com', 'www.vivebienn.com')).toBe(false)
  })
  it('sin authDomain, no', () => {
    expect(redireccionDisponible(undefined, 'vivebienn.com')).toBe(false)
  })
})

// ── El orden completo ──────────────────────────────────────────────────────
function deps(p: Partial<DependenciasEntrada> = {}) {
  const registros: unknown[] = []
  const d: DependenciasEntrada = {
    ventana: vi.fn(async () => ({})),
    redireccion: vi.fn(async () => undefined),
    agente: UA.chromeEscritorio,
    anfitrion: 'vivebienn.com',
    authDomain: 'vivebien-84685.firebaseapp.com',
    registrar: (r) => { registros.push(r) },
    ...p,
  }
  return { d, registros }
}

describe('3 · ventana → plan B → frase clara', () => {
  it('E · ventana permitida: entra, sin redirección ni bitácora', async () => {
    const { d, registros } = deps()
    expect(await crearEntrada(d)('dashboard')).toEqual({ estado: 'dentro' })
    expect(d.redireccion).not.toHaveBeenCalled()
    expect(registros).toEqual([])
  })

  it('F · ventana bloqueada SIN proxy: no intenta una redirección que perdería la sesión; frase clara', async () => {
    const { d, registros } = deps({ ventana: vi.fn(async () => { throw error('auth/popup-blocked') }) })
    const r = await crearEntrada(d)('dashboard')
    expect(r).toMatchObject({ estado: 'error', motivo: 'ventana-bloqueada' })
    expect(d.redireccion).not.toHaveBeenCalled()
    expect(registros).toEqual([{ codigo: 'auth/popup-blocked', donde: 'dashboard', paso: 'ventana', incrustado: null, planB: false }])
  })

  it('F · ventana bloqueada CON proxy: se va por redirección, sola', async () => {
    const { d, registros } = deps({ authDomain: 'vivebienn.com', ventana: vi.fn(async () => { throw error('auth/popup-blocked') }) })
    expect(await crearEntrada(d)('portal')).toEqual({ estado: 'redirigiendo' })
    expect(d.redireccion).toHaveBeenCalledTimes(1)
    expect(registros).toHaveLength(1)
  })

  it('F · la redirección también falla: frase, y las dos fallas en la bitácora', async () => {
    const { d, registros } = deps({
      authDomain: 'vivebienn.com',
      ventana: vi.fn(async () => { throw error('auth/popup-blocked') }),
      redireccion: vi.fn(async () => { throw error('auth/network-request-failed') }),
    })
    expect(await crearEntrada(d)('portal')).toMatchObject({ estado: 'error', motivo: 'sin-conexion' })
    expect(registros.map((r) => (r as { paso: string }).paso)).toEqual(['ventana', 'redireccion'])
  })

  it('G · cancelar: sin redirección; queda en la bitácora (Firebase lo reporta igual si la ventana se cierra sola)', async () => {
    const { d, registros } = deps({ authDomain: 'vivebienn.com', ventana: vi.fn(async () => { throw error('auth/popup-closed-by-user') }) })
    expect(await crearEntrada(d)('panel')).toEqual({ estado: 'cancelado' })
    expect(d.redireccion).not.toHaveBeenCalled()
    expect(registros).toHaveLength(1)
  })

  it('dominio no autorizado: sin plan B (tampoco serviría)', async () => {
    const { d } = deps({ authDomain: 'vivebienn.com', ventana: vi.fn(async () => { throw error('auth/unauthorized-domain') }) })
    expect(await crearEntrada(d)('dashboard')).toMatchObject({ motivo: 'dominio-no-autorizado' })
    expect(d.redireccion).not.toHaveBeenCalled()
  })

  it('M · Instagram SIN proxy: ni ventana ni redirección; cómo abrirlo fuera', async () => {
    const { d, registros } = deps({ agente: UA.instagramIphone })
    const r = await crearEntrada(d)('dashboard')
    expect(r).toMatchObject({ estado: 'navegador-incrustado', app: 'Instagram' })
    expect(d.ventana).not.toHaveBeenCalled()
    expect(d.redireccion).not.toHaveBeenCalled()
    expect(registros).toEqual([{ codigo: 'vivebien/navegador-incrustado', donde: 'dashboard', paso: 'ventana', incrustado: 'Instagram', planB: false }])
  })

  it('M · Facebook CON proxy: tampoco redirección (Google bloquea el acceso en WebViews: disallowed_useragent)', async () => {
    const { d } = deps({ agente: UA.facebookAndroid, authDomain: 'vivebienn.com' })
    expect(await crearEntrada(d)('dashboard')).toMatchObject({ estado: 'navegador-incrustado', app: 'Facebook' })
    expect(d.ventana).not.toHaveBeenCalled()
    expect(d.redireccion).not.toHaveBeenCalled()
  })

  it('al volver de Google: sin proxy no pide nada; con proxy traduce el error', async () => {
    const resultado = vi.fn(async () => { throw error('auth/user-token-expired') })
    const { d, registros } = deps()
    expect(await crearRegreso({ ...d, resultado })('dashboard')).toBeNull()
    expect(resultado).not.toHaveBeenCalled()
    const r = await crearRegreso({ ...d, authDomain: 'vivebienn.com', resultado })('dashboard')
    expect(r).toMatchObject({ motivo: 'sesion-caducada' })
    expect(registros).toMatchObject([{ paso: 'regreso', codigo: 'auth/user-token-expired' }])
  })
})

// ── Bitácora ───────────────────────────────────────────────────────────────
describe('4 · bitácora técnica sin exponer nada', () => {
  beforeEach(() => { bd.insertados = []; bd.conteoHora = 0; bd.conteoDia = 0 })
  const enviar = (cuerpo: unknown, host = 'vivebienn.com') => registrarFallo(new Request('https://vivebienn.com/api/acceso/registro', {
    method: 'POST', headers: { 'content-type': 'application/json', host, 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(cuerpo),
  }))

  it('guarda sólo campos acotados, anónimo, y responde 204', async () => {
    const r = await enviar({ codigo: 'auth/unauthorized-domain', donde: 'dashboard', paso: 'ventana', incrustado: null, planB: false, mensaje: 'Firebase: correo@x.com', correo: 'correo@x.com' })
    expect(r.status).toBe(204)
    expect(bd.insertados).toEqual([{
      tabla: 'audit_logs', actor_uid: 'anonimo', accion: 'acceso.google_fallo', entidad: 'acceso', entidad_id: 'auth/unauthorized-domain',
      despues: { donde: 'dashboard', paso: 'ventana', incrustado: null, planB: false, anfitrion: 'vivebienn.com' },
    }])
    expect(JSON.stringify(bd.insertados)).not.toContain('correo@x.com')
  })

  it('basura → 204 y no guarda', async () => {
    for (const c of [null, 'x', { donde: 'dashboard' }, { donde: '<script>', paso: 'ventana' }, { donde: 'dashboard', paso: 'otro' }]) {
      expect((await enviar(c)).status).toBe(204)
    }
    expect(bd.insertados).toEqual([])
  })

  const valido = { codigo: 'auth/unauthorized-domain', donde: 'dashboard', paso: 'ventana', incrustado: null, planB: false }

  it('SEC-3 · control positivo: con cupo (14 en la hora, 99 en el día) SÍ guarda', async () => {
    bd.conteoHora = 14; bd.conteoDia = 99
    expect((await enviar(valido)).status).toBe(204)
    expect(bd.insertados).toHaveLength(1)
  })
  it('SEC-3 · con 15 en la última hora ya no guarda y sigue respondiendo 204', async () => {
    bd.conteoHora = 15
    expect((await enviar(valido)).status).toBe(204)
    expect(bd.insertados).toEqual([])
  })
  it('SEC-3 · con 100 en 24 h ya no guarda aunque la hora vaya limpia', async () => {
    bd.conteoHora = 0; bd.conteoDia = 100
    expect((await enviar(valido)).status).toBe(204)
    expect(bd.insertados).toEqual([])
  })
  it('SEC-3 · si el conteo falla NO escribe (falla cerrado), en cualquiera de las dos ventanas', async () => {
    bd.conteoHora = 'error'
    expect((await enviar(valido)).status).toBe(204)
    bd.conteoHora = 0; bd.conteoDia = 'error'
    expect((await enviar(valido)).status).toBe(204)
    expect(bd.insertados).toEqual([])
  })
  it('SEC-3 · un cuerpo mayor de 4 KB se descarta sin leerlo ni guardar', async () => {
    const r = await registrarFallo(new Request('https://vivebienn.com/api/acceso/registro', {
      method: 'POST', headers: { 'content-type': 'application/json', host: 'vivebienn.com', 'content-length': '5000', 'x-forwarded-for': '10.9.9.9' },
      body: JSON.stringify({ ...valido, relleno: 'x'.repeat(5000) }),
    }))
    expect(r.status).toBe(204)
    expect(bd.insertados).toEqual([])
  })

  it('un código raro se guarda como desconocido; la app incrustada sólo si es un nombre', () => {
    expect(registroValido({ codigo: 'DROP TABLE', donde: 'panel', paso: 'regreso' })).toMatchObject({ codigo: 'desconocido/sin-codigo' })
    expect(registroValido({ codigo: 'auth/x', donde: 'panel', paso: 'ventana', incrustado: '<img src=x>' })).toMatchObject({ incrustado: null })
    expect(registroValido({ codigo: 'auth/x', donde: 'panel', paso: 'ventana', incrustado: 'esta aplicación' })).toMatchObject({ incrustado: 'esta aplicación' })
  })
})

// ── Después de entrar ──────────────────────────────────────────────────────
describe('5 · Google → token → /api/usuarios/me → rol → destino', () => {
  beforeEach(() => { bd.upserts = []; bd.insertados = []; bd.fila = null; bd.flags = null; olvidarFlags() })
  const pedir = (conToken = true) => yo(new Request('https://vivebienn.com/api/usuarios/me', { headers: conToken ? { authorization: 'Bearer t' } : {} }))
  const perfil = (rol: string, superAdmin = false) => ({ uid: 'u-1', email: 'x@ejemplo.test', emailVerified: true, rol, superAdmin, estado: 'activo', nombre: null })

  it('sin token → 401 (la pantalla ofrece entrar)', async () => {
    expect((await pedir(false)).status).toBe(401)
  })

  it('I · sesión nueva: se da de alta como cliente y se queda en /dashboard', async () => {
    bd.perfil = perfil('cliente')
    const r = await pedir()
    expect(r.status).toBe(200)
    const p = await r.json()
    expect(bd.upserts).toMatchObject([{ tabla: 'usuarios', uid: 'u-1', rol: 'cliente' }])
    expect(p).toMatchObject({ rol: 'cliente', superAdmin: false })
    expect(destinoTrasEntrar(p, '')).toBeNull()
  })

  it('H/J · sesión existente de cliente: mismo resultado, sin cambiarle el rol', async () => {
    bd.perfil = perfil('cliente')
    bd.fila = { uid: 'u-1', rol: 'cliente', email: 'x@ejemplo.test' }
    const p = await (await pedir()).json()
    expect(p.rol).toBe('cliente')
    expect(destinoTrasEntrar(p, '')).toBeNull()
  })

  /**
   * V-1.1.89 — LA PUERTA DEL PORTAL NUEVO.
   *
   * El portal llevaba desde 3b-2 construido y desplegado, pero **nadie podía
   * llegar**: no había un solo enlace hacia él en toda la aplicación, así que
   * encender el flag no cambiaba nada y quien entraba seguía viendo el panel
   * viejo. Esto es lo que lo conecta, y lo que impide que se desconecte otra vez
   * sin que nos enteremos.
   */
  describe('la puerta del portal nuevo', () => {
    it('la regla pura: quién acaba dónde', () => {
      // Portal cerrado: nadie se mueve. Es lo que protegía antes y sigue igual.
      expect(destinoTrasEntrar({ rol: 'cliente', portal: false }, '')).toBeNull()
      expect(destinoTrasEntrar({ rol: 'publicador', portal: false }, '')).toBeNull()

      // Portal abierto: cliente y publicador entran al portal.
      expect(destinoTrasEntrar({ rol: 'cliente', portal: true }, '')).toBe('/portal')
      expect(destinoTrasEntrar({ rol: 'publicador', portal: true }, '')).toBe('/portal')

      // El admin va a SU panel, esté el portal como esté.
      expect(destinoTrasEntrar({ rol: 'admin', portal: true }, '')).toBe('/admin')
      expect(destinoTrasEntrar({ rol: 'admin', portal: false }, '')).toBe('/admin')

      // La escotilla vale para cualquiera: si el portal diera problemas,
      // `?clasico=1` devuelve el panel de siempre sin desplegar nada.
      for (const rol of ['cliente', 'publicador', 'admin']) {
        expect(destinoTrasEntrar({ rol, portal: true }, '?clasico=1')).toBeNull()
      }

      // Sin perfil no se mueve nadie, y `portal` tiene que ser EXACTAMENTE true:
      // un valor raro no abre la puerta.
      expect(destinoTrasEntrar(null, '')).toBeNull()
      expect(destinoTrasEntrar(undefined, '')).toBeNull()
      expect(destinoTrasEntrar({ rol: 'cliente', portal: 'true' }, '')).toBeNull()
      expect(destinoTrasEntrar({ rol: 'cliente' }, '')).toBeNull()
    })

    it('con el flag apagado, /api/usuarios/me dice portal: false y el cliente se queda', async () => {
      bd.perfil = perfil('cliente')
      const p = await (await pedir()).json()
      expect(p.portal).toBe(false)
      expect(destinoTrasEntrar(p, '')).toBeNull()
    })

    it('con portalCliente encendido, el cliente va a /portal', async () => {
      bd.perfil = perfil('cliente')
      bd.flags = { portalCliente: true }
      const p = await (await pedir()).json()
      expect(p.portal).toBe(true)
      expect(destinoTrasEntrar(p, '')).toBe('/portal')
    })

    it('con sólo portalClienteInterno, el cliente NO entra y el admin sí', async () => {
      bd.flags = { portalClienteInterno: true }

      bd.perfil = perfil('cliente')
      expect((await (await pedir()).json()).portal).toBe(false)

      olvidarFlags()
      bd.perfil = perfil('admin', true)
      const admin = await (await pedir()).json()
      expect(admin.portal).toBe(true)
      // Aun así su destino es su panel, no el portal.
      expect(destinoTrasEntrar(admin, '')).toBe('/admin')
    })

    it('la apertura la decide el MISMO predicado que guarda el portal', async () => {
      const { portalAbiertoPara } = await import('../src/lib/portal/apertura')
      const { FLAGS_APAGADOS } = await import('../src/lib/config/flags')
      const quien = { rol: 'cliente', superAdmin: false }
      // Si alguien cambiara la regla en un sitio y no en el otro, esto cae.
      bd.perfil = perfil('cliente')
      bd.flags = { portalCliente: true }
      const p = await (await pedir()).json()
      expect(p.portal).toBe(portalAbiertoPara({ ...FLAGS_APAGADOS, portalCliente: true }, quien))
    })

    it('una cuenta eliminada no llega ni a preguntar por el portal', async () => {
      bd.perfil = { ...perfil('cliente'), estado: 'eliminada' }
      bd.flags = { portalCliente: true }
      const r = await pedir()
      expect(r.status).toBe(403)
      expect(await r.json()).not.toHaveProperty('portal')
    })
  })

  it('publicador: se queda en /dashboard (su casa)', async () => {
    bd.perfil = perfil('publicador')
    expect(destinoTrasEntrar(await (await pedir()).json(), '')).toBeNull()
  })

  it('K · admin → /admin (y ?clasico=1 lo deja en el panel anterior)', async () => {
    bd.perfil = perfil('admin')
    const p = await (await pedir()).json()
    expect(p).toMatchObject({ rol: 'admin', superAdmin: false })
    expect(destinoTrasEntrar(p, '')).toBe('/admin')
    expect(destinoTrasEntrar(p, '?clasico=1')).toBeNull()
  })

  it('L · super_admin → rol efectivo admin + superAdmin → /admin', async () => {
    bd.perfil = perfil('admin', true)
    const p = await (await pedir()).json()
    expect(p).toMatchObject({ rol: 'admin', superAdmin: true })
    expect(destinoTrasEntrar(p, '')).toBe('/admin')
  })

  it('perfil ausente o raro → se queda (nunca /admin por defecto)', () => {
    expect(destinoTrasEntrar(null, '')).toBeNull()
    expect(destinoTrasEntrar({ rol: 'super_admin' }, '')).toBeNull()
  })
})

// ── Dominio canónico (next.config.ts) ──────────────────────────────────────
describe('1 · un solo dominio: vivebienn.com', () => {
  const cargar = async (env: Record<string, string | undefined>) => {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string)
    const cfg = (await import('../next.config')).default
    vi.unstubAllEnvs()
    return cfg
  }

  it('A/B · www → https://vivebienn.com, permanente, misma ruta (Next pasa la consulta sola)', async () => {
    const cfg = await cargar({ VERCEL_ENV: undefined })
    const reglas = await cfg.redirects!()
    expect(reglas[0]).toEqual({
      source: '/:path*', has: [{ type: 'host' as const, value: 'www.vivebienn.com' }],
      destination: 'https://vivebienn.com/:path*', permanent: true,
    })
    // El enlace corto de una propiedad (`/p/<folio>`) es una regla interna y temporal: se exige tal cual, sin salir del dominio.
    const corto = reglas.find((r) => r.source === '/p/:folio')
    expect(corto).toEqual({ source: '/p/:folio', destination: '/propiedades/:folio', permanent: false })
    // La ruta vieja de «Mis visitas» (citas v2, 6-nov-2026) es una regla interna y TEMPORAL (307) a «Citas»; se exige tal cual y sin salir del dominio.
    const citasVieja = reglas.find((r) => r.source === '/portal/visitas')
    expect(citasVieja).toEqual({ source: '/portal/visitas', destination: '/portal/citas', permanent: false })
    // Lo demás son fichas que cambiaron de nombre público; ninguna lleva a otro dominio.
    for (const r of reglas.slice(1).filter((x) => x !== corto && x !== citasVieja)) {
      expect(r.source, r.source).toMatch(/^\/propiedades\//)
      expect(r.destination, r.source).toMatch(/^\/propiedades\//)
      expect(r.permanent).toBe(true)
    }
  })

  it('V-1.1.84 · los nombres retirados de PANAM II llevan al corregido, y ninguno dice «sialo»', async () => {
    const cfg = await cargar({ VERCEL_ENV: undefined })
    const fichas = (await cfg.redirects!()).filter((r) => r.source.startsWith('/propiedades/'))
    expect(fichas).toHaveLength(2)
    for (const r of fichas) {
      expect(r.source).toContain('sialo')      // la dirección vieja, con la errata
      expect(r.destination).not.toContain('sialo')
      expect(r.destination).toContain('silao')
    }
  })

  it('en producción, los alias *.vercel.app también van al dominio, salvo /api (cron)', async () => {
    const cfg = await cargar({ VERCEL_ENV: 'production' })
    const [, alias] = await cfg.redirects!()
    expect(alias).toMatchObject({ has: [{ type: 'host', value: '.+\\.vercel\\.app' }], destination: 'https://vivebienn.com/:path', permanent: true })
    const host = new RegExp(`^${alias.has![0].value}$`)
    expect(host.test('vive-bien-oeo2kc057-grupo-p-once.vercel.app')).toBe(true)
    expect(host.test('vivebienn.com')).toBe(false)
    const ruta = /^(?!api\/).*$/
    expect(ruta.test('dashboard')).toBe(true)
    expect(ruta.test('')).toBe(true)
    expect(ruta.test('api/alertas/resumen')).toBe(false)
  })

  it('vista previa: sin redirección de alias (se prueba en su propia dirección)', async () => {
    const cfg = await cargar({ VERCEL_ENV: 'preview' })
    const conVercel = (await cfg.redirects!()).filter((r) => r.has?.some((h) => String(h.value).includes('vercel')))
    expect(conVercel).toEqual([])
  })

  it('proxy /__/auth/* preparado hacia el proyecto de Firebase', async () => {
    const cfg = await cargar({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'vivebien-84685' })
    expect(await cfg.rewrites!()).toEqual([
      { source: '/__/auth/:path*', destination: 'https://vivebien-84685.firebaseapp.com/__/auth/:path*' },
    ])
  })

  it('nada del sitio apunta a www', () => {
    const RAIZ = join(__dirname, '..', 'src')
    const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
    })
    const conWww = archivos(RAIZ).filter((p) => /www\.vivebienn\.com/.test(readFileSync(p, 'utf8'))).map((p) => relative(RAIZ, p))
    expect(conWww).toEqual([])
  })
})

// ── Que no vuelva a pasar ──────────────────────────────────────────────────
describe('guardas', () => {
  const RAIZ = join(__dirname, '..', 'src')
  const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })

  it('sólo lib/acceso/entrar-google.ts llama a signInWithPopup / signInWithRedirect', () => {
    const fuera = archivos(RAIZ)
      .filter((p) => /\bsignInWith(Popup|Redirect)\s*\(/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(RAIZ, p).replace(/\\/g, '/'))
    expect(fuera).toEqual(['lib/acceso/entrar-google.ts'])
  })

  it('ninguna pantalla pinta el código o el mensaje de un error de Firebase', () => {
    const culpables = archivos(RAIZ).filter((p) => p.endsWith('.tsx')).flatMap((p) =>
      readFileSync(p, 'utf8').split('\n')
        .filter((l) => /set\w+\(\s*`[^`]*\$\{[^}]*\.(code|message)/.test(l) || /set\w+\([^)]*\.code\s*(\|\||\+)/.test(l) || /Google auth error/.test(l))
        .map((l) => `${relative(RAIZ, p)}: ${l.trim()}`))
    expect(culpables).toEqual([])
  })
})
