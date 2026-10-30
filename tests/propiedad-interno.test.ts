import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notasVisibles, sanearNota, sanearOrigen } from '../src/lib/propiedad-interno'

/**
 * Datos internos de una propiedad (24-oct-2026): origen, comisión pactada y notas internas.
 * Reglas del propietario: el equipo (admin / super admin) ve las notas de TODOS; un publicador, solo las suyas; ninguna comisión por defecto;
 * lo interno nunca sale por una ruta pública. Base de mentira en memoria que sí filtra.
 */

describe('sanearOrigen', () => {
  it('acepta un origen mínimo y deja la comisión VACÍA (sin valor por defecto)', () => {
    const r = sanearOrigen({ origen_tipo: 'trato_directo' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos).toMatchObject({ origen_tipo: 'trato_directo', comision_tipo: null, comision_valor: null, comision_detalle: null })
  })
  it('exige el tipo de origen y rechaza uno inventado', () => {
    expect(sanearOrigen({}).ok).toBe(false)
    expect(sanearOrigen({ origen_tipo: 'primo' }).ok).toBe(false)
  })
  it('valida correo, teléfono y rangos de la comisión', () => {
    expect(sanearOrigen({ origen_tipo: 'broker', titular_correo: 'no-es-correo' }).ok).toBe(false)
    expect(sanearOrigen({ origen_tipo: 'broker', titular_telefono: 'abc' }).ok).toBe(false)
    expect(sanearOrigen({ origen_tipo: 'broker', comision_tipo: 'porcentaje', comision_valor: 101 }).ok).toBe(false)
    expect(sanearOrigen({ origen_tipo: 'broker', comision_tipo: 'meses_renta', comision_valor: 13 }).ok).toBe(false)
    expect(sanearOrigen({ origen_tipo: 'broker', comision_valor: 3 }).ok).toBe(false) // valor sin tipo
    expect(sanearOrigen({ origen_tipo: 'broker', comision_tipo: 'compartida' }).ok).toBe(false) // compartida sin detalle
  })
  it('una comisión compartida con detalle y un porcentaje con 2 decimales son válidos', () => {
    const a = sanearOrigen({ origen_tipo: 'inmobiliaria', comision_tipo: 'compartida', comision_detalle: '50/50 con la otra inmobiliaria' })
    expect(a.ok).toBe(true)
    const b = sanearOrigen({ origen_tipo: 'trato_directo', comision_tipo: 'porcentaje', comision_valor: '3.456' })
    expect(b.ok && b.datos.comision_valor).toBe(3.46)
  })
  it('ignora campos que no están en la lista blanca', () => {
    const r = sanearOrigen({ origen_tipo: 'trato_directo', creado_por: 'otro', propiedad_id: 'zzz' })
    expect(r.ok && Object.keys(r.datos)).not.toContain('creado_por')
  })
})

describe('sanearNota', () => {
  it('recorta, rechaza vacías y límites', () => {
    expect(sanearNota('  hola  ')).toEqual({ ok: true, texto: 'hola' })
    expect(sanearNota('   ').ok).toBe(false)
    expect(sanearNota(5).ok).toBe(false)
    expect(sanearNota('x'.repeat(2001)).ok).toBe(false)
  })
})

describe('notasVisibles', () => {
  const notas = [{ autor_uid: 'a', t: 1 }, { autor_uid: 'b', t: 2 }]
  it('el equipo ve todas; los demás, solo las suyas; sin identidad no ven ninguna', () => {
    expect(notasVisibles(notas, { uid: 'x', esEquipo: true })).toHaveLength(2)
    expect(notasVisibles(notas, { uid: 'a', esEquipo: false })).toEqual([{ autor_uid: 'a', t: 1 }])
    expect(notasVisibles(notas, { uid: null, esEquipo: false })).toEqual([])
  })
})

// ── La ruta ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>
const e = vi.hoisted(() => ({ perfil: null as null | { uid: string; email: string; rol: string; superAdmin: boolean }, tablas: {} as Record<string, Fila[]>, ausentes: [] as string[], bitacora: [] as unknown[] }))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    exigir: async (_r: Request, permiso: string) => (e.perfil && puede(e.perfil as never, permiso as never)
      ? { perfil: e.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: e.perfil ? 403 : 401 }) }),
    registrarIntentoDenegado: async () => {},
    supabaseAdmin: () => ({ from: (t: string) => new Consulta(t) }),
  }
})
vi.mock('@/lib/limites', async (o) => ({ ...(await o<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/portal/exigir-portal', () => ({ portalCerradoParaEscribir: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (x: unknown) => { e.bitacora.push(x) } }))

class Consulta {
  private fs: Array<(f: Fila) => boolean> = []
  private op: 'select' | 'insert' | 'upsert' = 'select'
  private fila: Fila | null = null
  private orden: string | null = null
  constructor(private t: string) {}
  select() { return this }
  eq(c: string, v: unknown) { this.fs.push((f) => f[c] === v); return this }
  order(c: string) { this.orden = c; return this }
  limit() { return this }
  insert(f: Fila) { this.op = 'insert'; this.fila = { id: `n${(e.tablas[this.t] ?? []).length + 1}`, creado_en: new Date().toISOString(), ...f }; return this }
  upsert(f: Fila) { this.op = 'upsert'; this.fila = f; return this }
  private ejecutar(): { data: unknown; error: unknown } {
    if (e.ausentes.includes(this.t)) return { data: null, error: { code: '42P01', message: `relation "${this.t}" does not exist` } }
    const tabla = (e.tablas[this.t] ??= [])
    if (this.op === 'insert') { tabla.push(this.fila!); return { data: this.fila, error: null } }
    if (this.op === 'upsert') {
      const i = tabla.findIndex((f) => f.propiedad_id === this.fila!.propiedad_id)
      if (i >= 0) tabla[i] = { ...tabla[i], ...this.fila }; else tabla.push(this.fila!)
      return { data: this.fila, error: null }
    }
    let filas = tabla.filter((f) => this.fs.every((x) => x(f)))
    if (this.orden) filas = [...filas].reverse()
    return { data: filas, error: null }
  }
  maybeSingle() { const r = this.ejecutar(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }) }
  then<T>(ok: (r: { data: unknown; error: unknown }) => T) { return Promise.resolve(this.ejecutar()).then(ok) }
}

const PUB_A = { uid: 'pub-A', email: 'a@x.test', rol: 'publicador', superAdmin: false }
const PUB_B = { uid: 'pub-B', email: 'b@x.test', rol: 'publicador', superAdmin: false }
const ADMIN = { uid: 'adm', email: 'adm@x.test', rol: 'admin', superAdmin: false }
const SUPER = { uid: 'sup', email: 'sup@x.test', rol: 'admin', superAdmin: true }
const CLIENTE = { uid: 'cli', email: 'c@x.test', rol: 'cliente', superAdmin: false }
const ctx = (id = 'p1') => ({ params: Promise.resolve({ id }) })
const json = (metodo: string, cuerpo?: unknown) => new Request('https://x.test/api/propiedades/p1/interno', { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo), headers: { 'Content-Type': 'application/json' } } : {}) })

beforeEach(() => {
  e.perfil = PUB_A; e.ausentes = []; e.bitacora = []
  e.tablas = {
    propiedades: [{ id: 'p1', owner_id: 'pub-A' }, { id: 'p2', owner_id: 'pub-B' }, { id: 'p3', owner_id: null }],
    usuarios: [{ uid: 'pub-A', nombre: 'Ana Dueña', email: 'ana@x.test', rol: 'publicador', tipo_publicador: 'asociado' }],
    propiedad_origen: [],
    propiedad_notas: [
      { id: 'n1', propiedad_id: 'p1', autor_uid: 'pub-A', autor_rol: 'publicador', texto: 'nota de la dueña', creado_en: '2026-10-20T10:00:00Z' },
      { id: 'n2', propiedad_id: 'p1', autor_uid: 'adm', autor_rol: 'admin', texto: 'nota del admin', creado_en: '2026-10-21T10:00:00Z' },
    ],
  }
})

describe('/api/propiedades/[id]/interno', () => {
  it('la dueña ve SOLO sus notas, y la cuenta dueña aparece como «Subida por»', async () => {
    const { GET } = await import('../src/app/api/propiedades/[id]/interno/route')
    const r = await GET(json('GET'), ctx())
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.notas.map((n: { texto: string }) => n.texto)).toEqual(['nota de la dueña'])
    expect(j.veTodas).toBe(false)
    expect(j.subidaPor).toMatchObject({ nombre: 'Ana Dueña', correo: 'ana@x.test', modalidad: 'asociado' })
  })
  it('el admin y el super admin ven las notas de TODOS', async () => {
    const { GET } = await import('../src/app/api/propiedades/[id]/interno/route')
    for (const quien of [ADMIN, SUPER]) {
      e.perfil = quien
      const j = await (await GET(json('GET'), ctx())).json()
      expect(j.notas).toHaveLength(2)
      expect(j.veTodas).toBe(true)
    }
  })
  it('una propiedad sin cuenta dueña dice que la subió el equipo (subidaPor nulo)', async () => {
    const { GET } = await import('../src/app/api/propiedades/[id]/interno/route')
    e.perfil = ADMIN
    expect((await (await GET(json('GET'), ctx('p3'))).json()).subidaPor).toBeNull()
  })
  it('otro publicador recibe 403 y un cliente 403; sin sesión 401; propiedad inexistente 404', async () => {
    const { GET, PUT, POST } = await import('../src/app/api/propiedades/[id]/interno/route')
    e.perfil = PUB_B
    expect((await GET(json('GET'), ctx())).status).toBe(403)
    expect((await PUT(json('PUT', { origen_tipo: 'broker' }), ctx())).status).toBe(403)
    expect((await POST(json('POST', { texto: 'x' }), ctx())).status).toBe(403)
    e.perfil = CLIENTE
    expect((await GET(json('GET'), ctx())).status).toBe(403)
    e.perfil = null
    expect((await GET(json('GET'), ctx())).status).toBe(401)
    e.perfil = ADMIN
    expect((await GET(json('GET'), ctx('nope'))).status).toBe(404)
  })
  it('agregar una nota guarda al autor y su rol desde la sesión (el cuerpo no puede ponerlos) y la bitácora solo lleva la longitud', async () => {
    const { POST } = await import('../src/app/api/propiedades/[id]/interno/route')
    e.perfil = SUPER
    const r = await POST(json('POST', { texto: '  Acordamos 3 % con el dueño  ', autor_uid: 'pub-A', autor_rol: 'publicador' }), ctx())
    expect(r.status).toBe(201)
    const guardada = e.tablas.propiedad_notas.at(-1)!
    expect(guardada).toMatchObject({ autor_uid: 'sup', autor_rol: 'super_admin', texto: 'Acordamos 3 % con el dueño' })
    expect(JSON.stringify(e.bitacora)).not.toContain('Acordamos')
    expect(JSON.stringify(e.bitacora)).toContain('"n":')
  })
  it('una nota vacía o enorme se rechaza con 400', async () => {
    const { POST } = await import('../src/app/api/propiedades/[id]/interno/route')
    expect((await POST(json('POST', { texto: '   ' }), ctx())).status).toBe(400)
    expect((await POST(json('POST', { texto: 'x'.repeat(2001) }), ctx())).status).toBe(400)
  })
  it('guardar el origen exige datos válidos y la bitácora no lleva los datos personales del titular', async () => {
    const { PUT } = await import('../src/app/api/propiedades/[id]/interno/route')
    expect((await PUT(json('PUT', { origen_tipo: 'broker', titular_correo: 'mal' }), ctx())).status).toBe(400)
    const ok = await PUT(json('PUT', { origen_tipo: 'inmobiliaria', titular_nombre: 'Luis Gómez', titular_telefono: '477 811 6501', titular_correo: 'luis@inmo.test', comision_tipo: 'porcentaje', comision_valor: 3 }), ctx())
    expect(ok.status).toBe(200)
    expect(e.tablas.propiedad_origen[0]).toMatchObject({ propiedad_id: 'p1', origen_tipo: 'inmobiliaria', comision_valor: 3, creado_por: 'a@x.test' })
    const b = JSON.stringify(e.bitacora)
    expect(b).not.toContain('Luis')
    expect(b).not.toContain('811')
    expect(b).not.toContain('luis@')
  })
  it('si las tablas no existen (migración sin aplicar) responde 503 sin devolver nada', async () => {
    const { GET, PUT, POST } = await import('../src/app/api/propiedades/[id]/interno/route')
    e.ausentes = ['propiedad_origen', 'propiedad_notas']
    const g = await GET(json('GET'), ctx())
    expect(g.status).toBe(503)
    expect((await g.json()).codigo).toBe('no_disponible')
    expect((await PUT(json('PUT', { origen_tipo: 'broker' }), ctx())).status).toBe(503)
    expect((await POST(json('POST', { texto: 'hola' }), ctx())).status).toBe(503)
  })
})

describe('lo interno no sale por ninguna lectura pública', () => {
  it('ni la lista de columnas públicas ni la ficha pública mencionan las tablas internas', async () => {
    const { readFileSync } = await import('node:fs')
    for (const r of ['src/lib/propiedad-publica.ts', 'src/app/api/catalogo/route.ts', 'supabase/18-columnas-publicas.sql']) {
      const t = readFileSync(new URL(`../${r}`, import.meta.url), 'utf8')
      expect(t, r).not.toMatch(/propiedad_origen|propiedad_notas|comision_/)
    }
  })
})
