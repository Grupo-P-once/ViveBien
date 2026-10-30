import { describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

/**
 * Tokens FALSIFICADOS contra `verifyIdToken` (la frontera de todas las rutas protegidas): todos deben dar `null` SIN red (la red está simulada como
 * caída). Cubre la regresión «alguien sustituye la verificación por una decodificación sin firma» o «acepta alg: none / HS256». LÍMITE HONESTO: si solo se
 * quitara `algorithms: ['RS256']`, `jose` seguiría rechazando estos casos (no hay clave que resolver), así que esa línea concreta no la protege esta prueba;
 * la protege la revisión de código y la prueba de integración en el Preview (60 respuestas 401 con tokens falsos). En Vercel el WAF además bloquea `alg: none`
 * (403 `x-vercel-mitigated: deny`), pero eso no es nuestro código.
 */
vi.mock('firebase-admin', () => ({}))

const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const ahora = Math.floor(Date.now() / 1000)
const PROYECTO = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'vivebien-84685'
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROYECTO}`, aud: PROYECTO, sub: 'zz-falso', user_id: 'zz-falso', iat: ahora - 60, exp: ahora + 3600,
  email: 'falso@example.invalid', email_verified: true, ...extra,
})
const pedir = (token: string | null) => new Request('https://vivebienn.com/api/usuarios/me', { headers: token === null ? {} : { authorization: `Bearer ${token}` } })

async function verificar(token: string | null) {
  const { verifyIdToken } = await import('../src/lib/auth-server')
  return verifyIdToken(pedir(token))
}

describe('verifyIdToken rechaza tokens falsificados (sin red)', () => {
  const red = vi.fn(() => Promise.reject(new Error('sin red en esta prueba')))
  vi.stubGlobal('fetch', red)

  it('sin cabecera Authorization → null', async () => { expect(await verificar(null)).toBeNull() })
  it('«Bearer » vacío y basura → null', async () => {
    for (const t of ['', 'esto-no-es-un-token', 'a.b.c', 'a'.repeat(10_000)]) expect(await verificar(t), t.slice(0, 12)).toBeNull()
  })
  it('alg: none con las afirmaciones de un administrador → null', async () => {
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims({ rol: 'super_admin', admin: true }))}.`
    expect(await verificar(t)).toBeNull()
  })
  it('alg: none con firma vacía o con firma ajena → null', async () => {
    const base = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims())}`
    expect(await verificar(base + '.')).toBeNull()
    expect(await verificar(base + '.' + b64(crypto.randomBytes(32)))).toBeNull()
  })
  it('HS256 firmado con una clave inventada (confusión de algoritmo) → null', async () => {
    const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(claims())
    const firma = crypto.createHmac('sha256', 'clave-inventada').update(`${h}.${p}`).digest('base64url')
    expect(await verificar(`${h}.${p}.${firma}`)).toBeNull()
  })
  it('control positivo: los casos anteriores se rechazan por el ALGORITMO, no por un fallo de red genérico', async () => {
    const { jwtVerify } = await import('jose')
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims())}.`
    await expect(jwtVerify(t, new TextEncoder().encode('x'), { algorithms: ['RS256'] })).rejects.toThrow(/alg/i)
  })
})
