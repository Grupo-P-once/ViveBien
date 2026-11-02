// ¿Qué elemento es el LCP y qué pesa? (solo lectura, producción). Uso: node lcp-causa.cjs <BASE> <ruta> [ancho]
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const { chromium } = require('C:/Users/jemil/vivebien-deploy-stage-e33/node_modules/playwright')
const { instalarGuardia } = require('../../scripts/qa/guardia-produccion.cjs') // R-15: contra producción solo lecturas; la telemetría y las escrituras se abortan antes de salir
/* eslint-enable @typescript-eslint/no-require-imports */
;(async () => {
  const [base, ruta, ancho] = [process.argv[2], process.argv[3], Number(process.argv[4] || 390)]
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: ancho, height: 900 } })
  instalarGuardia(ctx, { base })
  const p = await ctx.newPage()
  if (process.env.THROTTLE === 'perfil') { const c = await ctx.newCDPSession(p); await c.send('Network.enable'); const movil = ancho <= 768; await c.send('Network.emulateNetworkConditions', { offline: false, latency: movil ? 150 : 40, downloadThroughput: (movil ? 1.6 : 10) * 1024 * 1024 / 8, uploadThroughput: 100000 }) }
  const recursos = []
  p.on('response', async (r) => {
    try { const h = r.headers(); recursos.push({ url: r.url(), tipo: h['content-type'] || '', bytes: Number(h['content-length'] || 0), cache: h['x-vercel-cache'] || h['cf-cache-status'] || '' }) } catch {}
  })
  await p.addInitScript(() => {
    window.__lcp = null
    new PerformanceObserver((l) => { const e = l.getEntries().pop(); window.__lcp = { t: e.startTime, url: e.url, size: e.size, el: e.element ? e.element.tagName + '.' + (e.element.className || '').toString().slice(0, 40) : null, w: e.element && e.element.naturalWidth, h: e.element && e.element.naturalHeight, cw: e.element && e.element.clientWidth } }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  await p.goto(base + ruta, { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(800)
  const lcp = await p.evaluate(() => window.__lcp)
  console.log('LCP', JSON.stringify(lcp))
  const imgs = recursos.filter((r) => /image|video/.test(r.tipo) || /cloudinary|\.(jpe?g|png|webp|avif)/i.test(r.url)).sort((x, y) => y.bytes - x.bytes)
  console.log('imágenes:', imgs.length, '| bytes (content-length) suma:', imgs.reduce((a, r) => a + r.bytes, 0))
  for (const r of imgs.slice(0, 6)) console.log(' ', r.bytes, r.url.slice(0, 150))
  const js = recursos.filter((r) => /javascript/.test(r.tipo))
  console.log('js:', js.length, 'archivos, bytes:', js.reduce((a, r) => a + r.bytes, 0))
  await b.close()
})()
