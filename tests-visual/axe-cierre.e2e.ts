import AxeBuilder from '@axe-core/playwright'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { test } from '@playwright/test'
import { prepararPaginaPublica, esperarQuieta } from './ayudas'
import { esperarPanel, prepararPanel } from './ayudas-panel'

/**
 * Cierre independiente de E-34 (D-63): axe sobre las mismas rutas y anchos en la base (E-33) y en el candidato (E-34), para comparar.
 * NO falla por violaciones: registra cuántas hay por impacto y qué reglas son, en `AXE_SALIDA` (JSON por líneas), y el análisis decide la regresión.
 * Corre con la config de e2e (4 anchos); la etiqueta (`base` | `e34`) la pone `AXE_ETIQUETA`.
 */
const RUTAS = [
  { nombre: 'portada', ruta: '/', panel: false },
  { nombre: 'catalogo', ruta: '/propiedades', panel: false },
  { nombre: 'ficha-pausada', ruta: '/propiedades/sanjuan', panel: false },
  { nombre: 'entrar', ruta: '/entrar', panel: false },
  { nombre: 'contacto', ruta: '/contacto', panel: false },
  { nombre: 'panel-dashboard', ruta: '/admin', panel: true },
]
const ETIQUETA = process.env.AXE_ETIQUETA ?? 'sin-etiqueta'
const SALIDA = process.env.AXE_SALIDA ?? path.join(process.cwd(), `axe-${ETIQUETA}.json`)

for (const r of RUTAS) {
  test(`axe · ${r.nombre}`, async ({ page }, info) => {
    if (r.panel) await prepararPanel(page)
    else await prepararPaginaPublica(page)
    await page.goto(r.ruta)
    if (r.panel) await esperarPanel(page)
    else await esperarQuieta(page)
    const res = await new AxeBuilder({ page }).analyze()
    const porImpacto: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    const reglas: Record<string, { impacto: string; nodos: number; ejemplos: Array<{ sel: string; dato: string }> }> = {}
    for (const v of res.violations) {
      const imp = v.impact ?? 'minor'
      porImpacto[imp] = (porImpacto[imp] ?? 0) + v.nodes.length
      reglas[v.id] = { impacto: imp, nodos: v.nodes.length, ejemplos: v.nodes.slice(0, 6).map((n) => ({ sel: String(n.target[0]).slice(0, 110), dato: String((n.any[0]?.data && JSON.stringify(n.any[0].data)) ?? n.failureSummary ?? '').slice(0, 230) })) }
    }
    mkdirSync(path.dirname(SALIDA), { recursive: true })
    // una línea JSON por medición: cada proyecto (ancho) corre en su propio proceso y un archivo único se sobrescribiría
    appendFileSync(SALIDA, JSON.stringify({ etiqueta: ETIQUETA, proyecto: info.project.name, ruta: r.nombre, porImpacto, reglas }) + '\n')
  })
}
