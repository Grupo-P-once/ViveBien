import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { crearLibro, type Libro } from './dobles/libro-cupo'
import { mandar, sinCorreos } from '../src/lib/citas/enviar'

process.env.CORREO_ENVIO = '1'

/**
 * Revisión de Semgrep (5-nov-2026): el texto de error que `mandar` devuelve (y que se escribe en un registro de la plataforma y en `citas_correos.error`) podría repetir
 * la dirección del destinatario si el proveedor la incluye en su respuesta. Aquí el «proveedor» falso SÍ la repite, y se exige que no salga de `mandar` ni aparezca en consola.
 */
const libroH = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../src/lib/correo/libro', () => ({ dbDelLibro: () => libroH.db }))

const CORREO = 'persona.secreta@ejemplo.invalid'
let libro: Libro
let salida: string[]

beforeAll(async () => { libro = await crearLibro(); libroH.db = libro.db }, 60_000)
afterAll(async () => { await libro?.cerrar() })
beforeEach(async () => {
  await libro.vaciar()
  salida = []
  const guardar = (...a: unknown[]) => { salida.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  vi.spyOn(console, 'error').mockImplementation(guardar)
  vi.spyOn(console, 'warn').mockImplementation(guardar)
  vi.spyOn(console, 'log').mockImplementation(guardar)
  vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba_falsa')
  vi.stubEnv('CORREO_MODO_PRUEBAS', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const pedido = () => ({ clave: `cita/${crypto.randomUUID()}/v1/cliente`, para: CORREO, asunto: 'Tu visita', html: '<p>hola</p>', texto: 'hola' })

describe('mandar: el error devuelto no repite la dirección del destinatario', () => {
  it('un rechazo del proveedor que menciona la dirección sale con «[correo]»', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ name: 'validation_error', message: `The email ${CORREO} is not valid; try <${CORREO}>, ${CORREO}` }), { status: 422 }))
    const r = await mandar(pedido())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/^Resend 422/)
      expect(r.error).toContain('[correo]')
      expect(r.error).not.toContain(CORREO)
      expect(r.error).not.toContain('secreta@')
    }
    expect(salida.join('\n')).not.toContain(CORREO)
  })

  it('un fallo de red cuyo mensaje trae la dirección también sale sin ella', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error(`getaddrinfo falló para ${CORREO}`) })
    const r = await mandar(pedido())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain(CORREO)
    expect(salida.join('\n')).not.toContain(CORREO)
  })
})

describe('sinCorreos', () => {
  it('sustituye cada dirección y deja el resto del texto', () => {
    expect(sinCorreos(`a ${CORREO}, <b@c.d> y (e@f.g); sin dirección`)).toBe('a [correo], <[correo]> y ([correo]); sin dirección')
    expect(sinCorreos('Resend 500: error interno')).toBe('Resend 500: error interno')
    expect(sinCorreos('')).toBe('')
  })
})

describe('el registro de «no salió» (barrera estática)', () => {
  const fuente = readFileSync('src/lib/citas/enviar.ts', 'utf8')
  it('no interpola nada en la cadena de formato y no incluye la variable `email` (la dirección); `m.para` es solo el rol', () => {
    const completa = fuente.split('\n').find((l) => l.includes('console.error(') && l.includes('no salió')) ?? ''
    expect(completa).not.toBe('')
    const linea = completa.split(' // ')[0] // sólo el código, sin el comentario del final
    expect(linea).not.toMatch(/`/) // sin plantilla de texto en el primer argumento
    expect(linea).not.toMatch(/\bemail\b|destinatario_email|\.cliente_email/)
    expect(fuente).toMatch(/const email = m\.para === 'cliente'/) // `m.para` es 'cliente' | 'asesor'; la dirección vive en `email`
  })
})
