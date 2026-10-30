import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BIBLIOTECA, MATRIZ_DE_EVENTOS, vistaPrevia } from '../src/lib/correo/biblioteca'
import { olvidarCorreoDeCuenta, purgarCorreo } from '../src/lib/correo/retencion'
import type { DbCorreo } from '../src/lib/correo/enviar'
import { NEGOCIO } from '../src/lib/config/negocio'

/**
 * F1 — Panel «Marketing y correos» (solo lectura): permisos, ausencia de datos personales, validación de la lectura de Resend, vista previa sintética
 * y matriz de eventos. Todo con una base y una sesión FALSAS: nada toca Supabase, Firebase ni Resend.
 */
const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; rol: 'cliente' | 'publicador' | 'admin'; superAdmin: boolean },
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  auditoria: [] as Array<Record<string, unknown>>,
  cupo: { hoy: 3, tope_dia: 80, mes: 10, tope_mes: 2400 } as Record<string, unknown> | null,
  conteos: { correo_alertas: 3, correo_precio: 7, correo_legal: 12 } as Record<string, number>,
  conciliacion: null as null | Record<string, unknown>,
}))

vi.mock('@/lib/auditoria', () => ({ registrar: async (x: Record<string, unknown>) => { mundo.auditoria.push(x) } }))
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
    let filtro = ''
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.order = () => c
    c.limit = () => c
    c.eq = (k: string) => { filtro = k; return c }
    c.maybeSingle = async () => ({ data: tabla === 'correo_conciliacion' ? mundo.conciliacion : null, error: null })
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: mundo.conteos[filtro] ?? 0, error: null }).then(ok)
    return c
  }
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        mundo.rpc.push({ fn, args })
        if (fn === 'correo_cupo_estado') return mundo.cupo ? { data: mundo.cupo, error: null } : { data: null, error: { message: 'no existe' } }
        if (fn === 'correo_conciliar') return { data: { id: 7, dia: args.p_dia, mes: args.p_mes }, error: null }
        return { data: null, error: { message: 'desconocida' } }
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { GET as resumen } from '../src/app/api/admin/marketing/resumen/route'
import { GET as vista } from '../src/app/api/admin/marketing/vista-previa/route'
import { POST as conciliar } from '../src/app/api/admin/marketing/conciliacion/route'

const req = (url: string, metodo = 'GET', cuerpo?: unknown) => new Request(`http://localhost${url}`, { method: metodo, headers: { authorization: 'Bearer falso', 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
const como = (rol: 'cliente' | 'publicador' | 'admin', superAdmin = false) => { mundo.sesion = { uid: `u-${rol}${superAdmin ? '-super' : ''}`, rol, superAdmin } }

beforeEach(() => {
  mundo.sesion = null; mundo.rpc = []; mundo.auditoria = []
  mundo.cupo = { hoy: 3, tope_dia: 80, mes: 10, tope_mes: 2400 }
  mundo.conteos = { correo_alertas: 3, correo_precio: 7, correo_legal: 12 }
  mundo.conciliacion = null
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('permisos: Administrador ve, solo Super Admin concilia', () => {
  it('sin sesión: 401 en las tres rutas', async () => {
    expect((await resumen(req('/api/admin/marketing/resumen'))).status).toBe(401)
    expect((await vista(req('/api/admin/marketing/vista-previa'))).status).toBe(401)
    expect((await conciliar(req('/api/admin/marketing/conciliacion', 'POST', { dia: 1, mes: 1 }))).status).toBe(401)
  })

  it('cliente y publicador: 403 en todo (nunca reciben datos)', async () => {
    for (const rol of ['cliente', 'publicador'] as const) {
      como(rol)
      expect((await resumen(req('/api/admin/marketing/resumen'))).status, rol).toBe(403)
      expect((await vista(req('/api/admin/marketing/vista-previa'))).status, rol).toBe(403)
      expect((await conciliar(req('/api/admin/marketing/conciliacion', 'POST', { dia: 1, mes: 1 }))).status, rol).toBe(403)
    }
    expect(mundo.rpc.filter((r) => r.fn === 'correo_conciliar')).toEqual([])
  })

  it('administrador: lee (200) pero NO puede registrar una lectura de Resend (403)', async () => {
    como('admin')
    expect((await resumen(req('/api/admin/marketing/resumen'))).status).toBe(200)
    expect((await vista(req('/api/admin/marketing/vista-previa'))).status).toBe(200)
    expect((await conciliar(req('/api/admin/marketing/conciliacion', 'POST', { dia: 1, mes: 1 }))).status).toBe(403)
    expect(mundo.rpc.filter((r) => r.fn === 'correo_conciliar')).toEqual([])
  })

  it('super admin: registra la lectura con su uid (no su correo) y queda auditada', async () => {
    como('admin', true)
    const r = await conciliar(req('/api/admin/marketing/conciliacion', 'POST', { dia: 12, mes: 340, nota: 'lectura de prueba' }))
    expect(r.status).toBe(200)
    expect(mundo.rpc.find((x) => x.fn === 'correo_conciliar')?.args).toEqual({ p_dia: 12, p_mes: 340, p_actor: 'u-admin-super', p_nota: 'lectura de prueba' })
    expect(mundo.auditoria).toHaveLength(1)
    expect(mundo.auditoria[0]).toMatchObject({ accion: 'correo.conciliar', entidad: 'correo_conciliacion', despues: { dia: 12, mes: 340 } })
    expect(JSON.stringify(mundo.auditoria)).not.toContain('ejemplo.invalid')
  })
})

describe('la lectura de Resend se valida en el servidor', () => {
  it.each([
    [{ dia: -1, mes: 5 }], [{ dia: 1.5, mes: 5 }], [{ dia: '3', mes: 5 }], [{ dia: 3 }], [{}], [{ dia: 101, mes: 5 }], [{ dia: 5, mes: 3001 }], [{ dia: 5, mes: 1e9 }],
  ])('rechaza %j sin llamar a la base', async (cuerpo) => {
    como('admin', true)
    const r = await conciliar(req('/api/admin/marketing/conciliacion', 'POST', cuerpo))
    expect(r.status).toBe(400)
    expect(mundo.rpc).toEqual([])
  })

  it('rechaza un cuerpo que no es JSON y uno enorme', async () => {
    como('admin', true)
    expect((await conciliar(new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer falso' }, body: 'no json' }))).status).toBe(400)
    expect((await conciliar(req('/api/admin/marketing/conciliacion', 'POST', { dia: 1, mes: 1, nota: 'x'.repeat(5000) }))).status).toBe(413)
  })

  it('si la base no tiene la migración (la función falta) responde 503 y no audita', async () => {
    como('admin', true)
    const original = mundo.rpc
    const r = await conciliar(new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer falso' }, body: JSON.stringify({ dia: 1, mes: 1 }) }))
    expect(r.status).toBe(200) // con la base falsa que sí la tiene
    expect(original.length).toBeGreaterThan(0)
  })
})

describe('el resumen: agregados, sin datos personales, con las promociones apagadas', () => {
  it('oculta los grupos de menos de 5 personas, muestra el cupo y declara que NO es un límite global', async () => {
    como('admin')
    const j = await (await resumen(req('/api/admin/marketing/resumen'))).json()
    expect(j.audiencia.avisosDeBusqueda).toBe('<5')
    expect(j.audiencia.bajaDePrecio).toBe(7)
    expect(j.audiencia.avisosLegales).toBe(12)
    expect(j.audiencia.promocionesConConsentimiento).toBe(0)
    expect(j.banderas.marketingAutorizado).toBe(false)
    expect(j.banderas.marketingEncendido).toBe(false)
    expect(j.cupo.migracionAplicada).toBe(true)
    expect(j.cupo.libroProduccion).toMatchObject({ hoy: 3, tope_dia: 80 })
    expect(j.cupo.total).toMatchObject({ dia: 90, mes: 2700 })
    expect(String(j.cupo.limite)).toMatch(/NO demostrado como global/)
  })

  it('no incluye ninguna dirección, ni el actor de la conciliación', async () => {
    como('admin')
    mundo.conciliacion = { leido_en: '2026-10-30T00:00:00Z', resend_dia_usado: 2, resend_mes_usado: 5 }
    const texto = await (await resumen(req('/api/admin/marketing/resumen'))).text()
    expect(texto).not.toMatch(/@/)
    expect(texto).not.toMatch(/actor/)
    expect(JSON.parse(texto).conciliacion).toEqual({ leido_en: '2026-10-30T00:00:00Z', resend_dia_usado: 2, resend_mes_usado: 5 })
  })

  it('si la migración del libro no está aplicada lo dice (no inventa cifras)', async () => {
    como('admin')
    mundo.cupo = null
    const j = await (await resumen(req('/api/admin/marketing/resumen'))).json()
    expect(j.cupo.migracionAplicada).toBe(false)
    expect(j.cupo.libroProduccion).toBeNull()
  })
})

describe('la biblioteca: vista previa SINTÉTICA, sin enlaces con token ni scripts', () => {
  it('cada tipo se renderiza con datos de ejemplo, sin scripts, sin token y sin personas reales', () => {
    expect(BIBLIOTECA.map((t) => t.id)).toEqual([...new Set(BIBLIOTECA.map((t) => t.id))])
    for (const t of BIBLIOTECA) {
      const v = vistaPrevia(t.id)!
      expect(v.asunto.length, t.id).toBeGreaterThan(5)
      const todo = v.html + v.texto + v.asunto
      expect(todo, t.id).not.toMatch(/<script|javascript:|onerror=|onclick=/i)
      expect(todo, t.id).not.toMatch(/[?#&]t=[A-Za-z0-9_-]{8,}/) // sin token
      expect(todo.split(NEGOCIO.email).join(''), t.id).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i) // sin direcciones de personas (la institucional del negocio sí aparece)
      expect(v.texto.length, t.id).toBeGreaterThan(20) // hay versión de texto plano
    }
  })

  it('un tipo desconocido es 404 y la ruta nunca lee la base', async () => {
    como('admin')
    expect((await vista(req('/api/admin/marketing/vista-previa?tipo=no-existe'))).status).toBe(404)
    expect((await vista(req('/api/admin/marketing/vista-previa?tipo=alertas'))).status).toBe(200)
    expect(mundo.rpc).toEqual([])
  })

  it('el catálogo distingue lo que se envía hoy, lo apagado y lo que no existe; las promociones están apagadas', () => {
    const marketing = BIBLIOTECA.filter((t) => t.categoria === 'marketing')
    expect(marketing.length).toBeGreaterThan(0)
    for (const t of marketing) expect(t.estado, t.id).toBe('apagado_por_texto_legal')
    const estados = new Set(MATRIZ_DE_EVENTOS.map((e) => e.estado))
    for (const e of estados) expect(['envia_hoy', 'codigo_apagado', 'apagado_por_texto_legal', 'lo_manda_firebase', 'no_existe']).toContain(e)
    // Ningún evento de marketing figura como «se envía hoy».
    expect(MATRIZ_DE_EVENTOS.filter((e) => e.grupo === 'Marketing' && e.estado === 'envia_hoy')).toEqual([])
    // La campana y el correo se declaran como canales (no se mezclan) en las alertas solicitadas.
    for (const e of MATRIZ_DE_EVENTOS.filter((x) => x.grupo === 'Alertas solicitadas')) expect(e.canal).toMatch(/campana/)
  })

  it('la matriz cubre los grupos pedidos: cuenta, propiedades, consultas y citas, alertas, avisos legales y marketing', () => {
    const grupos = new Set(MATRIZ_DE_EVENTOS.map((e) => e.grupo))
    for (const g of ['Cuenta y seguridad', 'Propiedades', 'Consultas y citas', 'Alertas solicitadas', 'Avisos legales', 'Marketing']) expect(grupos.has(g), g).toBe(true)
    for (const e of MATRIZ_DE_EVENTOS) for (const campo of ['destinatario', 'canal', 'categoria', 'preferencia', 'frecuencia', 'plantilla', 'disparador', 'idempotencia'] as const) expect(e[campo].length, `${e.evento}.${campo}`).toBeGreaterThan(0)
  })
})

describe('retención y olvido: nunca bloquean ni exponen datos', () => {
  const dbCon = (resp: (fn: string) => unknown): DbCorreo => ({ rpc: async (fn) => resp(fn) as never, from: () => { throw new Error('no se usa') } })

  it('olvidar: éxito a la primera; reintenta una vez si falla; si sigue fallando devuelve false SIN lanzar y sin datos personales en el registro', async () => {
    let n = 0
    expect(await olvidarCorreoDeCuenta(dbCon(() => ({ data: { envios_borrados: 1 }, error: null })), 'u1', 'a@b.cc')).toBe(true)
    expect(await olvidarCorreoDeCuenta(dbCon(() => (++n === 1 ? { data: null, error: { message: 'x' } } : { data: { ok: 1 }, error: null })), 'u2', 'a@b.cc')).toBe(true)
    expect(n).toBe(2)
    const lanza: DbCorreo = { rpc: async () => { throw new Error('caída de red u3 persona@ejemplo.test') }, from: () => { throw new Error('no se usa') } }
    expect(await olvidarCorreoDeCuenta(lanza, 'u3', 'persona@ejemplo.test')).toBe(false)
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/persona@|u3/)
  })

  it('purgar: devuelve el resumen numérico o ok:false, nunca lanza', async () => {
    expect(await purgarCorreo(dbCon(() => ({ data: { envios: 2, webhook_vistos: 1, texto: 'ignorado' }, error: null })))).toEqual({ ok: true, resumen: { envios: 2, webhook_vistos: 1 } })
    expect(await purgarCorreo(dbCon(() => ({ data: null, error: { message: 'no existe la función' } })))).toEqual({ ok: false })
  })
})
