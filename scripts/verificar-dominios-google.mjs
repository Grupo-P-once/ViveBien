// Diagnóstico V-1.1.83: en qué direcciones falla «Continuar con Google».
// No escribe nada ni inicia sesión: pulsa el botón, mira qué pasa y cierra.
// Uso (producción, sólo lectura): `node scripts/verificar-dominios-google.mjs vivebienn.com www.vivebienn.com`.
import { chromium } from 'playwright'
const HOSTS = process.argv.slice(2)
const nav = await chromium.launch()
const filas = []
// Internet lento: hasta 3 intentos; un tiempo agotado aislado NO es un fallo del sitio.
async function intento(host) {
  const ctx = await nav.newContext()
  await ctx.route(/\/api\/eventos|google-analytics|googletagmanager|\/api\/acceso\/registro/, (r) => r.fulfill({ status: 204 }))
  const p = await ctx.newPage()
  let res = null, estado = '', ventana = ''
  try {
    res = await p.goto(`https://${host}/dashboard?prueba=1`, { waitUntil: 'networkidle', timeout: 60000 })
    const boton = p.getByRole('button', { name: /Continuar con Google/i })
    await boton.waitFor({ timeout: 30000 })
    const popupP = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null)
    await boton.click()
    const pop = await popupP
    if (pop) {
      const hasta = Date.now() + 30000
      while (!pop.isClosed() && !/accounts\.google\.com/.test(pop.url()) && Date.now() < hasta) await p.waitForTimeout(500)
      ventana = pop.isClosed() ? '(se cerró sola)' : new URL(pop.url()).host + new URL(pop.url()).pathname
      if (!pop.isClosed()) await pop.close()
    }
    await p.waitForTimeout(1500)
    estado = (await p.locator('text=/auth\/|Firebase: Error/').allInnerTexts()).join(' | ').slice(0, 140)
  } catch (e) { estado = 'tiempo agotado / red: ' + String(e).split('\n')[0].slice(0, 90) }
  const fila = { host, http: res?.status() ?? '-', final: res ? new URL(p.url()).host + new URL(p.url()).pathname + new URL(p.url()).search : '-', ventanaGoogle: ventana || '(no se abrió)', codigoCrudo: estado || '(ninguno)' }
  await ctx.close()
  return fila
}
for (const host of HOSTS) {
  let fila, n = 0
  do { n++; fila = await intento(host) } while (n < 3 && !/accounts\.google\.com/.test(fila.ventanaGoogle))
  filas.push({ ...fila, intentos: n })
}
await nav.close()
console.table(filas)
