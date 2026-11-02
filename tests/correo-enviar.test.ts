import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enviarCorreo, type DbCorreo, type SolicitudCorreo } from '../src/lib/correo/enviar'
import { entornoCorreo, type EntornoCorreo } from '../src/lib/correo/config'

// MKT-60: estas pruebas ejercitan el camino con la compuerta común ENCENDIDA; el camino apagado lo cubre tests/correo-compuerta-envio.test.ts.
process.env.CORREO_ENVIO = '1'

/** D-80 — el envío: banderas apagadas, reserva en la base, cabeceras de baja, errores sin filtrar y registros sin datos personales. */
const ENV: EntornoCorreo = { transaccional: true, marketing: true, resendKey: 're_clave_secreta_de_prueba', secreto: 's'.repeat(40), webhookSecret: '', remitente: null, remitenteMarketing: null }
const BASE: SolicitudCorreo = { clave: 'bienvenida/uid-1', categoria: 'transaccional', tipo: 'bienvenida', para: 'Persona@Ejemplo.test', asunto: 'Hola', html: '<p>hola</p>', texto: 'hola' }

let llamadas: Array<{ fn: string; args: Record<string, unknown> }>
let respuestaRpc: Record<string, unknown>
const db: DbCorreo = {
  rpc: async (fn, args = {}) => {
    llamadas.push({ fn, args })
    return fn === 'correo_reservar_envio' ? { data: respuestaRpc, error: null } : { data: null, error: null }
  },
  from: () => { throw new Error('no se usa') },
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- los parámetros tipan `mock.calls`
const fetchOk = vi.fn(async (_u: string, _i: RequestInit) => new Response('{"id":"re_123"}', { status: 200 }))

beforeEach(() => {
  llamadas = []
  respuestaRpc = { accion: 'enviar', id: 7 }
  fetchOk.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
const marcas = () => llamadas.filter((l) => l.fn === 'correo_marcar_envio').map((l) => l.args)

describe('banderas y claves: lo nuevo sale APAGADO', () => {
  it('por defecto (sin variables) todo está apagado', () => {
    expect(entornoCorreo({})).toEqual({ transaccional: false, marketing: false, resendKey: '', secreto: '', webhookSecret: '', remitente: null, remitenteMarketing: null, modoPruebas: false })
    expect(entornoCorreo({ CORREO_TRANSACCIONAL: 'true', CORREO_MARKETING: 'si' }).transaccional).toBe(false) // sólo «1» activa
  })

  it('apagado, sin clave del proveedor o con destinatario inválido: no se reserva nada ni se llama a nadie', async () => {
    for (const [s, env, motivo] of [
      [BASE, { ...ENV, transaccional: false }, 'transaccional_apagado'],
      [{ ...BASE, categoria: 'marketing' as const, urlBaja: 'https://x.com/b' }, { ...ENV, marketing: false }, 'marketing_apagado'],
      [{ ...BASE, categoria: 'marketing' as const, urlBaja: 'https://x.com/b' }, { ...ENV, secreto: '' }, 'marketing_apagado'],
      [BASE, { ...ENV, resendKey: '' }, 'sin_clave_del_proveedor'],
      [{ ...BASE, para: 'no-es-correo' }, ENV, 'destinatario_invalido'],
      [{ ...BASE, para: 'a@x.com, b@x.com' }, ENV, 'destinatario_invalido'],
      [{ ...BASE, clave: 'x' }, ENV, 'clave_invalida'],
    ] as Array<[SolicitudCorreo, EntornoCorreo, string]>) {
      const r = await enviarCorreo(db, s, { entorno: env, fetch: fetchOk as unknown as typeof fetch })
      expect(r).toEqual({ estado: 'omitido', motivo })
    }
    expect(llamadas).toEqual([])
    expect(fetchOk).not.toHaveBeenCalled()
  })
})

describe('la reserva en la base decide ANTES de llamar al proveedor', () => {
  it('duplicado, suprimido y sin presupuesto: nunca se llama a Resend', async () => {
    for (const [accion, estado] of [['duplicado', 'duplicado'], ['suprimido', 'suprimido'], ['sin_presupuesto', 'sin_presupuesto']] as const) {
      respuestaRpc = { accion }
      expect((await enviarCorreo(db, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })).estado).toBe(estado)
    }
    expect(fetchOk).not.toHaveBeenCalled()
    expect(marcas()).toEqual([])
  })

  it('un error de la base al reservar NO envía (falla cerrado) y no filtra datos', async () => {
    const mala: DbCorreo = { rpc: async () => ({ data: null, error: { message: 'relation x does not exist' } }), from: db.from }
    expect(await enviarCorreo(mala, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })).toEqual({ estado: 'error', motivo: 'cupo_sin_confirmar' })
    expect(fetchOk).not.toHaveBeenCalled()
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('relation x')
  })

  it('SIN CUPO CONFIRMADO NO SE ENVÍA: la base que lanza, que no contesta o que contesta algo ilegible detienen el envío', async () => {
    const casos: DbCorreo[] = [
      { rpc: async () => { throw new Error('conexión caída') }, from: db.from },
      { rpc: async () => ({ data: null, error: null }), from: db.from },
      { rpc: async () => ({ data: 'texto', error: null }), from: db.from },
      { rpc: async () => ({ data: { accion: 'enviar' }, error: null }), from: db.from },          // sin id
      { rpc: async () => ({ data: { accion: 'quizá', id: 3 }, error: null }), from: db.from },    // acción desconocida
    ]
    for (const mala of casos) {
      expect(await enviarCorreo(mala, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })).toEqual({ estado: 'error', motivo: 'cupo_sin_confirmar' })
    }
    expect(fetchOk).not.toHaveBeenCalled()
  })

  it('manda a la reserva sólo la rebanada (produccion/pruebas), NUNCA los topes: esos viven fijos en la base', async () => {
    await enviarCorreo(db, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch, entornoCupo: 'produccion' })
    expect(llamadas[0].args).toEqual({ p_clave: 'bienvenida/uid-1', p_categoria: 'transaccional', p_tipo: 'bienvenida', p_email: 'persona@ejemplo.test', p_suscriptor: null, p_props: null, p_entorno: 'produccion' })
    expect(Object.keys(llamadas[0].args).some((k) => /max|reserva_trans|tope/.test(k))).toBe(false)
  })
})

describe('la petición a Resend', () => {
  it('transaccional: remitente y reply-to institucionales, destinatario único, clave de idempotencia, sin cabeceras de baja masiva', async () => {
    const r = await enviarCorreo(db, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })
    expect(r).toEqual({ estado: 'enviado' })
    const [url, init] = fetchOk.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe('Bearer re_clave_secreta_de_prueba')
    expect(h['Idempotency-Key']).toBe('bienvenida/uid-1')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo).toMatchObject({ from: 'Vive Bien <informes@vivebienn.com>', to: ['persona@ejemplo.test'], reply_to: 'informes@vivebienn.com', subject: 'Hola', html: '<p>hola</p>', text: 'hola' })
    expect(cuerpo.headers).toBeUndefined()
    expect(marcas()).toEqual([{ p_id: 7, p_estado: 'enviado', p_resend_id: 're_123', p_error: null }])
  })

  it('el correo comercial puede salir de un subdominio dedicado (RESEND_FROM_MARKETING) sin cambiar el transaccional', async () => {
    const env = { ...ENV, remitenteMarketing: 'Vive Bien <recomendaciones@correo.vivebienn.com>' }
    await enviarCorreo(db, BASE, { entorno: env, fetch: fetchOk as unknown as typeof fetch })
    await enviarCorreo(db, { ...BASE, clave: 'reco/x/dia', categoria: 'marketing', urlBaja: 'https://vivebienn.com/api/correo/baja?t=T' }, { entorno: env, fetch: fetchOk as unknown as typeof fetch })
    expect(fetchOk.mock.calls.map((c) => JSON.parse(String(c[1].body)).from)).toEqual(['Vive Bien <informes@vivebienn.com>', 'Vive Bien <recomendaciones@correo.vivebienn.com>'])
  })

  it('RESEND_FROM, si existe, manda sobre el remitente por defecto', async () => {
    await enviarCorreo(db, BASE, { entorno: { ...ENV, remitente: 'Otro <otro@vivebienn.com>' }, fetch: fetchOk as unknown as typeof fetch })
    expect(JSON.parse(String(fetchOk.mock.calls[0][1].body)).from).toBe('Otro <otro@vivebienn.com>')
  })

  it('marketing: baja con un clic (List-Unsubscribe + List-Unsubscribe-Post); sin enlace de baja NO se envía', async () => {
    const m: SolicitudCorreo = { ...BASE, clave: 'reco/x/2026-10-10', categoria: 'marketing', tipo: 'recomendaciones', urlBaja: 'https://vivebienn.com/api/correo/baja?t=TOKEN' }
    await enviarCorreo(db, m, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })
    const cab = JSON.parse(String(fetchOk.mock.calls[0][1].body)).headers
    expect(cab['List-Unsubscribe']).toBe('<https://vivebienn.com/api/correo/baja?t=TOKEN>, <mailto:informes@vivebienn.com?subject=Baja>')
    expect(cab['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')

    fetchOk.mockClear()
    const sinBaja = await enviarCorreo(db, { ...m, clave: 'reco/y/2026-10-10', urlBaja: undefined }, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch })
    expect(sinBaja).toEqual({ estado: 'error', motivo: 'sin_baja' })
    expect(fetchOk).not.toHaveBeenCalled()
  })

  it('un 4xx/5xx o una caída de red quedan como «error»: sin lanzar, sin reintentar en bucle y sin filtrar el cuerpo del proveedor', async () => {
    for (const impl of [
      async () => new Response('{"message":"detalle interno del proveedor"}', { status: 422 }),
      async () => new Response('x', { status: 500 }),
      async () => { throw new Error('ECONNRESET con la clave re_clave_secreta_de_prueba') },
    ]) {
      llamadas = []
      const r = await enviarCorreo(db, BASE, { entorno: ENV, fetch: vi.fn(impl) as unknown as typeof fetch })
      expect(r.estado).toBe('error')
      expect(marcas()).toHaveLength(1)
      expect(marcas()[0]).toMatchObject({ p_estado: 'error', p_resend_id: null })
    }
    const registros = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(registros).not.toContain('detalle interno')
    expect(registros).not.toContain('re_clave_secreta')
    expect(registros).not.toContain('persona@ejemplo.test')
  })
})

describe('fuera de producción', () => {
  it('sin modo de pruebas NO se reserva ni se llama al proveedor; con el modo de pruebas sí (rebanada chica)', async () => {
    const r = await enviarCorreo(db, BASE, { entorno: ENV, fetch: fetchOk as unknown as typeof fetch, entornoCupo: 'pruebas' })
    expect(r).toEqual({ estado: 'omitido', motivo: 'fuera_de_produccion_sin_modo_de_pruebas' })
    expect(llamadas).toEqual([])
    expect(fetchOk).not.toHaveBeenCalled()
    const r2 = await enviarCorreo(db, BASE, { entorno: { ...ENV, modoPruebas: true }, fetch: fetchOk as unknown as typeof fetch, entornoCupo: 'pruebas' })
    expect(r2.estado).toBe('enviado')
    expect(llamadas[0].args).toMatchObject({ p_entorno: 'pruebas' })
  })
})
