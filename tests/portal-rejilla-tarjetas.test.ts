import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * E-52 (28-oct-2026): a 390 px, en «Mis guardadas» con datos, la tarjeta medía 610 px (x 16→627) y el corazón quedaba FUERA de la pantalla:
 * el cliente no podía quitar una propiedad desde el móvil. Causa: `grid gap-4` sin definir la columna → la pista toma el ancho MÍNIMO del contenido
 * y el `truncate` del lugar (white-space: nowrap) lo ensancha. `grid-cols-1` equivale a `minmax(0, 1fr)`: el texto se recorta y la columna no crece.
 * El recorrido anterior no lo vio porque corría con listas vacías.
 *
 * AMPLIADO (28-oct, tarde): el recorrido CON DATOS (`tests-visual/portal-cliente-con-datos.e2e.ts`) encontró el MISMO defecto en otras 5 rejillas
 * (Mis consultas, Inicio ×2, Perfil, Visitas): «Ver todas» quedaba en x=763..844 en un viewport de 390. La primera versión de esta barrera nombraba 4 pantallas
 * y por eso no las cubría. Ahora examina TODOS los archivos de `components/portal` y exige que cualquier `grid` con columnas por breakpoint lleve una columna
 * base (`grid-cols-1` o una plantilla explícita). Lista de excepciones = archivos de OTRO rol, con su motivo.
 */
const DIR = join(process.cwd(), 'src/components/portal')
const FUERA_DE_ALCANCE: Record<string, string> = {
  'TablaMisPropiedades.tsx': 'rol publicador: fuera del alcance de la auditoría del cliente (misma familia; anotado como observación, sin tocar)',
}

const RE_REJILLA = /className="([^"]*\bgrid\b[^"]*)"/g
const conColumnasPorBreakpoint = (c: string) => /(?:^|\s)(?:sm|md|lg|xl|2xl):grid-cols-/.test(c)
const tieneColumnaBase = (c: string) => /(?:^|\s)grid-cols-(?:1|\[)/.test(c)

const archivos = readdirSync(DIR).filter((f) => f.endsWith('.tsx'))

describe('las rejillas del portal no crecen con el texto (E-52)', () => {
  it('hay archivos que examinar', () => { expect(archivos.length).toBeGreaterThan(10) })

  for (const archivo of archivos) {
    if (FUERA_DE_ALCANCE[archivo]) continue
    it(`${archivo}: toda rejilla con columnas por breakpoint lleva columna base (grid-cols-1)`, () => {
      const fuente = readFileSync(join(DIR, archivo), 'utf8')
      const malas = [...fuente.matchAll(RE_REJILLA)].map((m) => m[1]).filter((c) => conColumnasPorBreakpoint(c) && !tieneColumnaBase(c))
      expect(malas, `rejillas sin grid-cols-1 en ${archivo}: ${malas.map((c) => `"${c}"`).join(' | ')}`).toEqual([])
    })
  }

  it('las excepciones siguen existiendo y tienen motivo (no se acumulan archivos fantasma)', () => {
    for (const [archivo, motivo] of Object.entries(FUERA_DE_ALCANCE)) {
      expect(archivos, archivo).toContain(archivo)
      expect(motivo.length).toBeGreaterThan(20)
    }
  })

  it('las 4 pantallas de tarjetas de propiedad (las de E-52) siguen cubiertas por nombre', () => {
    for (const n of ['GuardadasPortal.tsx', 'InteresanPortal.tsx', 'InicioPortal.tsx', 'AlertasPortal.tsx']) expect(archivos).toContain(n)
  })
})
