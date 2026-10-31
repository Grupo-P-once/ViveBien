import { describe, expect, it } from 'vitest'
import { catalogoCompleto, vistaPrevia } from '../src/lib/correo/biblioteca'

/**
 * Legibilidad mínima del texto legal pequeño de los correos (revisión visual, 1-nov-2026): el aviso «La disponibilidad, el precio y las condiciones de las propiedades pueden
 * cambiar…» estaba en 10 px; debe ser de 12 px o más. (Las etiquetas decorativas en mayúsculas y las insignias de tipo de propiedad son un criterio de diseño aparte.)
 */
describe('texto legal pequeño legible', () => {
  const conAviso = catalogoCompleto().filter((e) => e.conVista).map((e) => vistaPrevia(e.id)).filter((v) => v && v.html.includes('La disponibilidad, el precio y las condiciones'))

  it('hay correos con ese aviso y ninguno lo muestra por debajo de 12 px', () => {
    expect(conAviso.length).toBeGreaterThanOrEqual(5)
    for (const v of conAviso) {
      const m = v!.html.match(/<p style="([^"]*)">La disponibilidad, el precio y las condiciones/)
      expect(m, v!.asunto).toBeTruthy()
      const px = Number(m![1].match(/font-size:(\d+)px/)?.[1])
      expect(px, v!.asunto).toBeGreaterThanOrEqual(12)
    }
  })
})
