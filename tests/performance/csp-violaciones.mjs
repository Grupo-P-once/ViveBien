// Inventario de violaciones de CSP (R-05, D-62). Abre cada página con Chromium, escucha `securitypolicyviolation` y, opcionalmente,
// reescribe la cabecera CSP-Report-Only del documento para probar una política MÁS ESTRICTA sin tocar el servidor.
// Uso: node csp-violaciones.mjs <BASE> <salida.json> [variante]   variante: base | sin-eval
// Bloquea /api/eventos (telemetría) para no ensuciar la analítica (R-15). Solo lectura.
import { chromium } from 'playwright'
import fs from 'node:fs'
import guardia from '../../scripts/qa/guardia-produccion.cjs' // R-15: contra producción solo lecturas; la telemetría y las escrituras se abortan antes de salir
const { instalarGuardia } = guardia
const [BASE, SALIDA, VARIANTE = 'base'] = process.argv.slice(2)
const PAGINAS = ['/', '/propiedades', '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl', '/ayuda', '/ayuda/buscar-propiedades/como-buscar-una-propiedad', '/entrar', '/contacto', '/valuador', '/comparar', '/nosotros', '/privacidad', '/terminos', '/portal', '/publicador', '/admin', '/admin/propiedades/pendientes', '/dashboard']
;(async () => {
  const b = await chromium.launch()
  const resultado = {}
  for (const ruta of PAGINAS) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
    const p = await ctx.newPage()
    instalarGuardia(ctx, { base: BASE })
    if (VARIANTE === 'sin-eval') {
      await p.route(/.*/, async (r) => {
        if (r.request().resourceType() !== 'document') return r.continue()
        const resp = await r.fetch()
        const h = { ...resp.headers() }
        for (const k of ['content-security-policy-report-only', 'content-security-policy']) if (h[k]) h[k] = h[k].replace(" 'unsafe-eval'", '')
        await r.fulfill({ response: resp, headers: h })
      })
    }
    await p.addInitScript(() => {
      window.__csp = []
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ d: e.violatedDirective, b: (e.blockedURI || '').slice(0, 90), s: (e.sourceFile || '').slice(0, 70), disp: e.disposition, l: e.lineNumber }))
    })
    await p.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    await p.waitForTimeout(1500)
    resultado[ruta] = await p.evaluate(() => window.__csp)
    await ctx.close()
  }
  await b.close()
  fs.writeFileSync(SALIDA, JSON.stringify(resultado, null, 1))
  const agg = {}
  for (const [ruta, v] of Object.entries(resultado)) for (const x of v) { const k = x.d + ' ← ' + (x.b || '(inline/eval)'); agg[k] = agg[k] || { n: 0, rutas: new Set() }; agg[k].n++; agg[k].rutas.add(ruta) }
  console.log(`variante=${VARIANTE} · páginas=${PAGINAS.length} · violaciones totales=${Object.values(resultado).reduce((a, v) => a + v.length, 0)}`)
  for (const [k, v] of Object.entries(agg).sort((a, c) => c[1].n - a[1].n)) console.log(String(v.n).padStart(4), k, '·', [...v.rutas].slice(0, 4).join(' '))
})()
