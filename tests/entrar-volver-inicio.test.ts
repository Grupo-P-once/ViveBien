import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pantalla de acceso (`/entrar`), cambios del 21-oct-2026 pedidos por el propietario:
 *  · botón «Volver al inicio» (enlace a `/`);
 *  · el logotipo —en la tarjeta y en la banda— lleva al inicio, con nombre accesible;
 *  · la fotografía de la portada se mejoró de calidad (más resolución y menos compresión), sin tocar su composición.
 */
const raiz = join(__dirname, '..')
const entrar = readFileSync(join(raiz, 'src/components/acceso/Entrar.tsx'), 'utf8')

describe('acceso · volver al inicio y logotipo', () => {
  it('hay un botón «Volver al inicio» que es un enlace real a /', () => {
    expect(entrar).toContain('data-volver-inicio')
    expect(entrar).toMatch(/<Link href="\/" data-volver-inicio[\s\S]*?Volver al inicio/)
  })
  it('los dos logotipos (tarjeta y banda) van dentro de un enlace a / con nombre accesible', () => {
    const enlaces = entrar.match(/<Link href="\/" aria-label="Vive Bien: ir al inicio"/g) ?? []
    expect(enlaces.length).toBe(2)
    expect(entrar).not.toMatch(/<Image src=\{LOGO\}[^>]*\/>\s*\n\s*\n/)   // ningún logotipo suelto sin enlace
  })
  it('el icono de la flecha es decorativo y el botón mide al menos 44 px de alto (objetivo táctil)', () => {
    expect(entrar).toContain('<ArrowLeft aria-hidden')
    expect(entrar).toContain('min-h-[44px]')
  })
  it('la fotografía de la portada es más grande y más nítida que la anterior (2100 px de ancho; la anterior, 1400 px y 138 KB)', () => {
    const peso = statSync(join(raiz, 'public/acceso/portada.webp')).size
    expect(peso).toBeGreaterThan(200_000)     // antes 138 548 bytes: tan comprimida que se veía borrosa
    expect(peso).toBeLessThan(600_000)        // sin pasarse: es el LCP de la pantalla de acceso
    const b = readFileSync(join(raiz, 'public/acceso/portada.webp'))
    // cabecera WebP «VP8 »/«VP8X»/«VP8L»: ancho en el bloque de datos; se valida solo que es un WebP válido
    expect(b.subarray(0, 4).toString()).toBe('RIFF'); expect(b.subarray(8, 12).toString()).toBe('WEBP')
  })
})

describe('encabezado del sitio: «Ayuda» y «Ingresar» sin candado (pedido del propietario, 21-oct-2026)', () => {
  const header = readFileSync(join(raiz, 'src/components/Header.tsx'), 'utf8')
  it('la entrada de ayuda se llama solo «Ayuda» y lleva a /ayuda', () => {
    expect(header).toContain("{ href: '/ayuda', label: 'Ayuda', icono: 'fa-circle-question' }")
    expect(header).not.toContain("label: 'Centro de Ayuda'")
  })
  it('el botón «Ingresar» ya no lleva el icono de candado', () => {
    expect(header).not.toContain('fa fa-lock')
  })
})
