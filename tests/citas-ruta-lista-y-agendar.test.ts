import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrato HTTP de GET/POST /api/citas (la ruta real; el servicio y los avisos se simulan, igual que en citas-ics-ruta y citas-transicion-http).
 * Cubre lo que el servicio no puede garantizar por sí solo: validación de entrada, quién puede pedir cada vista, que un parámetro mal escrito no
 * produzca un 500, y que el POST apague primero con el flag (sin ni leer la sesión) y exija la clave de idempotencia.
 */
const estado = vi.hoisted(() => ({
  perfil: { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} } as Record<string, unknown>,
  flag: true,
  listaLlamadas: [] as Array<Record<string, unknown>>,
  crearLlamadas: [] as Array<{ perfil: Record<string, unknown>; datos: Record<string, unknown>; clave: string }>,
  crearRespuesta: { ok: true, valor: { id: 'cita-nueva' } } as Record<string, unknown>,
  crearLanza: false,
  exigirLlamadas: 0,
  avisos: [] as unknown[][],
}))

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => void) => { fn() } }))
vi.mock('@/lib/auth-server', () => ({ exigir: async () => { estado.exigirLlamadas++; return { perfil: estado.perfil } } }))
vi.mock('@/lib/limites', () => ({ frenarAsync: async () => null, TOPES: { citas: {} } }))
vi.mock('@/lib/config/flags-servidor', () => ({ flagEncendido: async () => estado.flag }))
vi.mock('@/lib/citas/enviar', () => ({ avisarCambio: async (...a: unknown[]) => { estado.avisos.push(a) } }))
vi.mock('@/lib/citas/servicio', () => ({
  listAppointments: async (o: Record<string, unknown>) => { estado.listaLlamadas.push(o); return [] },
  createAppointment: async (perfil: Record<string, unknown>, datos: Record<string, unknown>, clave: string) => {
    estado.crearLlamadas.push({ perfil, datos, clave })
    if (estado.crearLanza) throw new Error('SECRETO-INTERNO')
    return estado.crearRespuesta
  },
}))

const CLIENTE = { uid: 'u1', rol: 'cliente', superAdmin: false, estado: 'activo', capacidades: {} }
const ADMIN = { uid: 'a1', rol: 'admin', superAdmin: false, estado: 'activo', capacidades: {} }
const PUBLICADOR = { uid: 'p1', rol: 'publicador', superAdmin: false, estado: 'activo', tipoPublicador: 'publicador', capacidades: {} }
const RANGO = 'desde=2026-11-10T00:00:00Z&hasta=2026-11-17T00:00:00Z'

async function lista(q: string) {
  const { GET } = await import('../src/app/api/citas/route')
  return GET(new Request(`https://vivebienn.com/api/citas?${q}`))
}
async function agendar(cuerpo: unknown, cabeceras: Record<string, string> = { 'idempotency-key': 'clave-de-prueba-12345' }) {
  const { POST } = await import('../src/app/api/citas/route')
  return POST(new Request('https://vivebienn.com/api/citas', { method: 'POST', headers: cabeceras, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))
}
beforeEach(() => {
  estado.perfil = { ...CLIENTE }; estado.flag = true; estado.listaLlamadas = []; estado.crearLlamadas = []
  estado.crearRespuesta = { ok: true, valor: { id: 'cita-nueva' } }; estado.crearLanza = false; estado.exigirLlamadas = 0; estado.avisos = []
})

describe('GET /api/citas · entrada y vistas', () => {
  it('un `limite` negativo, decimal o que no es número NO llega al servicio (antes daba 500 al llegar a `.limit(-5)`)', async () => {
    for (const l of ['-5', '2.5', 'abc', '0', 'Infinity']) {
      estado.listaLlamadas = []
      const r = await lista(`${RANGO}&limite=${l}`)
      expect(r.status, `limite=${l}`).toBe(200)
      expect(estado.listaLlamadas[0].limite, `limite=${l}`).toBeUndefined()
    }
  })
  it('un `limite` entero positivo sí pasa tal cual (el tope de 500 lo pone el servicio)', async () => {
    await lista(`${RANGO}&limite=25`)
    expect(estado.listaLlamadas[0].limite).toBe(25)
  })
  it('rango ausente, invertido o de más de 100 días: 400 y el servicio no se llama', async () => {
    for (const q of ['', 'desde=2026-11-10T00:00:00Z', 'desde=2026-11-17T00:00:00Z&hasta=2026-11-10T00:00:00Z', 'desde=2026-01-01T00:00:00Z&hasta=2026-12-31T00:00:00Z', 'desde=x&hasta=y']) {
      expect((await lista(q)).status, q).toBe(400)
    }
    expect(estado.listaLlamadas).toHaveLength(0)
  })
  it('un cliente no puede pedir la vista de administración, la de quien atiende ni la de propietario', async () => {
    for (const v of ['admin', 'asesor', 'propietario']) expect((await lista(`${RANGO}&vista=${v}`)).status, v).toBe(403)
    expect(estado.listaLlamadas).toHaveLength(0)
  })
  it('un publicador sin `recibir_citas` no pide la de quien atiende; sí la de propietario', async () => {
    estado.perfil = { ...PUBLICADOR }
    expect((await lista(`${RANGO}&vista=asesor`)).status).toBe(403)
    expect((await lista(`${RANGO}&vista=propietario`)).status).toBe(200)
  })
  it('por defecto: el cliente ve «cliente» y el equipo «admin»', async () => {
    await lista(RANGO)
    expect(estado.listaLlamadas[0].vista).toBe('cliente')
    estado.perfil = { ...ADMIN }
    await lista(RANGO)
    expect(estado.listaLlamadas[1].vista).toBe('admin')
  })
  it('`asesor=` solo acota la vista de administración: desde cualquier otra se ignora; los estados desconocidos se descartan', async () => {
    await lista(`${RANGO}&asesor=otro-uid-123&estados=CONFIRMED,HACKEADA,CANCELLED`)
    expect(estado.listaLlamadas[0].asesorUid).toBeNull()
    expect(estado.listaLlamadas[0].estados).toEqual(['CONFIRMED', 'CANCELLED'])
    estado.perfil = { ...ADMIN }
    await lista(`${RANGO}&asesor=otro-uid-123`)
    expect(estado.listaLlamadas[1].asesorUid).toBe('otro-uid-123')
    await lista(`${RANGO}&asesor=${encodeURIComponent('x; drop table citas')}`)
    expect(estado.listaLlamadas[2].asesorUid).toBeNull()
  })
})

describe('POST /api/citas · agendar', () => {
  it('con `citasEnLinea` apagado: 409 y ni siquiera se lee la sesión', async () => {
    estado.flag = false
    const r = await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z' })
    expect(r.status).toBe(409)
    expect(estado.exigirLlamadas).toBe(0)
    expect(estado.crearLlamadas).toHaveLength(0)
  })
  it('sin clave de idempotencia, o con una mal formada: 400 y no se crea nada', async () => {
    const cabeceras: Array<Record<string, string>> = [{}, { 'idempotency-key': 'corta' }, { 'idempotency-key': 'con espacios y simbolos !!!' }]
    for (const h of cabeceras) {
      expect((await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z' }, h)).status).toBe(400)
    }
    expect(estado.crearLlamadas).toHaveLength(0)
  })
  it('sin propiedad o sin horario, o con un cuerpo que no es JSON: 400', async () => {
    expect((await agendar({ inicio: '2026-11-12T16:00:00Z' })).status).toBe(400)
    expect((await agendar({ propiedadId: 'prop-1' })).status).toBe(400)
    expect((await agendar('esto no es json')).status).toBe(400)
    expect(estado.crearLlamadas).toHaveLength(0)
  })
  it('lleva al servicio la clave y los datos recortados; `consentimiento` solo cuenta si es exactamente `true`', async () => {
    await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z', notas: 'n'.repeat(900), nombre: 'x'.repeat(300), consentimiento: 'true' })
    const c = estado.crearLlamadas[0]
    expect(c.clave).toBe('clave-de-prueba-12345')
    expect((c.datos.notas as string).length).toBe(500)
    expect((c.datos.nombre as string).length).toBe(120)
    expect(c.datos.consentimiento).toBe(false)
    await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z', consentimiento: true })
    expect(estado.crearLlamadas[1].datos.consentimiento).toBe(true)
  })
  it('el perfil que llega al servicio es el de la SESIÓN, aunque el cuerpo traiga otro uid o rol', async () => {
    await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z', uid: 'a1', rol: 'admin', perfil: { rol: 'admin' } })
    expect(estado.crearLlamadas[0].perfil).toMatchObject({ uid: 'u1', rol: 'cliente' })
    expect(estado.crearLlamadas[0].datos).not.toHaveProperty('rol')
  })
  it('éxito: 201 con la cita y se programa el aviso CREATED; un rechazo del servicio conserva su código y no manda aviso', async () => {
    const ok = await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z' })
    expect(ok.status).toBe(201)
    expect((await ok.json()).cita).toMatchObject({ id: 'cita-nueva' })
    expect(estado.avisos).toHaveLength(1)
    expect(estado.avisos[0].slice(0, 2)).toEqual(['cita-nueva', 'CREATED'])
    estado.crearRespuesta = { ok: false, status: 409, error: 'Ese horario ya no está disponible.' }
    const choque = await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z' })
    expect(choque.status).toBe(409)
    expect(estado.avisos).toHaveLength(1)
  })
  it('si el servicio revienta: 500 genérico, sin filtrar el error interno', async () => {
    estado.crearLanza = true
    const r = await agendar({ propiedadId: 'prop-1', inicio: '2026-11-12T16:00:00Z' })
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('SECRETO-INTERNO')
  })
})
