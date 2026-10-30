import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { patronSinAcentos } from '@/lib/ayuda/consultas'
import { normalizarConsulta } from '@/lib/ayuda/modelo'

/**
 * La búsqueda del Centro de Ayuda — tres defectos medidos EN PRODUCCIÓN.
 *
 * ─────────────────────────────────────────────────────────────
 * 1-oct-2026, contra https://vivebienn.com/ayuda/buscar
 *
 *   «cuenta,casa» → «No pudimos consultar el Centro»   ← filtro roto
 *   «a,b,c»       → «No pudimos consultar el Centro»
 *   «valuación»   → «No encontramos nada»
 *   «valuacion»   → «No encontramos nada»
 *   «valua»       → 1 artículo                          ← sí existía
 *
 * Los encontró Codex en la revisión L2. Los tres venían de 3c-3 y ninguno lo
 * detectaban las pruebas: comprobaban que la búsqueda devolviera resultados
 * para una palabra sencilla, que es justo el caso que funcionaba.
 * ─────────────────────────────────────────────────────────────
 */

const consultas = readFileSync(
  join(process.cwd(), 'src/lib/ayuda/consultas.ts'),
  'utf8',
)

describe('P2 · una coma rompía el filtro de PostgREST', () => {
  /* `.or()` recibe la gramática de filtros, donde la COMA SEPARA CONDICIONES.
     Interpolar el término crudo hacía que «cuenta,casa» partiera el filtro en
     pedazos inválidos y la consulta fallara entera. */

  it('el valor va entrecomillado en el filtro', () => {
    expect(consultas).toContain('function entrecomillar')
    expect(consultas).toContain('titulo.imatch.${q},resumen.imatch.${q},cuerpo.imatch.${q}')
  })

  it('usa `imatch`, el NOMBRE del operador — `~*` da 400', () => {
    /* PostgREST sólo acepta el nombre en la cadena de filtro. Con `~*`
       responde «unexpected "~" expecting "not" or operator». Mi primera
       versión lo usaba y dejó la búsqueda caída entera: ninguna prueba lo
       vio, porque todas miraban el código fuente y el fuente no tenía
       ninguna falta de escritura. Lo cazó probar contra la API real. */
    expect(consultas).toContain('.imatch.')
    expect(consultas).not.toMatch(/\.or\(`[^`]*~\*/)
  })

  it('ya no se interpola el término sin comillas', () => {
    // La forma vieja: `titulo.ilike.${q}` con q = `%término%` crudo.
    expect(consultas).not.toMatch(/titulo\.ilike\.\$\{q\}/)
  })

  it('escapa la comilla y la barra, que cerrarían el valor antes de tiempo', () => {
    const f = consultas.slice(consultas.indexOf('function entrecomillar'))
    const cuerpo = f.slice(0, f.indexOf('\n}'))
    /* Dos escapes, y la barra ANTES que la comilla: al revés, el escape de la
       comilla se volvería a escapar a sí mismo. */
    expect((cuerpo.match(/\.replace\(/g) ?? []).length).toBe(2)
    expect(cuerpo.indexOf('/\\\\/g')).toBeLessThan(cuerpo.indexOf('/"/g'))
    expect(cuerpo).toContain('`"${')
  })
})

describe('P2 · los acentos: fallaban las DOS formas', () => {
  it('una vocal acentuada y su versión sin acento casan con el mismo patrón', () => {
    const p = patronSinAcentos('valuacion')
    expect(p).toContain('[aáà]')
    expect(p).toContain('[oóò]')
    // El patrón acepta «valuación» aunque se escribiera sin acento.
    expect(new RegExp(p, 'i').test('valuación')).toBe(true)
    expect(new RegExp(p, 'i').test('valuacion')).toBe(true)
  })

  it('y al revés: escribir CON acento también encuentra', () => {
    const p = patronSinAcentos('valuación')
    expect(new RegExp(p, 'i').test('valuación')).toBe(true)
    expect(new RegExp(p, 'i').test('valuacion')).toBe(true)
  })

  it('la ñ cuenta como n', () => {
    const p = patronSinAcentos('ano')
    expect(new RegExp(p, 'i').test('año')).toBe(true)
  })

  it('el caso exacto que falló en producción', () => {
    // `normalizarConsulta` quita el acento; el texto guardado lo conserva.
    const escrito = normalizarConsulta('Valuación')
    expect(escrito).toBe('valuacion')
    const p = patronSinAcentos(escrito)
    expect(new RegExp(p, 'i').test('¿Cómo funciona el Valuación?')).toBe(true)
  })
})

describe('P2 · metacaracteres de regex son literales, no sintaxis', () => {
  /* Al pasar de `ilike` a `imatch`, un término con `(`, `*` o `+` dejaría de ser
     texto y pasaría a ser expresión regular — o la rompería. */

  it('escapa los metacaracteres', () => {
    for (const [entrada, dentro] of [
      ['cuenta(x)', '\\('],
      ['a+b', '\\+'],
      ['c*d', '\\*'],
      ['[uno]', '\\['],
    ] as const) {
      expect(patronSinAcentos(entrada)).toContain(dentro)
    }
  })

  it('el patrón resultante siempre es una regex válida', () => {
    for (const t of ['cuenta(x)', 'a+b', 'c*d', '[uno]', '\\', '((((', '?', '$^']) {
      expect(() => new RegExp(patronSinAcentos(t), 'i')).not.toThrow()
    }
  })

  it('un término con paréntesis casa consigo mismo', () => {
    const p = patronSinAcentos('cuenta(x)')
    expect(new RegExp(p, 'i').test('la cuenta(x) nueva')).toBe(true)
    // Y no casa con lo que casaría si los paréntesis fueran sintaxis.
    expect(new RegExp(p, 'i').test('cuentax')).toBe(false)
  })
})

describe('P2 · la caché ya no crece sin límite', () => {
  /* La clave de `buscar()` lleva el término escrito, así que cada búsqueda
     distinta dejaba una entrada para siempre en un Map de módulo. */

  it('hay un tope declarado', () => {
    expect(consultas).toContain('const TOPE_COPIAS')
    expect(consultas).toMatch(/while \(ultimaBuena\.size > TOPE_COPIAS\)/)
  })

  it('las escrituras pasan por el guardián, no por `set` directo', () => {
    const cuerpo = consultas.slice(consultas.indexOf('async function conRed'))
    expect(cuerpo).toContain('guardarCopia(clave, datos)')
    expect(cuerpo).not.toMatch(/ultimaBuena\.set\(/)
  })

  it('desaloja la más antigua, y reinsertar refresca el orden', () => {
    // `delete` antes de `set` es lo que convierte el Map en LRU.
    const g = consultas.slice(consultas.indexOf('function guardarCopia'))
    expect(g.indexOf('ultimaBuena.delete(clave)')).toBeLessThan(g.indexOf('ultimaBuena.set(clave'))
    expect(g).toContain('ultimaBuena.keys().next().value')
  })
})
