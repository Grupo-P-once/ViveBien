import { describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * P3-01 (V-1.1.82): ningún correo ni página de citas puede llevar a una
 * pantalla que no existe.
 */
const espias = vi.hoisted(() => ({ exigir: 0, crear: 0 }))

vi.mock('@/lib/config/flags-servidor', async (original) => ({
  ...(await original<typeof import('../src/lib/config/flags')>()),
  flagEncendido: async () => false,
}))
vi.mock('@/lib/auth-server', async (original) => ({
  ...(await original<typeof import('../src/lib/auth-server')>()),
  exigir: async () => { espias.exigir++; return { perfil: { uid: 'u', rol: 'cliente', superAdmin: false, estado: 'activo' } } },
}))
vi.mock('@/lib/citas/servicio', async (original) => ({
  ...(await original<typeof import('../src/lib/citas/servicio')>()),
  createAppointment: async () => { espias.crear++; return { ok: true, valor: {} } },
}))

import { RUTAS_DE_VISITAS, rutaDeVisitas } from '../src/lib/citas/enlaces'
import { enlaceParaVer } from '../src/lib/citas/enviar'
import { FLAGS, FLAGS_APAGADOS } from '../src/lib/config/flags'
import { POST } from '../src/app/api/citas/route'

const SRC = join(__dirname, '..', 'src')
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
const existePagina = (ruta: string) => existsSync(join(SRC, 'app', ruta.replace(/^\//, ''), 'page.tsx'))

describe('las rutas de citas salen de un solo lugar', () => {
  it('cliente → /portal/citas; equipo → /admin/citas; publicador y propietario → /publicador/citas (con la cita marcada)', () => {
    expect(rutaDeVisitas('cliente')).toBe('/portal/citas')
    expect(rutaDeVisitas('cliente', 'c 1')).toBe('/portal/citas?cita=c%201')
    expect(rutaDeVisitas('equipo')).toBe('/admin/citas')
    expect(rutaDeVisitas('equipo', 'c1')).toBe('/admin/citas?cita=c1')
    expect(rutaDeVisitas('publicador', 'c1')).toBe('/publicador/citas?cita=c1')
    // El propietario (D-1) cae en su pestaña de solo lectura.
    expect(rutaDeVisitas('propietario')).toBe('/publicador/citas?vista=propiedades')
    expect(rutaDeVisitas('propietario', 'c1')).toBe('/publicador/citas?vista=propiedades&cita=c1')
  })

  it('los correos usan esas rutas', () => {
    expect(enlaceParaVer('c1', 'cliente')).toMatch(/\/portal\/citas\?cita=c1$/)
    expect(enlaceParaVer('c1', 'asesor')).toMatch(/\/admin\/citas\?cita=c1$/)
    expect(enlaceParaVer('c1', 'asesor', true)).toMatch(/\/publicador\/citas\?cita=c1$/)
  })

  it('nadie más escribe la ruta vieja a mano: /portal/visitas y /admin/calendario ya no aparecen', () => {
    const culpables = archivos(SRC)
      .filter((p) => !p.replace(/\\/g, '/').endsWith('lib/citas/enlaces.ts'))
      .filter((p) => readFileSync(p, 'utf8').split('\n').some((l) =>
        !/^\s*(\/\/|\*)/.test(l) && /['"`]\/portal\/visitas|\/admin\/calendario/.test(l)))
      .map((p) => relative(SRC, p))
    expect(culpables).toEqual([])
  })
})

describe('ningún enlace puede apuntar a una pantalla que no existe', () => {
  it('cada ruta de RUTAS_DE_VISITAS tiene su pantalla (un correo o aviso nunca lleva a un 404)', () => {
    for (const [quien, ruta] of Object.entries(RUTAS_DE_VISITAS)) {
      expect(existePagina(ruta), `${quien} → ${ruta}`).toBe(true)
    }
  })

  it('la ruta vieja /portal/visitas sigue existiendo solo para redirigir a /portal/citas', () => {
    const p = join(SRC, 'app', 'portal', 'visitas', 'page.tsx')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8')).toMatch(/redirect\(['"`]\/portal\/citas/)
  })

  it('`citasEnLinea` nace apagado: crear citas está cerrado hasta que el dueño lo encienda', () => {
    expect(FLAGS as readonly string[]).toContain('citasEnLinea')
    expect(FLAGS_APAGADOS.citasEnLinea).toBe(false)
  })

  it('con el flag apagado, POST /api/citas responde 409 antes de leer la sesión y no crea nada', async () => {
    const r = await POST(new Request('https://vivebienn.com/api/citas', {
      method: 'POST',
      headers: { 'idempotency-key': 'a'.repeat(32), 'content-type': 'application/json' },
      body: JSON.stringify({ propiedadId: 'p-1', inicio: '2026-10-01T11:00:00-06:00' }),
    }))
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ citasEnLinea: false })
    expect(espias.exigir).toBe(0)
    expect(espias.crear).toBe(0)
  })
})
