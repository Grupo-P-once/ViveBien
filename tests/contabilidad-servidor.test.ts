import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Rutas de contabilidad (25-oct-2026): solo Super Admin, validan en el servidor, la bitácora no guarda texto libre y el libro no tiene PATCH ni DELETE. */

type Perfil = { uid: string; email: string; rol: string; superAdmin: boolean }
const estado = vi.hoisted(() => ({
  perfil: null as null | Perfil,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respuesta: { data: { resultado: 'ok', id: '11111111-1111-4111-8111-111111111111' } as unknown, error: null as null | { message: string } },
  tablas: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
  cuentaAntes: { activa: true } as null | { activa: boolean; nombre?: string; categoria?: string; identificador?: string | null },
  consultas: [] as string[],
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  function cadena(tabla: string) {
    const c: Record<string, unknown> = {
      select: (cols: string) => { estado.consultas.push(`${tabla}: ${cols}`); return c },
      order: () => c, limit: () => c, in: () => c, eq: () => c,
      maybeSingle: () => Promise.resolve({ data: estado.cuentaAntes, error: null }),
      then: (res: (v: unknown) => unknown) => res(estado.tablas[tabla] ?? { data: [], error: null }),
    }
    return c
  }
  return {
    ...real,
    exigir: async (_req: Request, permiso: string) => (estado.perfil && puede(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({ from: cadena, rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return estado.respuesta } }),
  }
})

const SUPER: Perfil = { uid: 'su', email: 'super@vb.mx', rol: 'admin', superAdmin: true }
const ADMIN: Perfil = { uid: 'ad', email: 'admin@vb.mx', rol: 'admin', superAdmin: false }
const post = (url: string, cuerpo: unknown) => new Request(`https://vb.test${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const patch = (url: string, cuerpo: unknown) => new Request(`https://vb.test${url}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const UUID_A = '22222222-2222-4222-8222-222222222222'
const GASTO = { clase: 'gasto', monto_pesos: '1,500.50', fecha: '2026-10-10', categoria: 'publicidad_impresa', concepto: 'Lonas El Juanito', referencia: 'F-118', clave_idempotencia: 'mov-test-0001' }

beforeEach(() => {
  estado.perfil = SUPER; estado.rpc = []; estado.consultas = []; estado.tablas = {}
  estado.respuesta = { data: { resultado: 'ok', id: '11111111-1111-4111-8111-111111111111' }, error: null }
  estado.cuentaAntes = { activa: true }
})

describe('permiso: solo Super Admin', () => {
  it('contabilidad.ver y contabilidad.registrar: ni un admin normal ni un anónimo; nada llega a la base', async () => {
    const libro = await import('../src/app/api/admin/contabilidad/libro/route')
    const movs = await import('../src/app/api/admin/contabilidad/movimientos/route')
    const cuentas = await import('../src/app/api/admin/contabilidad/cuentas/route')
    const cuenta = await import('../src/app/api/admin/contabilidad/cuentas/[id]/route')
    for (const [perfil, status] of [[ADMIN, 403], [null, 401]] as const) {
      estado.perfil = perfil
      expect((await libro.GET(new Request('https://vb.test/api/admin/contabilidad/libro'))).status).toBe(status)
      expect((await movs.POST(post('/api/admin/contabilidad/movimientos', GASTO))).status).toBe(status)
      expect((await cuentas.POST(post('/api/admin/contabilidad/cuentas', { nombre: 'Meta Ads', categoria: 'publicidad_digital' }))).status).toBe(status)
      expect((await cuenta.PATCH(patch(`/api/admin/contabilidad/cuentas/${UUID_A}`, { activa: false }), { params: Promise.resolve({ id: UUID_A }) })).status).toBe(status)
    }
    expect(estado.rpc).toEqual([])
    expect(estado.consultas).toEqual([])
  })
})

describe('GET /libro', () => {
  it('devuelve operaciones, movimientos y cuentas; sin la migración responde 503 y no enseña un libro a medias', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/libro/route')
    estado.tablas = { comision_operaciones: { data: [{ id: 'o1', propiedad_id: 'p1' }], error: null }, contab_movimientos: { data: [{ id: 'm1', propiedad_id: 'p9' }], error: null }, contab_cuentas: { data: [{ id: 'c1' }], error: null }, propiedades: { data: [{ id: 'p9', folio: 'VB-1', titulo: 'Terreno' }], error: null } }
    const r = await GET(new Request('https://vb.test/x'))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect([j.operaciones.length, j.movimientos.length, j.cuentas.length]).toEqual([1, 1, 1])
    expect(j.etiquetasDePropiedad).toEqual({ p9: 'Terreno' })
    estado.tablas.contab_movimientos = { data: null, error: { message: 'relation "contab_movimientos" does not exist' } }
    expect((await GET(new Request('https://vb.test/x'))).status).toBe(503)
  })
  it('no lee la clave de idempotencia ni más columnas de las que la pantalla usa', () => {
    const t = readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'contabilidad', 'libro', 'route.ts'), 'utf8')
    expect(t).not.toContain('clave_idempotencia')
    expect(t).not.toMatch(/select\('\*'\)/)
  })
})

describe('POST /movimientos', () => {
  it('un gasto válido llega a la función SQL en centavos, con quién lo registró; la bitácora no lleva el texto del concepto', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/movimientos/route')
    const r = await POST(post('/api/admin/contabilidad/movimientos', { ...GASTO, cuenta_id: UUID_A, propiedad_id: 'nave-mandujano' }))
    expect(r.status).toBe(201)
    expect(estado.rpc).toHaveLength(1)
    const { fn, args } = estado.rpc[0] as { fn: string; args: { p_datos: Record<string, unknown>; p_audit: Record<string, unknown> } }
    expect(fn).toBe('contab_movimiento_registrar')
    expect(args.p_datos).toMatchObject({ clase: 'gasto', monto_centavos: 150_050, fecha: '2026-10-10', categoria: 'publicidad_impresa', concepto: 'Lonas El Juanito', referencia: 'F-118', cuenta_id: UUID_A, propiedad_id: 'nave-mandujano', creado_por: 'super@vb.mx' })
    expect(args.p_audit).toMatchObject({ actor_uid: 'su', actor_rol: 'super_admin', accion: 'contabilidad.gasto' })
    expect(JSON.stringify(args.p_audit)).not.toContain('Lonas')
    expect(JSON.stringify(args.p_audit)).not.toContain('F-118')
  })
  it('un ingreso extra fija su categoría; una devolución lleva original y motivo y no manda categoría propia', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/movimientos/route')
    expect((await POST(post('/x', { ...GASTO, clase: 'ingreso_extra', categoria: 'lo-que-sea' }))).status).toBe(201)
    expect((estado.rpc[0].args.p_datos as Record<string, unknown>).categoria).toBe('ingreso_extra')
    expect((await POST(post('/x', { clase: 'devolucion', monto_pesos: '500', fecha: '2026-10-12', concepto: 'Devolución de lonas', reverso_de: UUID_A, motivo: 'Lona de mala calidad, devuelven', clave_idempotencia: 'dev-test-0001' }))).status).toBe(201)
    const d = estado.rpc[1].args.p_datos as Record<string, unknown>
    expect(d).toMatchObject({ clase: 'devolucion', reverso_de: UUID_A, motivo: 'Lona de mala calidad, devuelven', monto_centavos: 50_000 })
    expect(JSON.stringify(estado.rpc[1].args.p_audit)).not.toContain('mala calidad')
  })
  it('rechaza en el servidor lo mal escrito, sin llamar a la base', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/movimientos/route')
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const malos: Array<Record<string, unknown>> = [
      { monto_pesos: 'mucho' }, { monto_pesos: '0' }, { monto_pesos: '-5' }, { monto_pesos: '1e3' }, { monto_pesos: '10.999' },
      { fecha: manana }, { fecha: '1999-01-01' }, { fecha: 'ayer' }, { fecha: '2026-02-31' },
      { concepto: 'x' }, { concepto: 'Pagar a juan@correo.mx' }, { concepto: 'Llamar 4771234567' }, { referencia: 'a@b.c' },
      { categoria: 'inventada' }, { categoria: 'ingreso_extra' }, { clase: 'otra' }, { clave_idempotencia: 'corta' },
      { cuenta_id: 'no-es-uuid' }, { operacion_id: 'no-es-uuid' }, { reverso_de: UUID_A },
    ]
    for (const m of malos) expect((await POST(post('/x', { ...GASTO, ...m }))).status, JSON.stringify(m)).toBe(400)
    expect((await POST(post('/x', { clase: 'devolucion', monto_pesos: '1', fecha: '2026-10-10', concepto: 'Devolución', clave_idempotencia: 'dev-test-0002', motivo: 'Lona mala de verdad' }))).status).toBe(400) // sin original
    expect((await POST(post('/x', { clase: 'anulacion', monto_pesos: '1', fecha: '2026-10-10', concepto: 'Anulación', clave_idempotencia: 'anu-test-0001', reverso_de: UUID_A, motivo: 'corto' }))).status).toBe(400) // motivo corto
    expect((await POST(post('/x', null))).status).toBe(400)
    expect(estado.rpc).toEqual([])
  })
  it('traduce cada resultado de la función SQL: nunca da por bueno lo que no reconoce', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/movimientos/route')
    const casos: Array<[Record<string, unknown>, number, string?]> = [
      [{ resultado: 'repetida', id: UUID_A }, 200], [{ resultado: 'clave_en_uso' }, 409, 'clave_en_uso'], [{ resultado: 'no_existe' }, 404, 'no_existe'],
      [{ resultado: 'cuenta_inactiva' }, 409, 'cuenta_inactiva'], [{ resultado: 'excede', disponible: 700 }, 409, 'excede'], [{ resultado: 'ya_anulado' }, 409, 'ya_anulado'],
      [{ resultado: 'sin_remanente' }, 409, 'sin_remanente'], [{ resultado: 'monto_distinto', esperado: 900 }, 409, 'monto_distinto'], [{ resultado: 'no_aplica' }, 409, 'no_aplica'],
      [{ resultado: 'algo-nuevo' }, 500],
    ]
    for (const [data, status, codigo] of casos) {
      estado.respuesta = { data, error: null }
      const r = await POST(post('/x', { ...GASTO, clave_idempotencia: 'mov-test-' + status + (codigo ?? '') }))
      expect(r.status, JSON.stringify(data)).toBe(status)
      if (codigo) expect((await r.json()).codigo).toBe(codigo)
    }
    estado.respuesta = { data: { resultado: 'excede', disponible: 700 }, error: null }
    expect((await (await POST(post('/x', GASTO))).json()).disponible_centavos).toBe(700)
  })
  it('errores de la base: falta la migración → 503; datos inválidos → 400; otro → 500 sin filtrar el mensaje', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/movimientos/route')
    estado.respuesta = { data: null, error: { message: 'function public.contab_movimiento_registrar does not exist' } }
    expect((await POST(post('/x', GASTO))).status).toBe(503)
    estado.respuesta = { data: null, error: { message: 'cambio_invalido' } }
    expect((await POST(post('/x', GASTO))).status).toBe(400)
    estado.respuesta = { data: null, error: { message: 'deadlock detected en la fila 12 de contab_movimientos' } }
    const r = await POST(post('/x', GASTO))
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('deadlock')
  })
  it('el libro solo se agrega: la ruta no expone PATCH, PUT ni DELETE', async () => {
    const m = (await import('../src/app/api/admin/contabilidad/movimientos/route')) as Record<string, unknown>
    for (const metodo of ['PATCH', 'PUT', 'DELETE']) expect(m[metodo], metodo).toBeUndefined()
    const c = (await import('../src/app/api/admin/contabilidad/cuentas/[id]/route')) as Record<string, unknown>
    for (const metodo of ['PUT', 'DELETE', 'POST']) expect(c[metodo], `cuentas/[id] ${metodo}`).toBeUndefined()
  })
})

describe('cuentas de gasto', () => {
  it('alta: «Meta Ads · 33839»; repetirla devuelve la que ya existe; el nombre no admite correos', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/cuentas/route')
    const r = await POST(post('/x', { nombre: ' Meta Ads ', categoria: 'publicidad_digital', identificador: '33839', notas: 'Cuenta publicitaria principal' }))
    expect(r.status).toBe(201)
    expect(estado.rpc[0].args.p_datos).toEqual({ nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', notas: 'Cuenta publicitaria principal', creado_por: 'super@vb.mx' })
    estado.respuesta = { data: { resultado: 'ya_existe', id: UUID_A }, error: null }
    expect(await (await POST(post('/x', { nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839' }))).json()).toMatchObject({ ya_existe: true, id: UUID_A })
    for (const malo of [{ nombre: 'x' }, { nombre: 'a@b.mx' }, { nombre: 'Proveedor', categoria: 'inventada' }, { nombre: 'Proveedor', categoria: 'otro', identificador: 'a@b.c' }, { nombre: 'Proveedor', categoria: 'otro', notas: 'x'.repeat(501) }]) {
      expect((await POST(post('/x', { categoria: 'otro', ...malo }))).status, JSON.stringify(malo)).toBe(400)
    }
  })
  it('PATCH: activa y notas; nada más; la cuenta debe existir', async () => {
    const { PATCH } = await import('../src/app/api/admin/contabilidad/cuentas/[id]/route')
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
    expect((await PATCH(patch('/x', { activa: false, notas: 'Se pausó' }), ctx(UUID_A))).status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_id: UUID_A, p_cambios: { activa: false, notas: 'Se pausó' } })
    expect(JSON.stringify(estado.rpc[0].args.p_audit)).not.toContain('Se pausó')
    // Migración 50: también cambian el nombre, el tipo y el identificador (con el antes y el después en la bitácora).
    estado.cuentaAntes = { nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', activa: true }
    estado.rpc = []
    expect((await PATCH(patch('/x', { nombre: ' Meta Ads MX ', categoria: 'software_suscripciones', identificador: null }), ctx(UUID_A))).status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_cambios: { nombre: 'Meta Ads MX', categoria: 'software_suscripciones', identificador: null } })
    expect(estado.rpc[0].args.p_audit).toMatchObject({ antes: { nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839' }, despues: { nombre: 'Meta Ads MX', categoria: 'software_suscripciones', identificador: null } })
    for (const malo of [{ nombre: 'x' }, { nombre: 'a@b.mx' }, { categoria: 'inventada' }, { identificador: 'a@b.c' }, { identificador: 'x'.repeat(121) }, {}]) expect((await PATCH(patch('/x', malo), ctx(UUID_A))).status, JSON.stringify(malo)).toBe(400)
    estado.respuesta = { data: { resultado: 'ya_existe' }, error: null }
    expect((await PATCH(patch('/x', { nombre: 'Otro' }), ctx(UUID_A))).status).toBe(409)
    estado.respuesta = { data: { resultado: 'ok' }, error: null }
    expect((await PATCH(patch('/x', { activa: 'si' }), ctx(UUID_A))).status).toBe(400)
    expect((await PATCH(patch('/x', { notas: 'x'.repeat(501) }), ctx(UUID_A))).status).toBe(400)
    expect((await PATCH(patch('/x', { activa: true }), ctx('no-es-uuid'))).status).toBe(404)
    estado.cuentaAntes = null
    expect((await PATCH(patch('/x', { activa: true }), ctx(UUID_A))).status).toBe(404)
  })
})

describe('guardias de código', () => {
  const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', 'src', ...r), 'utf8')
  it('cada ruta pide el permiso correcto (ver para leer, registrar para escribir) y la librería es solo de servidor', () => {
    expect(leer('app', 'api', 'admin', 'contabilidad', 'libro', 'route.ts')).toContain("exigir(req, 'contabilidad.ver')")
    for (const r of [['movimientos', 'route.ts'], ['cuentas', 'route.ts'], ['cuentas', '[id]', 'route.ts']]) expect(leer('app', 'api', 'admin', 'contabilidad', ...r)).toContain("exigir(req, 'contabilidad.registrar')")
    expect(leer('lib', 'contabilidad-servidor.ts')).toMatch(/^import 'server-only'/m)
  })
  it('el navegador no manda saldos ni sentido: la entrada solo trae lo que la persona escribe', () => {
    const t = leer('lib', 'contabilidad-servidor.ts')
    const entrada = t.slice(t.indexOf('export type EntradaMovimiento'), t.indexOf('export type EntradaCuenta'))
    for (const prohibido of ['sentido', 'monto_centavos', 'total', 'saldo', 'creado_por']) expect(entrada).not.toContain(prohibido)
  })
})

describe('notas del contador (migración 49)', () => {
  const NOTA = { titulo: 'Plazo de la balanza mensual', tema: 'fiscal', texto: 'Para 2027 el plazo cambió; verificar en la RMF vigente.', clave_idempotencia: 'nota-test-0001' }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('solo Super Admin; sin la migración, 503', async () => {
    const r = await import('../src/app/api/admin/contabilidad/conocimiento/route')
    const id = await import('../src/app/api/admin/contabilidad/conocimiento/[id]/route')
    for (const [perfil, status] of [[ADMIN, 403], [null, 401]] as const) {
      estado.perfil = perfil
      expect((await r.GET(new Request('https://vb.test/x'))).status).toBe(status)
      expect((await r.POST(post('/x', NOTA))).status).toBe(status)
      expect((await id.PATCH(patch('/x', { motivo: 'La ley cambió otra vez' }), ctx(UUID_A))).status).toBe(status)
    }
    expect(estado.rpc).toEqual([])
    estado.perfil = SUPER
    estado.tablas.contab_conocimiento = { data: null, error: { message: 'relation "contab_conocimiento" does not exist' } }
    expect((await r.GET(new Request('https://vb.test/x'))).status).toBe(503)
  })
  it('GET devuelve las notas, la vigencia de la base y sus fuentes', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/conocimiento/route')
    estado.tablas.contab_conocimiento = { data: [{ id: 'n1', titulo: 'x', tema: 'fiscal', texto: 'texto de la nota', vigente_desde: '2026-11-03', retirada: false }], error: null }
    const j = await (await GET(new Request('https://vb.test/x'))).json()
    expect(j.notas).toHaveLength(1)
    expect(j.version).toBe('2026-10-26')
    expect(j.vigencia).toMatchObject({ vigente: expect.any(Boolean), edadEnDias: expect.any(Number) })
    expect(j.fuentes.length).toBeGreaterThan(10)
  })
  it('POST valida en el servidor, manda la nota a la función SQL y la bitácora no lleva el texto', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/conocimiento/route')
    expect((await POST(post('/x', NOTA))).status).toBe(201)
    const { fn, args } = estado.rpc[0] as { fn: string; args: { p_datos: Record<string, unknown>; p_audit: Record<string, unknown> } }
    expect(fn).toBe('contab_nota_registrar')
    expect(args.p_datos).toMatchObject({ titulo: 'Plazo de la balanza mensual', tema: 'fiscal', creado_por: 'super@vb.mx', clave_idempotencia: 'nota-test-0001' })
    expect(JSON.stringify(args.p_audit)).not.toContain('plazo cambió')
    expect(args.p_audit).toMatchObject({ accion: 'contabilidad.nota_registrada', actor_rol: 'super_admin' })
    for (const malo of [{ titulo: 'ab' }, { tema: 'inventado' }, { texto: 'corto' }, { texto: 'x'.repeat(1201) }, { texto: 'Escribir a contador@correo.mx para confirmar el criterio' }, { texto: 'Llamar al 4771234567 para confirmar el criterio nuevo' }, { vigente_desde: '2999-01-01' }, { vigente_desde: 'ayer' }, { clave_idempotencia: 'corta' }]) {
      expect((await POST(post('/x', { ...NOTA, ...malo }))).status, JSON.stringify(malo)).toBe(400)
    }
    expect(estado.rpc).toHaveLength(1)
    estado.respuesta = { data: { resultado: 'tope', maximo: 30 }, error: null }
    const t = await POST(post('/x', { ...NOTA, clave_idempotencia: 'nota-test-0002' }))
    expect(t.status).toBe(409)
    expect((await t.json()).codigo).toBe('tope')
  })
  it('retirar exige motivo de 10 a 300 caracteres; no hay DELETE ni PUT; una retirada no se retira otra vez', async () => {
    const id = await import('../src/app/api/admin/contabilidad/conocimiento/[id]/route') as Record<string, unknown>
    const PATCH = id.PATCH as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>
    for (const m of ['DELETE', 'PUT', 'POST']) expect(id[m], m).toBeUndefined()
    expect((await PATCH(patch('/x', { motivo: 'corto' }), ctx(UUID_A))).status).toBe(400)
    expect((await PATCH(patch('/x', {}), ctx(UUID_A))).status).toBe(400)
    expect((await PATCH(patch('/x', { motivo: 'x'.repeat(301) }), ctx(UUID_A))).status).toBe(400)
    expect((await PATCH(patch('/x', { motivo: 'La ley cambió y la nota ya no aplica' }), ctx('no-es-uuid'))).status).toBe(404)
    expect(estado.rpc).toEqual([])
    expect((await PATCH(patch('/x', { motivo: 'La ley cambió y la nota ya no aplica' }), ctx(UUID_A))).status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_id: UUID_A, p_motivo: 'La ley cambió y la nota ya no aplica', p_por: 'super@vb.mx' })
    estado.respuesta = { data: { resultado: 'ya_retirada' }, error: null }
    expect((await PATCH(patch('/x', { motivo: 'La ley cambió y la nota ya no aplica' }), ctx(UUID_A))).status).toBe(409)
    estado.respuesta = { data: { resultado: 'no_existe' }, error: null }
    expect((await PATCH(patch('/x', { motivo: 'La ley cambió y la nota ya no aplica' }), ctx(UUID_A))).status).toBe(404)
  })
})
