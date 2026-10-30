import { describe, it, expect } from 'vitest'
import { resolverCon } from '../src/lib/ficha-servidor'

/**
 * Un cliente falso que contesta lo que se le diga a cada consulta.
 *
 * `respuestas.slug` es lo que devuelve buscar por slug; `respuestas.id`, por id.
 */
function clienteFalso(respuestas: {
  slug?: { data: unknown; error: unknown }
  id?: { data: unknown; error: unknown }
}) {
  const pedidas: string[] = []
  const cliente = {
    from: () => ({
      select: () => ({
        eq: (columna: string) => ({
          maybeSingle: async () => {
            pedidas.push(columna)
            return (respuestas as Record<string, unknown>)[columna] ?? { data: null, error: null }
          },
        }),
      }),
    }),
  }
  return { cliente: cliente as never, pedidas }
}

const FILA = { id: 'propiedad-sin-titulo-d52n', slug: 'nave-industrial-en-venta-mandujano-leon-x7k2' }

describe('resolverCon', () => {
  it('encuentra por nombre público', async () => {
    const { cliente } = clienteFalso({ slug: { data: FILA, error: null } })
    const r = await resolverCon(cliente, FILA.slug)
    expect(r).toMatchObject({ estado: 'encontrada', por: 'slug' })
  })

  it('encuentra por el id de siempre cuando no hay slug con ese nombre', async () => {
    const { cliente } = clienteFalso({ id: { data: FILA, error: null } })
    const r = await resolverCon(cliente, FILA.id)
    expect(r).toMatchObject({ estado: 'encontrada', por: 'id' })
  })

  it('funciona antes de la migración 10: la columna slug aún no existe', async () => {
    const { cliente, pedidas } = clienteFalso({
      slug: { data: null, error: { code: '42703', message: 'column propiedades.slug does not exist' } },
      id: { data: FILA, error: null },
    })
    const r = await resolverCon(cliente, FILA.id)
    expect(r).toMatchObject({ estado: 'encontrada', por: 'id' })
    expect(pedidas).toEqual(['slug', 'id'])
  })

  it('«no existe» sólo cuando la base contestó sin error y sin filas', async () => {
    const { cliente } = clienteFalso({})
    expect(await resolverCon(cliente, 'no-existe')).toEqual({ estado: 'no-existe' })
  })

  it('una caída de la base NO se confunde con «no existe»', async () => {
    // La regresión que importa: supabase-js no lanza, devuelve { data: null,
    // error }. Tratarlo como «no existe» respondía 404 en TODAS las fichas
    // durante una caída, y un 404 saca las páginas del índice de Google.
    const { cliente } = clienteFalso({
      slug: { data: null, error: { code: 'PGRST000', message: 'connection refused' } },
    })
    const r = await resolverCon(cliente, FILA.id)
    expect(r.estado).toBe('error')
  })

  it('una caída al buscar por id tampoco es «no existe»', async () => {
    const { cliente } = clienteFalso({
      id: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    })
    const r = await resolverCon(cliente, FILA.id)
    expect(r.estado).toBe('error')
  })

  it('una excepción de red tampoco es «no existe»', async () => {
    const cliente = { from: () => { throw new Error('fetch failed') } } as never
    const r = await resolverCon(cliente, FILA.id)
    expect(r.estado).toBe('error')
  })
})
