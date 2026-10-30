import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { superficiesDe } from '../src/lib/caracteristicas'

/**
 * Decisión del dueño (27-oct-2026): el m² de TERRENO TOTAL es el más importante: va primero y más grande en la tarjeta y en la ficha, con la construcción justo al lado.
 */
const extras = (m_terreno: unknown) => ({ caracteristicas: { v: 1, m_terreno } })
const leer = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('superficiesDe', () => {
  it('casa con terreno: terreno primero y construcción (metros) al lado', () => {
    expect(superficiesDe({ tipo: 'casa', metros: 220, extras: extras(540) })).toEqual({ terreno: 540, construccion: 220, etiquetaConstruccion: 'Construcción' })
  })
  it('casa SIN terreno capturado: solo construcción, como siempre (no se inventa un terreno)', () => {
    expect(superficiesDe({ tipo: 'casa', metros: 220, extras: null })).toEqual({ terreno: null, construccion: 220, etiquetaConstruccion: 'Construcción' })
  })
  it('un terreno solo tiene terreno (su `metros`)', () => {
    expect(superficiesDe({ tipo: 'terreno', metros: 1000, extras: null })).toEqual({ terreno: 1000, construccion: null, etiquetaConstruccion: 'Construcción' })
  })
  it('nave y bodega: la superficie de la nave se llama «Nave»; el terreno va primero', () => {
    expect(superficiesDe({ tipo: 'nave', metros: 1800, extras: extras(4200) })).toEqual({ terreno: 4200, construccion: 1800, etiquetaConstruccion: 'Nave' })
    expect(superficiesDe({ tipo: 'bodega', metros: 300, extras: extras(500) }).etiquetaConstruccion).toBe('Nave')
  })
  it('departamento y oficina no tienen terreno aunque el dato venga mal puesto', () => {
    expect(superficiesDe({ tipo: 'departamento', metros: 90, extras: extras(500) })).toMatchObject({ terreno: null, construccion: 90 })
    expect(superficiesDe({ tipo: 'oficina', metros: 60, extras: extras(500) })).toMatchObject({ terreno: null, construccion: 60 })
  })
  it('valores raros no rompen nada: cero, negativos, texto, ausentes', () => {
    expect(superficiesDe({ tipo: 'casa', metros: 0, extras: extras(-5) })).toMatchObject({ terreno: null, construccion: null })
    expect(superficiesDe({ tipo: 'casa', metros: '150', extras: extras('abc') })).toMatchObject({ terreno: null, construccion: 150 })
    expect(superficiesDe({})).toMatchObject({ terreno: null, construccion: null })
  })
})

describe('el terreno es lo primero que se ve', () => {
  it('la tarjeta lo pinta antes que los demás datos y más grande que la construcción', () => {
    const t = leer('src/components/catalogo/TarjetaCompacta.tsx')
    expect(t).toContain('data-superficies')
    expect(t.indexOf('data-sup="terreno"')).toBeGreaterThan(-1)
    expect(t.indexOf('data-sup="terreno"')).toBeLessThan(t.indexOf('data-sup="construccion"'))
    expect(t.indexOf('data-superficies')).toBeLessThan(t.indexOf('data-datos-tarjeta'))
    const css = leer('src/components/catalogo/catalogo.css')
    const grande = Number(/\.tc-sup-terreno strong \{ font-size: ([\d.]+)rem/.exec(css)?.[1])
    const chico = Number(/\.tc-sup-const strong \{ font-size: ([\d.]+)rem/.exec(css)?.[1])
    expect(grande).toBeGreaterThan(chico)
  })
  it('la ficha pone «Terreno total» primero y la construcción justo después', () => {
    const f = leer('src/app/propiedades/[id]/page-client.tsx')
    expect(f.indexOf("etiqueta: 'Terreno total'")).toBeGreaterThan(-1)
    expect(f.indexOf("etiqueta: 'Terreno total'")).toBeLessThan(f.indexOf("'Construcción'"))
    expect(f).toContain("className={c.principal ? 'fd-principal' : undefined}")
    expect(leer('src/components/catalogo/catalogo.css')).toMatch(/\.fd-clave li\.fd-principal strong \{ font-size: 1\.75rem/)
    // El número no se parte en dos renglones («616 / m²»): la celda principal ocupa el doble y no admite salto.
    expect(leer('src/components/catalogo/catalogo.css')).toMatch(/\.fd-clave li\.fd-principal strong \{[^}]*white-space: nowrap/)
    expect(leer('src/components/catalogo/catalogo.css')).toMatch(/\.fd-clave li\.fd-principal \{ grid-column: span 2/)
  })
})
