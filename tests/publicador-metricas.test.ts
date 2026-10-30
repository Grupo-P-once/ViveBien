import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Métricas de publicadores y asociados (24-oct-2026). Lo que importa: cada cuenta ve SOLO sus propiedades (el dueño lo pone el servidor), solo recibe
 * CANTIDADES (jamás nombre, teléfono, correo ni mensaje de quien se comunicó) y quien no publica recibe 403. Base de mentira en memoria que sí filtra.
 */

type Fila = Record<string, unknown>
const e = vi.hoisted(() => ({ perfil: null as null | { uid: string; rol: string; superAdmin: boolean; capacidades?: Record<string, boolean> }, tablas: {} as Record<string, Fila[]>, consultas: [] as string[] }))

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

class Consulta {
  private fs: Array<(f: Fila) => boolean> = []
  private cuenta = false
  private cabeza = false
  constructor(private t: string) { e.consultas.push(t) }
  select(_c?: string, o?: { count?: string; head?: boolean }) { this.cuenta = o?.count === 'exact'; this.cabeza = !!o?.head; return this }
  eq(c: string, v: unknown) { this.fs.push((f) => f[c] === v); return this }
  in(c: string, v: unknown[]) { this.fs.push((f) => v.includes(f[c])); return this }
  gte(c: string, v: string) { this.fs.push((f) => String(f[c] ?? '') >= v); return this }
  lt(c: string, v: string) { this.fs.push((f) => String(f[c] ?? '') < v); return this }
  limit() { return this }
  then<T>(ok: (r: { data: unknown; error: unknown; count?: number }) => T) {
    const filas = (e.tablas[this.t] ?? []).filter((f) => this.fs.every((x) => x(f)))
    return Promise.resolve({ data: this.cabeza ? null : filas, error: null, ...(this.cuenta ? { count: filas.length } : {}) }).then(ok)
  }
}

const PUBLICADOR = { uid: 'pub-A', rol: 'publicador', superAdmin: false, capacidades: { recibir_solicitudes: true, recibir_citas: false } }   // el publicador normal: sin citas
const ASOCIADO = { uid: 'pub-A', rol: 'publicador', superAdmin: false, capacidades: { recibir_solicitudes: true, recibir_citas: true } }      // el asociado: con citas (por defecto de su modalidad)
const OTRO = { uid: 'pub-B', rol: 'publicador', superAdmin: false, capacidades: { recibir_citas: false } }
const CLIENTE = { uid: 'cli', rol: 'cliente', superAdmin: false }
const pedir = (q = '') => new Request(`https://x.test/api/publicador/metricas${q}`)
const ahora = new Date().toISOString()
const vista = (propiedad_id: string, sesion: string) => ({ nombre: 'property_view', propiedad_id, sesion, datos: null, creado_en: ahora })

beforeEach(() => {
  e.perfil = PUBLICADOR; e.consultas = []
  e.tablas = {
    propiedades: [
      { id: 'a1', owner_id: 'pub-A', folio: 'VB-1', titulo: 'Casa de A', tipo: 'casa', operacion: 'venta', precio: 1, estado_pub: 'publicada', publicada_en: '2026-09-01T00:00:00Z', vistas: 7, contacto_interno: 'secreto@x.com' },
      { id: 'a2', owner_id: 'pub-A', folio: 'VB-2', titulo: 'Borrador de A', tipo: 'casa', operacion: 'renta', precio: 2, estado_pub: 'borrador', vistas: 0 },
      { id: 'b1', owner_id: 'pub-B', folio: 'VB-3', titulo: 'Casa de B (otra cuenta)', tipo: 'casa', operacion: 'venta', precio: 3, estado_pub: 'publicada', publicada_en: '2026-09-01T00:00:00Z', vistas: 99 },
    ],
    eventos: [vista('a1', 's1'), vista('a1', 's2'), vista('b1', 's3'), vista('b1', 's4'), vista('b1', 's5'),
      { nombre: 'property_contact_click', propiedad_id: 'a1', sesion: 's1', datos: { canal: 'whatsapp', lugar: 'ficha' }, creado_en: ahora },
      { nombre: 'property_contact_click', propiedad_id: 'b1', sesion: 's3', datos: { canal: 'telefono' }, creado_en: ahora }],
    leads: [{ created_at: ahora, propiedad_id: 'a1', nombre: 'Ana Pérez', telefono: '4778116501', email: 'ana@x.com' }, { created_at: ahora, propiedad_id: 'b1', nombre: 'Luis', telefono: '4770000000', email: 'luis@x.com' }],
    solicitudes_contacto: [{ creado_en: ahora, propiedad_id: 'a1', nombre: 'Marta' }],
    favoritos: [{ propiedad_id: 'a1' }, { propiedad_id: 'b1' }, { propiedad_id: 'b1' }],
    citas: [{ propiedad_id: 'a1', estado: 'CONFIRMED', creada_en: ahora }, { propiedad_id: 'a1', estado: 'COMPLETED', creada_en: ahora }, { propiedad_id: 'a1', estado: 'REQUESTED', creada_en: ahora }, { propiedad_id: 'b1', estado: 'CONFIRMED', creada_en: ahora }],
  }
  e.tablas.eventos.push(
    { nombre: 'property_share', propiedad_id: 'a1', sesion: 's1', datos: { canal: 'nativo' }, creado_en: ahora },
    { nombre: 'property_share', propiedad_id: 'a1', sesion: 's2', datos: { canal: 'copiado' }, creado_en: ahora },
    { nombre: 'property_share', propiedad_id: 'b1', sesion: 's3', datos: { canal: 'copiado' }, creado_en: ahora },
  )
})

describe('GET /api/publicador/metricas', () => {
  it('solo ve SUS propiedades y los números de ellas, no los de otra cuenta', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const r = await GET(pedir('?dias=30'))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.propiedades.map((p: { id: string }) => p.id).sort()).toEqual(['a1', 'a2'])
    const a1 = j.propiedades.find((p: { id: string }) => p.id === 'a1')
    expect(a1).toMatchObject({ vistas: 2, whatsapp: 1, contactos: 1, solicitudes: 2, guardadas: 1, estado: 'publicada' })
    expect(JSON.stringify(j)).not.toMatch(/Casa de B|VB-3/)
    expect(j.resumen).toMatchObject({ porEstado: { publicada: 1, borrador: 1 }, vistasHistorico: 7 })
    expect(j.totales).toMatchObject({ propiedades: 2, vistas: 2 })
  })
  it('otra cuenta ve lo suyo y nada de la primera', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = OTRO
    const j = await (await GET(pedir())).json()
    expect(j.propiedades.map((p: { id: string }) => p.id)).toEqual(['b1'])
    expect(j.propiedades[0]).toMatchObject({ vistas: 3, telefono: 1, solicitudes: 1, guardadas: 2 })
    expect(JSON.stringify(j)).not.toMatch(/Casa de A|Borrador de A/)
  })
  it('un parámetro que intente elegir otro dueño no sirve: el filtro sale de la sesión', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const j = await (await GET(pedir('?owner_id=pub-B&uid=pub-B&propiedad=b1'))).json()
    expect(j.propiedades.map((p: { id: string }) => p.id).sort()).toEqual(['a1', 'a2'])
  })
  it('SOLO cantidades: nunca nombre, teléfono, correo ni datos internos de nadie', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const texto = JSON.stringify(await (await GET(pedir())).json())
    for (const dato of ['Ana Pérez', 'Marta', '4778116501', 'ana@x.com', 'luis@x.com', 'secreto@x.com', 'contacto_interno', 'owner_id']) expect(texto, dato).not.toContain(dato)
  })
  it('lo «general» es un promedio de todo el sitio, sin propiedades ni cuentas ajenas', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const j = await (await GET(pedir())).json()
    expect(j.generales).toEqual({ propiedadesPublicadasSitio: 2, vistasPromedioSitio: 2.5 })   // 5 vistas / 2 publicadas
  })
  it('quien no publica (cliente) recibe 403 y sin sesión 401, sin tocar la base', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = CLIENTE; e.consultas = []
    expect((await GET(pedir())).status).toBe(403)
    e.perfil = null
    expect((await GET(pedir())).status).toBe(401)
    expect(e.consultas).toEqual([])
  })
  it('una cuenta sin propiedades recibe listas vacías y totales en cero, no un error', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = { uid: 'nuevo', rol: 'publicador', superAdmin: false }
    const j = await (await GET(pedir())).json()
    expect(j.propiedades).toEqual([]); expect(j.totales).toMatchObject({ propiedades: 0, vistas: 0 }); expect(j.resumen.diasPromedioPublicadas).toBeNull()
  })
  it('valida el periodo', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    expect((await GET(pedir('?dias=1000'))).status).toBe(400)
    expect((await GET(pedir('?dias=7'))).status).toBe(200)
  })
})

describe('veces compartida, interesados y el detalle extra por CAPACIDAD', () => {
  it('el publicador normal ve las veces compartida y los interesados de lo suyo, pero NO el detalle de citas', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const j = await (await GET(pedir())).json()
    const a1 = j.propiedades.find((p: { id: string }) => p.id === 'a1')
    expect(a1).toMatchObject({ compartidas: 2, compartidasNativo: 1, compartidasCopiado: 1, solicitudes: 2, guardadas: 1 })
    expect(a1.citas).toBe(0)                 // no se consultaron: la cuenta no atiende citas
    expect(j.avanzado).toBeNull()
    expect(e.consultas).not.toContain('citas')
    expect(j.totales).toMatchObject({ compartidas: 2 })    // las compartidas de la otra cuenta (b1) no cuentan
  })
  it('quien tiene la capacidad de atender citas (el asociado) recibe además las citas de SUS propiedades y la serie diaria', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = ASOCIADO
    const j = await (await GET(pedir('?dias=7'))).json()
    const a1 = j.propiedades.find((p: { id: string }) => p.id === 'a1')
    expect(a1).toMatchObject({ citas: 3, citasConfirmadas: 1, citasCompletadas: 1 })
    expect(j.totales.citas).toBe(3)           // la cita de b1 es de otra cuenta
    expect(j.avanzado.vistasPorDia).toHaveLength(7)
    expect(j.avanzado.vistasPorDia.reduce((s: number, d: { vistas: number }) => s + d.vistas, 0)).toBe(2)
    expect(j.avanzado).toMatchObject({ compartidasNativo: 1, compartidasCopiado: 1 })
    expect(e.consultas).toContain('citas')
  })
  it('la capacidad la decide el servidor: ni «tipo» ni ningún parámetro del navegador la enciende', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    const j = await (await GET(pedir('?tipo=asociado&tipo_publicador=asociado&avanzado=1&recibir_citas=true'))).json()
    expect(j.avanzado).toBeNull()
  })
  it('con el detalle extra TAMPOCO sale ningún dato de las personas ni de las citas (con quién, cuándo)', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = ASOCIADO
    const texto = JSON.stringify(await (await GET(pedir())).json())
    for (const dato of ['Ana Pérez', 'Marta', '4778116501', 'ana@x.com', 'cliente_uid', 'asesor_uid', 'inicio']) expect(texto, dato).not.toContain(dato)
  })
  it('un cliente con la capacidad puesta a mano en la sesión igual recibe 403 (no es publicador)', async () => {
    const { GET } = await import('../src/app/api/publicador/metricas/route')
    e.perfil = { uid: 'cli', rol: 'cliente', superAdmin: false, capacidades: { recibir_citas: true } }
    expect((await GET(pedir())).status).toBe(403)
  })
})
