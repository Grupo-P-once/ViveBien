import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * E-51 (28-oct-2026): los botones-enlace del panel y del portal (`<Button asChild><Link>`) salían con texto casi negro sobre el rojo
 * (#1d1d20 sobre #971010 = 1,91:1; hacen falta 4,5:1). Causa: el reset global `a:not([data-pantalla] a)` (sin capa) tiene especificidad (0,1,2)
 * y le ganaba a `.panel-vb a { color: revert-layer }` (0,1,1), así que el color de la utilidad `text-primary-foreground` nunca llegaba.
 * Alguien lo había parchado botón por botón con `!text-primary-foreground`; la raíz es que el reset no debe aplicarse dentro del panel.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

describe('el reset de enlaces no se aplica dentro del panel', () => {
  it('la regla global de <a> excluye `.panel-vb a`', () => {
    const m = css.match(/^a:not\(([^)]*)\)\s*\{[^}]*color:\s*inherit/m)
    expect(m, 'no se encontró el reset global de enlaces').not.toBeNull()
    expect(m![1]).toContain('.panel-vb a')
    expect(m![1]).toContain('[data-pantalla] a')
  })

  it('el panel sigue devolviendo el color de los enlaces a la capa de utilidades', () => {
    expect(css).toMatch(/\.panel-vb a,[\s\S]*?\{\s*color:\s*revert-layer;/)
  })
})
