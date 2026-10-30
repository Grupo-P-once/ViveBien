import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BARRERA (incidente 27-oct-2026, «tarjetas viejas»): el catálogo público NO puede volver a ISR con stale-while-revalidate. `export const revalidate` hacía que, tras un rato sin visitas o
 * justo después de editar una propiedad, la primera persona recibiera una copia vieja (se midió una de 705 s de antigüedad). Aquí se exige: dinámico, borde corto sin SWR, y copia en memoria
 * con edad máxima.
 */
const fuente = readFileSync(join(__dirname, '..', 'src', 'app', 'api', 'catalogo', 'route.ts'), 'utf8')
const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('catálogo público · frescura', () => {
  it('no usa ISR (`export const revalidate`) y es dinámico', () => {
    expect(sinComentarios).not.toMatch(/export\s+const\s+revalidate\b/)
    expect(sinComentarios).toMatch(/export\s+const\s+dynamic\s*=\s*'force-dynamic'/)
  })
  it('la respuesta buena se cachea poco en el borde y SIN stale-while-revalidate', () => {
    const m = /const CACHE_BORDE = '([^']+)'/.exec(sinComentarios)
    expect(m).not.toBeNull()
    const cabecera = m![1]
    expect(cabecera).not.toMatch(/stale-while-revalidate|stale-if-error/)
    const s = /s-maxage=(\d+)/.exec(cabecera)
    expect(s).not.toBeNull()
    expect(Number(s![1])).toBeLessThanOrEqual(30)
    expect(cabecera).toMatch(/max-age=0/)
  })
  it('la copia «última buena» en memoria tiene edad máxima (no se sirve una de hace horas)', () => {
    const m = /EDAD_MAXIMA_DE_LA_COPIA_MS\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/.exec(sinComentarios)
    expect(m).not.toBeNull()
    expect(Number(m![1]) * Number(m![2]) * Number(m![3])).toBeLessThanOrEqual(60 * 60 * 1000)
    expect(sinComentarios).toMatch(/Date\.now\(\)\s*-\s*ultimaBuena\.cuando\s*<=\s*EDAD_MAXIMA_DE_LA_COPIA_MS/)
  })
  it('las respuestas degradadas siguen sin cachearse', () => {
    expect(sinComentarios).toMatch(/'Cache-Control':\s*'no-store'/)
  })
})
