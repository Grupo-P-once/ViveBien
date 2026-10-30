import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agruparPorPropiedad } from '../src/lib/portal/consultas-agrupadas'
import type { ConsultaVista, InteresVista } from '../src/lib/portal/pantallas'

/** «Me interesan» y «Mis consultas» se juntaron en una sola pantalla (24-oct-2026): una tarjeta por propiedad con todo lo que se hizo ahí. */

const tarjeta = (id: string) => ({ id, titulo: `Casa ${id}`, tipo: 'casa', tipoEtiqueta: 'Casa', ruta: `/propiedades/${id}`, foto: null, lugar: 'León', precio: '$1', iva: null, datos: [], publicadaEn: null })
const consulta = (id: number, propiedadId: string, creadoEn: string, tipo: 'visita' | 'informacion' = 'informacion'): ConsultaVista => ({
  id, propiedadId, propiedadTitulo: `Casa ${propiedadId}`, tipo, visitaPreferida: null, mensaje: 'hola', creadoEn, estado: 'enviada', propiedad: tarjeta(propiedadId), propiedadDisponible: true,
})
const interes = (id: string, interacciones: InteresVista['interacciones']): InteresVista => ({ ...tarjeta(id), disponible: true, interacciones, ultima: interacciones[0].cuando })

describe('agruparPorPropiedad', () => {
  it('junta las consultas de una misma propiedad en una sola tarjeta, de lo más reciente a lo más antiguo', () => {
    const g = agruparPorPropiedad([consulta(1, 'a', '2026-10-01T10:00:00Z'), consulta(2, 'a', '2026-10-03T10:00:00Z', 'visita'), consulta(3, 'b', '2026-10-02T10:00:00Z')], [])
    expect(g.map((x) => x.id)).toEqual(['a', 'b'])
    expect(g[0].pasos.map((p) => p.que)).toEqual(['visita', 'informacion'])
  })
  it('suma las citas agendadas, pero NO duplica los informes ni las visitas pedidas (esos ya vienen de las consultas)', () => {
    const g = agruparPorPropiedad(
      [consulta(1, 'a', '2026-10-01T10:00:00Z')],
      [interes('a', [{ que: 'cita', cuando: '2026-10-05T10:00:00Z', estado: 'confirmada' }, { que: 'informacion', cuando: '2026-10-01T10:00:00Z' }])],
    )
    expect(g).toHaveLength(1)
    expect(g[0].pasos.map((p) => p.que)).toEqual(['cita', 'informacion'])
  })
  it('una propiedad con solo cita también aparece, y sin nada no hay tarjetas', () => {
    expect(agruparPorPropiedad([], [interes('z', [{ que: 'cita', cuando: '2026-10-05T10:00:00Z' }])]).map((x) => x.id)).toEqual(['z'])
    expect(agruparPorPropiedad([], [])).toEqual([])
  })
})

describe('«Me interesan» ya no tiene entrada propia', () => {
  const leer = (r: string) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8')
  it('el enlace viejo redirige a «Mis consultas» y el menú ya no lo ofrece', () => {
    expect(leer('src/app/portal/propiedades/page.tsx')).toMatch(/redirect\('\/portal\/consultas'\)/)
    expect(leer('src/components/portal/BarraLateralPortal.tsx')).not.toMatch(/me-interesan/)
  })
})
