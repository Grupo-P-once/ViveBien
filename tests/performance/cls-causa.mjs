// ¿Qué elemento provoca los saltos de layout (CLS)? (R-08, D-62). Solo lectura. Uso: node cls-causa.mjs <BASE> <ruta> [ancho] [THROTTLE=perfil]
import { chromium, devices } from 'playwright'
import guardia from '../../scripts/qa/guardia-produccion.cjs'
const { instalarGuardia } = guardia
;(async () => {
  const [base, ruta, ancho] = [process.argv[2], process.argv[3], Number(process.argv[4] || 390)]
  const b = await chromium.launch()
  // DISPOSITIVO=movil|tableta usa un dispositivo REAL de Playwright (User-Agent y pistas de cliente incluidos); sin él, escritorio con ese ancho.
  const perfil = process.env.DISPOSITIVO === 'movil' ? devices['Pixel 7'] : process.env.DISPOSITIVO === 'tableta' ? devices['iPad (gen 7)'] : { viewport: { width: ancho, height: 844 } }
  const ctx = await b.newContext(perfil)
  instalarGuardia(ctx, { base })
  const p = await ctx.newPage()
  if (process.env.THROTTLE === 'perfil') { const c = await ctx.newCDPSession(p); await c.send('Network.enable'); const movil = ancho <= 768; await c.send('Network.emulateNetworkConditions', { offline: false, latency: movil ? 150 : 40, downloadThroughput: (movil ? 1.6 : 10) * 1024 * 1024 / 8, uploadThroughput: 100000 }) }
  await p.addInitScript(() => {
    window.__cls = []
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue
        window.__cls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), n: (e.sources || []).map((s) => (s.node ? (s.node.nodeName + '.' + (s.node.className || '').toString().slice(0, 50)) : '?') + ' ' + JSON.stringify([s.previousRect.y | 0, s.previousRect.height | 0, '→', s.currentRect.y | 0, s.currentRect.height | 0])) })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await p.goto(base + ruta, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(1500)
  const r = await p.evaluate(() => window.__cls)
  console.log(`CLS total ${r.reduce((a, x) => a + x.v, 0).toFixed(3)} en ${r.length} saltos`)
  for (const x of r) console.log(`  t=${x.t}ms valor=${x.v}`, x.n.join(' | ').slice(0, 300))
  await b.close()
})()
