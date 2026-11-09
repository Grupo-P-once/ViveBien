import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Auditoría del rol CLIENTE (28-oct-2026) — recorrido del portal en los cuatro anchos.
 *
 * Sin cuentas reales y sin base: Firebase Auth y TODA `/api/**` de la cuenta se simulan en el navegador (mismo arnés que `guardados.e2e.ts`).
 * Lo que demuestra esto es la PANTALLA (diseño, estados vacíos y con datos, accesibilidad, el botón flotante). La lógica de servidor
 * (aislamiento A/B, consentimiento, deduplicación) se prueba aparte, con PGlite y las rutas reales.
 *
 *     npx next build && npx playwright test -c playwright.sesion.config.ts portal-cliente-recorrido
 *
 * Por pantalla y por ancho: título visible · sin desborde horizontal · sin errores de consola de la app · axe sin graves/críticas ·
 * al llegar al final, el botón de WhatsApp no tapa el último control.
 */

const CLIENTE = { uid: 'uid-qa-cliente', email: 'qa.cliente@prueba.test', nombre: 'Cliente Prueba' }
const TOKEN = `tok-${CLIENTE.email}`

const PANTALLAS: Array<{ ruta: string; titulo: RegExp }> = [
  { ruta: '/portal', titulo: /Hola|Tu portal|Bienvenid/i },
  { ruta: '/portal/propiedades', titulo: /guardadas/i },
  { ruta: '/portal/busquedas', titulo: /búsquedas/i },
  { ruta: '/portal/alertas', titulo: /alertas/i },
  { ruta: '/portal/consultas', titulo: /consultas/i },
  { ruta: '/portal/visitas', titulo: /visitas/i },
  { ruta: '/portal/mi-busqueda', titulo: /búsqueda/i },
  { ruta: '/portal/perfil', titulo: /perfil/i },
  { ruta: '/portal/configuracion', titulo: /configuraci/i },
]

const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

async function simular(page: Page, errores: string[]) {
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', token_type: 'Bearer', user_id: 'x', project_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: CLIENTE.uid, email: CLIENTE.email, displayName: CLIENTE.nombre, idToken: TOKEN, registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: CLIENTE.uid, email: CLIENTE.email, emailVerified: true, displayName: CLIENTE.nombre, providerUserInfo: [{ providerId: 'password', federatedId: CLIENTE.email, email: CLIENTE.email }], validSince: '0', lastLoginAt: '0', createdAt: '0' }] }))
    return r.fulfill(json({}))
  })
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ uid: CLIENTE.uid, email: CLIENTE.email, nombre: CLIENTE.nombre, rol: 'cliente', superAdmin: false, estado: 'activo', portal: true, telefono: '', whatsapp: '', completitud: 40 })))
  await page.route('**/api/portal/acceso', (r) => r.fulfill(json({ ok: true })))
  await page.route('**/api/portal/resumen', (r) => r.fulfill(json({
    citasEnLinea: false, tarjetas: { guardadas: 0, busquedas: 0, nuevas: 0, visitas: 0 }, guardadas: [],
    paraTi: { criterio: 'recientes', propiedades: [] }, tuBusqueda: null, consultas: [], proximasVisitas: [], busquedas: [], avisos: [],
  })))
  await page.route('**/api/portal/guardadas', (r) => r.fulfill(json({ guardadas: [] })))
  await page.route('**/api/portal/busquedas', (r) => r.fulfill(json({ busquedas: [] })))
  await page.route('**/api/portal/alertas', (r) => r.fulfill(json({ alertas: [] })))
  await page.route('**/api/portal/consultas', (r) => r.fulfill(json({ consultas: [] })))
  await page.route('**/api/portal/contactos', (r) => r.fulfill(json({ contactos: [] })))
  await page.route('**/api/portal/visitas', (r) => r.fulfill(json({ proximas: [], pasadas: [], citasEnLinea: false })))
  await page.route('**/api/citas?**', (r) => r.fulfill(json({ citas: [] }))) // «Mis citas» (/portal/visitas) lee /api/citas
  await page.route('**/api/portal/notificaciones',(r) => r.fulfill(json({ notificaciones: [], sinLeer: 0 })))
  await page.route('**/api/portal/preferencias', (r) => r.fulfill(json({ correoAlertas: false, correoLegal: true, consentimientoEn: null })))
  await page.route('**/api/portal/me-interesan', (r) => r.fulfill(json({ interesan: [] })))
  await page.route('**/api/favoritos', (r) => r.fulfill(json([])))
  await page.route('**/api/eventos', (r) => r.fulfill(json({ ok: true })))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Ruido de terceros cortados a propósito por el arnés (fuentes, CDN) y recursos abortados.
    if (/Failed to load resource|net::ERR|googletagmanager|google-analytics|fonts\.g|cdnjs|unsplash/i.test(t)) return
    // Aviso del navegador: la CSP va en modo informe (R-05, pendiente conocido); no es un error de la app.
    if (/upgrade-insecure-requests' is ignored when delivered in a report-only policy/i.test(t)) return
    errores.push(t)
  })
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
}

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(CLIENTE.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/(portal|dashboard)/, { timeout: 30_000 })
}

test.describe('portal del cliente — recorrido', () => {
  for (const p of PANTALLAS) {
    test(`${p.ruta}`, async ({ page }, info) => {
      const errores: string[] = []
      await simular(page, errores)
      await entrar(page)
      await page.goto(p.ruta, { waitUntil: 'domcontentloaded' })

      // 1 · carga: aparece un título de la pantalla (no se queda en el esqueleto ni en un error).
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
      info.annotations.push({ type: 'h1', description: (await page.locator('h1').first().innerText()).trim() })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await expect(page.getByText(/No se pudo|Inténtalo de nuevo|Algo salió mal/i).first()).toHaveCount(0)

      // 2 · sin desborde horizontal.
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(desborde, `desborde horizontal de ${desborde}px en ${p.ruta}`).toBeLessThanOrEqual(1)

      // 3 · accesibilidad: ninguna violación grave o crítica.
      const axe = await new AxeBuilder({ page }).analyze()
      const graves = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.impact}) → ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} [${(n.any[0]?.message ?? '').slice(0, 170)}]`).join(' | ')}`)
      expect(graves, `axe en ${p.ruta}: ${graves.join(' ;; ')}`).toEqual([])

      // 4 · el botón flotante de WhatsApp no tapa el último control al llegar al final (el defecto que vigila wafloat-oclusion).
      await page.waitForTimeout(1800) // el flotante aparece a los 1,5 s
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const tapa = await page.evaluate(() => {
        const fab = document.querySelector('a[href*="wa.me"]')?.closest('div[style*="fixed"]') as HTMLElement | null
        const zona = document.querySelector('[data-portal-contenido]') as HTMLElement | null
        if (!fab || !zona) return { fab: !!fab, zona: !!zona, solapa: false }
        const f = fab.getBoundingClientRect()
        const controles = [...zona.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"]')]
          .filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
        const solapa = controles.some((r) => r.right > f.left && r.left < f.right && r.bottom > f.top && r.top < f.bottom)
        return { fab: true, zona: true, solapa }
      })
      expect(tapa.zona, 'falta data-portal-contenido').toBe(true)
      expect(tapa.solapa, 'el botón de WhatsApp tapa un control al final de la pantalla').toBe(false)

      // 5 · sin errores de JavaScript propios.
      expect(errores, `errores de consola en ${p.ruta}`).toEqual([])

      await page.screenshot({ path: `test-results/portal-cliente/${info.project.name}${p.ruta.replace(/\//g, '_')}.png`, fullPage: true })
    })
  }
})
