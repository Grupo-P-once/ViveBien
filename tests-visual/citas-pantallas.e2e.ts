import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Pantallas de citas (5-nov-2026) en 390/768/1024/1440: Google/Firebase y TODA la API de citas simulados en el navegador (no se toca la base
 * ni se usa ninguna cuenta real). Comprueba lo que se VE y se HACE en cada rol: sin desborde horizontal, axe sin hallazgos serios/críticos,
 * teclado (Enter abre el detalle, Escape lo cierra y devuelve el foco), solo las acciones que el servidor manda, y la tarjeta
 * «Agenda una cita» de la ficha de punta a punta (solo con cuenta, consentimiento, clave de idempotencia por horario).
 *
 *     npx playwright test -c playwright.sesion.config.ts citas-pantallas
 */

type Rol = 'cliente' | 'admin' | 'publicador'
const CUENTAS: Record<Rol, { uid: string; nombre: string; email: string; destino: RegExp }> = {
  cliente: { uid: 'uid-cli', nombre: 'Clara Cliente', email: 'clara@prueba.test', destino: /\/portal$/ },
  admin: { uid: 'uid-adm', nombre: 'Ana Admin', email: 'ana@prueba.test', destino: /\/admin$/ },
  publicador: { uid: 'uid-pub', nombre: 'Pablo Publicador', email: 'pablo@prueba.test', destino: /\/portal$/ },
}
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
const UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const enDias = (n: number, h: number) => { const d = new Date(Date.now() + n * 86_400_000); d.setUTCHours(h, 0, 0, 0); return d }
const manana = (h: number) => { const d = new Date(Date.now() + 2 * 86_400_000); d.setUTCHours(h, 0, 0, 0); return d }
const mas = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

function cita(o: Record<string, unknown>) {
  const inicio = (o.inicio as Date | undefined) ?? manana(16)
  return {
    id: ID_A, version: 1, estado: 'CONFIRMED', etiqueta: 'Confirmada', papel: 'cliente', tipo: 'solicitada', firme: true,
    zona: 'America/Mexico_City', lugar: 'León, Gto.',
    propiedad: { id: 'p1', titulo: 'Casa Álamos', tipo: 'casa', ruta: '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl', foto: null }, propuesta: null,
    cliente: { nombre: 'Clara Cliente' }, asesor: { nombre: 'Luis Asesor' }, notasCliente: null, motivoCancelacion: null,
    acciones: ['cancelar'], creadaEn: new Date().toISOString(), actualizadaEn: new Date().toISOString(),
    ...o, inicio: inicio.toISOString(), fin: mas(inicio, 60).toISOString(),
  }
}

type Control = { posts: Array<{ ruta: string; cuerpo: Record<string, unknown>; clave: string | null }> }

async function simular(page: Page, rol: Rol, o: { citas: Array<Record<string, unknown>>; flag?: boolean; atiende?: boolean; huecosEn?: number[] }): Promise<Control> {
  const yo = CUENTAS[rol]
  const control: Control = { posts: [] }
  await page.route((u) => /(^|\.)(cloudinary\.com)$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL }))
  await page.route((u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com|api\.open-meteo\.com|apis\.google\.com)$/.test(u.hostname), (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'images.unsplash.com') return r.fulfill({ status: 200, contentType: 'image/png', body: UN_PIXEL })
    if (u.hostname === 'fonts.googleapis.com' || (u.hostname === 'cdnjs.cloudflare.com' && u.pathname.endsWith('.css'))) return r.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return r.abort()
  })
  await page.route((u) => /(^|\.)(supabase\.co|supabase\.in|firebaseio\.com|firebaseapp\.com|vercel\.app|vercel\.com|vercel-insights\.com|vercel-scripts\.com|resend\.com|telegram\.org)$/.test(u.hostname), (r) => r.abort())
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', user_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: yo.uid, email: yo.email, displayName: yo.nombre, idToken: `tok-${rol}`, registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: yo.uid, email: yo.email, emailVerified: true, displayName: yo.nombre, providerUserInfo: [{ providerId: 'password', federatedId: yo.email, email: yo.email }] }] }))
    return r.fulfill(json({}))
  })

  const dia = manana(16).toISOString().slice(0, 10)
  await page.route('**/api/**', async (r) => {
    const q = r.request()
    const ruta = new URL(q.url()).pathname
    const metodo = q.method()
    if (ruta === '/api/portal/acceso') return r.fulfill(json({ ok: true }))
    if (ruta === '/api/usuarios/me') {
      return r.fulfill(json({
        uid: yo.uid, email: yo.email, nombre: yo.nombre, estado: 'activo', portal: true, superAdmin: rol === 'admin',
        rol: rol === 'admin' ? 'admin' : rol === 'publicador' ? 'publicador' : 'cliente',
        ...(rol === 'publicador' ? { tipoPublicador: o.atiende === false ? 'publicador' : 'asociado', capacidades: { recibir_citas: o.atiende !== false } } : {}),
      }))
    }
    if (ruta === '/api/citas/ics') return r.fulfill({ status: 200, contentType: 'text/calendar; charset=utf-8', headers: { 'content-disposition': 'attachment; filename="mis-citas-vive-bien.ics"' }, body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' })
    if (ruta === '/api/citas/estado') return r.fulfill(json({ citasEnLinea: o.flag !== false }))
    if (ruta === '/api/citas/disponibilidad' && o.huecosEn) {
      // Días de horarios libres elegidos por la prueba (en días desde hoy); responde SOLO los que caen en el rango pedido, como la ruta real.
      const u = new URL(q.url()); const desde = u.searchParams.get('desde'); const n = Number(u.searchParams.get('dias') || 14)
      const dias = o.huecosEn.map((k) => enDias(k, 16)).map((d) => ({ dia: d.toISOString().slice(0, 10), d })).filter((x) => !desde || (x.dia >= desde && x.dia <= new Date(Date.parse(desde + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)))
      return r.fulfill(json({ zona: 'America/Mexico_City', duracionMin: 60, dias: dias.map((x) => ({ dia: x.dia, horarios: [{ inicio: x.d.toISOString(), fin: mas(x.d, 60).toISOString() }, { inicio: mas(x.d, 120).toISOString(), fin: mas(x.d, 180).toISOString() }] })) }))
    }
    if (ruta === '/api/citas/disponibilidad') {
      return r.fulfill(json({ zona: 'America/Mexico_City', duracionMin: 60, dias: [
        { dia, horarios: [{ inicio: manana(16).toISOString(), fin: manana(17).toISOString() }, { inicio: manana(18).toISOString(), fin: manana(19).toISOString() }] },
      ] }))
    }
    if (ruta === '/api/citas' && metodo === 'GET') return r.fulfill(json({ citas: o.citas, vista: 'x' }))
    if (ruta === '/api/citas' && metodo === 'POST') {
      control.posts.push({ ruta, cuerpo: JSON.parse(q.postData() || '{}'), clave: q.headers()['idempotency-key'] ?? null })
      return r.fulfill(json({ cita: cita({ id: ID_B, estado: 'REQUESTED', etiqueta: 'Pendiente', firme: false, acciones: ['cancelar'] }) }, 201))
    }
    const m = ruta.match(/^\/api\/citas\/([0-9a-f-]{36})$/)
    if (m && metodo === 'GET') {
      const c = o.citas.find((x) => x.id === m[1])
      return c ? r.fulfill(json({ cita: c, historial: [{ tipo: 'CREATED', estadoAntes: null, estadoDespues: 'REQUESTED', por: 'cliente', via: 'web', en: new Date().toISOString() }] })) : r.fulfill(json({ error: 'No encontramos esa visita.' }, 404))
    }
    if (/^\/api\/citas\/[^/]+\/transicion$/.test(ruta)) {
      control.posts.push({ ruta, cuerpo: JSON.parse(q.postData() || '{}'), clave: null })
      return r.fulfill(json({ cita: cita({ estado: 'CANCELLED', etiqueta: 'Cancelada', firme: false, acciones: [] }) }))
    }
    // Todo lo demás (catálogo, ficha…) lo contesta el servidor de prueba y su réplica.
    return r.fallback()
  })
  return control
}

async function entrar(page: Page, rol: Rol) {
  const yo = CUENTAS[rol]
  await page.goto('/entrar')
  await page.getByLabel(/Correo/i).fill(yo.email)
  await page.getByLabel('Contraseña', { exact: false }).first().fill('no-es-real-123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(yo.destino, { timeout: 30_000 })
}

const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
async function axeSerio(page: Page, contexto: string, incluir?: string) {
  // axe mide el color calculado al instante: con el diálogo todavía en su transición de apertura (fade/zoom) compone colores parciales y marca un falso «color-contrast»
  // (intermitente según el ancho y la carga). Se espera a que no quede ninguna animación corriendo; la regla NO se desactiva.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
  const r = await (incluir ? b.include(incluir) : b).analyze()
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(graves.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), `axe en ${contexto}`).toEqual([])
}

const PENDIENTE = (o: Record<string, unknown> = {}) => cita({ id: ID_B, estado: 'REQUESTED', etiqueta: 'Pendiente', firme: false, acciones: ['cancelar'], inicio: manana(18), ...o })

test.describe('cliente · /portal/citas', () => {
  test('agenda con sus citas, resumen, detalle por teclado y cancelar', async ({ page }) => {
    const control = await simular(page, 'cliente', { citas: [cita({}), PENDIENTE()] })
    await entrar(page, 'cliente')
    await page.goto('/portal/citas')
    await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-lista-citas] [data-cita-id]')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator('[data-indicador="Pendientes"]')).toContainText('1')
    await expect(page.locator('[data-indicador="Confirmadas"]')).toContainText('1')
    // Tabla del dueño: el cliente solo tiene sus propias solicitudes; sin «Tipo», sin «Mis visitas», sin conflictos de horario.
    await expect(page.getByText('Solicitud de cliente')).toHaveCount(0)
    await expect(page.getByText('Visita propia')).toHaveCount(0)
    await expect(page.locator('[data-filtros-citas] option[value="propia"]')).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: 'Mis visitas' })).toHaveCount(0)
    await expect(page.locator('[data-aviso-conflictos]')).toHaveCount(0)
    await sinDesborde(page)
    await axeSerio(page, 'agenda del cliente')

    // Teclado: foco en la tarjeta, Enter abre el detalle; Escape lo cierra y devuelve el foco a la tarjeta.
    const tarjeta = page.locator(`[data-cita-id="${ID_A}"]`)
    await tarjeta.focus()
    await page.keyboard.press('Enter')
    const detalle = page.locator('[data-detalle-cita]')
    await expect(detalle).toBeVisible()
    await expect(detalle.getByText('Casa Álamos')).toBeVisible()
    await sinDesborde(page)
    await axeSerio(page, 'detalle de la cita')
    await page.keyboard.press('Escape')
    await expect(detalle).toHaveCount(0)
    await expect(tarjeta).toBeFocused()

    // Solo la acción que el servidor mandó: cancelar. Pide confirmación y manda la versión que vio.
    await tarjeta.click()
    await expect(detalle.getByRole('button', { name: /Confirmar cita|Rechazar|Proponer/ })).toHaveCount(0)
    await detalle.getByRole('button', { name: 'Cancelar cita' }).click()
    await detalle.getByRole('button', { name: /^Confirmar: cancelar cita/i }).click()
    await expect(detalle.getByRole('status').filter({ hasText: 'Listo' })).toBeVisible()
    expect(control.posts.at(-1)).toMatchObject({ cuerpo: { accion: 'cancelar', version: 1 } })
  })

  test('sin citas: dice qué aparecerá y cómo llegar', async ({ page }) => {
    await simular(page, 'cliente', { citas: [] })
    await entrar(page, 'cliente')
    await page.goto('/portal/citas')
    await expect(page.getByText(/Aún no tienes citas/)).toBeVisible({ timeout: 30_000 })
    await sinDesborde(page)
  })

  test('el calendario se pinta con sus controles y las vistas se alternan', async ({ page }) => {
    await simular(page, 'cliente', { citas: [cita({})] })
    await entrar(page, 'cliente')
    await page.goto('/portal/citas')
    await page.getByRole('button', { name: 'Calendario', exact: true }).click()
    // En pantalla angosta arranca en «Agenda» (la cuadrícula mensual encogida no se lee); en ancha, en «Mes».
    const angosta = (page.viewportSize()?.width ?? 1440) < 768
    await expect(page.getByRole('button', { name: angosta ? 'Vista de agenda' : 'Vista de mes' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Vista de mes' }).click()
    await expect(page.locator('[data-calendario-citas] [role="grid"]').first()).toBeVisible({ timeout: 30_000 })
    for (const v of ['Semana', 'Día', 'Agenda', 'Mes']) {
      await page.getByRole('button', { name: `Vista de ${v === 'Día' ? 'día' : v.toLowerCase()}` }).click()
      await expect(page.getByRole('button', { name: `Vista de ${v === 'Día' ? 'día' : v.toLowerCase()}` })).toHaveAttribute('aria-pressed', 'true')
    }
    await sinDesborde(page)
    await axeSerio(page, 'calendario')
  })

  test('la ruta vieja /portal/visitas lleva a /portal/citas', async ({ page }) => {
    await simular(page, 'cliente', { citas: [] })
    await entrar(page, 'cliente')
    await page.goto('/portal/visitas')
    await expect(page).toHaveURL(/\/portal\/citas$/, { timeout: 30_000 })
  })
})

test.describe('enlaces viejos', () => {
  test('/portal/visitas es un 307 REAL de servidor hacia /portal/citas, conservando ?cita= (sirve sin JavaScript)', async ({ request }) => {
    const r = await request.get('/portal/visitas?cita=' + ID_A, { maxRedirects: 0 })
    expect(r.status()).toBe(307)
    const destino = new URL(r.headers()['location'], 'http://x')
    expect(destino.pathname + destino.search).toBe(`/portal/citas?cita=${ID_A}`)
    const sin = await request.get('/portal/visitas', { maxRedirects: 0 })
    expect(sin.status()).toBe(307)
    expect(new URL(sin.headers()['location'], 'http://x').pathname).toBe('/portal/citas')
  })
})

test.describe('equipo · /admin/citas', () => {
  test('una solicitud con horario ocupado muestra el aviso y NO ofrece confirmar', async ({ page }) => {
    const conflicto = PENDIENTE({ papel: 'admin', conflicto: true, acciones: ['confirmar', 'rechazar', 'proponer'], cliente: { nombre: 'Ana Pérez', telefono: '4771234567' } })
    await simular(page, 'admin', { citas: [conflicto] })
    await entrar(page, 'admin')
    await page.goto('/admin/citas')
    await expect(page.getByRole('heading', { name: 'Calendario de citas' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aviso-conflictos]')).toContainText('1 solicitud pendiente cuyo horario ya ocupa otra cita confirmada')
    await expect(page.locator('[data-filtros-citas] option[value="propia"]')).toHaveCount(1)
    await expect(page.getByRole('checkbox', { name: 'Mis visitas' })).toBeVisible()
    await sinDesborde(page)
    await axeSerio(page, 'agenda del equipo')
    await page.locator(`[data-cita-id="${ID_B}"]`).click()
    const detalle = page.locator('[data-detalle-cita]')
    await expect(detalle.getByRole('alert').filter({ hasText: 'ya lo ocupa otra cita confirmada' })).toBeVisible()
    await expect(detalle.getByRole('button', { name: 'Confirmar cita' })).toHaveCount(0)
    await expect(detalle.getByRole('button', { name: 'Rechazar solicitud' })).toBeVisible()
    await expect(detalle.getByRole('button', { name: 'Proponer otro horario' })).toBeVisible()
    // Rechazar exige motivo.
    await detalle.getByRole('button', { name: 'Rechazar solicitud' }).click()
    await detalle.getByRole('button', { name: /^Confirmar: rechazar/i }).click()
    await expect(detalle.getByRole('alert').filter({ hasText: 'Escribe el motivo' })).toBeVisible()
    await sinDesborde(page)
  })
})

test.describe('publicador · /publicador/citas', () => {
  test('pestañas por papel y la propietaria en solo lectura', async ({ page }) => {
    await simular(page, 'publicador', { citas: [cita({ papel: 'propietario', acciones: [] })] })
    await entrar(page, 'publicador')
    await page.goto('/publicador/citas?vista=propiedades')
    await expect(page.getByRole('button', { name: 'Visitas a mis propiedades' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Coordinadas por VIVE BIEN' }).click()
    await page.locator(`[data-cita-id="${ID_A}"]`).click()
    const detalle = page.locator('[data-detalle-cita]')
    await expect(detalle.getByText('La administra VIVE BIEN')).toBeVisible()
    await expect(detalle.locator('[data-acciones-cita]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await sinDesborde(page)
    await axeSerio(page, 'citas del publicador')
    await page.getByRole('button', { name: 'Mi disponibilidad' }).click()
    await expect(page.getByRole('button', { name: 'Mi disponibilidad' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('publicador SIN recibir_citas · /publicador/citas', () => {
  test('solo ve «Visitas a mis propiedades» (lectura) y «Mis citas»; sin disponibilidad ni datos del cliente', async ({ page }) => {
    await simular(page, 'publicador', { citas: [cita({ papel: 'propietario', acciones: [], cliente: { nombre: 'Interesado' } })], atiende: false })
    await entrar(page, 'publicador')
    await page.goto('/publicador/citas')
    await expect(page.getByRole('button', { name: 'Visitas a mis propiedades' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Mis citas' })).toBeVisible()
    for (const n of ['Mi disponibilidad', 'Coordinadas por VIVE BIEN']) await expect(page.getByRole('button', { name: n })).toHaveCount(0)
    await page.locator(`[data-cita-id="${ID_A}"]`).click()
    const detalle = page.locator('[data-detalle-cita]')
    await expect(detalle.locator('[data-acciones-cita]')).toHaveCount(0)
    await expect(detalle.getByText('4771234567')).toHaveCount(0)
    await sinDesborde(page)
  })
})

test.describe('panel rediseñado', () => {
  test('los indicadores filtran (aria-pressed) y pulsarlos de nuevo quita el filtro', async ({ page }) => {
    await simular(page, 'cliente', { citas: [cita({}), PENDIENTE()] })
    await entrar(page, 'cliente')
    await page.goto('/portal/citas')
    const pendientes = page.locator('[data-indicador="Pendientes"]')
    await expect(page.locator('[data-lista-citas] [data-cita-id]')).toHaveCount(2, { timeout: 30_000 })
    await pendientes.click()
    await expect(pendientes).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-lista-citas] [data-cita-id]')).toHaveCount(1)
    await pendientes.click()
    await expect(pendientes).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-lista-citas] [data-cita-id]')).toHaveCount(2)
  })

  test('«Próximas citas» y «Acciones rápidas»: solo lo que existe; CSV y calendario se descargan', async ({ page }) => {
    await simular(page, 'cliente', { citas: [cita({}), PENDIENTE()] })
    await entrar(page, 'cliente')
    await page.goto('/portal/citas')
    await expect(page.locator('[data-proximas-citas]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-proximas-citas] [data-proxima-id]')).toHaveCount(2)
    const acciones = page.locator('[data-acciones-rapidas]')
    await expect(acciones.getByRole('link', { name: 'Agendar una visita' })).toHaveAttribute('href', '/propiedades')
    await expect(acciones.getByText(/Enviar recordatorios|Google Calendar|Sincronizar/)).toHaveCount(0)
    await expect(acciones.getByText('Mi disponibilidad')).toHaveCount(0)
    const [csv] = await Promise.all([page.waitForEvent('download'), acciones.getByRole('button', { name: 'Exportar a CSV' }).click()])
    expect(csv.suggestedFilename()).toMatch(/^citas-vive-bien-\d{4}-\d{2}-\d{2}\.csv$/)
    const [ics] = await Promise.all([page.waitForEvent('download'), acciones.getByRole('button', { name: 'Descargar mi calendario' }).click()])
    expect(ics.suggestedFilename()).toBe('mis-citas-vive-bien.ics')
    await sinDesborde(page)
    await axeSerio(page, 'próximas citas y acciones rápidas')
  })

  test('el equipo ve «Mi disponibilidad» en las acciones rápidas', async ({ page }) => {
    await simular(page, 'admin', { citas: [cita({ papel: 'admin', acciones: ['cancelar'] })] })
    await entrar(page, 'admin')
    await page.goto('/admin/citas')
    await expect(page.locator('[data-acciones-rapidas]').getByRole('link', { name: 'Mi disponibilidad' })).toHaveAttribute('href', '/admin/citas/disponibilidad', { timeout: 30_000 })
  })
})

test.describe('ficha · «Agenda una cita»', () => {
  test('con cuenta: se despliegan días y horas, pide consentimiento y manda la solicitud con su clave', async ({ page }) => {
    const control = await simular(page, 'cliente', { citas: [] })
    await entrar(page, 'cliente')
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    const tarjeta = page.locator('[data-agendar-cita]')
    await expect(tarjeta).toBeVisible({ timeout: 30_000 })
    // Va ENCIMA de la campana de baja de precio.
    const arriba = await tarjeta.evaluate((el) => { const c = document.querySelector('[data-aviso-precio]'); return !c || (el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 })
    expect(arriba).toBe(true)
    await tarjeta.getByRole('button', { name: 'Agenda una cita' }).click()
    await expect(tarjeta.getByRole('group', { name: 'Hora de la visita' })).toBeVisible()
    await sinDesborde(page)
    await axeSerio(page, 'tarjeta Agenda una cita (abierta)', '[data-agendar-cita]')
    await tarjeta.getByRole('group', { name: 'Hora de la visita' }).getByRole('button').first().click()
    await tarjeta.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(tarjeta.getByRole('alert')).toContainText('Marca la casilla')
    expect(control.posts).toHaveLength(0)
    await tarjeta.getByRole('checkbox').check()
    await tarjeta.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(tarjeta.locator('[data-solicitud-enviada]')).toBeVisible()
    expect(control.posts).toHaveLength(1)
    expect(control.posts[0].cuerpo).toMatchObject({ propiedadId: expect.any(String), consentimiento: true })
    expect(control.posts[0].clave).toMatch(/^[A-Za-z0-9_-]{8,100}$/)
  })

  test('solo enseña UNA semana de días y el calendario completo abre el resto: se agenda una fecha de dentro de dos semanas', async ({ page }) => {
    const control = await simular(page, 'cliente', { citas: [], huecosEn: [2, 15] })
    await entrar(page, 'cliente')
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    const tarjeta = page.locator('[data-agendar-cita]')
    await expect(tarjeta).toBeVisible({ timeout: 30_000 })
    await tarjeta.getByRole('button', { name: 'Agenda una cita' }).click()
    const dias = tarjeta.getByRole('group', { name: 'Día de la visita' })
    await expect(dias).toBeVisible()
    await expect(dias.getByRole('button')).toHaveCount(1)                       // el día de dentro de 15 días NO sale entre los de esta semana
    const abrir = tarjeta.getByRole('button', { name: /Ver calendario completo/ })
    await expect(abrir).toBeVisible()
    await abrir.click()
    const mes = tarjeta.getByRole('group', { name: 'Calendario de fechas disponibles' })
    await expect(mes).toBeVisible()
    const lejano = enDias(15, 16).toISOString().slice(0, 10)
    if ((await mes.locator(`[data-dia="${lejano}"]`).count()) === 0) await mes.getByRole('button', { name: 'Mes siguiente' }).click()
    const celda = mes.locator(`[data-dia="${lejano}"]`)
    await expect(celda).toBeEnabled()
    await expect(celda).toHaveAttribute('aria-label', /2 horarios libres/)
    await sinDesborde(page)
    await axeSerio(page, 'tarjeta Agenda una cita (calendario completo)', '[data-agendar-cita]')
    await celda.click()
    await expect(celda).toHaveAttribute('aria-pressed', 'true')
    const horas = tarjeta.getByRole('group', { name: 'Hora de la visita' })
    await expect(horas.getByRole('button')).toHaveCount(2)
    await horas.getByRole('button').first().click()
    await tarjeta.getByRole('checkbox').check()
    await tarjeta.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(tarjeta.locator('[data-solicitud-enviada]')).toBeVisible()
    expect(control.posts).toHaveLength(1)
    expect(String(control.posts[0].cuerpo.inicio).slice(0, 10)).toBe(lejano)    // se pidió LA FECHA elegida en el calendario
  })

  test('sin horarios en 7 días lo dice, el calendario sigue ahí y los días sin horarios no se pueden elegir', async ({ page }) => {
    await simular(page, 'cliente', { citas: [], huecosEn: [12] })
    await entrar(page, 'cliente')
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    const tarjeta = page.locator('[data-agendar-cita]')
    await expect(tarjeta).toBeVisible({ timeout: 30_000 })
    await tarjeta.getByRole('button', { name: 'Agenda una cita' }).click()
    await expect(tarjeta.getByText(/No hay horarios libres en los próximos 7 días/)).toBeVisible()
    await tarjeta.getByRole('button', { name: /Ver calendario completo/ }).click()
    const mes = tarjeta.getByRole('group', { name: 'Calendario de fechas disponibles' })
    await expect(mes).toBeVisible()
    const hoy = enDias(0, 16).toISOString().slice(0, 10)
    const sin = mes.locator(`[data-dia="${hoy}"]`)
    if (await sin.count()) { await expect(sin).toBeDisabled(); await expect(sin).toHaveAttribute('aria-label', /sin horarios/) }
    await mes.getByRole('button', { name: 'Volver a esta semana' }).click()
    await expect(tarjeta.getByRole('button', { name: /Ver calendario completo/ })).toBeVisible()
  })

  test('el calendario no deja ir a meses pasados ni a más de 3 meses adelante', async ({ page }) => {
    await simular(page, 'cliente', { citas: [], huecosEn: [2] })
    await entrar(page, 'cliente')
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    const tarjeta = page.locator('[data-agendar-cita]')
    await expect(tarjeta).toBeVisible({ timeout: 30_000 })
    await tarjeta.getByRole('button', { name: 'Agenda una cita' }).click()
    await tarjeta.getByRole('button', { name: /Ver calendario completo/ }).click()
    const mes = tarjeta.getByRole('group', { name: 'Calendario de fechas disponibles' })
    await expect(mes.getByRole('button', { name: 'Mes anterior' })).toBeDisabled()
    for (let i = 0; i < 3; i++) await mes.getByRole('button', { name: 'Mes siguiente' }).click()
    await expect(mes.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    await expect(mes.getByRole('button', { name: 'Mes anterior' })).toBeEnabled()
  })

  test('con citasEnLinea apagado la tarjeta no aparece', async ({ page }) => {
    await simular(page, 'cliente', { citas: [], flag: false })
    await entrar(page, 'cliente')
    await page.goto('/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl')
    await expect(page.locator('[data-aviso-precio], #contacto-ficha').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-agendar-cita]')).toHaveCount(0)
  })
})
