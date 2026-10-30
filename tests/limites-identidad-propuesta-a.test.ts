import { beforeEach, describe, expect, it } from 'vitest'
import { memoria, reiniciarAlmacen } from '../src/lib/limites-almacen'
import { frenarAsync, origenDe } from '../src/lib/limites'

/**
 * PROPUESTA A de la auditoría del rol cliente (28-oct-2026) — PRUEBAS DEL ESQUEMA DE CLAVES, NO de las rutas (las rutas NO se han modificado y la solución
 * NO está aprobada para producción). Datos sintéticos; sin red ni base.
 *
 * Hoy 15 archivos limitan por IP (`origenDe`) aunque el cliente ya tenga sesión. Dos consecuencias que estas pruebas dejan ESCRITAS:
 *   · falso positivo: dos personas detrás de la misma IP (oficina, wifi compartido, CGNAT) se reparten UN cupo;
 *   · evasión (donde el servidor respeta `x-forwarded-for`, p. ej. local): una persona cambia la cabecera y obtiene cupos nuevos.
 * Propuesta A: con sesión la clave es el `uid` verificado; sin sesión, la IP. El prefijo `u:`/`ip:` evita que un valor de IP coincida con un uid.
 */
const TOPE = { maximo: 5, ventanaMs: 60_000 }
const ruta = 'favoritos'
const pedido = (ip: string) => new Request('http://localhost/api/x', { method: 'POST', headers: { 'x-forwarded-for': ip } })

// Esquema ACTUAL (tal cual lo escriben las rutas): `ruta:${origenDe(req)}`.
const claveActual = (req: Request) => `${ruta}:${origenDe(req)}`
// Esquema PROPUESTO A: con sesión, el uid; sin sesión, la IP. Prefijos distintos.
const claveA = (req: Request, uid?: string | null) => (uid ? `${ruta}:u:${uid}` : `${ruta}:ip:${origenDe(req)}`)

/** Cuántas peticiones seguidas pasan antes del primer 429 (hasta `techo`). */
async function pasan(clave: () => string, n: number) {
  let ok = 0
  for (let i = 0; i < n; i++) { if ((await frenarAsync(clave(), TOPE)) === null) ok++ }
  return ok
}

beforeEach(() => { memoria.vaciar(); reiniciarAlmacen() })

describe('ESTADO ACTUAL (clave por IP): documenta el falso positivo y la evasión', () => {
  it('falso positivo: dos personas distintas detrás de la MISMA IP se reparten un solo cupo', async () => {
    const ana = pedido('198.51.100.7'), beto = pedido('198.51.100.7')
    expect(await pasan(() => claveActual(ana), 5)).toBe(5)       // Ana agota el cupo de la IP
    expect(await pasan(() => claveActual(beto), 5)).toBe(0)      // Beto, otra persona, queda bloqueado sin haber hecho nada
  })
  it('evasión (servidor que respeta x-forwarded-for): una persona cambia la cabecera y obtiene cupos nuevos', async () => {
    let i = 0
    const rotando = () => claveActual(pedido(`198.51.100.${++i}`))
    expect(await pasan(rotando, 40)).toBe(40)                    // 40 de 40 pasan con tope 5: no hay límite efectivo
  })
})

describe('PROPUESTA A (clave por uid con sesión, IP sin sesión)', () => {
  it('dos uid detrás de la MISMA IP tienen cupos INDEPENDIENTES (se elimina el falso positivo)', async () => {
    const mismaIp = pedido('198.51.100.7')
    expect(await pasan(() => claveA(mismaIp, 'uid-ana'), 5)).toBe(5)
    expect(await pasan(() => claveA(mismaIp, 'uid-ana'), 3)).toBe(0)   // Ana sí queda frenada al pasarse
    expect(await pasan(() => claveA(mismaIp, 'uid-beto'), 5)).toBe(5)  // Beto conserva su cupo completo
  })
  it('un mismo uid con IP/cabecera CAMBIANTE sigue en el mismo cupo (se elimina la evasión)', async () => {
    let i = 0
    const rotando = () => claveA(pedido(`198.51.100.${++i}`), 'uid-ana')
    expect(await pasan(rotando, 40)).toBe(5)                     // solo 5 de 40 pasan, por mucho que cambie la IP
  })
  it('sin sesión se cae a la IP: dos anónimos en la misma IP comparten cupo (límite conocido de la propuesta)', async () => {
    const a = pedido('198.51.100.9'), b = pedido('198.51.100.9')
    expect(await pasan(() => claveA(a, null), 5)).toBe(5)
    expect(await pasan(() => claveA(b, undefined), 1)).toBe(0)
  })
  it('un valor de IP no puede colisionar con un uid (prefijos u:/ip:)', async () => {
    const ipQueParecidoAUid = pedido('uid-ana')                  // cabecera hostil con el mismo texto que un uid
    expect(await pasan(() => claveA(ipQueParecidoAUid, null), 5)).toBe(5)
    expect(await pasan(() => claveA(pedido('1.1.1.1'), 'uid-ana'), 5)).toBe(5) // el cupo del uid real no se tocó
  })
  it('la clave nunca queda vacía ni compartida por todos: sin uid y sin cabecera cae a un cubo propio «desconocido», sin mezclar con uid', async () => {
    const sinCabecera = new Request('http://localhost/api/x', { method: 'POST' })
    expect(claveA(sinCabecera, null)).toBe(`${ruta}:ip:desconocido`)
    expect(claveA(sinCabecera, 'uid-ana')).toBe(`${ruta}:u:uid-ana`)
  })
})
