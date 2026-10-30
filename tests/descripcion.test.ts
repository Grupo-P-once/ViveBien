import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EJEMPLO_DESCRIPCION, parsearDescripcion, trozosDeLinea } from '../src/lib/descripcion'

/**
 * «Sobre esta propiedad» con formato libre (22-oct-2026). Antes todo salía en un solo párrafo (se perdían los saltos de línea y las líneas en blanco) y se
 * veía amontonado. Ahora se respeta lo que escribió quien publica, con marcas sencillas y SIN HTML.
 */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

describe('descripción · lector de formato', () => {
  it('una línea en blanco separa párrafos y un salto simple se conserva dentro del párrafo', () => {
    const b = parsearDescripcion('Primera línea\nsegunda línea\n\nOtro párrafo')
    expect(b).toEqual([{ tipo: 'parrafo', lineas: ['Primera línea', 'segunda línea'] }, { tipo: 'parrafo', lineas: ['Otro párrafo'] }])
  })
  it('viñetas (-, •, *), listas numeradas y subtítulos (## y «Incluye:»)', () => {
    const b = parsearDescripcion('## Lo que incluye\n- Andenes\n• Oficinas\n* Baños\n\nPasos:\n1. Visita\n2) Oferta')
    expect(b).toEqual([
      { tipo: 'titulo', texto: 'Lo que incluye' },
      { tipo: 'lista', items: ['Andenes', 'Oficinas', 'Baños'] },
      { tipo: 'titulo', texto: 'Pasos' },
      { tipo: 'numerada', items: ['Visita', 'Oferta'] },
    ])
  })
  it('una línea con sangría debajo de una viñeta continúa esa viñeta', () => {
    expect(parsearDescripcion('- Bodega amplia\n  con muelle de carga\n- Oficina')).toEqual([{ tipo: 'lista', items: ['Bodega amplia con muelle de carga', 'Oficina'] }])
  })
  it('un «:» en medio de un párrafo NO lo vuelve subtítulo, ni una oración larga', () => {
    expect(parsearDescripcion('Texto introductorio\nIncluye: cocina y clima')[0]).toMatchObject({ tipo: 'parrafo' })
    expect(parsearDescripcion('Esta es una oración larga que termina con dos puntos y no es un título:')[0]).toMatchObject({ tipo: 'parrafo' })
  })
  it('negritas con ** y nada más: el HTML se queda como texto', () => {
    expect(trozosDeLinea('Es **muy** amplia')).toEqual([{ texto: 'Es ', negrita: false }, { texto: 'muy', negrita: true }, { texto: ' amplia', negrita: false }])
    const b = parsearDescripcion('<script>alert(1)</script> y <b>x</b>')
    expect(JSON.stringify(b)).toContain('<script>alert(1)</script>')                     // sigue siendo TEXTO: React lo pinta escapado
    expect(leer('src/components/catalogo/DescripcionRica.tsx')).not.toMatch(/dangerouslySetInnerHTML|innerHTML/)
  })
  it('acepta saltos de Windows, espacios de más y texto vacío', () => {
    expect(parsearDescripcion('a\r\n\r\nb')).toHaveLength(2)
    expect(parsearDescripcion('   \n\n  ')).toEqual([]); expect(parsearDescripcion(null)).toEqual([]); expect(parsearDescripcion(undefined)).toEqual([])
  })
  it('el ejemplo del editor produce subtítulo, viñetas y negritas', () => {
    const b = parsearDescripcion(EJEMPLO_DESCRIPCION)
    expect(b.map((x) => x.tipo)).toEqual(['parrafo', 'titulo', 'lista', 'parrafo'])
  })
})

describe('descripción · dónde se usa', () => {
  it('la ficha pinta la descripción con DescripcionRica (ya no un solo <p> amontonado)', () => {
    const f = leer('src/app/propiedades/[id]/page-client.tsx')
    expect(f).toContain('<DescripcionRica texto={prop.descripcion} />'); expect(f).not.toMatch(/\{prop\.descripcion\}<\/p>/)
  })
  it('el editor del publicador explica el formato y enseña una vista previa en vivo', () => {
    const e = leer('src/app/publicador/propiedades/[id]/editar/page.tsx')
    expect(e).toContain('Cómo darle formato'); expect(e).toContain('<DescripcionRica texto={prop.descripcion ?? \'\'} />'); expect(e).toContain('Así se verá en la página')
  })
  it('la hoja de estilo da aire: párrafos, subtítulos con filete rojo y viñetas con marca roja', () => {
    const c = leer('src/components/catalogo/catalogo.css')
    expect(c).toMatch(/\.dr-p \{[^}]*margin: 0 0 1\.15rem/); expect(c).toMatch(/\.dr-titulo::before/); expect(c).toMatch(/\.dr-lista li::marker \{[^}]*color: var\(--rojo\)/)
  })
})
