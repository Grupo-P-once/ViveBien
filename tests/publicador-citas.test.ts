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
 * PUBLICADOR / ASOCIADO — citas recibidas y protección de datos del interesado (ADR-0013).
 *
 * Dos perspectivas que NO se mezclan:
 *   · «Mis visitas»      → las que él pidió como cliente (vista `cliente`).
 *   · «Citas recibidas»  → las que piden a SUS propiedades (vista `asesor`), sólo con `recibir_citas`.
 *
 * El perfil se calcula con el código real (`resolverPerfil`) y el servicio de
 * citas, las rutas y los correos son los de producción; sólo la base y el
 * envío de correo están simulados.
 */

type Fila = Record<string, unknown>

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo' } as Record<string, unknown> },
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  denegados: [] as string[],
  sinMigracion28: false,
  /** Simula que la lectura base de `usuarios(uid, rol)` falla (caída, timeout). */
  fallaLecturaRoles: false,
  correos: [] as Array<{ to: string[]; subject: string; html: string; text: string }>,
  alertas: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const cadena = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = []
    let escribir: { tipo: 'insert' | 'update' | 'upsert'; valor: Fila } | null = null
    let columnas = '*'
    const filas = () => (mundo.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
    const manejadores: Record<string, (...a: unknown[]) => unknown> = {
      select: (cols?: unknown) => { if (typeof cols === 'string') columnas = cols; return c },
      eq: (k: unknown, v: unknown) => { filtros.push((f) => f[k as string] === v); return c },
      neq: (k: unknown, v: unknown) => { filtros.push((f) => f[k as string] !== v); return c },
      in: (k: unknown, v: unknown) => { filtros.push((f) => (v as unknown[]).includes(f[k as string])); return c },
      lt: (k: unknown, v: unknown) => { filtros.push((f) => typeof f[k as string] === 'string' && (f[k as string] as string) < (v as string)); return c },
      gt: (k: unknown, v: unknown) => { filtros.push((f) => typeof f[k as string] === 'string' && (f[k as string] as string) > (v as string)); return c },
      is: (k: unknown, v: unknown) => { filtros.push((f) => (f[k as string] ?? null) === v); return c },
      insert: (v: unknown) => { escribir = { tipo: 'insert', valor: v as Fila }; return c },
      update: (v: unknown) => { escribir = { tipo: 'update', valor: v as Fila }; return c },
      upsert: (v: unknown) => { escribir = { tipo: 'upsert', valor: v as Fila }; return c },
      maybeSingle: async () => {
        if (mundo.sinMigracion28 && tabla === 'usuarios' && /tipo_publicador|permisos_override/.test(columnas)) {
          return { data: null, error: { message: 'column does not exist' } }
        }
        return { data: filas()[0] ?? null, error: null }
      },
      single: async () => ({ data: escribir ? { id: 1 } : filas()[0] ?? null, error: null }),
      then: ((resolver: (v: unknown) => unknown) => {
        if (mundo.fallaLecturaRoles && tabla === 'usuarios' && /^uid, rol$/.test(columnas)) {
          return resolver({ data: null, error: { message: 'timeout' } })
        }
        if (mundo.sinMigracion28 && tabla === 'usuarios' && /tipo_publicador|permisos_override/.test(columnas)) {
          return resolver({ data: null, error: { message: 'column does not exist' } })
        }
        if (escribir) {
          if (escribir.tipo === 'update') for (const f of filas()) Object.assign(f, escribir.valor)
          else (mundo.tablas[tabla] ??= []).push(...(Array.isArray(escribir.valor) ? (escribir.valor as Fila[]) : [escribir.valor]))
          return resolver({ data: null, error: null })
        }
        return resolver({ data: filas(), error: null })
      }) as (...a: unknown[]) => unknown,
    }
    const c: Record<string, unknown> = new Proxy({}, { get: (_t, k: string) => manejadores[k] ?? (() => c) })
    return c
  }

  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      rpc: async (fn: string, args: Record<string, unknown>) => { mundo.rpcs.push({ fn, args }); return { data: null, error: null } },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async (_p: unknown, _r: unknown, que: string) => { mundo.denegados.push(que) },
  }
})
vi.mock('@/lib/alertas', () => ({ avisar: async (a: Record<string, unknown>) => { mundo.alertas.push(a); return true } }))
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: () => {} }))

import { resolverPerfil, type PerfilUsuario } from '../src/lib/auth-server'
import { checkAvailability, getAppointment, listAppointments, transicionar, usarToken, verToken } from '../src/lib/citas/servicio'
import { avisarCambio } from '../src/lib/citas/enviar'
import { nuevoToken } from '../src/lib/citas/tokens'
import { GET as listarCitas } from '../src/app/api/citas/route'
import { GET as leerCita } from '../src/app/api/citas/[id]/route'
import { POST as transicionRuta } from '../src/app/api/citas/[id]/transicion/route'

// MKT-60: estas pruebas ejercitan el camino con la compuerta común ENCENDIDA; el camino apagado lo cubre tests/correo-compuerta-envio.test.ts.
process.env.CORREO_ENVIO = '1'

// ── Fixtures ───────────────────────────────────────────────────

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const FUTURO = '2030-01-15T17:00:00.000Z'
const FUTURO_FIN = '2030-01-15T18:00:00.000Z'

const usuario = (uid: string, rol: string, extra: Fila = {}): Fila => ({
  uid, rol, estado: 'activo', nombre: `Nombre ${uid}`, email: `${uid.toLowerCase()}@ejemplo.test`, telefono: '4770000000', ...extra,
})

const cita = (n: number, asesor: string, estado: string, extra: Fila = {}): Fila => ({
  id: ID(n), version: 1, estado, estado_previo: null, propiedad_id: `p-${asesor}`, cliente_uid: 'X', asesor_uid: asesor,
  inicio: FUTURO, fin: FUTURO_FIN, ocupa_desde: FUTURO, ocupa_hasta: FUTURO_FIN, margen_min: 0, zona_horaria: 'America/Mexico_City',
  propuesta_inicio: null, propuesta_fin: null, propuesta_por: null,
  cliente_nombre: 'Rosa Interesada', cliente_telefono: '4771234567', cliente_email: 'rosa@ejemplo.test',
  notas_cliente: 'Prefiero por la tarde', notas_internas: 'NOTA INTERNA DEL EQUIPO', motivo_cancelacion: null,
  propiedad_titulo: `Casa de ${asesor}`, lugar: 'León', google_sync: 'ok', google_error: null, google_event_id: 'g1',
  creada_en: '2029-12-01T00:00:00Z', actualizada_en: '2029-12-01T00:00:00Z', creada_por: 'X',
  propiedad: { id: `p-${asesor}`, titulo: `Casa de ${asesor}`, tipo: 'casa', operacion: 'venta', ubicacion: 'León', colonia: null, ciudad: 'León', owner_id: asesor, estado_pub: 'publicada', estatus: 'disponible', slug: `casa-${asesor}`, fotos: [] },
  asesor: { nombre: `Nombre ${asesor}`, telefono: '4779999999', email: `${asesor.toLowerCase()}@ejemplo.test`, rol: 'publicador' },
  cliente: { nombre: 'Rosa Interesada', email: 'rosa@ejemplo.test' },
  ...extra,
})

const perfilDe = (uid: string, fila: Fila): PerfilUsuario =>
  resolverPerfil({ uid, email: `${uid.toLowerCase()}@ejemplo.test`, emailVerified: true }, { estado: 'activo', ...fila })

const comoSesion = (uid: string, fila: Fila) => { mundo.sesion = { uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { estado: 'activo', ...fila } } }

const R = (url: string, cuerpo?: unknown) => new Request(`https://vivebienn.com${url}`, {
  method: cuerpo === undefined ? 'GET' : 'POST',
  headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${Math.floor(Math.random() * 250)}` },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
})
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const RANGO = { desde: new Date('2029-01-01'), hasta: new Date('2031-01-01') }

const ASOCIADO = { rol: 'publicador', tipo_publicador: 'asociado' }
const PUBLICADOR = { rol: 'publicador', tipo_publicador: 'publicador' }

beforeEach(() => {
  mundo.rpcs = []; mundo.denegados = []; mundo.correos = []; mundo.alertas = []; mundo.sinMigracion28 = false; mundo.fallaLecturaRoles = false
  comoSesion('A', PUBLICADOR)
  mundo.tablas = {
    usuarios: [
      usuario('A', 'publicador', { tipo_publicador: 'publicador', permisos_override: {} }),
      usuario('B', 'publicador', { tipo_publicador: 'asociado', permisos_override: {} }),
      usuario('A2', 'publicador', { tipo_publicador: 'asociado', permisos_override: {} }),
      usuario('C', 'cliente', { tipo_publicador: 'asociado', permisos_override: { recibir_citas: true } }),
      usuario('X', 'cliente'),
      usuario('ADM', 'admin'),
    ],
    citas: [
      cita(1, 'A', 'REQUESTED'),
      cita(2, 'B', 'REQUESTED'),
      cita(3, 'B', 'CONFIRMED'),
      cita(4, 'ADM', 'CONFIRMED', { cliente_uid: 'A', cliente_nombre: 'Ana (publicador como cliente)', asesor: { nombre: 'Equipo', telefono: '4778116501', email: 'adm@ejemplo.test', rol: 'admin' } }),
    ],
    propiedades: [
      { id: 'p-A', owner_id: 'A', estado_pub: 'publicada', estatus: 'disponible', titulo: 'Casa de A', tipo: 'casa', operacion: 'venta', ubicacion: 'León', colonia: null, ciudad: 'León', slug: 'casa-a', fotos: [] },
      { id: 'p-B', owner_id: 'B', estado_pub: 'publicada', estatus: 'disponible', titulo: 'Casa de B', tipo: 'casa', operacion: 'venta', ubicacion: 'León', colonia: null, ciudad: 'León', slug: 'casa-b', fotos: [] },
    ],
    citas_eventos: [], citas_correos: [], citas_tokens: [], disponibilidad_asesores: [], ajustes_citas: [], bloqueos_asesores: [],
  }
  vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
    mundo.correos.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ id: 'r1' }), { status: 200 })
  })
  process.env.RESEND_API_KEY = 'test'
})

const idsDe = (cs: Array<{ id: string }>) => cs.map((c) => c.id).sort()

// ───────────────────────────────────────────────────────────────
describe('quién ve qué: citas recibidas (vista asesor)', () => {
  it('un ASOCIADO ve las suyas y NO las de otro asesor (A2 no ve las de B)', async () => {
    const A2 = perfilDe('A2', ASOCIADO)
    mundo.tablas.citas.push(cita(9, 'A2', 'REQUESTED'))
    const suyas = await listAppointments({ perfil: A2, vista: 'asesor', ...RANGO })
    expect(idsDe(suyas)).toEqual([ID(9)])
    const B = perfilDe('B', ASOCIADO)
    expect(idsDe(await listAppointments({ perfil: B, vista: 'asesor', ...RANGO }))).toEqual([ID(2), ID(3)])
  })

  it('un PUBLICADOR normal NO recibe citas: la vista queda vacía y la API responde 403', async () => {
    const A = perfilDe('A', PUBLICADOR)
    expect(await listAppointments({ perfil: A, vista: 'asesor', ...RANGO })).toEqual([])
    comoSesion('A', PUBLICADOR)
    expect((await listarCitas(R(`/api/citas?vista=asesor&desde=${RANGO.desde.toISOString()}&hasta=${new Date('2029-03-01').toISOString()}`))).status).toBe(403)
  })

  it('con `recibir_citas` encendido por un admin, el PUBLICADOR normal sí ve las suyas (y sólo las suyas)', async () => {
    const A = perfilDe('A', { ...PUBLICADOR, permisos_override: { recibir_citas: true } })
    expect(idsDe(await listAppointments({ perfil: A, vista: 'asesor', ...RANGO }))).toEqual([ID(1)])
  })

  it('«Mis visitas» (vista cliente) es aparte: un publicador ve las que ÉL pidió, sin mezclar las recibidas', async () => {
    const B = perfilDe('B', ASOCIADO)
    mundo.tablas.citas.push(cita(8, 'ADM', 'CONFIRMED', { cliente_uid: 'B', asesor: { nombre: 'Equipo', telefono: null, email: 'adm@ejemplo.test', rol: 'admin' } }))
    const mias = await listAppointments({ perfil: B, vista: 'cliente', ...RANGO })
    expect(idsDe(mias)).toEqual([ID(8)])
    expect(mias[0].papel).toBe('cliente')
    const recibidas = await listAppointments({ perfil: B, vista: 'asesor', ...RANGO })
    expect(recibidas.every((c) => c.papel === 'asesor')).toBe(true)
    expect(idsDe(recibidas)).toEqual([ID(2), ID(3)])
  })

  it('quien pidió como cliente la cita de OTRO publicador no la ve como asesor', async () => {
    // A es cliente de la cita 4 (propiedad del equipo): no puede verla en «recibidas».
    const A = perfilDe('A', { ...PUBLICADOR, permisos_override: { recibir_citas: true } })
    const recibidas = await listAppointments({ perfil: A, vista: 'asesor', ...RANGO })
    expect(idsDe(recibidas)).not.toContain(ID(4))
  })

  it('un CLIENTE no obtiene capacidades de publicador aunque su fila diga «asociado» con permisos', async () => {
    const C = perfilDe('C', { rol: 'cliente', tipo_publicador: 'asociado', permisos_override: { recibir_citas: true } })
    mundo.tablas.citas.push(cita(7, 'C', 'REQUESTED'))
    expect(await listAppointments({ perfil: C, vista: 'asesor', ...RANGO })).toEqual([])
    expect(await getAppointment(ID(7), C)).toBeNull()
    comoSesion('C', { rol: 'cliente', tipo_publicador: 'asociado', permisos_override: { recibir_citas: true } })
    expect((await listarCitas(R('/api/citas?vista=asesor&desde=2029-01-01T00:00:00Z&hasta=2029-02-01T00:00:00Z'))).status).toBe(403)
  })

  it('el equipo (admin) mantiene su acceso: ve todas, con todos los datos y todo lo interno', async () => {
    const ADM = perfilDe('ADM', { rol: 'admin' })
    const todas = await listAppointments({ perfil: ADM, vista: 'admin', ...RANGO })
    expect(idsDe(todas)).toEqual([ID(1), ID(2), ID(3), ID(4)])
    const una = todas.find((c) => c.id === ID(1))!
    expect(una.cliente).toMatchObject({ nombre: 'Rosa Interesada', telefono: '4771234567', email: 'rosa@ejemplo.test' })
    expect(una.notasInternas).toBe('NOTA INTERNA DEL EQUIPO')
    expect(una.google).toBeDefined()
  })
})

describe('IDOR: lo ajeno no se lee ni se toca', () => {
  for (const [nombre, fila] of [['PUBLICADOR', PUBLICADOR], ['ASOCIADO', ASOCIADO]] as const) {
    it(`${nombre} A no lee la cita de B (404, no se revela que existe)`, async () => {
      const A = perfilDe('A', { ...fila, permisos_override: { recibir_citas: true } })
      expect(await getAppointment(ID(2), A)).toBeNull()
      comoSesion('A', { ...fila, permisos_override: { recibir_citas: true } })
      expect((await leerCita(R(`/api/citas/${ID(2)}`), ctx(ID(2)))).status).toBe(404)
    })

    it(`${nombre} A no modifica la cita de B: 404 y la base no se toca`, async () => {
      const A = perfilDe('A', { ...fila, permisos_override: { recibir_citas: true, aceptar_citas: true, cancelar_citas: true, reprogramar_citas: true, rechazar_citas: true } })
      for (const accion of ['confirmar', 'cancelar', 'proponer'] as const) {
        const r = await transicionar({ id: ID(2), version: 1, accion, perfil: A, datos: { motivo: 'x', inicio: '2030-01-16T17:00:00Z' } })
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.status).toBe(404)
      }
      expect(mundo.rpcs).toHaveLength(0)
    })
  }

  it('agendar en la propiedad de un publicador SIN `recibir_citas` no se puede (409): no hay a quién atender', async () => {
    const r = await checkAvailability({ propiedadId: 'p-A', desde: '2030-01-14', dias: 3, clienteUid: 'X', ahora: new Date('2029-12-01') })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('en la propiedad de un ASOCIADO (con `recibir_citas`) sí hay horarios', async () => {
    const r = await checkAvailability({ propiedadId: 'p-B', desde: '2030-01-14', dias: 3, clienteUid: 'X', ahora: new Date('2029-12-01') })
    expect(r.ok).toBe(true)
  })

  it('apagar `recibir_citas` a un asociado cierra su agenda otra vez', async () => {
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { recibir_citas: false }
    const r = await checkAvailability({ propiedadId: 'p-B', desde: '2030-01-14', dias: 3, clienteUid: 'X', ahora: new Date('2029-12-01') })
    expect(r.ok).toBe(false)
  })

  it('con la migración 28 sin aplicar, nadie que no sea del equipo atiende citas (falla cerrado)', async () => {
    mundo.sinMigracion28 = true
    const r = await checkAvailability({ propiedadId: 'p-B', desde: '2030-01-14', dias: 3, clienteUid: 'X', ahora: new Date('2029-12-01') })
    expect(r.ok).toBe(false)
  })
})

describe('cada acción exige SU permiso (cuatro permisos independientes)', () => {
  const asesorB = (overrides: Record<string, boolean> = {}) => perfilDe('B', { ...ASOCIADO, permisos_override: overrides })

  it('aceptar → `aceptar_citas`', async () => {
    const sin = await transicionar({ id: ID(2), version: 1, accion: 'confirmar', perfil: asesorB({ aceptar_citas: false }) })
    expect(sin).toMatchObject({ ok: false, status: 403 })
    expect(mundo.rpcs).toHaveLength(0)
    const con = await transicionar({ id: ID(2), version: 1, accion: 'confirmar', perfil: asesorB() })
    expect(con.ok).toBe(true)
    expect(mundo.rpcs.map((r) => r.fn)).toEqual(['cita_transicionar'])
    expect(mundo.rpcs[0].args).toMatchObject({ p_actor_uid: 'B', p_actor_rol: 'asesor', p_accion: 'confirmar' })
  })

  it('rechazar una solicitud sin confirmar → `rechazar_citas`', async () => {
    const sin = await transicionar({ id: ID(2), version: 1, accion: 'cancelar', perfil: asesorB({ rechazar_citas: false }), datos: { motivo: 'No disponible' } })
    expect(sin).toMatchObject({ ok: false, status: 403 })
    // `cancelar_citas` apagado NO impide rechazar: son permisos distintos
    const con = await transicionar({ id: ID(2), version: 1, accion: 'cancelar', perfil: asesorB({ cancelar_citas: false }), datos: { motivo: 'No disponible' } })
    expect(con.ok).toBe(true)
  })

  it('cancelar una visita ya confirmada → `cancelar_citas`', async () => {
    const sin = await transicionar({ id: ID(3), version: 1, accion: 'cancelar', perfil: asesorB({ cancelar_citas: false }), datos: { motivo: 'Imprevisto' } })
    expect(sin).toMatchObject({ ok: false, status: 403 })
    const con = await transicionar({ id: ID(3), version: 1, accion: 'cancelar', perfil: asesorB({ rechazar_citas: false }), datos: { motivo: 'Imprevisto' } })
    expect(con.ok).toBe(true)
  })

  it('reprogramar → `reprogramar_citas`', async () => {
    const sin = await transicionar({ id: ID(3), version: 1, accion: 'proponer', perfil: asesorB({ reprogramar_citas: false }), datos: { inicio: '2030-01-16T17:00:00Z' } })
    expect(sin).toMatchObject({ ok: false, status: 403 })
    const con = await transicionar({ id: ID(3), version: 1, accion: 'proponer', perfil: asesorB(), datos: { inicio: '2030-01-16T17:00:00Z' } })
    expect(con.ok).toBe(true)
  })

  it('un PUBLICADOR normal con `recibir_citas` pero sin las otras: ve la cita y no puede hacer nada con ella', async () => {
    const A = perfilDe('A', { ...PUBLICADOR, permisos_override: { recibir_citas: true } })
    const v = await getAppointment(ID(1), A)
    expect(v).not.toBeNull()
    expect(v!.acciones).toEqual([])
    for (const accion of ['confirmar', 'cancelar', 'proponer'] as const) {
      const r = await transicionar({ id: ID(1), version: 1, accion, perfil: A, datos: { motivo: 'x', inicio: '2030-01-16T17:00:00Z' } })
      expect(r, accion).toMatchObject({ ok: false, status: 403 })
    }
    expect(mundo.rpcs).toHaveLength(0)
  })

  it('las acciones que la pantalla recibe son sólo las permitidas', async () => {
    const v = await getAppointment(ID(2), asesorB({ rechazar_citas: false, reprogramar_citas: false }))
    expect(v!.acciones).toContain('confirmar')
    expect(v!.acciones).not.toContain('cancelar')
    expect(v!.acciones).not.toContain('proponer')
  })

  it('apagar `recibir_citas` apaga las otras cuatro aunque sigan en el JSON', async () => {
    const B = asesorB({ recibir_citas: false, aceptar_citas: true })
    expect(await getAppointment(ID(2), B)).toBeNull()
    const r = await transicionar({ id: ID(2), version: 1, accion: 'confirmar', perfil: B })
    expect(r).toMatchObject({ ok: false, status: 404 })
  })

  it('manipular el body no concede permisos: capacidades, rol o actor_rol del cuerpo se ignoran (403 y bitácora)', async () => {
    comoSesion('A', { ...PUBLICADOR, permisos_override: { recibir_citas: true } })
    const r = await transicionRuta(R(`/api/citas/${ID(1)}/transicion`, {
      accion: 'confirmar', version: 1,
      capacidades: { aceptar_citas: true }, permisos: { aceptar_citas: true }, rol: 'admin', superAdmin: true, actor_rol: 'admin', tipo_publicador: 'asociado',
    }), ctx(ID(1)))
    expect(r.status).toBe(403)
    expect(mundo.rpcs).toHaveLength(0)
    expect(mundo.denegados).toContain('cita.accion:confirmar')
  })

  it('el equipo (admin) actúa sobre cualquier cita', async () => {
    const ADM = perfilDe('ADM', { rol: 'admin' })
    const r = await transicionar({ id: ID(2), version: 1, accion: 'confirmar', perfil: ADM })
    expect(r.ok).toBe(true)
    expect(mundo.rpcs[0].args).toMatchObject({ p_actor_rol: 'admin' })
  })
})

describe('protección de datos del interesado en las vistas', () => {
  const sinDatos = (c: { cliente: { nombre: string; telefono?: string; email?: string | null }; notasCliente: string | null }) => {
    expect(c.cliente).toEqual({ nombre: 'Interesado' })
    expect(c.notasCliente).toBeNull()
  }

  it('recibir citas NO implica ver al interesado: el ASOCIADO recibe fecha, hora y estado, sin nombre, teléfono, correo ni notas', async () => {
    const B = perfilDe('B', ASOCIADO)
    const lista = await listAppointments({ perfil: B, vista: 'asesor', ...RANGO })
    expect(lista).toHaveLength(2)
    for (const c of lista) sinDatos(c)
    // y no hay rastro de los datos en TODA la respuesta, ni en los campos que no se pintan
    const json = JSON.stringify(lista)
    for (const secreto of ['Rosa', '4771234567', 'rosa@ejemplo.test', 'Prefiero por la tarde', 'NOTA INTERNA']) expect(json).not.toContain(secreto)
    expect(lista[0].notasInternas).toBeUndefined()
    expect(lista[0].google).toBeUndefined()
  })

  it('con `ver_datos_interesado` (permiso independiente) sí ve nombre, teléfono, correo y la nota del cliente… pero no lo interno', async () => {
    const B = perfilDe('B', { ...ASOCIADO, permisos_override: { ver_datos_interesado: true } })
    const [c] = await listAppointments({ perfil: B, vista: 'asesor', ...RANGO })
    expect(c.cliente).toMatchObject({ nombre: 'Rosa Interesada', telefono: '4771234567', email: 'rosa@ejemplo.test' })
    expect(c.notasCliente).toBe('Prefiero por la tarde')
    expect(c.notasInternas).toBeUndefined()
    expect(c.google).toBeUndefined()
  })

  it('`ver_datos_interesado` por sí solo no da citas: sin `recibir_citas` no ve ninguna', async () => {
    const A = perfilDe('A', { ...PUBLICADOR, permisos_override: { ver_datos_interesado: true } })
    expect(await listAppointments({ perfil: A, vista: 'asesor', ...RANGO })).toEqual([])
    expect(await getAppointment(ID(1), A)).toBeNull()
  })

  it('el default es apagado para las DOS modalidades', async () => {
    for (const fila of [PUBLICADOR, ASOCIADO]) {
      const uid = fila === ASOCIADO ? 'B' : 'A'
      const p = perfilDe(uid, { ...fila, permisos_override: { recibir_citas: true } })
      expect(p.capacidades?.ver_datos_interesado).toBe(false)
    }
  })

  it('la respuesta de UNA cita (GET /api/citas/[id]) también va recortada, y el historial sólo trae horarios', async () => {
    comoSesion('B', ASOCIADO)
    mundo.tablas.citas_eventos.push({ cita_id: ID(2), id: 1, tipo: 'CREATED', estado_antes: null, estado_despues: 'REQUESTED', actor_rol: 'cliente', via: 'panel',
      datos: { inicio: FUTURO, cliente_telefono: '4771234567', cliente_nombre: 'Rosa Interesada', notas: 'secreto' }, creado_en: '2029-12-01T00:00:00Z' })
    const r = await leerCita(R(`/api/citas/${ID(2)}`), ctx(ID(2)))
    expect(r.status).toBe(200)
    const texto = JSON.stringify(await r.json())
    for (const secreto of ['Rosa', '4771234567', 'rosa@ejemplo.test', 'secreto', 'NOTA INTERNA']) expect(texto).not.toContain(secreto)
    expect(texto).toContain(FUTURO)
  })

  it('el CLIENTE ve el nombre del publicador sólo si un admin le dio perfil y nombre públicos; si no, «Vive Bien»', async () => {
    const X = perfilDe('X', { rol: 'cliente' })
    const [conPerfil] = await listAppointments({ perfil: X, vista: 'cliente', desde: RANGO.desde, hasta: RANGO.hasta, incluirCanceladas: true })
    // A (publicador normal): sin perfil público → «Vive Bien»
    const deA = (await listAppointments({ perfil: X, vista: 'cliente', ...RANGO })).find((c) => c.id === ID(1))!
    expect(deA.asesor.nombre).toBe('Vive Bien')
    // B (asociado): perfil y nombre públicos por defecto → su nombre
    const deB = (await listAppointments({ perfil: X, vista: 'cliente', ...RANGO })).find((c) => c.id === ID(2))!
    expect(deB.asesor.nombre).toBe('Nombre B')
    // y si un admin apaga `mostrar_nombre`, vuelve a ser Vive Bien
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { mostrar_nombre: false }
    const deB2 = (await listAppointments({ perfil: X, vista: 'cliente', ...RANGO })).find((c) => c.id === ID(2))!
    expect(deB2.asesor.nombre).toBe('Vive Bien')
    expect(conPerfil).toBeDefined()
    // nunca el teléfono del publicador al cliente
    expect(JSON.stringify(deB)).not.toContain('4779999999')
  })
})

describe('correos y enlaces: no filtran datos personales ni ofrecen lo que no se puede hacer', () => {
  const alAsesor = (correo: string) => mundo.correos.filter((c) => c.to.includes(correo))
  const SECRETOS = ['Rosa', '4771234567', 'rosa@ejemplo.test', 'Prefiero por la tarde']

  it('ASOCIADO sin `ver_datos_interesado`: su correo no trae nombre, teléfono, correo ni notas del interesado', async () => {
    await avisarCambio(ID(2), 'CREATED', 'X')
    const [c] = alAsesor('b@ejemplo.test')
    expect(c).toBeDefined()
    for (const s of SECRETOS) {
      expect(c.html, `html: ${s}`).not.toContain(s)
      expect(c.text, `texto: ${s}`).not.toContain(s)
      expect(c.subject, `asunto: ${s}`).not.toContain(s)
    }
    expect(c.html).toContain('El cliente</b> quiere visitar')
  })

  it('con `ver_datos_interesado` el correo sí los lleva', async () => {
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { ver_datos_interesado: true }
    await avisarCambio(ID(2), 'CREATED', 'X')
    const [c] = alAsesor('b@ejemplo.test')
    expect(c.html).toContain('Rosa Interesada')
    expect(c.text).toContain('4771234567')
  })

  it('el correo enlaza a «Citas recibidas» del publicador, no al panel del equipo', async () => {
    await avisarCambio(ID(2), 'CREATED', 'X')
    const [c] = alAsesor('b@ejemplo.test')
    expect(c.text).toContain('/publicador/citas?cita=')
    expect(c.text).not.toMatch(/vivebienn\.com\/admin/)
  })

  it('sin `aceptar_citas` el correo no trae ningún botón de acción ni se guarda ningún token', async () => {
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { aceptar_citas: false }
    await avisarCambio(ID(2), 'CREATED', 'X')
    const [c] = alAsesor('b@ejemplo.test')
    expect(c.text).not.toContain('Confirmar visita')
    expect(mundo.tablas.citas_tokens.filter((t) => t.para_rol === 'asesor' && t.accion === 'confirmar')).toHaveLength(0)
  })

  it('D-3: ni CON el permiso el correo trae botón de acción ni guarda tokens: lleva a «Citas recibidas» y ahí se confirma con sesión', async () => {
    await avisarCambio(ID(2), 'CREATED', 'X')
    const c = alAsesor('b@ejemplo.test')[0]
    expect(c.text).not.toContain('Confirmar visita')
    expect(c.text).not.toContain('citas/accion')
    expect(c.text).toContain('Responder en mi panel: ')
    expect(c.text).toContain('/publicador/citas?cita=')
    expect(mundo.tablas.citas_tokens).toHaveLength(0)
  })

  it('un PUBLICADOR sin `recibir_citas` es el asesor de nadie: no recibe correos de citas ajenas', async () => {
    await avisarCambio(ID(2), 'CREATED', 'X')
    expect(alAsesor('a@ejemplo.test')).toHaveLength(0)
  })

  it('el correo al CLIENTE no lleva el teléfono ni el correo del publicador', async () => {
    await avisarCambio(ID(2), 'CREATED', 'B')
    const alCliente = mundo.correos.filter((c) => c.to.includes('rosa@ejemplo.test'))
    for (const c of alCliente) expect(c.html + c.text).not.toContain('4779999999')
  })

  it('VIVE BIEN recibe un aviso interno de la visita en la propiedad de un publicador, sin datos del interesado', async () => {
    await avisarCambio(ID(2), 'CREATED', 'X')
    const a = mundo.alertas.find((x) => String(x.titulo).includes('publicador'))
    expect(a).toBeDefined()
    expect(JSON.stringify(a)).not.toMatch(/Rosa|4771234567|rosa@/)
  })

  it('el enlace del correo muestra al asesor-publicador la cita SIN el nombre del interesado', async () => {
    const t = nuevoToken()
    mundo.tablas.citas_tokens.push({ id: 1, hash: t.hash, cita_id: ID(2), accion: 'confirmar', para_rol: 'asesor', version_cita: 1, expira_en: '2031-01-01T00:00:00Z', usado_en: null, revocado_en: null })
    const v = await verToken(t.plano, new Date('2029-12-01'))
    expect(v.valido).toBe(true)
    if (v.valido) {
      expect(v.cita.cliente).toBeNull()
      expect(v.enlace).toContain('/publicador/citas?cita=')
    }
  })

  it('actuar desde el enlace usa los permisos REALES de esa cuenta: sin `aceptar_citas` no se acepta (403)', async () => {
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { aceptar_citas: false }
    const t = nuevoToken()
    mundo.tablas.citas_tokens.push({ id: 1, hash: t.hash, cita_id: ID(2), accion: 'confirmar', para_rol: 'asesor', version_cita: 1, expira_en: '2031-01-01T00:00:00Z', usado_en: null, revocado_en: null })
    const r = await usarToken(t.plano, new Date('2029-12-01'))
    expect(r).toMatchObject({ ok: false, status: 403 })
    expect(mundo.rpcs).toHaveLength(0)
  })

  it('con el permiso, el enlace sí confirma como esa cuenta', async () => {
    const t = nuevoToken()
    mundo.tablas.citas_tokens.push({ id: 1, hash: t.hash, cita_id: ID(2), accion: 'confirmar', para_rol: 'asesor', version_cita: 1, expira_en: '2031-01-01T00:00:00Z', usado_en: null, revocado_en: null })
    const r = await usarToken(t.plano, new Date('2029-12-01'))
    expect(r.ok).toBe(true)
    expect(mundo.rpcs[0].args).toMatchObject({ p_actor_uid: 'B', p_actor_rol: 'asesor', p_via: 'correo' })
  })
})

describe('falla CERRADO: si no se puede verificar la cuenta del asesor, no se filtra nada', () => {
  const alAsesor = (correo: string) => mundo.correos.filter((c) => c.to.includes(correo))

  it('el correo al asesor sale sin datos del interesado y sin botones cuando la lectura de su cuenta falla', async () => {
    mundo.fallaLecturaRoles = true
    await avisarCambio(ID(2), 'CREATED', 'X')
    const [c] = alAsesor('b@ejemplo.test')
    expect(c).toBeDefined()
    for (const secreto of ['Rosa', '4771234567', 'rosa@ejemplo.test', 'Prefiero por la tarde']) {
      expect(c.html + c.text + c.subject, secreto).not.toContain(secreto)
    }
    expect(c.text).not.toContain('Confirmar visita')
    expect(mundo.tablas.citas_tokens.filter((t) => t.para_rol === 'asesor')).toHaveLength(0)
  })

  it('el enlace del correo no enseña el nombre del interesado si no se puede verificar al asesor', async () => {
    mundo.fallaLecturaRoles = true
    const t = nuevoToken()
    mundo.tablas.citas_tokens.push({ id: 1, hash: t.hash, cita_id: ID(2), accion: 'confirmar', para_rol: 'asesor', version_cita: 1, expira_en: '2031-01-01T00:00:00Z', usado_en: null, revocado_en: null })
    const v = await verToken(t.plano, new Date('2029-12-01'))
    expect(v).toMatchObject({ valido: false, motivo: 'permiso' })
    expect(JSON.stringify(v)).not.toContain('Rosa')
  })

  it('al cliente no se le revela el nombre de un publicador si no se puede verificar su perfil público', async () => {
    mundo.fallaLecturaRoles = true
    const X = perfilDe('X', { rol: 'cliente' })
    const c = (await listAppointments({ perfil: X, vista: 'cliente', ...RANGO })).find((x) => x.id === ID(2))!
    expect(c.asesor.nombre).toBe('Vive Bien')
  })

  it('un enlace viejo no ofrece la acción si el permiso se retiró después de mandar el correo', async () => {
    const t = nuevoToken()
    mundo.tablas.citas_tokens.push({ id: 1, hash: t.hash, cita_id: ID(2), accion: 'confirmar', para_rol: 'asesor', version_cita: 1, expira_en: '2031-01-01T00:00:00Z', usado_en: null, revocado_en: null })
    expect((await verToken(t.plano, new Date('2029-12-01'))).valido).toBe(true)
    mundo.tablas.usuarios.find((u) => u.uid === 'B')!.permisos_override = { aceptar_citas: false }
    expect(await verToken(t.plano, new Date('2029-12-01'))).toMatchObject({ valido: false, motivo: 'permiso' })
  })
})
