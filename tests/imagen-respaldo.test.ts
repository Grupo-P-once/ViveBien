import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alFallarImagen } from '../src/lib/imagen-respaldo'

/** Etapa 7 · la reserva de una imagen se prueba UNA vez: sin bucle cuando la reserva también falla (~6 000 intentos/30 s medidos). */

function imagen(srcInicial: string) {
  const attrs = new Map<string, string>([['srcset', 'a 1x'], ['sizes', '100vw']])
  const el = {
    dataset: {} as Record<string, string>,
    src: srcInicial,
    removeAttribute: (n: string) => { attrs.delete(n) },
    attrs,
  }
  return el as unknown as HTMLImageElement & { attrs: Map<string, string> }
}

describe('alFallarImagen', () => {
  it('el primer fallo cambia a la reserva y quita srcset/sizes', () => {
    const el = imagen('https://x/foto.jpg')
    expect(alFallarImagen(el, 'https://x/reserva.jpg')).toBe('respaldo')
    expect(el.src).toBe('https://x/reserva.jpg')
    expect(el.attrs.has('srcset')).toBe(false)
    expect(el.attrs.has('sizes')).toBe(false)
  })

  it('si la reserva TAMBIÉN falla no vuelve a asignar nada: no hay bucle', () => {
    const el = imagen('https://x/foto.jpg')
    let asignaciones = 0
    let actual = el.src
    Object.defineProperty(el, 'src', { get: () => actual, set: (v: string) => { asignaciones++; actual = v } })
    // simula 10 000 eventos de error seguidos (red sin acceso al host)
    for (let i = 0; i < 10_000; i++) alFallarImagen(el, 'https://x/reserva.jpg')
    expect(asignaciones).toBe(1)
  })

  it('devuelve «sin-respaldo» en el segundo fallo', () => {
    const el = imagen('https://x/foto.jpg')
    alFallarImagen(el, 'https://x/reserva.jpg')
    expect(alFallarImagen(el, 'https://x/reserva.jpg')).toBe('sin-respaldo')
  })
})

describe('ningún componente reasigna la reserva a mano', () => {
  const raiz = join(__dirname, '..')
  for (const f of ['src/components/PropertyCard.tsx', 'src/components/catalogo/GaleriaFluida.tsx', 'src/components/inicio/QueEsViveBien.tsx']) {
    it(`${f} usa alFallarImagen`, () => {
      const t = readFileSync(join(raiz, f), 'utf8')
      expect(t).toContain('alFallarImagen(')
      expect(t).not.toMatch(/\.src\s*=\s*PLACEHOLDER/)
      expect(t).not.toMatch(/onError=\{e => \{ \(e\.currentTarget as HTMLImageElement\)\.src = /)
    })
  }
})

describe('el botón del menú móvil no depende del CDN de iconos (Etapa 7)', () => {
  it('Header: el botón .vb-nav-mobile-btn trae minWidth y minHeight propios', () => {
    const t = readFileSync(join(__dirname, '..', 'src/components/Header.tsx'), 'utf8')
    const boton = t.slice(t.indexOf('className="vb-nav-mobile-btn"'), t.indexOf('aria-expanded={menuOpen}'))
    expect(boton).toMatch(/minWidth:\s*\d+/)
    expect(boton).toMatch(/minHeight:\s*\d+/)
  })
})
