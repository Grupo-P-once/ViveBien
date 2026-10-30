import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * La cola de revisión abría la ficha pública con «Vista previa», y esa ficha solo existe para lo publicado: toda propiedad en revisión daba 404
 * (25-oct-2026). El equipo revisa en su propia pantalla, que además muestra el origen, la comisión y las fotos completas.
 */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', ...r), 'utf8')

describe('cola de revisión', () => {
  const cola = leer('src', 'app', 'admin', 'propiedades', 'pendientes', 'page.tsx')
  it('«Vista previa» abre la revisión del equipo, no la ficha pública', () => {
    expect(cola).toContain('/admin/propiedades/${p.id}/revision')
    expect(cola).not.toMatch(/href=\{`\/propiedades\/\$\{p\.id\}`\}/)
  })
  it('la ruta de datos de la revisión exige poder moderar', () => {
    const ruta = leer('src', 'app', 'api', 'admin', 'propiedades', '[id]', 'revision', 'route.ts')
    expect(ruta).toContain("exigir(req, 'propiedad.moderar')")
  })
})
