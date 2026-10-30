import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aHref, coincide, describir, filtrosDeUrl, normalizarFiltros, type Filtros, type PropiedadBuscable } from '../src/lib/busquedas'

/**
 * CIERRE (28-oct-2026) — «Guardar búsqueda» con los filtros nuevos: lo que la página manda se guarda NORMALIZADO, se restaura igual desde el enlace del panel
 * (`aHref` → URL → `filtrosDeUrl`) y sigue decidiendo lo mismo sobre una propiedad. Lo inválido no se guarda. Base y sesión simuladas; sin red.
 */
const guardadas: Array<{ uid: string; nombre: string; filtros: Filtros }> = []
vi.mock('@/lib/auth-server', () => ({
  exigir: async () => ({ perfil: { uid: 'u-1' } }),
  supabaseAdmin: () => ({
    from: () => {
      let insertada: { uid: string; nombre: string; filtros: Filtros } | null = null
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b,
        insert: (fila: { uid: string; nombre: string; filtros: Filtros }) => { insertada = fila; guardadas.push(fila); return b },
        maybeSingle: async () => ({ data: { id: 7 }, error: null }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: insertada ? [] : guardadas.map((g, i) => ({ id: i + 1, filtros: g.filtros })), error: null }).then(ok),
      }
      return b
    },
  }),
}))

const PAGINA = {   // la forma EXACTA del estado de page-client (todo texto)
  op: 'venta', tipo: 'casa', zona: '', precioMin: '', precioMax: '', rec: '', ban: '3', est: '0', smin: '', smax: '', amu: '', masc: '', sub: '',
  car: 'alberca, permite mascotas', cmin: '100', cmax: '', tmin: '', tmax: '400', amb: 'estudio,bodega', gen: 'alberca', ext: 'jardin,terraza', srv: 'caseta', ame: 'gimnasio', mm: 'planos', ant: '10', pub: '30', dir: 'Álamo',
}

beforeEach(() => { guardadas.length = 0 })

describe('Guardar búsqueda con «Más filtros»', () => {
  it('POST guarda los filtros nuevos normalizados, se restauran por la URL y deciden igual', async () => {
    const { POST } = await import('../src/app/api/busquedas/route')
    const r = await POST(new Request('http://localhost/api/busquedas', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.20' }, body: JSON.stringify({ filtros: PAGINA }) }))
    expect(r.status).toBe(200)
    expect(guardadas).toHaveLength(1)
    const guardado = guardadas[0].filtros
    for (const k of ['car', 'cmin', 'tmax', 'amb', 'gen', 'ext', 'srv', 'ame', 'mm', 'ant', 'pub', 'dir', 'ban', 'est'] as const) expect(guardado[k], `se perdió «${k}» al guardar`).toBeDefined()
    expect(guardado.amb).toEqual(['bodega', 'estudio'].sort()) // normalizado y ordenado
    expect(guardado.est).toBe(0)
    // restaurar: enlace → URL → filtros idénticos
    const href = aHref(guardado)
    const restaurado = filtrosDeUrl(new URL(href, 'http://x').searchParams)
    expect(restaurado).toEqual(guardado)
    expect(describir(guardado).length).toBeGreaterThan(0)
    // y siguen EXCLUYENDO: una propiedad que no cumple queda fuera con el filtro restaurado
    const sinNada: PropiedadBuscable = { operacion: 'venta', tipo: 'casa', precio: 1, metros: 500, banos: 1, estatus: 'disponible', ubicacion: 'Otra', colonia: 'x', videos: [], planos: [], extras: null }
    expect(coincide(sinNada, restaurado!, Date.now())).toBe(false)
  })

  it('valores inválidos no se guardan; sin ningún filtro válido responde 400', async () => {
    const { POST } = await import('../src/app/api/busquedas/route')
    const r = await POST(new Request('http://localhost/api/busquedas', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.21' }, body: JSON.stringify({ filtros: { ban: 'abc', gen: 'inventada', ant: 'nunca', cmin: '-5' } }) }))
    expect(r.status).toBe(400)
    expect(guardadas).toHaveLength(0)
    expect(normalizarFiltros({ ban: 'abc', gen: 'inventada', ant: 'nunca', cmin: '-5' })).toBeNull()
  })
})
