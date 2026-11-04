import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * LINT-2 (3-nov-2026) — las fuentes se sirven desde el propio sitio. Garantía que cubre esta prueba: el cambio NO altera la tipografía
 * (mismas familias, pesos y estilos que la petición anterior a Google Fonts, `font-display: swap`), no queda ninguna petición a Google
 * y los archivos son los que se descargaron (tamaño y huella en `public/fuentes/manifiesto.json`). Si alguien quita un peso, cambia un
 * archivo o vuelve a enlazar Google, falla.
 */
const raiz = join(__dirname, '..')
const css = readFileSync(join(raiz, 'src/app/fuentes.css'), 'utf8')
const layout = readFileSync(join(raiz, 'src/app/layout.tsx'), 'utf8')
const dir = join(raiz, 'public/fuentes')

const bloques = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const cuerpo = m[1]
  const get = (p: string) => (cuerpo.match(new RegExp(`${p}:\\s*([^;]+);`)) || [])[1]?.trim()
  return {
    familia: get('font-family')?.replace(/'/g, ''),
    estilo: get('font-style'),
    peso: get('font-weight'),
    display: get('font-display'),
    src: get('src'),
    rango: get('unicode-range'),
  }
})

// Petición original: Montserrat 400/600/700/800/900, Open Sans 400/500/600, Playfair Display 400/700/900 normal y cursiva.
const ORIGINAL = [
  ...['400', '600', '700', '800', '900'].map((p) => `Montserrat|normal|${p}`),
  ...['400', '500', '600'].map((p) => `Open Sans|normal|${p}`),
  ...['normal', 'italic'].flatMap((e) => ['400', '700', '900'].map((p) => `Playfair Display|${e}|${p}`)),
]

describe('fuentes alojadas en el sitio (LINT-2)', () => {
  it('conserva los 79 bloques @font-face con las mismas familias, pesos y estilos de antes', () => {
    expect(bloques).toHaveLength(79)
    const triples = new Set(bloques.map((b) => `${b.familia}|${b.estilo}|${b.peso}`))
    expect([...triples].sort()).toEqual([...ORIGINAL].sort())
    for (const b of bloques) {
      expect(b.display, `${b.familia} ${b.peso}`).toBe('swap')
      expect(b.rango, `${b.familia} ${b.peso}`).toMatch(/^U\+/)
    }
  })

  it('todas las URLs son locales (/fuentes/*.woff2) y el CSS no menciona a Google', () => {
    for (const b of bloques) expect(b.src).toMatch(/^url\(\/fuentes\/[a-z0-9-]+\.woff2\) format\('woff2'\)$/)
    // Sin comentarios: la cabecera cuenta de dónde venían, pero ninguna regla puede apuntar fuera.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/googleapis|gstatic|https?:\/\//)
  })

  it('el diseño raíz importa fuentes.css y ya no enlaza Google Fonts ni suprime la regla de fuentes', () => {
    expect(layout).toMatch(/import ['"]\.\/fuentes\.css['"]/)
    expect(layout).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(layout).not.toMatch(/no-page-custom-font|eslint-disable/)
  })

  it('cada archivo referenciado existe, es woff2 y coincide con el manifiesto (tamaño y sha256)', () => {
    const manifiesto = JSON.parse(readFileSync(join(dir, 'manifiesto.json'), 'utf8')) as { nombre: string; bytes: number; sha256_16: string }[]
    const usados = new Set(bloques.map((b) => b.src!.match(/\/fuentes\/([a-z0-9-]+\.woff2)/)![1]))
    expect(usados.size).toBe(23)
    expect(manifiesto.map((m) => m.nombre).sort()).toEqual([...usados].sort())
    for (const m of manifiesto) {
      const ruta = join(dir, m.nombre)
      expect(existsSync(ruta), m.nombre).toBe(true)
      const buf = readFileSync(ruta)
      expect(buf.subarray(0, 4).toString('latin1'), m.nombre).toBe('wOF2')
      expect(buf.length, m.nombre).toBe(m.bytes)
      expect(createHash('sha256').update(buf).digest('hex').slice(0, 16), m.nombre).toBe(m.sha256_16)
    }
    // Nada sobra en la carpeta salvo los woff2 del manifiesto y los textos de licencia.
    const extra = readdirSync(dir).filter((f) => f.endsWith('.woff2') && !usados.has(f))
    expect(extra).toEqual([])
  })

  it('las licencias OFL de las tres familias viajan con las fuentes', () => {
    for (const f of ['OFL-Montserrat.txt', 'OFL-Open-Sans.txt', 'OFL-Playfair-Display.txt', 'LICENCIAS.md']) expect(existsSync(join(dir, f)), f).toBe(true)
    for (const f of ['OFL-Montserrat.txt', 'OFL-Open-Sans.txt', 'OFL-Playfair-Display.txt']) expect(readFileSync(join(dir, f), 'utf8')).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i)
  })

  it('CSP-1: la política permite las fuentes propias y ya no autoriza los dominios de Google Fonts', async () => {
    const { CSP } = await import('../src/lib/csp')
    const directiva = (n: string) => CSP.split(';').map((s) => s.trim()).find((s) => s.startsWith(n + ' ')) ?? ''
    expect(directiva('font-src')).toContain("'self'")
    for (const n of ['style-src', 'font-src']) { expect(directiva(n), n).not.toMatch(/fonts\.googleapis|fonts\.gstatic/); expect(directiva(n), n).toContain('https://cdnjs.cloudflare.com') }
    expect(readFileSync(join(raiz, 'src/lib/csp.ts'), 'utf8')).not.toMatch(/https:\/\/fonts\.g/)
  })
})
