import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { accionParaMotivo, interpretarExportacion, leerCsv, numero, resumirGrafico } from '../src/lib/seo/csv'

const leer = (n: string) => readFileSync(`tests/fixtures/seo/${n}`, 'utf8')

describe('lector de exportaciones de Search Console', () => {
  it('lee comillas, comas dentro de un campo y comillas escapadas', () => {
    expect(leerCsv('a,b\n"x, y","di ""hola"""\n')).toEqual([['a', 'b'], ['x, y', 'di "hola"']])
  })
  it('números: miles, decimales con coma, porcentaje y vacíos', () => {
    expect([numero('1,234'), numero('3,5'), numero('0.5%'), numero('12,5 %'), numero(''), numero('N/D'), numero('1,234.5')]).toEqual([1234, 3.5, 0.5, 12.5, null, null, 1234.5])
  })
  it('reconoce el gráfico de cobertura real (34 días) y lo resume', () => {
    const e = interpretarExportacion(leer('cobertura-grafico.csv'))
    expect(e.tipo).toBe('grafico')
    if (e.tipo !== 'grafico') return
    expect(e.filas.length).toBe(34)
    const r = resumirGrafico(e.filas)
    expect([r.desde, r.hasta, r.indexadas, r.sinIndexar]).toEqual(['2026-09-12', '2026-10-15', 54, 16])
    expect(r.impresionesTotal).toBe(211)   // suma hecha a mano de las 34 filas del export
    expect(r.variacionIndexadas).toBe(42)   // de 12 (18-sep) a 54
  })
  it('reconoce los problemas críticos reales (7 motivos, 16 páginas sin indexar)', () => {
    const e = interpretarExportacion(leer('cobertura-problemas-criticos.csv'))
    expect(e.tipo).toBe('problemas')
    if (e.tipo !== 'problemas') return
    expect(e.filas.length).toBe(7)
    expect(e.filas.reduce((s, f) => s + f.paginas, 0)).toBe(16)
    expect(e.filas.find((f) => /redirecci/i.test(f.motivo))?.paginas).toBe(7)
    expect(e.filas.find((f) => /noindex/i.test(f.motivo))?.paginas).toBe(4)
  })
  it('consultas y páginas de Rendimiento (formato en español)', () => {
    const c = interpretarExportacion('Consultas principales,Clics,Impresiones,CTR,Posición\ncasas en león,3,120,"2,5%","8,4"\n')
    expect(c).toEqual({ tipo: 'consultas', filas: [{ clave: 'casas en león', clics: 3, impresiones: 120, ctr: 2.5, posicion: 8.4 }] })
    const p = interpretarExportacion('Páginas principales,Clics,Impresiones,CTR,Posición\nhttps://vivebienn.com/,5,200,2.5%,6.1\n')
    expect(p.tipo).toBe('paginas')
  })
  it('lo desconocido se dice, no se inventa', () => {
    expect(interpretarExportacion('foo,bar\n1,2\n').tipo).toBe('desconocido')
    expect(interpretarExportacion('').tipo).toBe('desconocido')
  })
  it('cada motivo de no indexación tiene una acción; las redirecciones y los noindex no son «problemas» por sí mismos', () => {
    expect(accionParaMotivo('Página con redirección').esProblema).toBe(false)
    expect(accionParaMotivo('Excluida por una etiqueta "noindex"').esProblema).toBe(false)
    expect(accionParaMotivo('Soft 404').esProblema).toBe(true)
    expect(accionParaMotivo('No se ha encontrado (404)').esProblema).toBe(true)
    expect(accionParaMotivo('Rastreada: actualmente sin indexar').esProblema).toBe(true)
    expect(accionParaMotivo('algo raro').accion).toMatch(/Search Console/)
  })
})
