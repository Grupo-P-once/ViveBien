import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ocultarBoton, SIN_BOTON } from '@/components/WAFloat'

/**
 * El flotante de WhatsApp tapaba controles del portal a 390 px.
 *
 * Encontrado el 29-sep-2026 en la revisión visual de 03.06 y registrado en el
 * plan. **El instrumento no lo detecta**: `verificar-*.mjs` mide desborde
 * horizontal, axe y errores JS, no que un elemento `fixed` se monte encima de
 * otro. Así que la garantía tiene que vivir aquí.
 *
 * Esto no comprueba píxeles —eso pide navegador— sino que la reserva de
 * espacio siga existiendo y siga cubriendo 390 px. Si alguien cambia el
 * `max-width` a 360, o borra el `data-portal-contenido`, esta prueba se pone
 * roja y dice por qué.
 */

const raiz = process.cwd()
const css = readFileSync(join(raiz, 'src/app/globals.css'), 'utf8')
const shell = readFileSync(
  join(raiz, 'src/components/portal/PortalShell.tsx'),
  'utf8',
)
const wafloat = readFileSync(join(raiz, 'src/components/WAFloat.tsx'), 'utf8')

/** El bloque `@media` que contiene el selector, con sus llaves equilibradas. */
function bloqueMediaQueContiene(selector: string): string | null {
  let desde = 0
  for (;;) {
    const i = css.indexOf('@media', desde)
    if (i === -1) return null
    const abre = css.indexOf('{', i)
    let nivel = 0
    let j = abre
    for (; j < css.length; j++) {
      if (css[j] === '{') nivel++
      else if (css[j] === '}') { nivel--; if (nivel === 0) break }
    }
    const bloque = css.slice(i, j + 1)
    if (bloque.includes(selector)) return bloque
    desde = j + 1
  }
}

describe('reserva de espacio para el flotante', () => {
  it('el contenedor del portal lleva el gancho `data-portal-contenido`', () => {
    /* Se busca el ATRIBUTO en un elemento, no la cadena en el archivo: la
       primera versión de esta prueba pasaba con el gancho borrado, porque el
       comentario que lo explica también contiene el nombre. Lo cazó la
       regresión adversarial. */
    const sinComentarios = shell.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(sinComentarios).toMatch(/<div[^>]*\sdata-portal-contenido[\s>]/)
    expect(sinComentarios).toMatch(/data-portal-contenido>\{children\}/)
  })

  it('globals.css reserva espacio inferior para ese contenedor', () => {
    const bloque = bloqueMediaQueContiene('[data-portal-contenido]')
    expect(bloque, 'no hay ningún @media con la reserva').not.toBeNull()
    expect(bloque!).toMatch(/padding-bottom:\s*\d+px/)
  })

  it('la reserva cubre 390 px — el ancho donde se midió el fallo', () => {
    const bloque = bloqueMediaQueContiene('[data-portal-contenido]')!
    const m = bloque.match(/max-width:\s*(\d+)px/)
    expect(m, 'la media query debe acotarse por max-width').not.toBeNull()
    const limite = Number(m![1])
    // 390 es el viewport donde se vio tapado «Añadir» y «Visitas agendadas».
    expect(limite).toBeGreaterThanOrEqual(390)
    // Y no debe pasarse a escritorio, donde no ocurre y metería un hueco.
    expect(limite).toBeLessThan(1024)
  })

  it('reserva al menos lo que el botón ocupa: 60 + 28 = 88 px', () => {
    const bloque = bloqueMediaQueContiene('[data-portal-contenido]')!
    const px = Number(bloque.match(/padding-bottom:\s*(\d+)px/)![1])
    expect(px).toBeGreaterThanOrEqual(88)
  })

  it('el botón sigue midiendo 60 px a 28 px de la esquina', () => {
    // Si esto cambia, la cuenta de 104 px hay que rehacerla.
    expect(wafloat).toContain("bottom: '28px'")
    expect(wafloat).toContain("right: '28px'")
    expect(wafloat).toContain("width: '60px'")
  })

  it('no usa una utilidad `pb-*` de Tailwind, que E-20 deja inerte', () => {
    // `globals.css:252` tiene un reset sin capa que gana a `@layer utilities`:
    // un `pb-26` aquí se escribiría y no se aplicaría. Ver E-20 en el plan.
    expect(shell).not.toMatch(/className="[^"]*\bpb-\d/)
  })
})

describe('dónde no aparece el flotante', () => {
  it('se esconde en el panel y en el acceso', () => {
    expect(ocultarBoton('/admin')).toBe(true)
    expect(ocultarBoton('/admin/usuarios')).toBe(true)
    expect(ocultarBoton('/entrar')).toBe(true)
  })

  it('sigue apareciendo en el portal y en el sitio público', () => {
    // Por eso hace falta la reserva: en el portal el botón SÍ está.
    for (const r of ['/portal', '/portal/mi-busqueda', '/propiedades', '/']) {
      expect(ocultarBoton(r)).toBe(false)
    }
  })

  it('no se confunde con una ruta que sólo empiece igual', () => {
    expect(ocultarBoton('/entrarada')).toBe(false)
    expect(ocultarBoton('/administracion')).toBe(false)
  })

  it('la lista de rutas sin botón no crece sin querer', () => {
    expect([...SIN_BOTON]).toEqual(['/admin', '/entrar'])
  })
})
