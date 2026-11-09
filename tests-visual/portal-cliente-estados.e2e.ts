import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Auditoría del rol CLIENTE (28-oct-2026) — los TRES estados de cada pantalla del portal: carga lenta, vacío y ERROR (500).
 * Regla del proyecto: «si la petición falló, DÍLO: no enseñes "aún no hay datos"». Una pantalla que ante un 500 dice «Todavía no tienes…» miente al cliente.
 * Sin base ni cuentas reales: Firebase y `/api/**` se simulan; el modo (lento / vacío / error) cambia entre navegaciones dentro de la MISMA sesión.
 *
 * Por pantalla: (1) LENTO — mientras tarda no aparece ningún texto de «vacío» ni de «error» y sí un esqueleto; (2) VACÍO — se ve el estado vacío y ninguna alerta de error;
 * (3) ERROR — se ve un aviso de error (`role="alert"` o «No se pudo…») y NINGÚN texto de «vacío».
 */
const CLIENTE = { uid: 'uid-qa-cliente', email: 'qa.cliente@prueba.test', nombre: 'Cliente Prueba' }
const TOKEN = `tok-${CLIENTE.email}`
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
const VACIO = /Todavía no|No tienes|Aún no|aún no hay|Sin (consultas|propiedades|búsquedas)|no has (preguntado|guardado)/i
const ERROR = /No se pudo/i

const PANTALLAS = ['/portal', '/portal/propiedades', '/portal/busquedas', '/portal/alertas', '/portal/consultas', '/portal/visitas', '/portal/mi-busqueda', '/portal/perfil', '/portal/configuracion']
// Pantallas cuyo contenido NO depende de `/api/portal/**` (solo de la sesión): ante un 500 de esas rutas no hay nada que fallar.
// Perfil: formulario sobre la sesión (`/api/usuarios/me`). Configuración: solo monta `CuentaYSeguridad` (correo, contraseña, cerrar sesión, baja); las preferencias de aviso y la bandeja
// viven en «Mis alertas» y el historial de contactos en «Mis consultas» (ahí SÍ se prueba el error). Un 500 de `/api/portal/**` no puede afectar a estas dos.
const DEPENDEN_DE_LA_API: Record<string, boolean> = { '/portal/perfil': false, '/portal/configuracion': false }

type Modo = 'vacio' | 'lento' | 'error'
const RESPUESTA_VACIA: Record<string, unknown> = {
  resumen: { citasEnLinea: false, tarjetas: { guardadas: 0, busquedas: 0, nuevas: 0, visitas: 0 }, guardadas: [], paraTi: { criterio: 'recientes', propiedades: [] }, tuBusqueda: null, consultas: [], proximasVisitas: [], busquedas: [], avisos: [] },
  guardadas: { guardadas: [] }, busquedas: { busquedas: [] }, alertas: { alertas: [] }, consultas: { consultas: [] }, contactos: { contactos: [] },
  visitas: { proximas: [], pasadas: [], citasEnLinea: false }, notificaciones: { notificaciones: [], sinLeer: 0 },
  preferencias: { correoAlertas: false, correoLegal: true, consentimientoEn: null }, 'me-interesan': { interesan: [] },
}

async function simular(page: Page, modo: () => Modo, errores: string[]) {
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', token_type: 'Bearer', user_id: 'x', project_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', (r) => {
    const u = r.request().url()
    if (u.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: CLIENTE.uid, email: CLIENTE.email, displayName: CLIENTE.nombre, idToken: TOKEN, registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (u.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: CLIENTE.uid, email: CLIENTE.email, emailVerified: true, displayName: CLIENTE.nombre, providerUserInfo: [{ providerId: 'password', federatedId: CLIENTE.email, email: CLIENTE.email }], validSince: '0', lastLoginAt: '0', createdAt: '0' }] }))
    return r.fulfill(json({}))
  })
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ uid: CLIENTE.uid, email: CLIENTE.email, nombre: CLIENTE.nombre, rol: 'cliente', superAdmin: false, estado: 'activo', portal: true, telefono: '', whatsapp: '', completitud: 40 })))
  await page.route('**/api/portal/acceso', (r) => r.fulfill(json({ ok: true })))
  await page.route('**/api/favoritos', (r) => r.fulfill(json([])))
  await page.route('**/api/eventos', (r) => r.fulfill(json({ ok: true })))
  // «Mis citas» (/portal/visitas) lee `/api/citas`, no `/api/portal/*`: sin este mock llegaba al servidor con un token falso y recibía un 401 real.
  await page.route('**/api/citas?**', async (r) => {
    const m = modo()
    if (m === 'error') return r.fulfill(json({ error: 'fallo simulado' }, 500))
    if (m === 'lento') await new Promise((x) => setTimeout(x, 2500))
    return r.fulfill(json({ citas: [] }))
  })
  await page.route('**/api/portal/**', async (r) => {
    const clave = new URL(r.request().url()).pathname.replace('/api/portal/', '')
    if (clave === 'acceso') return r.fulfill(json({ ok: true }))
    const m = modo()
    if (m === 'error') return r.fulfill(json({ error: 'fallo simulado' }, 500))
    if (m === 'lento') await new Promise((x) => setTimeout(x, 2500))
    return r.fulfill(json(RESPUESTA_VACIA[clave] ?? {}))
  })
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|googletagmanager|google-analytics|fonts\.g|cdnjs|unsplash|upgrade-insecure-requests/i.test(m.text())) errores.push(m.text()) })
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
}

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(CLIENTE.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/(portal|dashboard)/, { timeout: 30_000 })
}

const textoVisible = (page: Page) => page.locator('[data-portal-contenido]').innerText()

test.describe('portal del cliente — carga, vacío y error', () => {
  test.use({ reducedMotion: 'reduce' })
  test.setTimeout(120_000)
  for (const ruta of PANTALLAS) {
    test(`${ruta}`, async ({ page }, info) => {
      let modo: Modo = 'vacio'
      const errores: string[] = []
      await simular(page, () => modo, errores)
      await entrar(page)

      // 1 · VACÍO
      modo = 'vacio'
      await page.goto(ruta, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      expect(await page.locator('[role="alert"]').filter({ hasText: ERROR }).count(), `${ruta} VACÍO: no debe haber alerta de error`).toBe(0)
      expect(await textoVisible(page), `${ruta} VACÍO: no debe decir «No se pudo»`).not.toMatch(ERROR)

      // 2 · LENTO (2,5 s): al principio no debe mostrar «vacío» ni «error»
      modo = 'lento'
      await page.goto(ruta, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(900)
      const durante = await textoVisible(page)
      info.annotations.push({ type: 'durante la carga', description: durante.replace(/\s+/g, ' ').slice(0, 140) })
      if (DEPENDEN_DE_LA_API[ruta] !== false) {
        expect(durante, `${ruta} CARGANDO: no debe enseñar «vacío» mientras tarda`).not.toMatch(VACIO)
        expect(durante, `${ruta} CARGANDO: no debe enseñar «error» mientras tarda`).not.toMatch(ERROR)
      }
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

      // 3 · ERROR 500
      modo = 'error'
      await page.goto(ruta, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(600)
      const enError = await textoVisible(page)
      info.annotations.push({ type: 'ante un 500', description: enError.replace(/\s+/g, ' ').slice(0, 160) })
      if (DEPENDEN_DE_LA_API[ruta] !== false) {
        // OJO: NO se cuenta cualquier `role="alert"` de la página: el anunciador de rutas de Next.js trae uno SIEMPRE (en un shadow root) y volvía verdadera esta
        // condición en todas las pantallas (lo reveló el control positivo). Se exige el aviso DENTRO del contenido del portal.
        const avisa = (await page.locator('[data-portal-contenido] [role="alert"]').count()) > 0 || ERROR.test(enError)
        expect(avisa, `${ruta} ERROR: debe AVISAR que falló. Texto visible: «${enError.replace(/\s+/g, ' ').slice(0, 120)}»`).toBe(true)
        expect(enError, `${ruta} ERROR: NO debe decir «vacío» cuando en realidad falló. Texto: «${enError.replace(/\s+/g, ' ').slice(0, 120)}»`).not.toMatch(VACIO)
      }
      await page.screenshot({ path: `test-results/portal-cliente-estados/${info.project.name}${ruta.replace(/\//g, '_')}-error.png`, fullPage: true })
      void errores
    })
  }
})
