// Rendimiento en navegador (solo lectura): TTFB, FCP, LCP, CLS, errores JS y de red, peso y número de peticiones por página y ancho.
// Uso: node navegador-web-vitals.cjs <BASE> <salida.json> [repeticiones]   (playwright se resuelve desde el staging)
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const { chromium } = require('C:/Users/jemil/vivebien-deploy-stage-e33/node_modules/playwright')
const fs = require('fs')
const { instalarGuardia } = require('../../scripts/qa/guardia-produccion.cjs') // R-15: contra producción solo lecturas; la telemetría y las escrituras se abortan antes de salir
/* eslint-enable @typescript-eslint/no-require-imports */
const BASE = process.argv[2]
const SALIDA = process.argv[3]
const N = Number(process.argv[4] || 3)
const PAGINAS = process.env.PAGINAS ? process.env.PAGINAS.split(',') : ['/', '/propiedades', '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl', '/ayuda', '/entrar', '/publicador', '/admin/propiedades/pendientes', '/portal']
const ANCHOS = [390, 768, 1024, 1440]
const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }

;(async () => {
  const b = await chromium.launch()
  const filas = []
  let bloqueadasTotal = 0
  for (const w of ANCHOS) {
    for (const ruta of PAGINAS) {
      const muestras = []
      for (let i = 0; i < N; i++) {
        const ctx = await b.newContext({ viewport: { width: w, height: 900 } })
        const p = await ctx.newPage()
        const errs = []; const fallos = []; let n = 0
        const guardia = instalarGuardia(ctx, { base: BASE, permitirTelemetria: process.env.PERMITIR_TELEMETRIA === '1' }); bloqueadasTotal += 0
        const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable')
        // Perfil de red (THROTTLE=perfil): ≤768 px = móvil 4G lento (1,6 Mbps, 150 ms); más ancho = banda ancha modesta (10 Mbps, 40 ms). Sin él: red sin limitar.
        if (process.env.THROTTLE === 'perfil') {
          const movil = w <= 768
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: movil ? 150 : 40, downloadThroughput: (movil ? 1.6 : 10) * 1024 * 1024 / 8, uploadThroughput: (movil ? 0.75 : 5) * 1024 * 1024 / 8 })
        }
        let enviados = 0; cdp.on('Network.loadingFinished', (e) => { enviados += e.encodedDataLength || 0 })
        p.on('pageerror', (e) => errs.push(e.message))
        p.on('console', (m) => { if (m.type() === 'error' && !/upgrade-insecure-requests/.test(m.text())) errs.push(m.text().slice(0, 100)) })
        p.on('requestfailed', (r) => fallos.push(r.url().slice(0, 80)))
        p.on('response', () => { n++ })
        await p.addInitScript(() => {
          window.__vit = { lcp: 0, cls: 0 }
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__vit.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vit.cls += e.value }).observe({ type: 'layout-shift', buffered: true })
        })
        const t0 = Date.now()
        const res = await p.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
        const total = Date.now() - t0
        await p.waitForTimeout(500)
        const m = await p.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0]
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]
          return { ttfb: nav ? nav.responseStart : null, fcp: fcp ? fcp.startTime : null, lcp: window.__vit.lcp, cls: window.__vit.cls, dcl: nav ? nav.domContentLoadedEventEnd : null, transfer: nav ? nav.transferSize : null }
        })
        muestras.push({ ...m, total, estado: res ? res.status() : 0, errs: errs.length, fallos: fallos.length, n, bytes: enviados })
        bloqueadasTotal += guardia.bloqueadas.length
        await ctx.close()
      }
      filas.push({ ancho: w, ruta, estado: muestras[0].estado, ttfb: mediana(muestras.map((x) => x.ttfb)), fcp: mediana(muestras.map((x) => x.fcp)), lcp: mediana(muestras.map((x) => x.lcp)), cls: mediana(muestras.map((x) => x.cls)),
        carga_total: mediana(muestras.map((x) => x.total)), peticiones: mediana(muestras.map((x) => x.n)), kb: Math.round(mediana(muestras.map((x) => x.bytes)) / 1024), errores_js: Math.max(...muestras.map((x) => x.errs)), fallos_red: Math.max(...muestras.map((x) => x.fallos)) })
      const f = filas[filas.length - 1]
      console.log(`${w}px ${ruta.slice(0, 38).padEnd(38)} HTTP ${f.estado} TTFB ${Math.round(f.ttfb)} FCP ${Math.round(f.fcp)} LCP ${Math.round(f.lcp)} CLS ${f.cls.toFixed(3)} total ${f.carga_total} req ${f.peticiones} KB ${f.kb} errJS ${f.errores_js} redFallos ${f.fallos_red}`)
    }
  }
  await b.close()
  fs.writeFileSync(SALIDA, JSON.stringify(filas, null, 1))
  console.log(`guardia de producción: ${bloqueadasTotal} peticiones de telemetría/escritura abortadas antes de salir`)
})()
