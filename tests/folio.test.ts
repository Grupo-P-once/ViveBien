import { describe, it, expect } from 'vitest'
import { esFolio, normalizarFolio } from '../src/lib/folio'
import { resolverCon } from '../src/lib/ficha-servidor'

describe('folio — lo que se dicta por teléfono', () => {
  it('reconoce el folio escrito como sea', () => {
    for (const t of ['VB-2026-00006', 'vb-2026-00006', ' VB 2026 00006 ', 'VB2026-00006', 'vb-2026-6']) {
      expect(esFolio(t)).toBe(true)
      expect(normalizarFolio(t)).toBe('VB-2026-00006')
    }
  })

  it('no confunde un slug ni un id con un folio', () => {
    for (const t of ['nave-industrial-en-venta-mandujano-leon-jdoo', 'sanjuan', 'propiedad-sin-titulo-d52n', 'VB-26-00006', 'XX-2026-00006']) {
      expect(esFolio(t)).toBe(false)
    }
  })
})

function clienteFalso(respuestas: Record<string, { data: unknown; error: unknown }>) {
  const pedidas: string[] = []
  const cliente = {
    from: () => ({
      select: () => ({
        eq: (columna: string, valor: string) => ({
          maybeSingle: async () => {
            pedidas.push(`${columna}=${valor}`)
            return respuestas[columna] ?? { data: null, error: null }
          },
        }),
      }),
    }),
  }
  return { cliente: cliente as never, pedidas }
}

describe('resolverCon — por folio', () => {
  const FILA = { id: 'propiedad-sin-titulo-d52n', slug: 'nave-industrial-en-venta-mandujano-leon-jdoo', folio: 'VB-2026-00006' }

  it('un folio en minúsculas encuentra la propiedad', async () => {
    const { cliente, pedidas } = clienteFalso({ folio: { data: FILA, error: null } })
    const r = await resolverCon(cliente, 'vb-2026-00006')
    expect(r).toMatchObject({ estado: 'encontrada', por: 'folio' })
    // Se busca normalizado: en la base está en mayúsculas.
    expect(pedidas[0]).toBe('folio=VB-2026-00006')
  })

  it('un slug normal no pregunta por folio', async () => {
    const { cliente, pedidas } = clienteFalso({ slug: { data: FILA, error: null } })
    await resolverCon(cliente, FILA.slug)
    expect(pedidas.some((p) => p.startsWith('folio='))).toBe(false)
  })

  it('un folio que no existe sigue buscando y acaba en «no existe»', async () => {
    const { cliente } = clienteFalso({})
    expect(await resolverCon(cliente, 'VB-2026-99999')).toEqual({ estado: 'no-existe' })
  })

  it('una caída de la base al buscar por folio NO es «no existe»', async () => {
    const { cliente } = clienteFalso({ folio: { data: null, error: { code: 'PGRST000', message: 'caida' } } })
    expect((await resolverCon(cliente, 'VB-2026-00006')).estado).toBe('error')
  })
})
