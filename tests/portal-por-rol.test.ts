import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Mis búsquedas», «Guardadas», «Me interesan» y «Mis consultas» para TODOS los roles (Etapa 6).
 *
 * Reporte del propietario: en el sidebar, «Me interesan» (y las búsquedas/consultas) no guardaba ni registraba nada. Causa comprobada:
 * lo que esas pantallas LEEN (`solicitudes_contacto` y `citas`, ligadas a la cuenta) no lo escribía NINGÚN formulario: la ficha siempre
 * mandaba a `/api/registro-lead` (tabla `leads`, sin cuenta). La corrección es de la pantalla (con sesión → `/api/contacto`; sin sesión →
 * prospecto); esta prueba fija el CONTRATO del servidor que esa corrección usa, por rol.
 *
 * QUÉ SIMULA: la base es un doble en memoria que imita PostgREST (filtros eq/gte/in, conteo, insert, update, delete); las rutas, el
 * perfil (`resolverPerfil`) y las vistas del portal son el código REAL. No prueba RLS real, Supabase, Vercel ni producción.
 */

type Fila = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  sesion: { uid: 'U1', email: 'u1@ejemplo.test', fila: { rol: 'cliente', estado: 'activo' } as Record<string, unknown> },
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  sinSesion: false,
  seq: 0,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = []
    let orden: { k: string; asc: boolean } | null = null
    let tope = Infinity
    let conteo = false
    let accion: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let nuevas: Fila[] = []
    let cambios: Fila = {}
    let devolver = false
    const c: Record<string, unknown> = {}
    const filas = () => (mundo.tablas[tabla] ??= [])
    const coincidentes = () => {
      let r = filas().filter((f) => filtros.every((p) => p(f)))
      if (orden) r = [...r].sort((a, b) => (String(a[orden!.k]) < String(b[orden!.k]) ? -1 : 1) * (orden!.asc ? 1 : -1))
      return r.slice(0, tope)
    }
    c.select = (_cols?: string, o?: { head?: boolean; count?: string }) => { if (accion !== 'select') devolver = true; if (o?.count) conteo = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return c }
    c.neq = (k: string, v: unknown) => { filtros.push((f) => f[k] !== v); return c }
    c.gte = (k: string, v: unknown) => { filtros.push((f) => String(f[k]) >= String(v)); return c }
    c.in = (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return c }
    c.order = (k: string, o?: { ascending?: boolean }) => { orden = { k, asc: o?.ascending !== false }; return c }
    c.limit = (n: number) => { tope = n; return c }
    c.insert = (r: Fila | Fila[]) => { accion = 'insert'; nuevas = Array.isArray(r) ? r : [r]; return c }
    c.update = (f: Fila) => { accion = 'update'; cambios = f; return c }
    c.delete = () => { accion = 'delete'; return c }
    const ejecutar = () => {
      if (accion === 'insert') {
        const creadas = nuevas.map((n) => ({ id: ++mundo.seq, creado_en: new Date().toISOString(), created_at: new Date().toISOString(), ...n }))
        filas().push(...creadas)
        return { data: devolver ? creadas : null, error: null, _filas: creadas }
      }
      const r = coincidentes()
      if (accion === 'update') { for (const f of r) Object.assign(f, cambios); return { data: devolver ? r : null, error: null } }
      if (accion === 'delete') { mundo.tablas[tabla] = filas().filter((f) => !r.includes(f)); return { data: devolver ? r : null, error: null } }
      return { data: r.map((x) => ({ ...x })), error: null, count: conteo ? r.length : undefined }
    }
    c.maybeSingle = async () => {
      const x = ejecutar()
      const d = accion === 'insert' ? (x as { _filas: Fila[] })._filas : (x.data as Fila[] | null)
      return { data: d?.[0] ?? null, error: null }
    }
    c.single = c.maybeSingle
    c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko)
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t), rpc: async () => ({ data: null, error: null }) }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    verifyIdToken: async () => (mundo.sinSesion ? null : { uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    getPerfil: async (u: { uid: string; email?: string | null }) => real.resolverPerfil({ uid: u.uid, email: u.email ?? '', emailVerified: true }, mundo.sesion.fila),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/config/flags-servidor', () => ({ leerFlags: async () => ({ portalCliente: true, portalClienteInterno: false, citasEnLinea: false, publisherPortal: false }) }))
vi.mock('@/lib/auditoria', () => ({ registrar: async () => {} }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/whatsapp', () => ({ notificarAtencion: async () => {} }))
vi.mock('@/lib/aviso-lead', () => ({ avisarDeLead: async () => ({ enviado: false, motivo: 'sin-configurar' }) }))
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

import { POST as guardarBusqueda, GET as listarBusquedas, DELETE as borrarBusqueda } from '../src/app/api/busquedas/route'
import { GET as busquedasPortal } from '../src/app/api/portal/busquedas/route'
import { POST as crearContacto } from '../src/app/api/contacto/route'
import { GET as consultasPortal } from '../src/app/api/portal/consultas/route'
import { GET as meInteresan } from '../src/app/api/portal/me-interesan/route'
import { POST as registroLead } from '../src/app/api/registro-lead/route'
import { GET as leadsPropios } from '../src/app/api/leads/route'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })

const PROPIEDAD = {
  id: 'p1', titulo: 'Casa en León', tipo: 'casa', operacion: 'venta', precio: 2_500_000, ubicacion: 'León, Gto.', metros: 180, recamaras: 3, banos: 2,
  fotos: ['https://res.cloudinary.com/nube-prueba/image/upload/1.jpg'], estado_pub: 'publicada', estatus: 'disponible', slug: 'casa-en-leon', owner_id: 'DUENO',
}
const SOLICITUD = (extra: Fila = {}) => ({ nombre: 'Persona de Prueba', telefono: '4771112233', email: 'u1@ejemplo.test', mensaje: 'Me interesa', propiedadId: 'p1', consentimiento: true, ...extra })

const ROLES: Array<[string, Fila]> = [
  ['cliente', { rol: 'cliente' }],
  ['publicador', { rol: 'publicador', tipo_publicador: 'publicador', permisos_override: {} }],
  ['asociado', { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {} }],
  ['admin', { rol: 'admin' }],
  ['super_admin', { rol: 'super_admin' }],
]
const entrarComo = (uid: string, fila: Fila) => { mundo.sesion = { uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { estado: 'activo', ...fila } } }

beforeEach(() => {
  mundo.sinSesion = false
  mundo.seq = 0
  mundo.tablas = { propiedades: [{ ...PROPIEDAD }, { ...PROPIEDAD, id: 'borrador-1', estado_pub: 'borrador', slug: null }], busquedas_guardadas: [], solicitudes_contacto: [], citas: [], leads: [], usuarios: [] }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe.each(ROLES)('%s: sus búsquedas y sus consultas se guardan y se ven', (_nombre, fila) => {
  it('guardar una búsqueda → aparece en su lista y en «Mis búsquedas» del portal → se puede borrar', async () => {
    entrarComo('U1', fila)
    const r = await guardarBusqueda(R('/api/busquedas', { filtros: { tipo: 'casa', op: 'venta' } }))
    expect(r.status).toBe(200)
    expect(mundo.tablas.busquedas_guardadas).toHaveLength(1)
    expect(mundo.tablas.busquedas_guardadas[0].uid).toBe('U1')
    const lista = (await (await listarBusquedas(R('/api/busquedas', undefined, 'GET'))).json()) as { busquedas: unknown[] }
    expect(lista.busquedas).toHaveLength(1)
    const portal = (await (await busquedasPortal(R('/api/portal/busquedas', undefined, 'GET'))).json()) as { busquedas: unknown[] }
    expect(portal.busquedas).toHaveLength(1)
    // repetirla no duplica
    const otra = (await (await guardarBusqueda(R('/api/busquedas', { filtros: { tipo: 'casa', op: 'venta' } }))).json()) as { yaEstaba?: boolean }
    expect(otra.yaEstaba).toBe(true)
    expect(mundo.tablas.busquedas_guardadas).toHaveLength(1)
    const id = (mundo.tablas.busquedas_guardadas[0] as { id: number }).id
    expect((await borrarBusqueda(R(`/api/busquedas?id=${id}`, undefined, 'DELETE'))).status).toBe(200)
    expect(mundo.tablas.busquedas_guardadas).toHaveLength(0)
  })

  it('una búsqueda es PERSONAL: otra cuenta no la ve ni la borra', async () => {
    entrarComo('U1', fila)
    await guardarBusqueda(R('/api/busquedas', { filtros: { tipo: 'casa' } }))
    const id = (mundo.tablas.busquedas_guardadas[0] as { id: number }).id
    entrarComo('U2', { rol: 'cliente' })
    expect(((await (await listarBusquedas(R('/api/busquedas', undefined, 'GET'))).json()) as { busquedas: unknown[] }).busquedas).toHaveLength(0)
    await borrarBusqueda(R(`/api/busquedas?id=${id}`, undefined, 'DELETE'))
    expect(mundo.tablas.busquedas_guardadas).toHaveLength(1)
  })

  it('una consulta CON SESIÓN queda ligada a la cuenta → aparece en «Mis consultas» y en «Me interesan»; repetirla no la duplica', async () => {
    entrarComo('U1', fila)
    const r = await crearContacto(R('/api/contacto', SOLICITUD()))
    expect(r.status).toBeLessThan(300)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(1)
    expect(mundo.tablas.solicitudes_contacto[0]).toMatchObject({ cliente_uid: 'U1', propiedad_id: 'p1', tipo: 'informacion' })
    const consultas = (await (await consultasPortal(R('/api/portal/consultas', undefined, 'GET'))).json()) as { consultas: Array<{ propiedad?: { id?: string } }> }
    expect(consultas.consultas).toHaveLength(1)
    const interesan = (await (await meInteresan(R('/api/portal/me-interesan', undefined, 'GET'))).json()) as { interesan: unknown[] }
    expect(interesan.interesan).toHaveLength(1)
    // duplicada reciente: el servidor lo dice y NO crea otra fila
    const dup = (await (await crearContacto(R('/api/contacto', SOLICITUD()))).json()) as { duplicada?: boolean }
    expect(dup.duplicada).toBe(true)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(1)
  })

  it('la vista clásica del dashboard («Mis consultas enviadas», GET /api/leads) también ve la consulta de la cuenta', async () => {
    entrarComo('U1', fila)
    await crearContacto(R('/api/contacto', SOLICITUD()))
    const lista = (await (await leadsPropios(R('/api/leads', undefined, 'GET'))).json()) as Array<{ propiedad_id?: string; interes?: string }>
    // un admin ve TODOS los leads (aquí hay 0 leads, pero sus propias solicitudes no son «leads de todos»); los demás ven lo suyo
    if (fila.rol === 'admin' || fila.rol === 'super_admin') expect(Array.isArray(lista)).toBe(true)
    else expect(lista.filter((x) => x.propiedad_id === 'p1')).toHaveLength(1)
  })

  it('las consultas son PERSONALES: otra cuenta no ve las de esta', async () => {
    entrarComo('U1', fila)
    await crearContacto(R('/api/contacto', SOLICITUD()))
    entrarComo('U2', { rol: 'cliente' })
    expect(((await (await consultasPortal(R('/api/portal/consultas', undefined, 'GET'))).json()) as { consultas: unknown[] }).consultas).toHaveLength(0)
    expect(((await (await meInteresan(R('/api/portal/me-interesan', undefined, 'GET'))).json()) as { interesan: unknown[] }).interesan).toHaveLength(0)
  })
})

describe('reglas comunes de la creación de una consulta', () => {
  it('sin sesión: 401 con requiereSesion (la pantalla entonces la guarda como PROSPECTO, no la pierde)', async () => {
    mundo.sinSesion = true
    const r = await crearContacto(R('/api/contacto', SOLICITUD()))
    expect(r.status).toBe(401)
    expect(((await r.json()) as { requiereSesion?: boolean }).requiereSesion).toBe(true)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(0)
  })

  it('cuenta suspendida: 403 y no se crea nada', async () => {
    entrarComo('U1', { rol: 'cliente', estado: 'suspendido' })
    expect((await crearContacto(R('/api/contacto', SOLICITUD()))).status).toBe(403)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(0)
  })

  it('propiedad inexistente (404), no publicada (409), sin consentimiento o sin correo (400): ninguna crea fila', async () => {
    entrarComo('U1', { rol: 'cliente' })
    expect((await crearContacto(R('/api/contacto', SOLICITUD({ propiedadId: 'no-existe' })))).status).toBe(404)
    expect((await crearContacto(R('/api/contacto', SOLICITUD({ propiedadId: 'borrador-1' })))).status).toBe(409)
    expect((await crearContacto(R('/api/contacto', SOLICITUD({ consentimiento: false })))).status).toBe(400)
    expect((await crearContacto(R('/api/contacto', SOLICITUD({ email: '' })))).status).toBe(400)
    expect((await crearContacto(R('/api/contacto', SOLICITUD({ telefono: '123' })))).status).toBe(400)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(0)
  })

  it('un PROSPECTO (sin cuenta) queda en `leads` y NO aparece en «Mis consultas» ni «Me interesan» de nadie', async () => {
    mundo.sinSesion = true
    const r = await registroLead(R('/api/registro-lead', { nombre: 'Prospecto Anónimo', telefono: '4771112233', email: 'u1@ejemplo.test', propiedadId: 'p1', origen: 'ficha', consentimiento: true }))
    expect(r.status).toBe(200)
    expect(mundo.tablas.leads).toHaveLength(1)
    expect(mundo.tablas.solicitudes_contacto).toHaveLength(0)
    mundo.sinSesion = false
    entrarComo('U1', { rol: 'cliente' }) // mismo correo que el prospecto: NO se empareja (D-28.1)
    expect(((await (await consultasPortal(R('/api/portal/consultas', undefined, 'GET'))).json()) as { consultas: unknown[] }).consultas).toHaveLength(0)
    expect(((await (await meInteresan(R('/api/portal/me-interesan', undefined, 'GET'))).json()) as { interesan: unknown[] }).interesan).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Guarda sobre el código de la ficha (comprobación de texto: la conducta real se prueba en tests-visual/e48-consultas.e2e.ts).
describe('la ficha crea la consulta por el camino que le toca', () => {
  it('con sesión usa /api/contacto (cuenta) ANTES de caer a /api/registro-lead (prospecto), y nunca al revés', async () => {
    const { readFileSync } = await import('node:fs')
    const fuente = readFileSync(new URL('../src/app/propiedades/[id]/page-client.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    const iContacto = fuente.indexOf("fetch('/api/contacto'")
    const iLead = fuente.indexOf("fetch('/api/registro-lead'")
    expect(iContacto).toBeGreaterThan(-1)
    expect(iLead).toBeGreaterThan(iContacto)
    expect(fuente).toMatch(/if \(isLoggedIn && user\) \{/)
    // sin el seguro, un 401 (sesión vencida) no debe perder los datos: sigue como prospecto
    expect(fuente).toMatch(/if \(r\.status !== 401\) throw new Error/)
  })
})
