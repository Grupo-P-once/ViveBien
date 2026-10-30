import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HOSTS_PERMITIDOS, MAX_PUBLICACIONES, PERFIL, PUBLICACIONES } from '../src/lib/redes/publicaciones'

/**
 * Guardia de la sección «Conoce nuestras últimas publicaciones» (inicio, 21-oct-2026). Plan en Obsidian:
 * «Plan — Publicaciones de redes sociales en el inicio». Datos locales, sin Meta, sin cifras inventadas.
 */
const raiz = join(__dirname, '..')
const comp = readFileSync(join(raiz, 'src/components/inicio/RedesSociales.tsx'), 'utf8')
const inicio = readFileSync(join(raiz, 'src/app/page-client.tsx'), 'utf8')

describe('redes · datos de las publicaciones', () => {
  it('hay publicaciones, no más del límite y con ids únicos', () => {
    expect(PUBLICACIONES.length).toBeGreaterThanOrEqual(4)
    expect(PUBLICACIONES.length).toBeLessThanOrEqual(MAX_PUBLICACIONES)
    expect(new Set(PUBLICACIONES.map((p) => p.id)).size).toBe(PUBLICACIONES.length)
  })
  it.each(PUBLICACIONES.map((p) => [p.id, p] as const))('«%s»: imagen WebP local ligera, texto alternativo y pie con contenido', (_id, p) => {
    const ruta = join(raiz, 'public/redes', p.imagen)
    expect(existsSync(ruta), p.imagen).toBe(true)
    expect(p.imagen).toMatch(/\.webp$/)
    expect(statSync(ruta).size).toBeLessThan(200_000)                // ligera: son varias en una sola pantalla
    expect(p.alt.length).toBeGreaterThan(30)
    expect(p.texto.length).toBeGreaterThan(30)
    expect(p.texto.length).toBeLessThan(200)
    expect(p.ancho / p.alto).toBeGreaterThan(0.7); expect(p.ancho / p.alto).toBeLessThan(0.9)   // vertical, tipo publicación
    expect(p.redes.length).toBeGreaterThan(0)
  })
  it('los enlaces a una publicación (si los hay) son https y solo de Instagram o Facebook', () => {
    for (const p of PUBLICACIONES) {
      if (!p.permalink) continue
      const u = new URL(p.permalink)
      expect(u.protocol).toBe('https:')
      expect(HOSTS_PERMITIDOS as readonly string[]).toContain(u.hostname)
    }
  })
  it('el perfil usa el usuario real de Instagram', () => { expect(PERFIL.usuario).toBe('vive_bien_mx') })
})

describe('redes · componente e inicio', () => {
  it('no carga nada de Meta: ni scripts, ni iframes, ni imágenes remotas', () => {
    expect(comp).not.toMatch(/<script|<iframe|connect\.facebook|instagram\.com\/embed|platform\.instagram|cdninstagram|fbcdn/i)
    expect(comp).not.toMatch(/src=\{?['"`]https?:/)
  })
  it('no inventa «me gusta» ni comentarios', () => {
    expect(comp).not.toMatch(/Ver \d+ comentario|\d+ me gusta|likes/i)
    expect(comp).toContain('Ver en {h.nombre}')
  })
  it('los enlaces externos son seguros y avisan que abren pestaña nueva; los iconos son decorativos', () => {
    expect(comp).toMatch(/target="_blank" rel="noopener noreferrer"/)
    expect(comp).toContain('se abre en una pestaña nueva')
    expect(comp).toContain('className="ini-post-iconos" aria-hidden')
  })
  it('carrusel accesible: región con nombre, flechas con etiqueta, teclado y sin avance automático', () => {
    expect(comp).toContain('aria-roledescription="carrusel"')
    expect(comp).toContain('aria-label="Publicaciones anteriores"'); expect(comp).toContain('aria-label="Publicaciones siguientes"')
    expect(comp).toContain("e.key === 'ArrowRight'")
    expect(comp).not.toMatch(/setInterval|setTimeout\(/)
    expect(comp).toContain("aria-pressed={red === r}")
  })
  it('está en el inicio, ENTRE las reseñas de clientes y «Contáctanos»', () => {
    const iClientes = inicio.indexOf('<CarruselClientes />')
    const iRedes = inicio.indexOf('<RedesSociales />')
    const iContacto = inicio.indexOf('<ContactoInicio />')
    expect(iClientes).toBeGreaterThan(0)
    expect(iRedes).toBeGreaterThan(iClientes)
    expect(iContacto).toBeGreaterThan(iRedes)
  })
})
