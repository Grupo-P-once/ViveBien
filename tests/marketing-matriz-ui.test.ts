import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import MatrizDeEventos from '../src/components/admin/marketing/MatrizDeEventos'
import { MATRIZ_DE_EVENTOS } from '../src/lib/correo/biblioteca'

/**
 * Matriz de eventos plegable y gráficas siempre visibles. El HTML inicial se comprueba con renderToStaticMarkup (sin red ni sesión); la interacción real
 * (clic, teclado, móvil) se verifica en el navegador sobre el Preview.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const html = renderToStaticMarkup(createElement(MatrizDeEventos, { matriz: MATRIZ_DE_EVENTOS }))

describe('matriz de eventos plegable', () => {
  it('nace plegada: botón con aria-expanded="false", aria-controls y cuerpo oculto; el título y el resumen siguen visibles', () => {
    expect(html).toContain('data-matriz="plegada"')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"/)
    expect(html).toMatch(/<div id="[^"]+-cuerpo" hidden=""/)
    expect(html).toContain('Matriz de eventos')
    expect(html).toContain(`${MATRIZ_DE_EVENTOS.length} eventos:`)
  })

  it('el resumen cuenta los eventos por estado y suma el total', () => {
    const por = (e: string) => MATRIZ_DE_EVENTOS.filter((m) => m.estado === e).length
    const resumen = html.match(/data-resumen-matriz[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]+>/g, '')
    for (const [e, texto] of [['envia_hoy', 'se envía hoy'], ['codigo_apagado', 'código listo, apagado'], ['no_existe', 'no existe todavía']] as const) expect(resumen).toContain(`${por(e)} ${texto}`)
    const numeros = [...resumen.matchAll(/(\d+) (?:se envía|código|apagado|lo manda|no existe)/g)].map((m) => Number(m[1]))
    expect(numeros.reduce((a, b) => a + b, 0)).toBe(MATRIZ_DE_EVENTOS.length)
  })

  it('el cuerpo trae todos los eventos agrupados, como tabla (escritorio) y como tarjetas (móvil)', () => {
    const grupos = [...new Set(MATRIZ_DE_EVENTOS.map((m) => m.grupo))]
    for (const g of grupos) expect(html).toContain(`>${g} <`)
    expect(html).toContain('hidden overflow-x-auto md:block')
    expect(html).toContain('md:hidden')
    expect((html.match(/<tr class="border-b align-top">/g) ?? []).length).toBe(MATRIZ_DE_EVENTOS.length)
    for (const m of MATRIZ_DE_EVENTOS) expect(html).toContain(m.evento.replace(/&/g, '&amp;'))
  })

  it('sin datos todavía dice «Cargando…» y no inventa un resumen', () => {
    const vacio = renderToStaticMarkup(createElement(MatrizDeEventos, { matriz: null }))
    expect(vacio).toContain('Cargando')
    expect(vacio).not.toContain('data-resumen-matriz')
  })

  it('la página usa el componente plegable (no queda la tabla fija)', () => {
    const p = leer('src/app/admin/marketing/page.tsx')
    expect(p).toContain('<MatrizDeEventos')
    expect(p).not.toContain('min-w-[900px]')
  })
})

describe('gráficas y datos no disponibles (guardias del componente)', () => {
  const r = leer('src/components/admin/marketing/Resultados.tsx')
  it('las gráficas se dibujan aunque no haya envíos (con ceros) y no dependen de «sinEnvios»', () => {
    expect(r).not.toMatch(/serie && !sinEnvios/)
    expect(r).toContain('Sin envíos en este periodo: las barras están en cero porque no hubo actividad.')
  })
  it('lo que depende del webhook sale como «No disponible» y no se dibuja como cero', () => {
    expect(r).toContain("const ND = 'No disponible'")
    expect(r).toMatch(/\{!sinWebhook && <Bar dataKey="entregados"/)
    expect(r).toMatch(/\{!sinWebhook && <Bar dataKey="rebotes"/)
    expect(r).toContain('data-aviso-grafica')
  })
  it('cada gráfica trae su rótulo de origen: «Datos de ejemplo» o «Datos reales de esta base»', () => {
    expect(r).toContain("'Datos de ejemplo (sintéticos)'")
    expect(r).toContain("'Datos reales de esta base'")
  })
  it('hay gráficas por día de enviados, entregados, rebotes, fallos y bajas promocionales', () => {
    for (const t of ['Enviados y entregados por día', 'Rebotes, fallos y omitidos por día', 'Bajas promocionales por día y acumuladas']) expect(r).toContain(t)
  })
})
