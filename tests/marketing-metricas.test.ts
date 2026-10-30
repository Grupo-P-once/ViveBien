import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ruta /api/admin/marketing/metricas: permisos en el servidor, validación de filtros, origen y entorno de los datos, datos de demostración separados de los
 * reales, y que NUNCA se pidan columnas con direcciones. Base y sesión FALSAS: nada toca Supabase, Firebase ni Resend.
 */
type Consulta = { tabla: string; cols: string; filtros: Array<[string, string, unknown]>; head: boolean; rango?: [number, number] }
const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; rol: 'cliente' | 'publicador' | 'admin'; superAdmin: boolean },
  tablas: {} as Record<string, Record<string, unknown>[] | null>,
  consultas: [] as Array<Consulta>,
}))

vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const autorizar = real.crearAutorizador({
    verificar: async () => (mundo.sesion ? { uid: mundo.sesion.uid, email: 'quien@ejemplo.invalid', emailVerified: true, authTime: Math.floor(Date.now() / 1000) } : null),
    perfil: async (u) => ({ ...u, rol: mundo.sesion!.rol, superAdmin: mundo.sesion!.superAdmin, estado: 'activo' as never, nombre: null }),
    denegado: async () => {},
  })
  const cadena = (tabla: string): Record<string, unknown> => {
    const consulta: Consulta = { tabla, cols: '', filtros: [], head: false }
    mundo.consultas.push(consulta)
    const c: Record<string, unknown> = {}
    c.select = (cols: string, opts?: { head?: boolean }) => { consulta.cols = cols; consulta.head = Boolean(opts?.head); return c }
    for (const op of ['eq', 'gte', 'lt']) c[op] = (k: string, v: unknown) => { consulta.filtros.push([op, k, v]); return c }
    c.order = () => c
    c.range = (a: number, b: number) => { consulta.rango = [a, b]; return c }
    c.then = (ok: (v: unknown) => unknown) => {
      const filas = mundo.tablas[tabla]
      if (filas === null || filas === undefined) return Promise.resolve({ data: null, count: null, error: { message: 'no existe' } }).then(ok)
      const r = filas.filter((f) => consulta.filtros.every(([op, k, v]) => (op === 'eq' ? f[k] === v : op === 'gte' ? String(f[k]) >= String(v) : String(f[k]) < String(v))))
      if (consulta.head) return Promise.resolve({ count: r.length, error: null }).then(ok)
      const [a, b] = consulta.rango ?? [0, 999]
      return Promise.resolve({ data: r.slice(a, b + 1), error: null }).then(ok)
    }
    return c
  }
  return {
    ...real,
    supabaseAdmin: () => ({ from: (t: string) => cadena(t), rpc: async () => ({ data: null, error: { message: 'no' } }) }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { GET } from '../src/app/api/admin/marketing/metricas/route'

const pedir = (url = '') => GET(new Request(`http://localhost/api/admin/marketing/metricas${url}`, { headers: { authorization: 'Bearer falso' } }))
const como = (rol: 'cliente' | 'publicador' | 'admin', superAdmin = false) => { mundo.sesion = { uid: `u-${rol}`, rol, superAdmin } }
const envio = (categoria: string, estado: string, dia: string, entorno: string, tipo = 'alertas') => ({ categoria, tipo, estado, entorno, creado_en: `${dia}T18:00:00.000Z` })
const muchos = (n: number, ...a: Parameters<typeof envio>) => Array.from({ length: n }, () => envio(...a))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-30T20:00:00Z'))
  mundo.sesion = null; mundo.consultas = []
  mundo.tablas = { correo_envios: [], correo_suscriptores: [], correo_webhook_vistos: [] }
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('permisos (en el servidor)', () => {
  it('sin sesión 401; cliente y publicador 403; ninguno toca la base', async () => {
    expect((await pedir()).status).toBe(401)
    for (const rol of ['cliente', 'publicador'] as const) { como(rol); expect((await pedir()).status, rol).toBe(403) }
    expect(mundo.consultas).toEqual([])
  })
  it('Administrador y Super Admin ven los resultados', async () => {
    como('admin'); expect((await pedir()).status).toBe(200)
    como('admin', true); expect((await pedir()).status).toBe(200)
  })
})

describe('filtros validados', () => {
  it('rechaza periodos no permitidos, rangos malos, tipos raros, grupos y campañas inexistentes', async () => {
    como('admin')
    for (const q of ['?dias=15', '?dias=abc', '?desde=2026-10-29&hasta=2026-10-20', '?desde=2026-10-01&hasta=2026-12-01', '?desde=2026-02-30&hasta=2026-03-01', '?tipo=a%20b%3B--', '?grupo=todo', '?campana=abril']) {
      expect((await pedir(q)).status, q).toBe(400)
    }
    expect((await pedir('?campana=todas')).status).toBe(200)
    expect((await pedir('?desde=2026-10-01&hasta=2026-10-30&tipo=alertas&grupo=servicio')).status).toBe(200)
  })
})

describe('datos reales: entorno, origen y privacidad', () => {
  it('en un Preview lee SOLO la rebanada «pruebas», la rotula como staging simulado y nunca como producción', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    como('admin')
    mundo.tablas.correo_envios = [...muchos(6, 'servicio', 'entregado', '2026-10-28', 'pruebas'), ...muchos(9, 'servicio', 'entregado', '2026-10-28', 'produccion')]
    const j = await (await pedir('?dias=7')).json()
    expect(j.origen).toMatchObject({ tipo: 'real', entorno: 'preview_staging' })
    expect(j.origen.descripcion).toMatch(/SIMULADOS/)
    expect(j.origen.descripcion).not.toMatch(/Base de producción/)
    expect(j.resultado.bloques[0].totales.enviados).toBe(6)
    const lectura = mundo.consultas.find((c) => c.tabla === 'correo_envios')!
    expect(lectura.filtros).toContainEqual(['eq', 'entorno', 'pruebas'])
    expect(j.zona).toBe('America/Mexico_City')
  })
  it('en producción lee la rebanada «produccion» y la rotula como producción', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    como('admin')
    mundo.tablas.correo_envios = [...muchos(7, 'servicio', 'entregado', '2026-10-28', 'produccion'), ...muchos(3, 'servicio', 'entregado', '2026-10-28', 'pruebas')]
    const j = await (await pedir('?dias=7')).json()
    expect(j.origen).toMatchObject({ tipo: 'real', entorno: 'produccion' })
    expect(j.resultado.bloques[0].totales.enviados).toBe(7)
    expect(mundo.consultas.find((c) => c.tabla === 'correo_envios')!.filtros).toContainEqual(['eq', 'entorno', 'produccion'])
  })
  it('nunca pide direcciones, huellas ni nombres: sólo columnas agregables', async () => {
    como('admin')
    await pedir('?dias=7')
    const cols = mundo.consultas.map((c) => c.cols).join(',')
    expect(cols).not.toMatch(/email|hash|nombre|uid|resend_id|error/i)
  })
  it('con staging vacío devuelve ceros y estados vacíos, sin rellenar con datos simulados', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    como('admin')
    const j = await (await pedir('?dias=30')).json()
    expect(j.origen.tipo).toBe('real')
    for (const b of j.resultado.bloques) { expect(b.totales.enviados).toBe(0); expect(b.tasas.every((t: { valor: number | null }) => t.valor === null)).toBe(true) }
  })
  it('con la migración sin aplicar lo dice claramente en vez de mostrar ceros', async () => {
    como('admin')
    mundo.tablas.correo_envios = null
    const j = await (await pedir()).json()
    expect(j).toMatchObject({ disponible: false, motivo: 'libro_sin_migracion' })
    expect(j.resultado).toBeUndefined()
  })
  it('las bajas promocionales y las acumuladas vienen de correo_suscriptores', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    como('admin')
    mundo.tablas.correo_envios = muchos(10, 'marketing', 'entregado', '2026-10-27', 'pruebas', 'recomendaciones')
    mundo.tablas.correo_suscriptores = [
      ...Array.from({ length: 6 }, () => ({ estado: 'baja', baja_en: '2026-10-28T18:00:00.000Z' })),
      ...Array.from({ length: 3 }, () => ({ estado: 'baja', baja_en: '2026-09-01T18:00:00.000Z' })),
      { estado: 'activa', baja_en: null },
    ]
    const j = await (await pedir('?dias=7&grupo=promocional')).json()
    expect(j.resultado.bloques[0].bajas).toMatchObject({ enPeriodo: 6, vigentes: 9, acumuladasAntes: 3 })
  })
  it('informa si el webhook de Resend está configurado y cuántos eventos se recibieron', async () => {
    como('admin')
    mundo.tablas.correo_webhook_vistos = [{ svix_id: 'a' }, { svix_id: 'b' }]
    const j = await (await pedir()).json()
    expect(j.fuentes).toMatchObject({ eventosDelProveedor: 2 })
    expect(typeof j.fuentes.webhookConfigurado).toBe('boolean')
  })
})

describe('datos de demostración', () => {
  it('en un Preview, demo=1 devuelve datos sintéticos rotulados, sin leer la base y sin mezclar los reales', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    como('admin')
    mundo.tablas.correo_envios = muchos(6, 'servicio', 'entregado', '2026-10-28', 'pruebas')
    const j = await (await pedir('?dias=30&demo=1')).json()
    expect(j.origen.tipo).toBe('demostracion')
    expect(j.origen.descripcion).toMatch(/DATOS DE EJEMPLO/)
    expect(mundo.consultas.filter((c) => c.tabla.startsWith('correo_'))).toEqual([])
    const real = await (await pedir('?dias=30')).json()
    expect(real.origen.tipo).toBe('real')
    expect(real.resultado.bloques[0].totales.enviados).toBe(6)
    expect(j.resultado.bloques[0].totales.enviados).not.toBe(6)
  })
  it('en producción demo=1 se rechaza (no existe)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    como('admin')
    expect((await pedir('?demo=1')).status).toBe(400)
  })
})

describe('webhook de Resend y métricas no disponibles (ruta)', () => {
  const datos = () => { mundo.tablas.correo_envios = [...muchos(8, 'servicio', 'enviado', '2026-10-28', 'pruebas'), ...muchos(3, 'servicio', 'error', '2026-10-28', 'pruebas')] }
  it('sin RESEND_WEBHOOK_SECRET: entregados, rebotes y quejas salen null y se avisa; enviados y fallos se conservan', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    como('admin'); datos()
    const j = await (await pedir('?dias=7&grupo=servicio')).json()
    expect(j.fuentes.webhookConfigurado).toBe(false)
    expect(j.resultado.bloques[0].totales).toMatchObject({ enviados: 8, entregados: null, rebotes: null, quejas: null, fallos: '<5' })
    expect(j.resultado.noDisponibles[0].motivo).toMatch(/webhook/)
  })
  it('con el webhook configurado se muestran las cifras (cero si no hubo eventos)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_sintetico')
    como('admin'); datos()
    const j = await (await pedir('?dias=7&grupo=servicio')).json()
    expect(j.fuentes.webhookConfigurado).toBe(true)
    expect(j.resultado.bloques[0].totales.entregados).toBe(0)
    expect(j.resultado.noDisponibles).toBeUndefined()
  })
  it('los datos de ejemplo no se marcan como no disponibles (son sintéticos y completos)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    como('admin')
    const j = await (await pedir('?dias=30&demo=1')).json()
    expect(j.resultado.bloques[0].totales.entregados).not.toBeNull()
    expect(j.resultado.noDisponibles).toBeUndefined()
  })
})
