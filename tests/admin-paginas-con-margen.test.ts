import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Las pantallas de /admin llevan su propio contenedor con aire lateral (`<main className="mx-auto w-full max-w-… px-4 …">`): el shell no lo pone.
 * Sin él, el texto sale pegado a la barra lateral y al borde derecho (Comisiones salió así el 25-oct-2026).
 */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', 'src', 'app', 'admin', ...r), 'utf8')

describe('pantallas de Comisiones con margen', () => {
  for (const [nombre, archivo] of [['/admin/comisiones', ['comisiones', 'page.tsx']], ['/admin/propiedades/[id]/revision', ['propiedades', '[id]', 'revision', 'page.tsx']]] as const) {
    it(`${nombre} se envuelve en <main> con ancho máximo, centrado y relleno lateral`, () => {
      const t = leer(...archivo)
      expect(t).toMatch(/<main className="mx-auto w-full max-w-\[\d+px\][^"]*\bpx-4\b[^"]*\bsm:px-6\b[^"]*\blg:px-8\b/)
      expect(t).toContain('</main>')
    })
  }
})
