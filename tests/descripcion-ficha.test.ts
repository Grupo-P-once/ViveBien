import { describe, expect, it } from 'vitest'
import { etiquetaDeEnlace, parsearDescripcion, sinEmojis, trozosDeLinea } from '../src/lib/descripcion'

/** Descripción de la ficha (27-oct-2026): sin emojis sueltos, subtítulos en MAYÚSCULAS, enlaces como botón. Todo seguro: nunca HTML. */
describe('sinEmojis', () => {
  it('quita pictogramas y modificadores sin tocar la sangría ni las palabras', () => {
    expect(sinEmojis('📍 UBICACIÓN')).toBe(' UBICACIÓN')
    expect(sinEmojis('Con ✅ cisterna y 🚛 andenes')).toBe('Con cisterna y andenes')
    expect(sinEmojis('- Bodega\n  con muelle')).toBe('- Bodega\n  con muelle')
  })
})

describe('subtítulos en MAYÚSCULAS', () => {
  it('una línea corta toda en mayúsculas es un subtítulo y se escribe en tipo oración', () => {
    expect(parsearDescripcion('📍 UBICACIÓN\nSobre bulevares principales')).toEqual([
      { tipo: 'titulo', texto: 'Ubicación' },
      { tipo: 'parrafo', lineas: ['Sobre bulevares principales'] },
    ])
  })
  it('una oración en mayúsculas larga, con punto final o con cifras largas NO es subtítulo', () => {
    expect(parsearDescripcion('ESTA ES UNA FRASE MUY LARGA EN MAYÚSCULAS QUE EN REALIDAD ES UN PÁRRAFO COMPLETO')[0].tipo).toBe('parrafo')
    expect(parsearDescripcion('VENDO URGENTE.')[0].tipo).toBe('parrafo')
    expect(parsearDescripcion('TEL 4778116501')[0].tipo).toBe('parrafo')
  })
  it('en medio de un párrafo no se vuelve subtítulo', () => {
    const b = parsearDescripcion('Nave nueva\nUBICACIÓN')
    expect(b).toHaveLength(1)
    expect(b[0].tipo).toBe('parrafo')
  })
})

describe('enlaces como botón', () => {
  it('un enlace de Google Maps se llama «Ver ubicación en Google Maps»; otro, «Abrir sitio»', () => {
    expect(etiquetaDeEnlace('https://maps.app.goo.gl/24vhHpVQUFnFd94D6')).toBe('Ver ubicación en Google Maps')
    expect(etiquetaDeEnlace('https://www.google.com/maps/place/Nave')).toBe('Ver ubicación en Google Maps')
    expect(etiquetaDeEnlace('https://www.ejemplo.mx/ficha')).toBe('Abrir ejemplo.mx')
  })
  it('separa el enlace del texto y deja fuera la puntuación final', () => {
    expect(trozosDeLinea('Mira: https://maps.app.goo.gl/abc123.')).toEqual([
      { texto: 'Mira: ', negrita: false },
      { texto: 'Ver ubicación en Google Maps', negrita: false, enlace: 'https://maps.app.goo.gl/abc123' },
      { texto: '.', negrita: false },
    ])
  })
  it('solo http(s): javascript:, data: y similares quedan como texto inerte', () => {
    for (const x of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'ftp://x.mx/a']) {
      expect(trozosDeLinea(x).every((t) => !t.enlace)).toBe(true)
    }
  })
  it('el HTML escrito nunca se interpreta (sigue siendo texto)', () => {
    const t = trozosDeLinea('<img src=x onerror=alert(1)> https://ejemplo.mx/a')
    expect(t.some((x) => x.texto.includes('<img src=x onerror=alert(1)>'))).toBe(true)
    expect(t.filter((x) => x.enlace)).toHaveLength(1)
  })
})
