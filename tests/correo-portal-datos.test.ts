import { describe, expect, it } from 'vitest'
import { datosDelPortal } from '../src/lib/correo/transaccionales'
import type { DbCorreo } from '../src/lib/correo/enviar'

/** D-80 — las cifras de la bienvenida del portal son las de la base o no se enseñan: nada de ceros por defecto. */
type Fila = Record<string, unknown>
const prop = (id: string, extra: Fila = {}): Fila => ({
  id, titulo: `Casa ${id}`, tipo: 'casa', operacion: 'venta', precio: 2_000_000, ubicacion: 'León, Gto.', colonia: null, ciudad: null, metros: 150,
  estatus: 'disponible', estado_pub: 'publicada', slug: `casa-${id}`, fotos: ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg'],
  publicada_en: `2026-10-0${id}T00:00:00Z`, ...extra,
})

function dbFalsa(opciones: { conteos?: Record<string, number | null>; propiedades?: Fila[]; falla?: 'propiedades' | 'excepcion' } = {}): DbCorreo {
  const conteos = { favoritos: 2, busquedas_guardadas: 1, citas: 0, ...(opciones.conteos ?? {}) }
  return {
    rpc: async () => ({ data: null, error: null }),
    from: (tabla: string) => {
      if (opciones.falla === 'excepcion') throw new Error('sin conexión')
      const q: Record<string, unknown> = {}
      const encadenar = () => q
      for (const m of ['eq', 'in', 'order', 'limit']) q[m] = encadenar
      q.select = (_c: string, o?: { count?: string }) => {
        if (o?.count) {
          const n = conteos[tabla as keyof typeof conteos]
          return { eq: () => ({ in: async () => ({ count: n, error: n === null ? { message: 'x' } : null }), then: undefined }), then: undefined, ...{ } } as unknown
        }
        return q
      }
      // los conteos de `favoritos` y `busquedas_guardadas` terminan en `.eq(...)`; los de `citas`, en `.eq(...).in(...)`
      if (tabla === 'favoritos' || tabla === 'busquedas_guardadas') {
        q.select = () => ({ eq: async () => ({ count: conteos[tabla], error: conteos[tabla] === null ? { message: 'x' } : null }) })
      }
      if (tabla === 'propiedades') {
        q.select = () => ({ eq: () => ({ order: () => ({ limit: async () => (opciones.falla === 'propiedades' ? { data: null, error: { message: 'x' } } : { data: opciones.propiedades ?? [], error: null }) }) }) })
      }
      return q
    },
  }
}

describe('datosDelPortal', () => {
  it('cifras reales y las tres propiedades publicadas más recientes (sin pausadas ni borradores)', async () => {
    const r = await datosDelPortal(dbFalsa({ propiedades: [prop('1'), prop('2'), prop('3'), prop('4', { estatus: 'pausada' }), prop('5', { estado_pub: 'borrador' })] }), 'uid-1')
    expect(r.resumen).toEqual({ guardadas: 2, busquedas: 1, citas: 0 })
    expect(r.propiedades.map((p) => p.titulo)).toEqual(['Casa 3', 'Casa 2', 'Casa 1'])
  })

  it('si no se pudo leer algo, esa parte se omite: ni cifras inventadas ni un correo caído', async () => {
    expect((await datosDelPortal(dbFalsa({ conteos: { favoritos: null } }), 'u')).resumen).toBeNull()
    const sinCatalogo = await datosDelPortal(dbFalsa({ falla: 'propiedades' }), 'u')
    expect(sinCatalogo).toEqual({ resumen: null, propiedades: [] })
    expect(await datosDelPortal(dbFalsa({ falla: 'excepcion' }), 'u')).toEqual({ resumen: null, propiedades: [] })
  })
})
