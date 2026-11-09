import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardia de aislamiento de terceros en las pruebas de navegador.
 *
 * Por qué existe: el sitio pide al cargar hosts externos (Font Awesome en cdnjs, fuentes, apis.google.com). En el navegador de la prueba eso es internet REAL;
 * si uno no contesta, `goto` hasta «load» (o `networkidle`) no termina y la prueba agota sus 30 s. Pasó en las corridas 6 y 7 del gate (8-nov-2026):
 * `ga-eventos`, `guardados` y `seo-admin` fallaron con `page.goto: Test timeout`, y la traza de `seo-admin` mostró UNA sola petición sin respuesta:
 * `cdnjs.cloudflare.com/.../font-awesome/6.5.0/css/all.min.css`. Las pruebas pasaban en aislado: el defecto era de aislamiento, no del producto.
 *
 * Regla: toda especificación que navega debe acotar los terceros (`acotarTerceros`: con la red sana responde igual; si no contesta en 4 s, corta),
 * usar un ayudante que ya lo hace (`prepararPanel`, `ayudas.ts`) o cortar el CDN a mano (como las E-48).
 */
const DIR = path.join(process.cwd(), 'tests-visual')
const PROTEGIDA = /acotarTerceros|prepararPanel|from '\.\/ayudas'|cdnjs\\?\.cloudflare\\?\.com/

const especificaciones = readdirSync(DIR).filter((f) => /\.(e2e|visual)\.ts$/.test(f))

describe('pruebas de navegador: terceros acotados', () => {
  it('hay especificaciones que revisar (la guardia no se vacía en silencio)', () => {
    expect(especificaciones.length).toBeGreaterThanOrEqual(35) // hoy son 40; si baja de 35 se perdió el directorio o el filtro
  })

  it('toda especificación que navega acota o corta los terceros del sitio', () => {
    const sinProteccion = especificaciones.filter((f) => {
      const t = readFileSync(path.join(DIR, f), 'utf8')
      return /\.goto\(/.test(t) && !PROTEGIDA.test(t)
    })
    expect(sinProteccion, `Sin proteger frente a terceros que no contestan: ${sinProteccion.join(', ')}`).toEqual([])
  })

  it('el ayudante del panel acota los terceros (lo usan seo-admin, comisiones, contabilidad y las capturas)', () => {
    const t = readFileSync(path.join(DIR, 'ayudas-panel.ts'), 'utf8')
    expect(t).toMatch(/import \{ acotarTerceros \} from '\.\/ayudas-red'/)
    expect(t).toMatch(/await acotarTerceros\(page\)/)
  })

  it('las pruebas de Analytics (nuevo contexto limpio) también acotan sus terceros', () => {
    for (const f of ['ga-eventos.e2e.ts', 'ga-eventos-ficha.e2e.ts', 'analitica-aviso.e2e.ts']) {
      expect(readFileSync(path.join(DIR, f), 'utf8'), f).toMatch(/await acotarTerceros\(page\)/)
    }
  })
})
