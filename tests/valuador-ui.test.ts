import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Guardas estáticas de la interfaz del valuador (el comportamiento lo prueba `tests-visual/valuador.e2e.ts`). */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')
const flujo = leer('src/components/valuador/ValuadorFlujo.tsx')
const pagina = leer('src/app/valuador/page-client.tsx')
const css = leer('src/components/valuador/valuador.css')

describe('valuador · interfaz', () => {
  it('no usa alert(), no promete un «avalúo oficial» y dice que NO es un avalúo', () => {
    expect(flujo + pagina).not.toMatch(/alert\(/)
    expect(flujo + pagina).not.toMatch(/solicitar (un )?avalúo oficial/i)
    expect(flujo).toContain('Esto no es un avalúo')
    expect(flujo).toContain('precios de oferta')
  })
  it('para ver la estimación no hay campos de contacto: el teléfono solo existe en el formulario OPCIONAL posterior al resultado', () => {
    const antes = flujo.slice(0, flujo.indexOf('function Resultado'))
    expect(antes).not.toMatch(/type="tel"|type="email"/)
    expect(flujo.slice(flujo.indexOf('function Contacto'))).toContain('type="tel"')
    expect(flujo).toContain('consentimiento: acepta')          // el contacto lleva consentimiento
    expect(flujo).toContain("origen: 'valuador'")
  })
  it('accesibilidad: etiquetas asociadas, progreso con rol, anuncio de paso, foco al título y errores con role=alert', () => {
    for (const id of ['val-colonia', 'val-m2', 'val-nombre', 'val-tel']) { expect(flujo).toContain(`htmlFor="${id}"`); expect(flujo).toContain(`id="${id}"`) }
    expect(flujo).toContain('role="progressbar"')
    expect(flujo).toContain('aria-live="polite"')
    expect(flujo).toContain('titulo.current?.focus()')
    expect((flujo.match(/role="alert"/g) ?? []).length).toBeGreaterThanOrEqual(6)
    expect(flujo).toContain('<fieldset')
  })
  it('conserva el avance solo en sessionStorage (no en localStorage) y no guarda el resultado ni el contacto', () => {
    expect(flujo).toContain('sessionStorage')
    expect(flujo).not.toContain('localStorage')
    expect(flujo).toMatch(/JSON\.stringify\(\{ d, paso \}\)/)
  })
  it('un solo h1 y el valuador sigue funcionando dentro del portal (`enPortal`, sin cabecera ni pie)', () => {
    expect((pagina.match(/<h1[ >]/g) ?? []).length).toBe(1)
    expect(pagina).toContain('enPortal')
    expect(readFileSync(join(raiz, 'src/app/portal/valuador/page.tsx'), 'utf8')).toContain('<ValuadorPage enPortal />')
  })
  it('movimiento reducido apaga las animaciones y el diseño no usa px fijos que desborden (contenedor con min())', () => {
    expect(css).toContain('prefers-reduced-motion: reduce'); expect(css).toContain('.val-gira { animation: none; }')
    expect(css).toContain('width: min(100% - 2.5rem, 1100px)')
  })
  it('contraste de los pares de color del valuador (texto ≥ 4,5:1; gris sobre papel y blanco)', () => {
    const lin = (h: string) => h.replace('#', '').match(/../g)!.map((v) => parseInt(v, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    const lum = (h: string) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const cr = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    const pares: [string, string, string][] = [['#4b5563', '#ffffff', 'gris/blanco'], ['#4b5563', '#fbfaf8', 'gris/papel'], ['#0f2747', '#ffffff', 'azul/blanco'], ['#6b7280', '#ffffff', 'marcador'], ['#b91c1c', '#ffffff', 'error'],
      ['#ffffff', '#8a0b1d', 'botón rojo'], ['#0b1a10', '#25d366', 'botón verde'], ['#422006', '#fffbeb', 'aviso'], ['#5f6368', '#ffffff', 'secundario']]
    for (const [a, b, n] of pares) expect(cr(a, b), n).toBeGreaterThanOrEqual(4.5)
    for (const c of ['#4b5563', '#6b7280', '#b91c1c', '#8a0b1d', '#25d366']) expect(css, c).toContain(c)
  })
  it('la ruta del valuador y su lógica existen donde la documentación las ubica', () => {
    for (const f of ['src/app/api/valuador/route.ts', 'src/lib/valuador/estimar.ts', 'src/lib/valuador/validar.ts']) expect(existsSync(join(raiz, f)), f).toBe(true)
    expect(readFileSync(join(raiz, 'src/app/api/valuador/route.ts'), 'utf8')).toContain('TOPES.valuador')
  })
})
