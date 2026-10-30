import AxeBuilder from '@axe-core/playwright'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'

/**
 * Etapa 7 · iniciar sesión se veía como DOS pantallas distintas: una azul y luego una blanca.
 *
 * Causa (comprobada aquí, con el navegador): `/dashboard` pintaba su propia espera (fondo azul, texto «Vive Bien», spinner de
 * Font Awesome) mientras preguntaba el rol; al redirigir, el marco del portal/publicador/admin montaba OTRA (fondo blanco, otro
 * spinner) y volvía a preguntar lo mismo a `/api/usuarios/me`.
 *
 * Qué mide: una grabadora dentro de la página anota, fotograma a fotograma, QUÉ pantalla completa se ve (la espera única, otra
 * espera distinta, o contenido). Después del arreglo toda espera es `PantallaDeEspera` (misma firma: fondo blanco, logo oficial,
 * texto de estado), y entrar cuesta UNA consulta de perfil, no dos.
 *
 * `MEDIR_SOLO=1` no afirma nada: solo escribe la evidencia (se usa para fotografiar el «antes» en la base promovida).
 * Sin cuentas reales: Google Identity y toda la API se simulan; `/api/usuarios/me` hace de servidor y es la única fuente del rol.
 */

type Perfil = {
  uid: string; nombre: string; rol: 'cliente' | 'publicador' | 'admin'; superAdmin: boolean
  capacidades?: Record<string, boolean>; tipo_publicador?: string
}
const PERFILES: Record<string, Perfil> = {
  'cliente@prueba.test': { uid: 'uid-cliente', nombre: 'Cliente Prueba', rol: 'cliente', superAdmin: false },
  'publicador@prueba.test': { uid: 'uid-publicador', nombre: 'Publicador Prueba', rol: 'publicador', superAdmin: false, capacidades: { recibir_citas: false }, tipo_publicador: 'publicador' },
  'asociado@prueba.test': { uid: 'uid-asociado', nombre: 'Asociado Prueba', rol: 'publicador', superAdmin: false, capacidades: { recibir_citas: true }, tipo_publicador: 'asociado' },
  'admin@prueba.test': { uid: 'uid-admin', nombre: 'Admin Prueba', rol: 'admin', superAdmin: false },
  'super@prueba.test': { uid: 'uid-super', nombre: 'Super Prueba', rol: 'admin', superAdmin: true },
}
const porToken = (t: string) => Object.entries(PERFILES).find(([c]) => `tok-${c}` === t)

type Firma = { t: number; firma: string; ruta: string }
type VentanaConFirmas = Window & { __firmas: Firma[] }

const MEDIR_SOLO = process.env.MEDIR_SOLO === '1'
const SALIDA = process.env.EVIDENCIA_LOGIN ?? path.join(process.cwd(), 'test-results', 'login')
const ETIQUETA = process.env.ETIQUETA_LOGIN ?? 'candidato'
/** El «servidor» tarda esto en contestar el perfil: lo bastante para que cada espera sea observable, no tanto que alargue la suite. */
const DEMORA_PERFIL_MS = 700

async function simular(page: Page, opc: { perfil?: 'normal' | 'error500' | 'vencida' } = {}) {
  await acotarTerceros(page)
  const me: string[] = []
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' }) }))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    const cuerpo = JSON.parse(r.request().postData() || '{}')
    if (url.includes('accounts:signInWithPassword')) {
      const p = PERFILES[cuerpo.email]
      if (!p) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }) })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ localId: p.uid, email: cuerpo.email, displayName: p.nombre, idToken: `tok-${cuerpo.email}`, registered: true, refreshToken: 'r', expiresIn: '3600' }) })
    }
    if (url.includes('accounts:lookup')) {
      const hallado = porToken(cuerpo.idToken)
      const [email, p] = hallado ?? ['', PERFILES['cliente@prueba.test']]
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: p.uid, email, emailVerified: true, displayName: p.nombre, providerUserInfo: [{ providerId: 'password', federatedId: email, email }], validSince: '1700000000', lastLoginAt: '1700000000000', createdAt: '1700000000000' }] }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    if (q.method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (ruta === '/api/usuarios/me') {
      const token = (q.headers()['authorization'] || '').replace('Bearer ', '')
      me.push(token)
      await new Promise((ok) => setTimeout(ok, DEMORA_PERFIL_MS))
      if (opc.perfil === 'error500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' })
      if (opc.perfil === 'vencida') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"sesion"}' })
      const hallado = porToken(token)
      if (!hallado) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"x"}' })
      const [email, p] = hallado
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: p.uid, email, nombre: p.nombre, rol: p.rol, superAdmin: p.superAdmin, estado: 'activo', portal: true, capacidades: p.capacidades ?? {}, tipo_publicador: p.tipo_publicador }) })
    }
    if (ruta === '/api/portal/acceso') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    if (ruta === '/api/publicador/propiedades') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' })
  })
  return { me }
}

/**
 * Grabadora: en cada fotograma anota la «firma» de lo que ocupa la pantalla y solo guarda los CAMBIOS.
 *   espera:<fondo>:logo=<si/no>   → la pantalla única (`data-pantalla-de-espera`)
 *   otra-espera:<fondo>           → cualquier otra pantalla completa con role=status (las dos de antes)
 *   contenido:<ruta>              → ya hay contenido
 */
async function grabadora(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as VentanaConFirmas
    w.__firmas = []
    const fondo = (e: Element) => {
      for (let n: Element | null = e; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
      }
      return 'sin-fondo'
    }
    const firma = () => {
      const e = document.querySelector('[data-pantalla-de-espera]')
      if (e) return `espera:${fondo(e)}:logo=${!!e.querySelector('img')}`
      const st = Array.from(document.querySelectorAll('[role=status]')).find((x) => x.getBoundingClientRect().height >= window.innerHeight * 0.9)
      if (st) return `otra-espera:${fondo(st)}`
      return `contenido:${location.pathname}`
    }
    let ultima = ''
    const t0 = performance.now()
    const paso = () => {
      const f = firma()
      if (f !== ultima) { ultima = f; w.__firmas.push({ t: Math.round(performance.now() - t0), firma: f, ruta: location.pathname }) }
      requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  })
}

const firmas = (page: Page) => page.evaluate(() => (window as unknown as VentanaConFirmas).__firmas)

async function entrarCon(page: Page, email: string) {
  await page.getByLabel(/Correo/i).fill(email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function fotografiar(page: Page, nombre: string) {
  mkdirSync(path.join(SALIDA, 'capturas'), { recursive: true })
  await page.screenshot({ path: path.join(SALIDA, 'capturas', `${ETIQUETA}-${nombre}.png`) })
}

/** Mientras dura la espera, saca una captura cada vez que cambia la pantalla (nombre = ancho + rol + orden). */
async function seguirYFotografiar(page: Page, rol: string, hasta: () => Promise<void>) {
  const ancho = page.viewportSize()!.width
  let ultima = ''
  let n = 0
  const vigilar = (async () => {
    for (let i = 0; i < 60; i++) {
      const f = await page.evaluate(() => {
        const a = (window as unknown as VentanaConFirmas).__firmas
        return a.length ? a[a.length - 1].firma : ''
      }).catch(() => '')
      if (f && f !== ultima) { ultima = f; n++; await fotografiar(page, `${rol}-${ancho}-${n}-${f.split(':')[0]}`).catch(() => {}) }
      if (f.startsWith('contenido:') && !f.endsWith('/entrar') && n > 1) break
      await page.waitForTimeout(90)
    }
  })()
  await hasta()
  await vigilar
}

const ROLES: Array<{ clave: string; correo: string; destino: RegExp }> = [
  { clave: 'cliente', correo: 'cliente@prueba.test', destino: /\/portal$/ },
  { clave: 'publicador', correo: 'publicador@prueba.test', destino: /\/portal$/ },
  { clave: 'asociado', correo: 'asociado@prueba.test', destino: /\/portal$/ },
  { clave: 'admin', correo: 'admin@prueba.test', destino: /\/admin(\/|$|\?)/ },
  { clave: 'super-admin', correo: 'super@prueba.test', destino: /\/admin(\/|$|\?)/ },
]

for (const r of ROLES) {
  test(`entrar como ${r.clave}: una sola pantalla de espera y UNA consulta de perfil`, async ({ page }, info) => {
    const { me } = await simular(page)
    await grabadora(page)
    await page.goto('/entrar')
    await seguirYFotografiar(page, r.clave, async () => {
      await entrarCon(page, r.correo)
      await expect(page).toHaveURL(r.destino, { timeout: 30_000 })
      await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
    })
    const f = await firmas(page)
    const esperas = f.filter((x) => !x.firma.startsWith('contenido:'))
    const distintas = Array.from(new Set(esperas.map((x) => x.firma)))
    mkdirSync(SALIDA, { recursive: true })
    appendFileSync(path.join(SALIDA, `firmas-${ETIQUETA}.jsonl`), JSON.stringify({ rol: r.clave, ancho: page.viewportSize()!.width, consultasDePerfil: me.length, distintas, secuencia: f }) + '\n')
    if (MEDIR_SOLO) { info.annotations.push({ type: 'medicion', description: `${distintas.length} esperas distintas, ${me.length} consultas` }); return }

    // 1) Si hubo espera, TODAS son la misma pantalla (mismo fondo y logo): nada de «azul y luego blanco».
    expect(distintas.length, `esperas vistas: ${JSON.stringify(distintas)}`).toBeLessThanOrEqual(1)
    for (const d of distintas) expect(d).toBe('espera:rgb(255, 255, 255):logo=true')
    // 2) Ninguna pantalla completa «ajena» (la azul del dashboard ni la blanca del marco).
    expect(esperas.filter((x) => x.firma.startsWith('otra-espera'))).toEqual([])
    // 3) Entrar cuesta UNA consulta de perfil (antes eran dos: /dashboard y el marco).
    expect(me.length, `consultas a /api/usuarios/me: ${me.length}`).toBe(1)
  })
}

test('entrada directa por URL: /admin y /publicador muestran la misma espera y consultan el perfil una vez', async ({ page }, info) => {
  const { me } = await simular(page)
  await grabadora(page)
  await page.goto('/entrar')
  await entrarCon(page, 'super@prueba.test')
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/, { timeout: 30_000 })
  for (const ruta of ['/admin', '/publicador']) {
    me.length = 0
    await page.goto(ruta)
    await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 15_000 })
    const f = await firmas(page)
    const esperas = Array.from(new Set(f.filter((x) => !x.firma.startsWith('contenido:')).map((x) => x.firma)))
    appendFileSync(path.join(SALIDA, `firmas-${ETIQUETA}.jsonl`), JSON.stringify({ directa: ruta, ancho: page.viewportSize()!.width, consultasDePerfil: me.length, distintas: esperas }) + '\n')
    if (MEDIR_SOLO) continue
    expect(esperas.length, `esperas en ${ruta}: ${JSON.stringify(esperas)}`).toBeLessThanOrEqual(1)
    for (const d of esperas) expect(d).toBe('espera:rgb(255, 255, 255):logo=true')
    expect(me.length, `consultas en ${ruta}`).toBe(1)
  }
  info.annotations.push({ type: 'ok', description: 'directas' })
})

test('la espera es accesible: role=status con texto, logo con nombre y axe sin hallazgos; no roba el foco', async ({ page }) => {
  test.skip(MEDIR_SOLO, 'la base anterior no tiene esta pantalla')
  await simular(page)
  await page.goto('/entrar')
  await entrarCon(page, 'cliente@prueba.test')
  const espera = page.locator('[data-pantalla-de-espera]')
  await expect(espera).toBeVisible({ timeout: 15_000 })
  await expect(espera).toHaveAttribute('role', 'status')
  await expect(espera).toContainText('Entrando a tu cuenta…')
  await expect(espera.getByRole('img', { name: 'Vive Bien' })).toBeVisible()
  // El spinner es decorativo.
  await expect(espera.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  const res = await new AxeBuilder({ page }).include('[data-pantalla-de-espera]').analyze()
  expect(res.violations.map((v) => `${v.id}:${v.nodes.length}`)).toEqual([])
  // No hay trampa de foco ni autofoco forzado: la espera no contiene nada enfocable.
  expect(await espera.locator('a, button, input, select, textarea, [tabindex]').count()).toBe(0)
})

test('errores: perfil 500 y sesión vencida (401) NO dejan la espera para siempre', async ({ page }) => {
  test.skip(MEDIR_SOLO, 'solo candidato')
  for (const modo of ['error500', 'vencida'] as const) {
    await page.unroute('**/api/**').catch(() => {})
    const { me } = await simular(page, { perfil: modo })
    await page.goto('/entrar')
    await entrarCon(page, 'cliente@prueba.test')
    // Sea cual sea el destino (panel de siempre, tarjeta de error o de entrada), la espera termina y se dice algo.
    await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('body')).not.toBeEmpty()
    expect(me.length, `consultas con ${modo}`).toBeLessThanOrEqual(2)
    await page.context().clearCookies()
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.databases?.().then((d) => d.forEach((b) => b.name && indexedDB.deleteDatabase(b.name))) } catch { /* nada */ } })
  }
})

test('sin sesión, /dashboard va a /entrar sin quedarse en la espera', async ({ page }) => {
  test.skip(MEDIR_SOLO, 'solo candidato')
  await simular(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/entrar/, { timeout: 20_000 })
  await expect(page.locator('[data-pantalla-de-espera]')).toHaveCount(0)
})

test('"siguiente" de un área ajena se ignora: cliente con ?siguiente=/admin/usuarios acaba en /portal, con la misma espera', async ({ page }) => {
  test.skip(MEDIR_SOLO, 'solo candidato')
  const { me } = await simular(page)
  await grabadora(page)
  await page.goto('/entrar?siguiente=%2Fadmin%2Fusuarios')
  await entrarCon(page, 'cliente@prueba.test')
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 })
  const f = await firmas(page)
  expect(f.filter((x) => x.firma.startsWith('otra-espera'))).toEqual([])
  expect(me.length).toBe(1)
})
