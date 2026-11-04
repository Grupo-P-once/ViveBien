import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NEGOCIO } from '../src/lib/config/negocio'
import { arranqueGa, CLAVE_ANALITICA } from '../src/lib/ga'

/**
 * Elección de analítica (2-nov-2026). Garantía: Google Analytics NO se descarga ni crea `window.gtag` hasta que la persona acepta, tal como promete el Aviso de
 * Privacidad (sección 6). El script del `<head>` se ejecuta aquí contra un navegador simulado, no se compara como texto.
 */
const ids = [NEGOCIO.ga4, NEGOCIO.ga4Adicional]

function correr(opts: { eleccion?: string | null; ruta?: string; sinAlmacenamiento?: boolean }) {
  const anadidos: Array<{ src: string }> = []
  const w: Record<string, unknown> = {}
  const doc = { createElement: () => ({ async: false, src: '' }), head: { appendChild: (s: { src: string }) => { anadidos.push(s) } } }
  const almacen = opts.sinAlmacenamiento
    ? { getItem: () => { throw new Error('bloqueado') } }
    : { getItem: (k: string) => (k === CLAVE_ANALITICA ? (opts.eleccion ?? null) : null) }
  new Function('window', 'document', 'localStorage', 'location', 'dataLayer', arranqueGa(ids))(w, doc, almacen, { pathname: opts.ruta ?? '/' }, undefined)
  return { w, anadidos }
}

describe('Google Analytics solo carga con elección afirmativa', () => {
  it('sin elección: no se descarga gtag.js y gtag ni existe (nada se encola para mandarse después)', () => {
    const { w, anadidos } = correr({ eleccion: null })
    expect(anadidos).toEqual([])
    expect(w.gtag).toBeUndefined()
    expect(w.dataLayer).toBeUndefined()
    expect(typeof w.vbCargarGa).toBe('function')
  })

  it('con elección «no», o con un valor cualquiera, tampoco carga', () => {
    for (const e of ['no', 'true', '1', 'SI', '']) expect(correr({ eleccion: e }).anadidos, e).toEqual([])
  })

  it('si el navegador bloquea el almacenamiento, no carga (falla cerrado)', () => {
    expect(correr({ sinAlmacenamiento: true }).anadidos).toEqual([])
  })

  it('con elección «si» descarga gtag.js de la propiedad principal y configura las dos', () => {
    const { w, anadidos } = correr({ eleccion: 'si' })
    expect(anadidos).toHaveLength(1)
    expect(anadidos[0].src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ids[0]}`)
    expect(typeof w.gtag).toBe('function')
    const cola = (w.dataLayer as unknown[][]).map((a) => Array.from(a as ArrayLike<unknown>))
    expect(cola.filter((a) => a[0] === 'config').map((a) => a[1])).toEqual(ids)
  })

  it('al aceptar después (vbCargarGa), carga una sola vez aunque se llame dos veces', () => {
    const { w, anadidos } = correr({ eleccion: null })
    ;(w.vbCargarGa as () => void)()
    ;(w.vbCargarGa as () => void)()
    expect(anadidos).toHaveLength(1)
  })

  it('en un área privada GA nace apagado aunque haya aceptado', () => {
    const { w } = correr({ eleccion: 'si', ruta: '/portal/alertas' })
    for (const id of ids) expect(w[`ga-disable-${id}`], id).toBe(true)
    const { w: publica } = correr({ eleccion: 'si', ruta: '/propiedades' })
    for (const id of ids) expect(publica[`ga-disable-${id}`], id).toBeUndefined()
  })
})

describe('el diseño raíz ya no carga Google Analytics por su cuenta', () => {
  const layout = readFileSync(join(__dirname, '..', 'src/app/layout.tsx'), 'utf8')
  it('no hay etiqueta <script src> a googletagmanager y se usa arranqueGa + el aviso de elección', () => {
    expect(layout).not.toMatch(/src=\{[^}]*googletagmanager/)
    expect(layout).not.toMatch(/gtag\/js/)
    expect(layout).toMatch(/arranqueGa\(/)
    expect(layout).toMatch(/<AvisoAnalitica \/>/)
  })
  it('el pie ofrece volver a elegir', () => {
    expect(readFileSync(join(__dirname, '..', 'src/components/Footer.tsx'), 'utf8')).toMatch(/Preferencias de analítica/)
  })
})
