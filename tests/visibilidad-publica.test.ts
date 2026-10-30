import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { esVisibleAlPublico, ESTATUS_OCULTOS_AL_PUBLICO } from '../src/lib/visibilidad-publica'
import { resolverCon } from '../src/lib/ficha-servidor'

const leer = (ruta: string) => readFileSync(ruta, 'utf8')

describe('esVisibleAlPublico (D-59)', () => {
  it('publicada + disponible es visible', () => {
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: 'disponible' })).toBe(true)
  })
  it('publicada + pausada NO es visible', () => {
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: 'pausada' })).toBe(false)
  })
  it('publicada + eliminada (archivada) NO es visible', () => {
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: 'eliminada' })).toBe(false)
  })
  it('vendida y rentada YA NO se ven en el sitio (decisión del dueño, 26-oct-2026: viven en «Rentadas / Vendidas» del panel)', () => {
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: 'vendida' })).toBe(false)
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: 'rentada' })).toBe(false)
  })
  it('estatus nulo o ausente es visible (no se pierde por un NULL)', () => {
    expect(esVisibleAlPublico({ estado_pub: 'publicada', estatus: null })).toBe(true)
    expect(esVisibleAlPublico({ estado_pub: 'publicada' })).toBe(true)
    expect(esVisibleAlPublico({ estatus: 'disponible' })).toBe(true)
  })
  it('borrador / revisión / cambios / rechazada siguen privados, sea cual sea el estatus', () => {
    for (const e of ['borrador', 'en_revision', 'cambios_solicitados', 'rechazada']) {
      expect(esVisibleAlPublico({ estado_pub: e, estatus: 'disponible' })).toBe(false)
    }
  })
  it('null / undefined no es visible', () => {
    expect(esVisibleAlPublico(null)).toBe(false)
    expect(esVisibleAlPublico(undefined)).toBe(false)
  })
  it('se esconden pausada, eliminada, vendida y rentada (solo «disponible» se ve)', () => {
    expect([...ESTATUS_OCULTOS_AL_PUBLICO]).toEqual(['pausada', 'eliminada', 'vendida', 'rentada'])
  })
})

function clienteCon(fila: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: fila, error: null }) }),
      }),
    }),
  } as never
}

describe('ficha pública: resolverCon respeta el estatus comercial', () => {
  const base = { id: 'x', slug: 'casa-x', estado_pub: 'publicada' }
  it('disponible → encontrada', async () => {
    expect(await resolverCon(clienteCon({ ...base, estatus: 'disponible' }), 'casa-x')).toMatchObject({ estado: 'encontrada' })
  })
  it('vendida y rentada → no-existe (404): ya no se muestran en el sitio', async () => {
    expect(await resolverCon(clienteCon({ ...base, estatus: 'vendida' }), 'casa-x')).toEqual({ estado: 'no-existe' })
    expect(await resolverCon(clienteCon({ ...base, estatus: 'rentada' }), 'casa-x')).toEqual({ estado: 'no-existe' })
  })
  it('pausada → no-existe (404)', async () => {
    expect(await resolverCon(clienteCon({ ...base, estatus: 'pausada' }), 'casa-x')).toEqual({ estado: 'no-existe' })
  })
  it('eliminada → no-existe (404)', async () => {
    expect(await resolverCon(clienteCon({ ...base, estatus: 'eliminada' }), 'casa-x')).toEqual({ estado: 'no-existe' })
  })
  it('borrador → no-existe', async () => {
    expect(await resolverCon(clienteCon({ ...base, estado_pub: 'borrador', estatus: 'disponible' }), 'casa-x')).toEqual({ estado: 'no-existe' })
  })
})

describe('todos los lectores públicos usan la regla única', () => {
  it.each([
    'src/app/api/catalogo/route.ts',
    'src/app/sitemap.ts',
    'src/lib/ficha-servidor.ts',
    'src/app/propiedades/[id]/page-client.tsx',
  ])('%s importa esVisibleAlPublico', (ruta) => {
    expect(leer(ruta)).toContain('esVisibleAlPublico')
  })
  it('E-35: /api/admin/propiedades YA NO es un lector público: exige administrador antes de consultar (la lectura pública es /api/catalogo)', () => {
    const src = leer('src/app/api/admin/propiedades/route.ts')
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(get).toContain('await requireAdmin(req)')
    expect(get.indexOf('requireAdmin')).toBeLessThan(get.indexOf('.from('))
    expect(src).not.toContain('esVisibleAlPublico')
  })
  it('el sitemap filtra antes de generar las URLs', () => {
    const src = leer('src/app/sitemap.ts')
    expect(src.indexOf('.filter(esVisibleAlPublico)')).toBeGreaterThan(-1)
    expect(src.indexOf('.filter(esVisibleAlPublico)')).toBeLessThan(src.indexOf('rutaDe(p)}`'))
  })
})
