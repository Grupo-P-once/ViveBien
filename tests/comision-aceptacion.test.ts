import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { debeAceptar, type TextoComision } from '../src/lib/comision-aceptacion'
import { tieneCapacidad, DEFAULTS_POR_TIPO } from '../src/lib/acceso/capacidades'

/**
 * Etapa B del motor de comisiones (24-oct-2026): aceptar la propuesta de comisión antes de enviar o publicar.
 * Reglas: apagado por defecto (cero cambios con el flag apagado); solo si hay un texto vigente; no aceptan el equipo ni quien tiene `sin_comision`;
 * si está encendido y no se puede comprobar, no pasa (falla cerrado).
 */

const TEXTO: TextoComision = { id: 't1', version: 'v1', titulo: 'Propuesta de comisión', cuerpo: 'x'.repeat(60), hash: 'a'.repeat(64) }

describe('debeAceptar', () => {
  it('apagado, del equipo, exento o sin texto vigente: no se pide nada', () => {
    expect(debeAceptar({ flagEncendida: false, esEquipo: false, exenta: false, texto: TEXTO })).toBe(false)
    expect(debeAceptar({ flagEncendida: true, esEquipo: true, exenta: false, texto: TEXTO })).toBe(false)
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: true, texto: TEXTO })).toBe(false)
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: false, texto: null })).toBe(false)
  })
  it('encendido + texto vigente + cuenta con comisión: se pide', () => {
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: false, texto: TEXTO })).toBe(true)
  })
})

describe('la capacidad «sin comisión»', () => {
  it('la modalidad asociado la trae encendida y el publicador, apagada (se decide con capacidades, no con la modalidad)', () => {
    expect(DEFAULTS_POR_TIPO.asociado.sin_comision).toBe(true)
    expect(DEFAULTS_POR_TIPO.publicador.sin_comision).toBe(false)
  })
  it('un ajuste individual la cambia', () => {
    const p = { uid: 'u', rol: 'publicador', superAdmin: false, capacidades: { ...DEFAULTS_POR_TIPO.publicador, sin_comision: true } }
    expect(tieneCapacidad(p as never, 'sin_comision')).toBe(true)
  })
})

// ── Servidor ────────────────────────────────────────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>
const e = vi.hoisted(() => ({
  flag: false, perfil: null as null | Record<string, unknown>, tablas: {} as Record<string, Fila[]>, consultas: [] as string[],
  errorEn: null as null | string, bitacora: [] as unknown[],
}))

vi.mock('@/lib/config/flags-servidor', () => ({ leerFlags: async () => ({ commissionEngine: e.flag }) }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  return {
    ...real,
    exigir: async (_r: Request, permiso: string) => (e.perfil && puede(e.perfil as never, permiso as never)
      ? { perfil: e.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: e.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({ from: (t: string) => new Consulta(t) }),
  }
})
vi.mock('@/lib/limites', async (o) => ({ ...(await o<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))
vi.mock('@/lib/portal/exigir-portal', () => ({ portalCerradoParaEscribir: async () => null }))
vi.mock('@/lib/auditoria', () => ({ registrar: async (x: unknown) => { e.bitacora.push(x) } }))

class Consulta {
  private fs: Array<(f: Fila) => boolean> = []
  private fila: Fila | null = null
  constructor(private t: string) { e.consultas.push(t) }
  select() { return this }
  eq(c: string, v: unknown) { this.fs.push((f) => f[c] === v); return this }
  insert(f: Fila) { this.fila = f; return this }
  private ejecutar(): { data: unknown; error: unknown } {
    if (e.errorEn === this.t) return { data: null, error: { code: '42P01', message: 'no existe' } }
    const tabla = (e.tablas[this.t] ??= [])
    if (this.fila) {
      if (tabla.some((f) => f.uid === this.fila!.uid && f.texto_id === this.fila!.texto_id)) return { data: null, error: { code: '23505', message: 'dup' } }
      tabla.push(this.fila); return { data: this.fila, error: null }
    }
    return { data: tabla.filter((f) => this.fs.every((x) => x(f))), error: null }
  }
  maybeSingle() { const r = this.ejecutar(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }) }
  then<T>(ok: (r: { data: unknown; error: unknown }) => T) { return Promise.resolve(this.ejecutar()).then(ok) }
}

const PUB = { uid: 'pub-1', email: 'p@x.test', rol: 'publicador', superAdmin: false, capacidades: { ...DEFAULTS_POR_TIPO.publicador } }
const ASOC = { uid: 'aso-1', email: 'a@x.test', rol: 'publicador', superAdmin: false, capacidades: { ...DEFAULTS_POR_TIPO.asociado } }
const ADMIN = { uid: 'adm', email: 'adm@x.test', rol: 'admin', superAdmin: false, capacidades: {} }
const post = (c: unknown) => new Request('https://x.test/api/comision/aceptacion', { method: 'POST', body: JSON.stringify(c), headers: { 'Content-Type': 'application/json', 'user-agent': 'prueba' } })
const get = () => new Request('https://x.test/api/comision/aceptacion')

beforeEach(() => {
  e.flag = false; e.perfil = PUB; e.consultas = []; e.errorEn = null; e.bitacora = []
  e.tablas = { comision_textos: [{ id: 't1', version: 'v1', titulo: 'Propuesta de comisión', cuerpo: 'x'.repeat(60), hash: 'a'.repeat(64), estado: 'vigente' }], comision_aceptaciones: [] }
})

describe('/api/comision/aceptacion', () => {
  it('con el módulo APAGADO no hay nada que aceptar y NO se toca la base', async () => {
    const { GET } = await import('../src/app/api/comision/aceptacion/route')
    const j = await (await GET(get())).json()
    expect(j).toEqual({ requerida: false, aceptada: false, texto: null })
    expect(e.consultas).toEqual([])
  })
  it('encendido: el publicador debe aceptar y ve el texto; el asociado (sin_comision) y el admin, no', async () => {
    const { GET } = await import('../src/app/api/comision/aceptacion/route')
    e.flag = true
    const j = await (await GET(get())).json()
    expect(j).toMatchObject({ requerida: true, aceptada: false, texto: { id: 't1', version: 'v1' } })
    for (const quien of [ASOC, ADMIN]) {
      e.perfil = quien; e.consultas = []
      expect(await (await GET(get())).json()).toEqual({ requerida: false, aceptada: false, texto: null })
      expect(e.consultas).toEqual([])
    }
  })
  it('encendido pero SIN texto vigente: no se exige nada', async () => {
    const { GET } = await import('../src/app/api/comision/aceptacion/route')
    e.flag = true; e.tablas.comision_textos = []
    expect((await (await GET(get())).json()).requerida).toBe(false)
  })
  it('aceptar guarda la versión y el hash que vio, deja bitácora y es idempotente', async () => {
    const { GET, POST } = await import('../src/app/api/comision/aceptacion/route')
    e.flag = true
    const r = await POST(post({ texto_id: 't1', hash: 'a'.repeat(64) }))
    expect(r.status).toBe(201)
    expect(e.tablas.comision_aceptaciones[0]).toMatchObject({ uid: 'pub-1', texto_id: 't1', version: 'v1', hash: 'a'.repeat(64), agente: 'prueba' })
    expect(e.bitacora).toHaveLength(1)
    expect((await (await GET(get())).json()).aceptada).toBe(true)
    const otra = await POST(post({ texto_id: 't1', hash: 'a'.repeat(64) }))
    expect(otra.status).toBe(200)
    expect(e.tablas.comision_aceptaciones).toHaveLength(1)
  })
  it('si el texto cambió mientras lo leía (otro id o hash), 409 y no se guarda nada', async () => {
    const { POST } = await import('../src/app/api/comision/aceptacion/route')
    e.flag = true
    for (const cuerpo of [{ texto_id: 'otro', hash: 'a'.repeat(64) }, { texto_id: 't1', hash: 'b'.repeat(64) }, {}]) {
      const r = await POST(post(cuerpo))
      expect(r.status).toBe(409)
      expect((await r.json()).codigo).toBe('texto_cambio')
    }
    expect(e.tablas.comision_aceptaciones).toHaveLength(0)
  })
  it('encendido y la base no responde (tablas sin migrar): 503, falla cerrado', async () => {
    const { GET, POST } = await import('../src/app/api/comision/aceptacion/route')
    e.flag = true; e.errorEn = 'comision_textos'
    expect((await GET(get())).status).toBe(503)
    expect((await POST(post({ texto_id: 't1', hash: 'a'.repeat(64) }))).status).toBe(503)
  })
  it('un cliente o sin sesión no entra', async () => {
    const { GET } = await import('../src/app/api/comision/aceptacion/route')
    e.perfil = { uid: 'c', rol: 'cliente', superAdmin: false }
    expect((await GET(get())).status).toBe(403)
    e.perfil = null
    expect((await GET(get())).status).toBe(401)
  })
})

describe('la ruta de estado respeta la aceptación', () => {
  const src = readFileSync(new URL('../src/app/api/propiedades/[id]/estado/route.ts', import.meta.url), 'utf8')
  it('consulta la aceptación ANTES de cambiar el estado, solo al enviar/autopublicar, y falla cerrado', () => {
    const iAcept = src.indexOf('estadoDeAceptacion(perfil)')
    const iCambio = src.indexOf('await cambiarEstadoDePropiedad(')
    expect(iAcept).toBeGreaterThan(0)
    expect(iAcept).toBeLessThan(iCambio)
    expect(src).toMatch(/requiere_aceptacion_comision/)
    expect(src).toMatch(/comision_no_disponible/)
    expect(src.slice(0, iAcept)).toMatch(/destino === 'en_revision' \|\| autopublica/)
  })
})
