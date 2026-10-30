import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * E-53 (28-oct-2026): `html { scroll-behavior: smooth }` era global: quien pide «reducir movimiento» lo recibía igual (WCAG 2.3.3) y «Ver en el mapa»
 * del catálogo hacía `scrollIntoView({ behavior: 'smooth' })` sin mirar la preferencia. El scroll suave solo se activa con `no-preference`.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
const catalogo = readFileSync(join(process.cwd(), 'src/app/propiedades/page-client.tsx'), 'utf8')

describe('el scroll suave respeta «reducir movimiento»', () => {
  it('`scroll-behavior: smooth` vive solo dentro de prefers-reduced-motion: no-preference', () => {
    const fuera = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g, '')
    expect(fuera, 'hay un scroll-behavior: smooth fuera del bloque no-preference').not.toMatch(/scroll-behavior:\s*smooth/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*html \{ scroll-behavior: smooth; \}/)
  })
  it('«Ver en el mapa» consulta la preferencia antes de animar el scroll', () => {
    expect(catalogo).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    expect(catalogo).toMatch(/behavior: suave \? 'smooth' : 'auto'/)
  })
})
