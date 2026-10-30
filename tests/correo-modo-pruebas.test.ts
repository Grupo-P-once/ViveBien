import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DESTINO_PRUEBAS, entornoCorreo, type EntornoCorreo } from '../src/lib/correo/config'
import { enviarCorreo, exigirSoloDestinoDePruebas, MARCA_PRUEBA, type DbCorreo, type SolicitudCorreo } from '../src/lib/correo/enviar'
import { ENLACE_INERTE } from '../src/lib/correo/resend'

/**
 * D-80 — MODO DE PRUEBAS: con `CORREO_MODO_PRUEBAS=1` NINGÚN correo puede salir hacia otra dirección que `informes@vivebienn.com`.
 * La restricción vive en el punto central de envío (`enviarCorreo`) y se comprueba otra vez sobre el cuerpo ya armado, justo antes de llamar
 * al proveedor. El proveedor es un doble (nada sale de verdad): estas pruebas no envían ningún correo.
 */
const ENV: EntornoCorreo = { transaccional: true, marketing: true, resendKey: 're_clave_secreta_de_prueba', secreto: 's'.repeat(40), webhookSecret: '', remitente: null, remitenteMarketing: null }
const ENV_PRUEBAS: EntornoCorreo = { ...ENV, modoPruebas: true }
const REAL = 'cliente.real@empresa-real.test'
const BASE: SolicitudCorreo = { clave: 'bienvenida/uid-1', categoria: 'transaccional', tipo: 'bienvenida', para: REAL, asunto: 'Hola', html: '<p>hola</p>', texto: 'hola' }

type Peticion = { url: string; init: RequestInit; cuerpo: Record<string, unknown> }
let peticiones: Peticion[]
let rpcs: Array<{ fn: string; args: Record<string, unknown> }>
const db: DbCorreo = {
  rpc: async (fn, args = {}) => {
    rpcs.push({ fn, args })
    return fn === 'correo_reservar_envio' ? { data: { accion: 'enviar', id: 7 }, error: null } : { data: null, error: null }
  },
  from: () => { throw new Error('no se usa') },
}
const fetchOk = (async (url: string, init: RequestInit) => {
  peticiones.push({ url, init, cuerpo: JSON.parse(String(init.body)) })
  return new Response('{"id":"re_123"}', { status: 200 })
}) as unknown as typeof fetch

beforeEach(() => {
  peticiones = []
  rpcs = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
const enviar = (s: Record<string, unknown>, env = ENV_PRUEBAS) => enviarCorreo(db, { ...BASE, ...s } as SolicitudCorreo, { entorno: env, fetch: fetchOk })
const todoElTrafico = () => JSON.stringify({ peticiones: peticiones.map((p) => ({ url: p.url, h: p.init.headers, c: p.cuerpo })), rpcs })

describe('la bandera: separada del modo real y apagada por defecto', () => {
  it('el destino de pruebas es una CONSTANTE del código (no se puede apuntar a otra dirección con una variable)', () => {
    expect(DESTINO_PRUEBAS).toBe('informes@vivebienn.com')
    expect(entornoCorreo({ CORREO_MODO_PRUEBAS: '1', CORREO_DESTINO_PRUEBAS: 'otra@x.test', DESTINO_PRUEBAS: 'otra@x.test' })).toMatchObject({ modoPruebas: true })
  })

  it('apagado por defecto; sólo el valor «1» lo activa', () => {
    expect(entornoCorreo({}).modoPruebas).toBe(false)
    for (const v of ['0', '', 'true', 'si', 'yes', ' 1', '1 ', 'on']) expect(entornoCorreo({ CORREO_MODO_PRUEBAS: v }).modoPruebas, v).toBe(false)
    expect(entornoCorreo({ CORREO_MODO_PRUEBAS: '1' }).modoPruebas).toBe(true)
  })

  it('NO activa el envío real: sin las banderas de correo o sin clave, el modo de pruebas tampoco envía', async () => {
    for (const env of [{ ...ENV_PRUEBAS, transaccional: false }, { ...ENV_PRUEBAS, resendKey: '' }]) {
      expect((await enviar({}, env)).estado).toBe('omitido')
    }
    expect((await enviar({ categoria: 'marketing', urlBaja: 'https://vivebienn.com/b' }, { ...ENV_PRUEBAS, marketing: false })).estado).toBe('omitido')
    expect(peticiones).toEqual([])
    expect(rpcs).toEqual([])
  })

  it('sin modo de pruebas el envío real no cambia: va al destinatario original, sin prefijo ni cabecera de modo', async () => {
    await enviar({ responderA: 'asesor@vivebienn.com' }, ENV)
    expect(peticiones[0].cuerpo).toMatchObject({ to: [REAL], reply_to: 'asesor@vivebienn.com', subject: 'Hola' })
    expect(peticiones[0].cuerpo.headers).toBeUndefined()
  })
})

describe('en modo de pruebas TODO sale al destino de pruebas', () => {
  it('transaccional: destinatario sustituido, asunto marcado, cabecera de modo y respuesta institucional', async () => {
    expect((await enviar({ responderA: 'asesor.real@empresa-real.test' })).estado).toBe('enviado')
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0].cuerpo).toMatchObject({ to: [DESTINO_PRUEBAS], subject: expect.stringMatching(/^\[PRUEBA VB · [0-9A-F]{8}\] Hola$/), reply_to: 'informes@vivebienn.com' })
    expect((peticiones[0].cuerpo.headers as Record<string, string>)['X-Vive-Bien-Modo']).toBe('pruebas')
  })

  it('marketing: igual, pero SIN cabeceras de baja ni enlaces con token (un correo de pruebas no puede dar de baja a nadie real)', async () => {
    await enviar({ clave: 'reco/x/dia', categoria: 'marketing', tipo: 'recomendaciones', urlBaja: 'https://vivebienn.com/api/correo/baja?t=TOKENREAL', html: '<a href="https://vivebienn.com/correo/baja#t=TOKENREAL">baja</a>', texto: 'https://vivebienn.com/correo/baja#t=TOKENREAL' })
    expect(peticiones[0].cuerpo.to).toEqual([DESTINO_PRUEBAS])
    const cab = peticiones[0].cuerpo.headers as Record<string, string>
    expect(Object.keys(cab)).toEqual(['X-Vive-Bien-Modo'])
    expect(todoElTrafico()).not.toContain('TOKENREAL')
    expect(peticiones[0].cuerpo.html).toContain(ENLACE_INERTE)
  })

  it('el destinatario ORIGINAL no aparece en ninguna parte del tráfico: ni en la petición, ni en la base (la reserva usa el destino de pruebas)', async () => {
    await enviar({})
    expect(todoElTrafico()).not.toContain('empresa-real')
    expect(rpcs.find((r) => r.fn === 'correo_reservar_envio')!.args.p_email).toBe(DESTINO_PRUEBAS)
  })

  it('mayúsculas, espacios y variantes del mismo correo original no cambian el resultado', async () => {
    for (const [i, para] of ['  CLIENTE.Real@Empresa-REAL.test ', 'cliente.real@empresa-real.test'].entries()) {
      await enviar({ clave: `bienvenida/uid-${i}`, para })
    }
    expect(peticiones.map((p) => p.cuerpo.to)).toEqual([[DESTINO_PRUEBAS], [DESTINO_PRUEBAS]])
  })

  it('el destinatario inválido se omite igual que en producción (el modo de pruebas no «arregla» una solicitud mala)', async () => {
    for (const para of ['no-es-correo', '', 'a@b']) expect((await enviar({ para })).motivo).toBe('destinatario_invalido')
    expect(peticiones).toEqual([])
  })
})

describe('varios destinatarios, CC y CCO: ninguno puede salir', () => {
  it('una lista de destinatarios en `para` (coma, punto y coma, espacio, salto de línea, arreglo) se omite y no se envía NADA', async () => {
    for (const para of ['a@x.test, b@x.test', 'a@x.test;b@x.test', 'a@x.test b@x.test', 'a@x.test\nb@x.test', 'a@x.test\r\nBcc: b@x.test', '<a@x.test>,<b@x.test>']) {
      expect((await enviar({ para })).estado, JSON.stringify(para)).toBe('omitido')
    }
    for (const para of [['a@x.test', 'b@x.test'], ['a@x.test'], { a: 1 }, null, undefined, 42]) {
      expect((await enviar({ para })).estado, JSON.stringify(para)).toBe('omitido')
    }
    expect(peticiones).toEqual([])
  })

  it('campos extra de una solicitud sin tipar (`to`, `cc`, `bcc`, `cco`, `destinatarios`) NO llegan al proveedor', async () => {
    await enviar({ to: ['x@x.test'], cc: ['c@x.test'], bcc: ['b@x.test'], cco: ['o@x.test'], CC: 'z@x.test', Bcc: 'y@x.test', destinatarios: ['d@x.test'], reply_to: 'r@x.test', headers: { Bcc: 'h@x.test' } })
    expect(peticiones).toHaveLength(1)
    const c = peticiones[0].cuerpo
    expect(c.to).toEqual([DESTINO_PRUEBAS])
    for (const k of Object.keys(c)) expect(k).toMatch(/^(from|to|reply_to|subject|html|text|headers)$/)
    expect(c.reply_to).toBe('informes@vivebienn.com')
    expect(Object.keys(c.headers as object).sort()).toEqual(['X-Vive-Bien-Modo'])
    expect(todoElTrafico()).not.toMatch(/c@x\.test|b@x\.test|o@x\.test|z@x\.test|y@x\.test|d@x\.test|h@x\.test|r@x\.test|x@x\.test/)
  })

  it('un enlace de baja con saltos de línea no puede inyectar una cabecera `Bcc` ni mandar copias', async () => {
    const r = await enviar({ categoria: 'marketing', clave: 'reco/inyeccion', urlBaja: 'https://vivebienn.com/b\r\nBcc: victima@x.test' })
    expect(r.estado).toBe('enviado')
    expect(todoElTrafico()).not.toMatch(/victima|Bcc/i)
    expect(Object.keys(peticiones[0].cuerpo.headers as object)).toEqual(['X-Vive-Bien-Modo'])
  })

  it('la barrera final rechaza cualquier cuerpo con otro destinatario, copias, cabeceras de destinatarios o respuesta ajena', () => {
    const ok = { to: [DESTINO_PRUEBAS], reply_to: 'informes@vivebienn.com', subject: 's', headers: { 'X-Vive-Bien-Modo': 'pruebas' } }
    expect(() => exigirSoloDestinoDePruebas(ok)).not.toThrow()
    const malos: Array<Record<string, unknown>> = [
      { ...ok, to: ['otro@x.test'] },
      { ...ok, to: [DESTINO_PRUEBAS, 'otro@x.test'] },
      { ...ok, to: ['otro@x.test', DESTINO_PRUEBAS] },
      { ...ok, to: DESTINO_PRUEBAS },
      { ...ok, to: [] },
      { ...ok, to: undefined },
      { ...ok, to: [DESTINO_PRUEBAS.toUpperCase()] },
      { ...ok, cc: ['c@x.test'] },
      { ...ok, bcc: ['b@x.test'] },
      { ...ok, BCC: ['b@x.test'] },
      { ...ok, Cco: ['b@x.test'] },
      { ...ok, cc: [] },
      { ...ok, reply_to: 'otro@x.test' },
      { ...ok, reply_to: undefined },
      { ...ok, headers: { Bcc: 'b@x.test' } },
      { ...ok, headers: { ' cc ': 'b@x.test' } },
      { ...ok, headers: { To: 'b@x.test' } },
      { ...ok, headers: { 'X-A': 'v\r\nBcc: b@x.test' } },
      { ...ok, headers: { 'X-A': 'v\nCc: b@x.test' } },
      { ...ok, headers: { 'X-A': 5 } },
      { ...ok, headers: { 'List-Unsubscribe': '<https://vivebienn.com/api/correo/baja?t=T>' } },
      { ...ok, headers: { 'list-unsubscribe-post': 'List-Unsubscribe=One-Click' } },
      { ...ok, attachments: [{ filename: 'a.ics', content: 'x' }] },
      { ...ok, scheduled_at: 'in 1 min' },
      { ...ok, tags: [] },
    ]
    for (const m of malos) expect(() => exigirSoloDestinoDePruebas(m), JSON.stringify(m)).toThrow('fuga_modo_pruebas')
  })

  it('el destino de pruebas exacto es el ÚNICO que acepta la barrera (ni subdominios ni variantes)', () => {
    for (const to of ['informes@vivebienn.com.otro.test', 'xinformes@vivebienn.com', 'informes+x@vivebienn.com', 'informes@vivebienn.co']) {
      expect(() => exigirSoloDestinoDePruebas({ to: [to], reply_to: 'informes@vivebienn.com' }), to).toThrow()
    }
  })
})

describe('el cuerpo que ve el proveedor, en modo de pruebas, respecto del modo real', () => {
  it('sólo cambian destinatario, asunto, respuesta y la cabecera de modo: el contenido (html/texto) es el mismo', async () => {
    await enviar({}, ENV)
    await enviar({ clave: 'bienvenida/uid-2' }, ENV_PRUEBAS)
    const [real, prueba] = peticiones.map((p) => p.cuerpo)
    expect(prueba.html).toBe(real.html)
    expect(prueba.text).toBe(real.text)
    expect(prueba.from).toBe(real.from)
    expect(real.to).toEqual([REAL])
    expect(prueba.to).toEqual([DESTINO_PRUEBAS])
  })
})
