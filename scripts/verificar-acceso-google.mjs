// Verificación V-1.1.83: el acceso con Google en un build de
// producción local, contra Firebase de verdad. No inicia sesión con nadie:
// provoca cada caso, mira lo que ve la persona y lo que va a la bitácora.
// La bitácora se intercepta (no llega a la base de producción), igual que la
// analítica.
// Uso: `npx next build && npx next start -p 3100`, y luego `node scripts/verificar-acceso-google.mjs`.
import { chromium, devices } from 'playwright'

// El build local se sirve como «vivebienn.com» DENTRO de este navegador de prueba
// (localhost ya no está en los dominios autorizados de Firebase).
const BASE = 'http://vivebienn.com'
const IP = 'http://127.0.0.1:3100'
const nav = await chromium.launch({ args: ['--host-resolver-rules=MAP vivebienn.com 127.0.0.1:3100'] })
const filas = []

const UA_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98 (iPhone15,2; iOS 17_5; es_MX; es; scale=3.00; 1179x2556; 607420519)'
const UA_FACEBOOK_ANDROID = 'Mozilla/5.0 (Linux; Android 13; moto g(60) Build/T1RD33.116-33-3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.118 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/458.0.0.44.109;]'

async function caso(nombre, { url, ctxOpts = {}, antes, accion, esperar = 15000, boton = /Continuar con Google/i }) {
  const ctx = await nav.newContext(ctxOpts)
  const bitacora = []
  await ctx.route(/\/api\/eventos|google-analytics|googletagmanager/, (r) => r.abort())
  await ctx.route(/\/api\/acceso\/registro/, async (r) => { bitacora.push(r.request().postData()); await r.fulfill({ status: 204 }) })
  if (antes) await ctx.addInitScript(antes)
  const p = await ctx.newPage()
  let ventana = '', aviso = '', crudo = false, enlaces = []
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    const b = p.getByRole('button', { name: boton })
    await b.waitFor({ timeout: 20000 })
    const popupP = ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null)
    await b.click()
    const pop = await popupP
    if (pop) {
      const hasta = Date.now() + 25000
      while (!pop.isClosed() && !/accounts\.google\.com/.test(pop.url()) && Date.now() < hasta) await p.waitForTimeout(500)
      ventana = pop.isClosed() ? '(se cerró sola)' : new URL(pop.url()).host + new URL(pop.url()).pathname
      if (accion === 'cerrar' && !pop.isClosed()) await pop.close()
    }
    const a = p.locator('[data-aviso-entrada]')
    await a.waitFor({ timeout: esperar }).catch(() => {})
    if (await a.count()) {
      aviso = (await a.innerText()).replace(/\s+/g, ' ').slice(0, 150)
      enlaces = await a.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    }
    crudo = /auth\/|Firebase: Error/.test(await p.locator('body').innerText())
  } catch (e) { aviso = 'FALLO: ' + String(e).slice(0, 140) }
  filas.push({ caso: nombre, ventana: ventana || '(ninguna)', aviso: aviso || '(ninguno)', enlaces: enlaces.join(' '), codigoCrudoEnPantalla: crudo, bitacora: bitacora.map((b) => JSON.parse(b).codigo).join(',') })
  await ctx.close()
}

// Tu captura del 22-sep: dirección que no está en los dominios autorizados.
await caso('dominio no autorizado (127.0.0.1, Firebase real)', { url: `${IP}/dashboard` })
await caso('dominio no autorizado (localhost, Firebase real)', { url: 'http://localhost:3100/dashboard' })
// E: ventana permitida en escritorio → llega a Google; G: la persona la cierra.
await caso('E+G escritorio: ventana → Google → la cierra', { url: `${BASE}/dashboard`, accion: 'cerrar', esperar: 30000 })
// F: el navegador bloquea la ventana.
await caso('F ventana bloqueada (escritorio)', { url: `${BASE}/dashboard`, antes: () => { window.open = () => null } })
// D: móvil (Safari de iPhone emulado) → ventana → Google.
await caso('D móvil iPhone: ventana → Google → la cierra', { url: `${BASE}/dashboard`, ctxOpts: { ...devices['iPhone 13'] }, accion: 'cerrar', esperar: 30000 })
// M: navegador de Instagram (iPhone) y de Facebook (Android).
await caso('M Instagram (iPhone)', { url: `${BASE}/dashboard`, ctxOpts: { ...devices['iPhone 13'], userAgent: UA_INSTAGRAM } })
await caso('M Facebook (Android)', { url: `${BASE}/dashboard`, ctxOpts: { ...devices['Pixel 7'], userAgent: UA_FACEBOOK_ANDROID } })
// Panel de administración: mismo flujo.
await caso('panel /admin: ventana bloqueada', { url: `${BASE}/admin`, boton: /Entrar con Google/i, antes: () => { window.open = () => null } })
await caso('panel /admin: dominio no autorizado', { url: `${IP}/admin`, boton: /Entrar con Google/i })

await nav.close()
console.table(filas)
if (filas.some((f) => f.codigoCrudoEnPantalla || f.aviso.startsWith('FALLO'))) process.exit(1)
