import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'
import { enviarPorEmisorUnico } from '../src/lib/correo/emisor'
import { avisarDeLead } from '../src/lib/aviso-lead'
import { enviarInvitacion } from '../src/lib/invitacion-correo'
import { mandar } from '../src/lib/citas/enviar'
import { DESTINO_PRUEBAS } from '../src/lib/correo/config'

/**
 * F0 — CUPO DURO Y EMISOR ÚNICO, de punta a punta con el libro REAL (migración 62 en PGlite) y un «Resend» falso.
 * Regla del dueño: el plan gratuito de Resend no se rebasa NUNCA, y si el sistema no puede confirmar el cupo, no se envía.
 * Aquí se prueba con los cinco emisores del sitio (el quinto, los avisos a clientes, tiene su prueba en avisos-job-y-rutas / correo-baja-de-precio).
 */
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))

let libro: Libro
let peticiones: Array<{ cuerpo: Record<string, unknown>; headers: Record<string, string> }>
let respuesta: () => Response

beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
afterAll(async () => { await libro?.cerrar() })
beforeEach(async () => {
  await libro.vaciar()
  peticiones = []
  respuesta = () => new Response('{"id":"re_ok"}', { status: 200 })
  vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba_falsa')
  vi.stubEnv('CORREO_MODO_PRUEBAS', '')
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    peticiones.push({ cuerpo: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> })
    return respuesta()
  })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const LEAD = { nombre: 'Visitante', telefono: '4771234567', email: 'visitante@ejemplo.test', mensaje: 'Hola', origen: 'contacto' }
const emisores: Array<[string, () => Promise<unknown>]> = [
  ['avisarDeLead', () => avisarDeLead(LEAD)],
  ['enviarInvitacion', () => enviarInvitacion({ email: 'invitado@ejemplo.test', rol: 'publicador', invitadoPor: 'jefe@ejemplo.test' })],
  ['citas/mandar', () => mandar({ clave: `cita/${crypto.randomUUID()}/v1/cliente`, para: 'cliente@ejemplo.test', asunto: 'Tu visita', html: '<p>hola</p>', texto: 'hola' })],
]

describe('cada correo cuenta contra el cupo ANTES de salir', () => {
  for (const [nombre, emitir] of emisores) {
    it(`${nombre}: deja una fila en el libro y llama al proveedor UNA vez`, async () => {
      await emitir()
      expect(peticiones).toHaveLength(1)
      expect(await libro.usados()).toBe(1)
      expect((await libro.filas())[0]).toMatchObject({ estado: 'enviado', categoria: 'transaccional', entorno: 'produccion' })
    })
  }

  it('el libro no guarda el cuerpo del correo: sólo clave, categoría, tipo, estado y el correo normalizado', async () => {
    await avisarDeLead(LEAD)
    const cols = Object.keys((await libro.pg.query('select * from public.correo_envios')).fields.reduce((o, f) => ({ ...o, [f.name]: 1 }), {}))
    expect(cols.sort()).toEqual(['categoria', 'clave', 'creado_en', 'email_hash', 'entorno', 'enviado_en', 'error', 'estado', 'id', 'propiedades', 'resend_id', 'suscriptor_id', 'tipo'].sort())
  })
})

describe('SIN CUPO NO SE ENVÍA', () => {
  async function llenarHoy(n: number) {
    await libro.pg.query(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, entorno)
                          select 'lleno/' || g, 'transaccional', 'x', 'lleno@ejemplo.test', 'enviado', 'produccion' from generate_series(1, $1::int) g`, [n])
  }

  for (const [nombre, emitir] of emisores) {
    it(`${nombre}: con el cupo del día agotado NO llama al proveedor`, async () => {
      await llenarHoy(80)
      await emitir()
      expect(peticiones).toEqual([])
      expect(await libro.usados()).toBe(80)
    })

    it(`${nombre}: si la base del libro no contesta NO llama al proveedor`, async () => {
      const original = libroH.db
      libroH.db = { rpc: async () => { throw new Error('conexión caída') }, from: () => { throw new Error('no se usa') } }
      try { await emitir() } finally { libroH.db = original }
      expect(peticiones).toEqual([])
    })

    it(`${nombre}: si el libro contesta algo ilegible NO llama al proveedor`, async () => {
      const original = libroH.db
      libroH.db = { rpc: async () => ({ data: 'cualquier cosa', error: null }), from: () => { throw new Error('no se usa') } }
      try { await emitir() } finally { libroH.db = original }
      expect(peticiones).toEqual([])
    })
  }

  it('el aviso de leads informa que no salió (el lead se guarda aparte): no finge éxito', async () => {
    await llenarHoy(80)
    expect(await avisarDeLead(LEAD)).toMatchObject({ enviado: false })
  })

  it('un cupo de 10 en la rebanada de pruebas se agota exacto: el 11.º correo no sale aunque se pidan en paralelo', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('CORREO_MODO_PRUEBAS', '1')
    const r = await Promise.all(Array.from({ length: 25 }, (_, i) => enviarPorEmisorUnico({
      apiKey: 'k', clave: `par/${i}`, categoria: 'transaccional', tipo: 'x', para: `p${i}@ejemplo.test`, cuerpo: { from: 'a', to: [`p${i}@ejemplo.test`], subject: 's', html: 'h', text: 't' }, db: libro.db,
    })))
    expect(r.filter((x) => x.ok)).toHaveLength(10)
    expect(r.filter((x) => x.estado === 'sin_cupo')).toHaveLength(15)
    expect(peticiones).toHaveLength(10)
  })

  it('lo opcional («servicio») respeta la reserva transaccional en producción: se detiene en 50 y lo transaccional sigue hasta 80', async () => {
    await libro.pg.query(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, entorno)
                          select 'prev/' || g, 'transaccional', 'x', 'p@ejemplo.test', 'enviado', 'produccion' from generate_series(1, 50) g`)
    const pedido = (clave: string, categoria: 'transaccional' | 'servicio') => enviarPorEmisorUnico({
      apiKey: 'k', clave, categoria, tipo: 'x', para: 'a@ejemplo.test', cuerpo: { from: 'a', to: ['a@ejemplo.test'], subject: 's', html: 'h', text: 't' }, db: libro.db, entornoCupo: 'produccion',
    })
    expect((await pedido('o/1', 'servicio')).estado).toBe('sin_cupo')
    expect((await pedido('t/1', 'transaccional')).ok).toBe(true)
  })

  it('el estado del proveedor «error» sigue contando (un error ambiguo pudo haber enviado el correo)', async () => {
    respuesta = () => new Response('{"message":"boom"}', { status: 500 })
    await avisarDeLead(LEAD)
    expect(peticiones).toHaveLength(1)
    expect((await libro.filas())[0].estado).toBe('error')
    expect(await libro.usados()).toBe(1)
  })
})

describe('MODO DE PRUEBAS cuenta igual y marca el asunto con un ID', () => {
  beforeEach(() => { vi.stubEnv('CORREO_MODO_PRUEBAS', '1'); vi.stubEnv('VERCEL_ENV', 'preview') })

  it('va SOLO a informes@vivebienn.com, con asunto «[PRUEBA VB · ID] …», y el libro lo cuenta', async () => {
    await enviarInvitacion({ email: 'persona.real@cliente-real.test', rol: 'publicador', invitadoPor: 'otra.real@cliente-real.test' })
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0].cuerpo.to).toEqual([DESTINO_PRUEBAS])
    expect(DESTINO_PRUEBAS).toBe('informes@vivebienn.com')
    expect(String(peticiones[0].cuerpo.subject)).toMatch(/^\[PRUEBA VB · [0-9A-F]{8}\] invitacion$/)
    expect(await libro.usados('pruebas')).toBe(1)
    const filas = await libro.filas()
    expect(filas[0].email_hash).toBe(await libro.huella(DESTINO_PRUEBAS)) // ni el libro guarda la dirección real: sólo la huella del destino de pruebas
    expect(JSON.stringify(filas)).not.toContain(DESTINO_PRUEBAS)
    // F1: el contenido real (que mencionaba al invitado) se descarta: la dirección real no aparece en NINGÚN campo ni en el libro.
    expect(JSON.stringify(peticiones) + JSON.stringify(filas)).not.toContain('cliente-real')
    expect(String(peticiones[0].cuerpo.text)).toContain('contenido sintético')
  })

  it('el ID del asunto es estable para la misma clave y distinto entre correos', async () => {
    const mandarUno = (clave: string) => enviarPorEmisorUnico({ apiKey: 'k', clave, categoria: 'transaccional', tipo: 'x', para: 'a@ejemplo.test', cuerpo: { from: 'a', to: ['a@ejemplo.test'], subject: 'Hola', html: 'h', text: 't' }, db: libro.db })
    await mandarUno('id/uno'); await mandarUno('id/dos')
    await libro.vaciar()
    await mandarUno('id/uno')
    const ids = peticiones.map((p) => /^\[PRUEBA VB · ([0-9A-F]{8})\]/.exec(String(p.cuerpo.subject))?.[1])
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
    expect(ids[2]).toBe(ids[0])
  })

  it('una prueba que agota el cupo de pruebas impide más pruebas (10 al día), sin tocar la rebanada de producción', async () => {
    for (let i = 0; i < 12; i++) await enviarPorEmisorUnico({ apiKey: 'k', clave: `t/${i}`, categoria: 'transaccional', tipo: 'x', para: 'a@ejemplo.test', cuerpo: { from: 'a', to: ['a@ejemplo.test'], subject: 's', html: 'h', text: 't' }, db: libro.db })
    expect(peticiones).toHaveLength(10)
    expect(await libro.usados('produccion')).toBe(0)
  })
})

describe('duplicados', () => {
  it('la misma clave NO se envía dos veces (ni se cuenta dos veces)', async () => {
    const pedido = () => enviarPorEmisorUnico({ apiKey: 'k', clave: 'unica/1', categoria: 'transaccional', tipo: 'x', para: 'a@ejemplo.test', cuerpo: { from: 'a', to: ['a@ejemplo.test'], subject: 's', html: 'h', text: 't' }, db: libro.db })
    expect((await pedido()).estado).toBe('enviado')
    expect(await pedido()).toMatchObject({ ok: true, estado: 'duplicado' })
    expect(peticiones).toHaveLength(1)
    expect(await libro.usados()).toBe(1)
  })

  it('una dirección con rebote permanente suprimida no recibe más correo (y no gasta cupo)', async () => {
    await libro.pg.query(`insert into public.correo_supresiones values (public.correo_huella('rebotada@ejemplo.test'), 'rebote')`)
    const r = await enviarPorEmisorUnico({ apiKey: 'k', clave: 'sup/1', categoria: 'transaccional', tipo: 'x', para: 'Rebotada@Ejemplo.test', cuerpo: { from: 'a', to: ['rebotada@ejemplo.test'], subject: 's', html: 'h', text: 't' }, db: libro.db })
    expect(r.estado).toBe('suprimido')
    expect(peticiones).toEqual([])
    expect(await libro.usados()).toBe(0)
  })
})

describe('FUERA DE PRODUCCIÓN no sale ningún correo real (los contadores de otras bases no se suman: auditoría del límite agregado)', () => {
  beforeEach(() => { vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('CORREO_MODO_PRUEBAS', '') })

  for (const [nombre, emitir] of emisores) {
    it(`${nombre}: en Preview/local sin modo de pruebas NO llama al proveedor ni toca el libro`, async () => {
      await emitir()
      expect(peticiones).toEqual([])
      expect(await libro.filas()).toEqual([])
    })
  }

  it('con el modo de pruebas sí sale, pero sólo a informes@ y contando en la rebanada de pruebas', async () => {
    vi.stubEnv('CORREO_MODO_PRUEBAS', '1')
    await avisarDeLead(LEAD)
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0].cuerpo.to).toEqual([DESTINO_PRUEBAS])
    expect(await libro.usados('pruebas')).toBe(1)
  })
})

describe('MIGRACIÓN 62 AÚN NO APLICADA: qué se detiene', () => {
  const faltante = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.correo_reservar_envio in the schema cache' } }), from: () => { throw new Error('no se usa') } }
  for (const [nombre, emitir] of emisores) {
    it(`${nombre}: se DETIENE (falla cerrada); por eso la migración va antes que el código`, async () => {
      const original = libroH.db
      libroH.db = faltante
      try { await emitir() } finally { libroH.db = original }
      expect(peticiones).toEqual([])
    })
  }
  it('con la migración aplicada y el libro VACÍO nada se bloquea', async () => {
    for (const [, emitir] of emisores) await emitir()
    expect(peticiones).toHaveLength(emisores.length)
  })
})
