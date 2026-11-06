import { describe, expect, it } from 'vitest'
import { conParecidoA, elegirPropiedades, leerPreferencias, motivoParecido } from '../src/lib/correo/recomendaciones'
import { ultimaPropiedadVista } from '../src/lib/correo/tarea'
import { CORREO, TEXTO_CONSENTIMIENTO_MARKETING, VERSION_CONSENTIMIENTO_MARKETING } from '../src/lib/correo/config'
import type { DbCorreo } from '../src/lib/correo/enviar'
import type { FilaPropiedadPortal } from '../src/lib/portal/tarjeta'

/**
 * Marketing (decisión del dueño, 6-nov-2026): una vez cada 7 días, 50 personas por ejecución, y las propiedades nuevas que se
 * mandan son PARECIDAS a la última que la persona vio: mínimo el mismo tipo (casa → casas, oficina → oficinas).
 */
const fila = (id: string, extra: Partial<FilaPropiedadPortal> = {}): FilaPropiedadPortal => ({
  id, titulo: `Propiedad ${id}`, tipo: 'casa', operacion: 'venta', precio: 3_000_000, precio_incluye_iva: false, moneda: 'MXN',
  ubicacion: 'León, Guanajuato', colonia: null, ciudad: null, metros: 180, recamaras: 3, banos: 2, altura_libre: null, andenes: null,
  estatus: 'disponible', estado_pub: 'publicada', slug: `propiedad-${id}`, fotos: [],
  publicada_en: `2026-10-0${id}T00:00:00Z`, created_at: `2026-10-0${id}T00:00:00Z`, ...extra,
} as FilaPropiedadPortal)

const catalogo = [
  fila('1', { tipo: 'casa' }), fila('2', { tipo: 'oficina' }), fila('3', { tipo: 'casa', operacion: 'renta' }),
  fila('4', { tipo: 'oficina' }), fila('5', { tipo: 'nave' }), fila('6', { tipo: 'depto' }), fila('7', { tipo: 'departamento' }),
]
const ids = (v: { tipo?: string | null; operacion?: string | null } | null, prefs: unknown = {}) =>
  elegirPropiedades(conParecidoA(leerPreferencias(prefs), v as never), catalogo, new Set(), 10).map((p) => p.id).sort()

describe('parecidas a la última propiedad vista', () => {
  it('vio una casa en venta → sólo casas en venta (no oficinas, ni naves, ni casas en renta)', () => {
    expect(ids({ tipo: 'casa', operacion: 'venta' })).toEqual(['1'])
  })
  it('vio una oficina → sólo oficinas', () => {
    expect(ids({ tipo: 'oficina', operacion: 'venta' })).toEqual(['2', '4'])
  })
  it('depto y departamento son el mismo tipo en los dos sentidos', () => {
    expect(ids({ tipo: 'depto', operacion: 'venta' })).toEqual(['6', '7'])
    expect(ids({ tipo: 'departamento', operacion: 'venta' })).toEqual(['6', '7'])
  })
  it('la operación de la propiedad vista se respeta: vio una renta → sólo rentas del mismo tipo', () => {
    expect(ids({ tipo: 'casa', operacion: 'renta' })).toEqual(['3'])
  })
  it('lo que la persona eligió a mano manda: tipos declarados no se pisan con lo último que vio', () => {
    expect(ids({ tipo: 'casa', operacion: 'venta' }, { tipos: ['nave'] })).toEqual(['5'])
  })
  it('sin propiedad vista, o sin tipo reconocible, no se inventa nada (queda lo de siempre)', () => {
    expect(ids(null)).toHaveLength(7)
    expect(ids({ tipo: null, operacion: 'venta' })).toHaveLength(7)
    expect(ids({ tipo: '  ', operacion: null })).toHaveLength(7)
  })
  it('no repite lo ya enviado y respeta el máximo', () => {
    const p = conParecidoA(leerPreferencias({}), { tipo: 'oficina', operacion: 'venta' } as never)
    expect(elegirPropiedades(p, catalogo, new Set(['2']), 10).map((x) => x.id)).toEqual(['4'])
    expect(elegirPropiedades(p, catalogo, new Set(), 1)).toHaveLength(1)
  })
  it('la frase del correo explica el parecido sin datos de la persona', () => {
    const f = motivoParecido(conParecidoA(leerPreferencias({}), { tipo: 'casa', operacion: 'renta' } as never))
    expect(f).toBe('Viste una propiedad de tipo casa en renta en VIVE BIEN; estas son propiedades nuevas parecidas.')
  })
})

describe('ultimaPropiedadVista', () => {
  const dbCon = (eventos: unknown, propiedades: unknown = { data: null, error: null }): DbCorreo => {
    const cadena = (res: unknown) => {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c
      c.maybeSingle = () => Promise.resolve(res)
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok)
      return c
    }
    return { rpc: async () => ({ data: null, error: null }), from: (t: string) => cadena(t === 'eventos' ? eventos : propiedades) }
  }
  it('toma la más reciente con propiedad (ignora eventos sin propiedad) y la lee del catálogo', async () => {
    const db = dbCon({ data: [{ propiedad_id: null }, { propiedad_id: '4' }, { propiedad_id: '1' }], error: null })
    expect(await ultimaPropiedadVista(db, 'u1', catalogo)).toEqual({ tipo: 'oficina', operacion: 'venta' })
  })
  it('si ya no está en el catálogo (vendida, pausada) usa su tipo desde la tabla', async () => {
    const db = dbCon({ data: [{ propiedad_id: 'vieja' }], error: null }, { data: { tipo: 'casa', operacion: 'renta' }, error: null })
    expect(await ultimaPropiedadVista(db, 'u1', catalogo)).toEqual({ tipo: 'casa', operacion: 'renta' })
  })
  it('sin eventos, con error o sin la propiedad: null (se manda lo de siempre, nunca falla)', async () => {
    expect(await ultimaPropiedadVista(dbCon({ data: [], error: null }), 'u1', catalogo)).toBeNull()
    expect(await ultimaPropiedadVista(dbCon({ data: null, error: { message: 'x' } }), 'u1', catalogo)).toBeNull()
    expect(await ultimaPropiedadVista(dbCon({ data: [{ propiedad_id: 'zzz' }], error: null }, { data: null, error: null }), 'u1', catalogo)).toBeNull()
  })
})

describe('frecuencia, lote y consentimiento', () => {
  it('una vez cada 7 días y 50 personas por ejecución', () => {
    expect(CORREO.entreMarketingDias).toBe(7)
    expect(CORREO.loteMarketing).toBe(50)
  })
  it('el texto que acepta la persona dice siete días y la actividad en el sitio, con versión nueva', () => {
    expect(VERSION_CONSENTIMIENTO_MARKETING).toBe('marketing-2026-11-v3')
    expect(TEXTO_CONSENTIMIENTO_MARKETING).toMatch(/una cada siete días/)
    expect(TEXTO_CONSENTIMIENTO_MARKETING).toMatch(/última propiedad que consultaste/)
    expect(TEXTO_CONSENTIMIENTO_MARKETING).toMatch(/baja con un clic/)
    expect(TEXTO_CONSENTIMIENTO_MARKETING).not.toMatch(/tres días/)
  })
})
