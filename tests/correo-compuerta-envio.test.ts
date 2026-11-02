import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLibro, type Libro } from './dobles/libro-cupo'
import { enviarPorEmisorUnico } from '../src/lib/correo/emisor'
import { enviarCorreo, type SolicitudCorreo } from '../src/lib/correo/enviar'
import { entornoCorreo, envioHabilitado, type EntornoCorreo } from '../src/lib/correo/config'
import { avisarDeLead } from '../src/lib/aviso-lead'
import { enviarInvitacion } from '../src/lib/invitacion-correo'
import { mandar } from '../src/lib/citas/enviar'

/**
 * MKT-60 (2-nov-2026) — COMPUERTA COMÚN DE ENVÍO (`CORREO_ENVIO`).
 * Causa: `enviarPorEmisorUnico` (aviso de contacto, invitaciones, citas y avisos a clientes) no tenía bandera de entorno; lo único que lo
 * frenaba era la falta de una lectura de cupo de Resend, así que guardarla encendió todos esos canales. Ahora ambos emisores
 * (`enviarPorEmisorUnico` y `enviarCorreo`) comprueban la MISMA compuerta antes de tocar la base o el proveedor.
 * Regla: ausente o apagada = no sale NADA ni se reserva cupo; encendida = cada correo sigue sujeto a consentimiento, preferencias, cupo y proveedor.
 */
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))

let libro: Libro
let peticiones: Array<Record<string, unknown>>
let respuesta: () => Response
beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
afterAll(async () => { await libro?.cerrar() })
beforeEach(async () => {
  await libro.vaciar()
  peticiones = []
  respuesta = () => new Response('{"id":"re_ok"}', { status: 200 })
  vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba_falsa')
  vi.stubEnv('CORREO_MODO_PRUEBAS', '')
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { peticiones.push(JSON.parse(String(init.body))); return respuesta() })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const LEAD = { nombre: 'Visitante', telefono: '4771234567', email: 'visitante@ejemplo.test', mensaje: 'Hola', origen: 'contacto' }
const CUERPO = { from: 'a@ejemplo.test', to: ['p@ejemplo.test'], subject: 's', html: '<p>h</p>', text: 't' }
// Cada llamador relevante del emisor único: aviso de contacto, invitación, citas y la llamada directa de los avisos a clientes (servicio).
const llamadores: Array<[string, () => Promise<unknown>]> = [
  ['avisarDeLead (aviso de contacto)', () => avisarDeLead(LEAD)],
  ['enviarInvitacion (invitación al equipo)', () => enviarInvitacion({ email: 'invitado@ejemplo.test', rol: 'publicador', invitadoPor: 'jefe@ejemplo.test' })],
  ['citas/mandar', () => mandar({ clave: `cita/${crypto.randomUUID()}/v1/cliente`, para: 'cliente@ejemplo.test', asunto: 'Tu visita', html: '<p>hola</p>', texto: 'hola' })],
  ['avisos a clientes (categoría servicio)', () => enviarPorEmisorUnico({ apiKey: 'k', clave: `aviso/alertas/u/${crypto.randomUUID()}`, categoria: 'servicio', tipo: 'aviso_alertas', para: 'p@ejemplo.test', cuerpo: CUERPO })],
]

describe('compuerta CORREO_ENVIO — valores que NO la encienden (cierre seguro)', () => {
  // Solo el valor exacto '1' enciende. Ausente, vacío, '0', 'false', 'true', con espacios o en otro formato = apagada.
  for (const v of [undefined, '', '0', 'false', 'true', 'TRUE', 'si', ' 1', '1 ', '2']) {
    it(`CORREO_ENVIO=${JSON.stringify(v)}: ningún llamador del emisor único envía, ni reserva cupo, ni toca la base`, async () => {
      if (v === undefined) vi.stubEnv('CORREO_ENVIO', undefined as unknown as string); else vi.stubEnv('CORREO_ENVIO', v)
      expect(envioHabilitado()).toBe(false)
      for (const [, emitir] of llamadores) await emitir()
      expect(peticiones).toEqual([])
      expect(await libro.usados()).toBe(0)
      expect(await libro.filas()).toEqual([])
    })
  }

  it('la lectura de uso de Resend NO la enciende: con lectura vigente y cupo de sobra, apagada sigue sin salir nada', async () => {
    vi.stubEnv('CORREO_ENVIO', '')
    // El libro de pruebas tiene cupo libre; el emisor devuelve «bloqueado» antes de preguntarle nada.
    const r = await enviarPorEmisorUnico({ apiKey: 'k', clave: 'sin-compuerta/1', categoria: 'transaccional', tipo: 'x', para: 'p@ejemplo.test', cuerpo: CUERPO, db: libro.db as never })
    expect(r).toMatchObject({ ok: false, estado: 'bloqueado', detalle: 'envio_apagado' })
    expect(peticiones).toEqual([])
    expect(await libro.filas()).toEqual([])
  })

  it('el valor lo decide el momento del envío (se lee cada vez): apagarla en caliente detiene los siguientes', async () => {
    vi.stubEnv('CORREO_ENVIO', '1')
    await avisarDeLead(LEAD)
    expect(peticiones).toHaveLength(1)
    vi.stubEnv('CORREO_ENVIO', '0')
    await avisarDeLead({ ...LEAD, nombre: 'Otro' })
    expect(peticiones).toHaveLength(1)
  })
})

describe('compuerta CORREO_ENVIO encendida — cada correo sigue sujeto a sus reglas', () => {
  beforeEach(() => { vi.stubEnv('CORREO_ENVIO', '1') })

  for (const [nombre, emitir] of llamadores) {
    it(`${nombre}: sale UNA vez y deja su fila en el libro`, async () => {
      await emitir()
      expect(peticiones).toHaveLength(1)
      expect(await libro.usados()).toBe(1)
    })
  }

  it('error del proveedor: no finge éxito y el libro queda en «error»', async () => {
    respuesta = () => new Response('{"message":"fallo"}', { status: 500 })
    const r = await enviarPorEmisorUnico({ apiKey: 'k', clave: 'falla/1', categoria: 'transaccional', tipo: 'x', para: 'p@ejemplo.test', cuerpo: CUERPO })
    expect(r).toMatchObject({ ok: false, estado: 'rechazado', status: 500 })
    expect((await libro.filas())[0]).toMatchObject({ estado: 'error' })
  })

  it('el proveedor rechaza al aviso de contacto: informa enviado=false', async () => {
    respuesta = () => new Response('', { status: 422 })
    expect(await avisarDeLead(LEAD)).toMatchObject({ enviado: false })
  })

  it('sin destinatario válido no se llama al proveedor (vacío, lista, salto de línea)', async () => {
    for (const para of ['', 'a@x.test, b@x.test', 'a@x.test\nbcc: b@x.test']) {
      const r = await enviarPorEmisorUnico({ apiKey: 'k', clave: `sin-dest/${para.length}`, categoria: 'transaccional', tipo: 'x', para, cuerpo: CUERPO })
      expect(r.ok).toBe(false)
    }
    expect(peticiones).toEqual([])
  })

  it('sin clave del proveedor no sale nada', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect((await enviarPorEmisorUnico({ apiKey: '', clave: 'sin-clave/1', categoria: 'transaccional', tipo: 'x', para: 'p@ejemplo.test', cuerpo: CUERPO })).estado).toBe('sin_clave')
    expect(peticiones).toEqual([])
  })
})

describe('compuerta CORREO_ENVIO en el emisor de D-80 (`enviarCorreo`)', () => {
  const ENV: EntornoCorreo = { transaccional: true, marketing: true, resendKey: 're_prueba_no_real', secreto: 's'.repeat(40), webhookSecret: '', remitente: null, remitenteMarketing: null }
  const base = (categoria: SolicitudCorreo['categoria'], tipo: string): SolicitudCorreo => ({ clave: `d80/${categoria}/${crypto.randomUUID()}`, categoria, tipo, para: 'persona@ejemplo.test', asunto: 'Hola', html: '<p>hola</p>', texto: 'hola', urlBaja: 'https://vivebienn.com/api/correo/baja?t=x' })
  const categorias: Array<[SolicitudCorreo['categoria'], string]> = [['transaccional', 'bienvenida'], ['servicio', 'aviso_alertas'], ['marketing', 'recomendaciones']]

  for (const [cat, tipo] of categorias) {
    for (const v of [undefined, '', '0', 'true', ' 1 ']) {
      it(`${cat}: CORREO_ENVIO=${JSON.stringify(v)} → omitido, sin cupo y sin proveedor, aunque las demás banderas estén encendidas`, async () => {
        vi.stubEnv('CORREO_ENVIO', v as unknown as string)
        const r = await enviarCorreo(libro.db as never, base(cat, tipo), { entorno: ENV, entornoCupo: 'produccion' })
        expect(r).toMatchObject({ estado: 'omitido', motivo: 'envio_apagado' })
        expect(peticiones).toEqual([])
        expect(await libro.filas()).toEqual([])
      })
    }
  }

  it('NO hay vía de bypass: un entorno inyectado con `envio: true` (o cualquier campo parecido) no enciende la compuerta', async () => {
    vi.stubEnv('CORREO_ENVIO', '')
    const trampa = { ...ENV, envio: true, CORREO_ENVIO: '1' } as unknown as EntornoCorreo
    const r = await enviarCorreo(libro.db as never, base('transaccional', 'bienvenida'), { entorno: trampa, entornoCupo: 'produccion' })
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'envio_apagado' })
    const e = await enviarPorEmisorUnico({ apiKey: 'k', clave: 'trampa/1', categoria: 'transaccional', tipo: 'x', para: 'p@ejemplo.test', cuerpo: CUERPO, envio: true } as never)
    expect(e).toMatchObject({ ok: false, estado: 'bloqueado', detalle: 'envio_apagado' })
    expect(peticiones).toEqual([])
    expect(await libro.filas()).toEqual([])
  })

  it('encendida (exactamente "1"): lo transaccional sale solo si además está su bandera propia (CORREO_TRANSACCIONAL)', async () => {
    vi.stubEnv('CORREO_ENVIO', '1')
    const r = await enviarCorreo(libro.db as never, base('transaccional', 'bienvenida'), { entorno: { ...ENV, transaccional: false }, entornoCupo: 'produccion' })
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'transaccional_apagado' })
    expect(peticiones).toEqual([])
  })

  it('encendida con sus banderas: sale UNA vez y deja la fila en el libro', async () => {
    vi.stubEnv('CORREO_ENVIO', '1')
    const r = await enviarCorreo(libro.db as never, base('transaccional', 'bienvenida'), { entorno: ENV, entornoCupo: 'produccion' })
    expect(r.estado).toBe('enviado')
    expect(peticiones).toHaveLength(1)
    expect(await libro.usados()).toBe(1)
  })

  it('marketing: la compuerta encendida NO basta; sin la autorización legal (MARKETING_AUTORIZADO=false) nunca se enciende', async () => {
    vi.stubEnv('CORREO_ENVIO', '1')
    const real = entornoCorreo({ CORREO_ENVIO: '1', CORREO_MARKETING: '1', CORREO_SECRETO: 's'.repeat(40), RESEND_API_KEY: 're_x' })
    expect(real.marketing).toBe(false) // la constante de código lo impide aunque la variable esté puesta
    const r = await enviarCorreo(libro.db as never, base('marketing', 'recomendaciones'), { entorno: real, entornoCupo: 'produccion' })
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'marketing_apagado' })
    expect(peticiones).toEqual([])
  })

  it('el emisor único no admite marketing (categoría excluida del tipo): la compuerta no abre esa puerta', () => {
    // @ts-expect-error la categoría `marketing` no existe en el pedido del emisor único
    const mal: Parameters<typeof enviarPorEmisorUnico>[0] = { apiKey: 'k', clave: 'x/1', categoria: 'marketing', tipo: 'x', para: 'p@ejemplo.test', cuerpo: CUERPO }
    expect(mal.categoria).toBe('marketing')
  })

  it('sin la variable en el entorno real, enviarCorreo no envía', async () => {
    vi.stubEnv('CORREO_ENVIO', '')
    vi.stubEnv('CORREO_TRANSACCIONAL', '1')
    const r = await enviarCorreo(libro.db as never, base('transaccional', 'bienvenida'), { entornoCupo: 'produccion' })
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'envio_apagado' })
    expect(peticiones).toEqual([])
  })
})

describe('barrera estructural: la compuerta se comprueba ANTES de reservar cupo o llamar al proveedor', () => {
  const leer = (f: string) => readFileSync(new URL(`../src/lib/correo/${f}`, import.meta.url), 'utf8')
  it('emisor.ts: `envioHabilitado` aparece antes de `reservarCupo` y de `llamarResend`', () => {
    const s = leer('emisor.ts')
    const i = s.indexOf('envioHabilitado()')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(s.indexOf('await reservarCupo('))
    expect(i).toBeLessThan(s.indexOf('await llamarResend('))
  })
  it('enviar.ts: `envioHabilitado()` se comprueba antes de `reservarCupo` y de `llamarResend`', () => {
    const s = leer('enviar.ts')
    const i = s.indexOf('envioHabilitado()')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(s.indexOf('await reservarCupo('))
    expect(i).toBeLessThan(s.indexOf('await llamarResend('))
  })
  it('la compuerta solo se lee de la variable de entorno real: el pedido del emisor y EntornoCorreo no tienen ningún campo para saltarla', () => {
    const e = leer('emisor.ts'); const c = leer('config.ts'); const v = leer('enviar.ts')
    expect(e).not.toMatch(/\benvio\??:\s*boolean/)
    expect(e).not.toMatch(/p\.envio/)
    expect(c).not.toMatch(/\benvio:\s*boolean/)
    expect(v).not.toMatch(/env\.envio/)
  })
  it('ningún archivo de src le pasa argumentos a `envioHabilitado`: siempre lee la variable de entorno real', () => {
    const raiz = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const archivos: string[] = []
    const recorrer = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) recorrer(p); else if (/\.(ts|tsx)$/.test(e.name)) archivos.push(p) } }
    recorrer(decodeURIComponent(raiz))
    const malos = archivos.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const)
      .filter(([, , l]) => /envioHabilitado\(/.test(l) && !/envioHabilitado\(\)/.test(l) && !/export const envioHabilitado/.test(l)).map(([f2, n]) => `${f2}:${n}`))
    expect(archivos.length).toBeGreaterThan(50)
    expect(malos).toEqual([])
  })
  it('los avisos a clientes (tarea diaria) no tocan preferencias ni usuarios si la compuerta está apagada', () => {
    const s = readFileSync(new URL('../src/lib/avisos-cliente-servidor.ts', import.meta.url), 'utf8')
    const i = s.indexOf('envioHabilitado()')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(s.indexOf("leerPreferencias(db, uids)"))
  })
})
