import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { acotarTerceros } from './ayudas-red'
import { BUSQUEDAS_DE_PRUEBA, CITAS_DE_PRUEBA, FAVORITOS_DE_PRUEBA, PERFIL_COMPLETO, PROPIEDADES_DE_PRUEBA, SOLICITUDES_DE_PRUEBA } from '../src/lib/portal/datos-de-prueba'
import { construirResumenPortal } from '../src/lib/portal/resumen'
import { alertasVista, busquedasVista, consultasVista, guardadasVista } from '../src/lib/portal/pantallas'
import type { FilaPropiedadPortal } from '../src/lib/portal/tarjeta'
import type { ConsultaCliente } from '../src/lib/consultas'

/**
 * Auditoría del rol CLIENTE (28-oct-2026) — recorrido del portal CON DATOS (el recorrido anterior corría con listas vacías y por eso no vio E-52).
 *
 * Sin base ni cuentas reales: Firebase y `/api/**` del portal se simulan en el navegador, PERO las respuestas se construyen con los MISMOS constructores
 * del servidor (`guardadasVista`, `busquedasVista`, `alertasVista`, `consultasVista`, `construirResumenPortal`) y con datos inventados que incluyen textos
 * EXTREMOS (títulos y direcciones larguísimos, palabras sin espacios, sin foto, sin precio). Lo que prueba es la PANTALLA, no el servidor.
 *
 *     npx next build && npx playwright test -c playwright.sesion.config.ts portal-cliente-con-datos
 *
 * Por pantalla y ancho (v390/v768/v1024/v1440 + 360 dentro del proyecto v390): título · sin desborde · TODO control interactivo dentro del viewport
 * (el defecto de E-52) · axe sin graves · foco de teclado visible y dentro de la pantalla · sin errores de consola.
 */
const CLIENTE = { uid: 'uid-qa-cliente', email: 'qa.cliente@prueba.test', nombre: 'Cliente Prueba' }
const TOKEN = `tok-${CLIENTE.email}`
const hace = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

// ── Datos con textos extremos ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TITULO_LARGO = 'Nave industrial de uso mixto con oficinas, andén de carga, patio de maniobras y vigilancia las veinticuatro horas en el corredor logístico'
const base = PROPIEDADES_DE_PRUEBA[0]
const extrema = (id: string, p: Partial<FilaPropiedadPortal>): FilaPropiedadPortal => ({ ...base, id, slug: id, estatus: 'disponible', estado_pub: 'publicada', publicada_en: hace(1), created_at: hace(3), fotos: [], ...p })
const X1 = extrema('x-largo', { titulo: TITULO_LARGO, ubicacion: 'Boulevard San Juan Bosco 4021 interior 12-B esquina con Avenida de los Insurgentes', colonia: 'Fraccionamiento Industrial Buenaventura Sector Poniente', precio: 1_234_567_890, metros: 123_456 })
const X2 = extrema('x-sin-espacios', { titulo: 'T'.repeat(90), ubicacion: 'U'.repeat(80), colonia: 'C'.repeat(60), precio: 9_999_999 })
const X3 = extrema('x-vacia', { titulo: null, ubicacion: null, colonia: null, ciudad: null, precio: null, metros: null })
const PROPIEDADES: FilaPropiedadPortal[] = [...PROPIEDADES_DE_PRUEBA, X1, X2, X3]
const FAVORITOS = [...FAVORITOS_DE_PRUEBA, { propiedad_id: X1.id, creado_en: hace(0) }, { propiedad_id: X2.id, creado_en: hace(0) }, { propiedad_id: X3.id, creado_en: hace(0) }]
const BUSQUEDAS = [
  ...BUSQUEDAS_DE_PRUEBA,
  { id: 98, nombre: 'Una búsqueda con un nombre larguísimo que alguien escribió sin pensar en el ancho de la pantalla del teléfono', filtros: { zona: 'buenaventura' }, creado_en: hace(30), revisadas_en: hace(10), alertas: true, frecuencia: 'semanal' as const },
  { id: 97, nombre: null, filtros: { op: 'renta' as const, tipo: 'oficina', pmax: 30000, zona: 'centro' }, creado_en: hace(5), alertas: false, frecuencia: 'diaria' as const },
]
const CONSULTAS: ConsultaCliente[] = [
  { id: 1, propiedadId: X1.id, propiedadTitulo: TITULO_LARGO, tipo: 'visita', visitaPreferida: hace(-2), mensaje: 'Mensaje muy largo. '.repeat(40), creadoEn: hace(1), estado: 'enviada' },
  { id: 2, propiedadId: X2.id, propiedadTitulo: 'T'.repeat(90), tipo: 'informacion', visitaPreferida: null, mensaje: null, creadoEn: hace(4), estado: 'enviada' },
  { id: 3, propiedadId: 'ya-no-existe', propiedadTitulo: 'Propiedad que ya no está', tipo: 'informacion', visitaPreferida: null, mensaje: 'Hola', creadoEn: hace(40), estado: 'enviada' },
]
const CONTACTOS = [
  { id: 1, propiedadId: X1.id, titulo: TITULO_LARGO, folio: 'VB-2026-00004', canal: 'whatsapp', destino: 'vivebien', creadoEn: hace(0), ruta: `/propiedades/${X1.id}` },
  { id: 2, propiedadId: X2.id, titulo: 'T'.repeat(90), folio: null, canal: 'telefono', destino: 'publicador', creadoEn: hace(2), ruta: null },
  { id: 3, propiedadId: 'z', titulo: null, folio: null, canal: 'correo', destino: 'vivebien', creadoEn: hace(9), ruta: null },
]
// Historial en tabla: nombre larguísimo, sin folio, vendida (no disponible) y una cita.
const HISTORIAL = [
  { clave: 'c1', creadoEn: hace(0), canal: 'whatsapp', folio: 'VB-2026-00004', nombre: TITULO_LARGO, disponible: true, ruta: `/propiedades/${X1.id}` },
  { clave: 'v1', creadoEn: hace(1), canal: 'cita', folio: 'VB-2026-00004', nombre: TITULO_LARGO, disponible: true, ruta: `/propiedades/${X1.id}` },
  { clave: 'c2', creadoEn: hace(2), canal: 'telefono', folio: null, nombre: 'T'.repeat(90), disponible: false, ruta: '/propiedades/ya-no-esta' },
  { clave: 'c3', creadoEn: hace(9), canal: 'correo', folio: null, nombre: 'Propiedad que ya no está publicada', disponible: false, ruta: '/propiedades/z' },
]
const NOTIFICACIONES = [
  { id: 1, tipo: 'busqueda_nueva', titulo: 'Nueva para «' + 'Búsqueda larguísima '.repeat(5) + '»', cuerpo: TITULO_LARGO, enlace: '/portal/alertas', creada_en: hace(0), leida_en: null },
  { id: 2, tipo: 'legal', titulo: 'Actualizamos el Aviso de Privacidad', cuerpo: 'El Aviso de Privacidad cambió. '.repeat(10), enlace: '/privacidad', creada_en: hace(3), leida_en: null },
]
const RESUMEN = construirResumenPortal({ perfil: PERFIL_COMPLETO, propiedades: PROPIEDADES, favoritos: FAVORITOS, busquedas: BUSQUEDAS, solicitudes: SOLICITUDES_DE_PRUEBA, citas: [...CITAS_DE_PRUEBA], citasEnLinea: false })

const PANTALLAS: Array<{ ruta: string }> = [
  { ruta: '/portal' }, { ruta: '/portal/propiedades' }, { ruta: '/portal/busquedas' }, { ruta: '/portal/alertas' }, { ruta: '/portal/consultas' },
  { ruta: '/portal/visitas' }, { ruta: '/portal/mi-busqueda' }, { ruta: '/portal/perfil' }, { ruta: '/portal/configuracion' },
]

async function simular(page: Page, errores: string[]) {
  await acotarTerceros(page)
  await page.route('**/www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**/www.google-analytics.com/**', (r) => r.abort())
  await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill(json({ access_token: 'x', id_token: 'x', refresh_token: 'x', expires_in: '3600', token_type: 'Bearer', user_id: 'x', project_id: 'x' })))
  await page.route('**/identitytoolkit.googleapis.com/**', (r) => {
    const url = r.request().url()
    if (url.includes('accounts:signInWithPassword')) return r.fulfill(json({ localId: CLIENTE.uid, email: CLIENTE.email, displayName: CLIENTE.nombre, idToken: TOKEN, registered: true, refreshToken: 'r', expiresIn: '3600' }))
    if (url.includes('accounts:lookup')) return r.fulfill(json({ users: [{ localId: CLIENTE.uid, email: CLIENTE.email, emailVerified: true, displayName: CLIENTE.nombre, providerUserInfo: [{ providerId: 'password', federatedId: CLIENTE.email, email: CLIENTE.email }], validSince: '0', lastLoginAt: '0', createdAt: '0' }] }))
    return r.fulfill(json({}))
  })
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ uid: CLIENTE.uid, email: CLIENTE.email, nombre: CLIENTE.nombre, rol: 'cliente', superAdmin: false, estado: 'activo', portal: true, telefono: '4771234567', whatsapp: '4771234567', completitud: 80 })))
  await page.route('**/api/portal/acceso', (r) => r.fulfill(json({ ok: true })))
  await page.route('**/api/portal/resumen', (r) => r.fulfill(json(RESUMEN)))
  await page.route('**/api/portal/guardadas', (r) => r.fulfill(json({ guardadas: guardadasVista(FAVORITOS, PROPIEDADES) })))
  await page.route('**/api/portal/busquedas', (r) => r.fulfill(json({ busquedas: busquedasVista(BUSQUEDAS, PROPIEDADES) })))
  await page.route('**/api/portal/alertas', (r) => r.fulfill(json({ alertas: alertasVista(BUSQUEDAS, PROPIEDADES) })))
  await page.route('**/api/portal/consultas', (r) => r.fulfill(json({ consultas: consultasVista(CONSULTAS, PROPIEDADES) })))
  await page.route('**/api/portal/contactos', (r) => r.fulfill(json({ contactos: CONTACTOS, historial: HISTORIAL })))
  await page.route('**/api/portal/visitas', (r) => r.fulfill(json({ proximas: [...CITAS_DE_PRUEBA], pasadas: [], citasEnLinea: false })))
  await page.route('**/api/portal/notificaciones', (r) => r.fulfill(json({ notificaciones: NOTIFICACIONES, sinLeer: 2 })))
  await page.route('**/api/portal/preferencias', (r) => r.fulfill(json({ correoAlertas: true, correoLegal: true, consentimientoEn: hace(7) })))
  await page.route('**/api/portal/me-interesan', (r) => r.fulfill(json({ interesan: [] })))
  await page.route('**/api/favoritos', (r) => r.fulfill(json(FAVORITOS.map((f) => f.propiedad_id))))
  await page.route('**/api/eventos', (r) => r.fulfill(json({ ok: true })))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/Failed to load resource|net::ERR|googletagmanager|google-analytics|fonts\.g|cdnjs|unsplash/i.test(t)) return
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

/**
 * Controles interactivos cuya parte VISIBLE queda fuera del ancho de la pantalla — el defecto de E-52 (el corazón en x=573 de 390).
 * Lo visible = el cuadro del control recortado por cada antepasado con `overflow-x` distinto de `visible` (un título en `truncate` mide 1000 px pero se VE
 * recortado con puntos suspensivos: eso no es un defecto). Un carrusel con scroll propio también se ignora. Primera versión (sin recorte) dio falsos positivos
 * con esos títulos; la versión actual se valida contra una página sintética (ver «el detector»).
 */
const controlesFuera = (page: Page) => page.evaluate(() => {
  // `clientWidth` y no `innerWidth`: si algo desborda y la página no recorta, el emulador móvil EXPANDE el viewport de diseño (innerWidth=890) y el defecto se esconde.
  const vw = document.documentElement.clientWidth
  const zona = document.querySelector('[data-portal-contenido]') as HTMLElement | null
  if (!zona) return ['sin [data-portal-contenido]']
  const fuera: string[] = []
  for (const e of zona.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"]')) {
    if (e.offsetParent === null) continue
    const r = e.getBoundingClientRect()
    if (r.width <= 0) continue
    let izq = r.left, der = r.right, enScroll = false
    for (let p: HTMLElement | null = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) { enScroll = true; break }
      if (s.overflowX !== 'visible') { const b = p.getBoundingClientRect(); izq = Math.max(izq, b.left); der = Math.min(der, b.right) }
    }
    if (enScroll) continue
    if (der <= izq || izq < -1 || der > vw + 1) fuera.push(`${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}» visible x=${Math.round(izq)}..${Math.round(der)} (ancho ${vw})`)
  }
  return fuera
})

/** Pulsa Tab hasta 14 veces: cada elemento enfocado debe estar dentro del ancho y mostrar un indicador de foco (contorno o sombra). */
async function recorrerFoco(page: Page) {
  const problemas: string[] = []
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null
      if (!e || e === document.body) return null
      const b = e.getBoundingClientRect(), s = getComputedStyle(e)
      const indicador = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
      // Parte VISIBLE (recortada por antepasados con overflow-x), igual que `controlesFuera`: un título en `truncate` mide 1000 px pero se ve recortado.
      let izq = b.left, der = b.right
      for (let p: HTMLElement | null = e.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') { const c = p.getBoundingClientRect(); izq = Math.max(izq, c.left); der = Math.min(der, c.right) }
      }
      const vw = document.documentElement.clientWidth
      return { nombre: `${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}»`, dentro: izq >= -1 && der <= vw + 1 && der > izq, indicador: !!indicador }
    })
    if (!r) continue
    if (!r.dentro) problemas.push(`${r.nombre}: fuera del ancho al enfocarlo`)
    if (!r.indicador) problemas.push(`${r.nombre}: sin indicador de foco visible`)
  }
  return problemas
}

async function recorrido(page: Page, ruta: string, info: { project: { name: string }; annotations: Array<{ type: string; description?: string }> }, etiqueta: string) {
  const errores: string[] = []
  await simular(page, errores)
  await entrar(page)
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await expect(page.getByText(/No se pudo|Inténtalo de nuevo|Algo salió mal/i).first()).toHaveCount(0)

  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(desborde, `desborde horizontal de ${desborde}px en ${ruta} (${etiqueta})`).toBeLessThanOrEqual(1)

  const fuera = await controlesFuera(page)
  expect(fuera, `controles fuera del ancho en ${ruta} (${etiqueta}): ${fuera.join(' | ')}`).toEqual([])

  const axe = await new AxeBuilder({ page }).analyze()
  const graves = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}) → ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} [${(n.any[0]?.message ?? '').slice(0, 150)}]`).join(' | ')}`)
  expect(graves, `axe en ${ruta} (${etiqueta}): ${graves.join(' ;; ')}`).toEqual([])

  const foco = await recorrerFoco(page)
  expect(foco, `foco de teclado en ${ruta} (${etiqueta}): ${foco.join(' | ')}`).toEqual([])

  expect(errores, `errores de consola en ${ruta} (${etiqueta})`).toEqual([])
  await page.screenshot({ path: `test-results/portal-cliente-datos/${etiqueta}${ruta.replace(/\//g, '_')}.png`, fullPage: true })
}

test.describe('portal del cliente CON DATOS — anchos del proyecto', () => {
  for (const p of PANTALLAS) test(`${p.ruta}`, async ({ page }, info) => { await recorrido(page, p.ruta, info, info.project.name) })
})

test.describe('portal del cliente CON DATOS — 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  for (const p of PANTALLAS) {
    test(`360 · ${p.ruta}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'v390', 'el 360 se corre una sola vez, dentro del proyecto v390')
      await recorrido(page, p.ruta, info, 'v360')
    })
  }
})

test.describe('el detector «controles fuera del ancho» (se valida a sí mismo, sin servidor)', () => {
  test.use({ viewport: { width: 390, height: 800 } })
  const LARGO = 'Nave industrial de uso mixto con oficinas, andén de carga, patio de maniobras y vigilancia las veinticuatro horas en el corredor logístico'
  // Réplica mínima de la tarjeta de E-52: rejilla (con o sin columna base) > tarjeta con overflow-hidden > corazón absoluto arriba a la derecha + línea `truncate`.
  const tarjeta = (plantilla: string) => `<meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div data-portal-contenido style="padding:16px"><ul style="display:grid;gap:16px;list-style:none;margin:0;padding:0;${plantilla}"><li><article style="position:relative;overflow:hidden;border:1px solid #ccc"><button aria-label="Quitar de guardadas" style="position:absolute;top:8px;right:8px;width:44px;height:44px">♥</button><p style="white-space:nowrap;margin:60px 0 0">${LARGO}</p></article></li></ul></div>`

  test('REPRODUCE E-52: rejilla sin columna base → el corazón queda fuera y el detector lo marca', async ({ page }) => {
    await page.setContent(tarjeta(''))
    const fuera = await controlesFuera(page)
    expect(fuera.length, 'el detector no vio el defecto de E-52').toBeGreaterThan(0)
    expect(fuera.join(' ')).toMatch(/Quitar de guardadas/)
  })
  test('con `grid-template-columns: minmax(0, 1fr)` (grid-cols-1) el mismo corazón queda dentro y NO se marca', async ({ page }) => {
    await page.setContent(tarjeta('grid-template-columns:minmax(0,1fr)'))
    expect(await controlesFuera(page)).toEqual([])
  })
  test('un título en `truncate` que mide 1000 px pero se ve recortado NO es un defecto', async ({ page }) => {
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div data-portal-contenido style="padding:16px"><p style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0"><a href="/x">${LARGO}</a></p></div>`)
    expect(await controlesFuera(page)).toEqual([])
  })
})

test.describe('movimiento reducido', () => {
  test('el scroll suave solo existe sin la preferencia «reducir movimiento» (E-53)', async ({ page, browser }) => {
    const sin = await browser.newContext({ reducedMotion: 'no-preference' }), con = await browser.newContext({ reducedMotion: 'reduce' })
    const leer = async (ctx: typeof sin) => { const pg = await ctx.newPage(); await pg.goto('http://localhost:3131/entrar'); return pg.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) }
    expect(await leer(sin)).toBe('smooth')
    expect(await leer(con)).toBe('auto')
    await sin.close(); await con.close(); void page
  })
})

test.describe('historial de contactos EN TABLA (28-oct-2026)', () => {
  test('columnas, canal (incluye cita), ID, nombre, estatus «Disponible / No disponible» y enlace en cada fila', async ({ page }, info) => {
    const errores: string[] = []
    await simular(page, errores)
    await entrar(page)
    await page.goto('/portal/consultas', { waitUntil: 'domcontentloaded' })
    const tabla = page.locator('[data-tabla-historial]')
    await expect(tabla).toBeVisible({ timeout: 30_000 })
    await expect(tabla.locator('thead th')).toHaveText(['Fecha', 'Canal', 'ID', 'Propiedad', 'Estatus', 'Enlace'])
    const filas = tabla.locator('tbody tr')
    await expect(filas).toHaveCount(4)
    await expect(filas.nth(0)).toContainText('WhatsApp'); await expect(filas.nth(0)).toContainText('VB-2026-00004')
    await expect(filas.nth(1)).toContainText('Cita')
    await expect(filas.nth(2)).toContainText('Llamada'); await expect(filas.nth(2)).toContainText('—')            // sin folio
    await expect(filas.nth(3)).toContainText('Correo')
    // estatus: texto (no solo color) y el atributo que lo respalda
    await expect(filas.nth(0)).toContainText('Disponible'); await expect(filas.nth(0)).toHaveAttribute('data-disponible', 'si')
    await expect(filas.nth(2)).toContainText('No disponible'); await expect(filas.nth(2)).toHaveAttribute('data-disponible', 'no')
    // el enlace SIEMPRE existe y apunta a la ficha (la no disponible irá a la página 404 con humor)
    for (let i = 0; i < 4; i++) await expect(filas.nth(i).getByRole('link', { name: /Ver la propiedad/ })).toHaveAttribute('href', /^\/propiedades\/[^/]+$/)
    await expect(filas.nth(2).getByRole('link')).toHaveAttribute('href', '/propiedades/ya-no-esta')
    // la tabla se desplaza dentro de su caja: la página no se ensancha
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `desborde en ${info.project.name}`).toBeLessThanOrEqual(1)
    expect(errores).toEqual([])
  })
})

const FICHA = '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl'
test.describe('campana «Avisarme cuando baje de precio» (28-oct-2026)', () => {
  test('CON cuenta: la campana enciende y apaga el aviso, lo dice, y queda debajo de la caja de precio y contacto', async ({ page }) => {
    const errores: string[] = []
    await simular(page, errores)
    let activo = false; const llamadas: string[] = []
    await page.route('**/api/portal/avisos-precio**', async (r) => {
      const req = r.request()
      if (req.method() === 'POST') { const b = req.postDataJSON() as { propiedadId: string; activo: boolean }; llamadas.push(`POST ${b.propiedadId} ${b.activo}`); activo = b.activo; return r.fulfill(json({ ok: true, activo })) }
      return r.fulfill(json({ activo }))
    })
    await entrar(page)
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const campana = page.locator('[data-campana]')
    await expect(campana).toBeVisible({ timeout: 30_000 })
    await expect(campana).toHaveAttribute('aria-pressed', 'false')
    // posición: debajo de la caja de precio y contacto
    const [cajaContacto, cajaAviso] = await Promise.all([page.locator('#contacto-ficha > div').first().boundingBox(), page.locator('[data-aviso-precio]').boundingBox()])
    expect(cajaAviso!.y, 'la campana va DEBAJO de la caja de contacto').toBeGreaterThanOrEqual(cajaContacto!.y + cajaContacto!.height - 1)
    await campana.click()
    await expect(campana).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-aviso-precio]')).toContainText('Te avisaremos si baja de precio')
    expect(llamadas).toEqual(['POST 5243dab0-e301-4ce1-a5de-f5f57037e613 true'])
    await campana.click()
    await expect(campana).toHaveAttribute('aria-pressed', 'false')
    expect(llamadas[1]).toBe('POST 5243dab0-e301-4ce1-a5de-f5f57037e613 false')
    // por teclado
    await campana.focus(); await page.keyboard.press('Enter')
    await expect(campana).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    expect(errores).toEqual([])
  })

  test('si el servidor falla: lo dice (role=alert) y la campana no se queda encendida a medias', async ({ page }) => {
    const errores: string[] = []
    await simular(page, errores)
    await page.route('**/api/portal/avisos-precio**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'No se pudo registrar.' }) }) : r.fulfill(json({ activo: false }))))
    await entrar(page)
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const campana = page.locator('[data-campana]')
    await campana.click()
    await expect(page.locator('[data-aviso-precio] [role="alert"]')).toContainText('No se pudo registrar')
    await expect(campana).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('sin cuenta', () => {
  test('SIN sesión la campana lleva a entrar/crear cuenta y NO llama a la API de avisos', async ({ page }) => {
    await acotarTerceros(page)
    const llamadas: string[] = []
    await page.route('**/api/portal/avisos-precio**', (r) => { llamadas.push(r.request().url()); return r.fulfill(json({ activo: false })) })
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const campana = page.locator('[data-campana]')
    await expect(campana).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-aviso-precio]')).toContainText('Con tu cuenta')
    await campana.click()
    await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 })
    expect(llamadas).toEqual([])
  })
})

test.describe('propiedad que ya no existe', () => {
  test('la ficha de una propiedad inexistente muestra el 404 con humor y salidas útiles', async ({ page }) => {
    await acotarTerceros(page)
    const r = await page.goto('/propiedades/sanjuan', { waitUntil: 'domcontentloaded' })
    expect(r?.status()).toBe(404)
    await expect(page.locator('[data-propiedad-404]')).toContainText('Llegaste tarde')
    await expect(page.getByText('Error 404')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver propiedades disponibles' })).toHaveAttribute('href', '/propiedades')
    await expect(page.getByRole('link', { name: 'Volver a mi historial' })).toHaveAttribute('href', '/portal/consultas')
  })
})

test.describe('corazón de guardadas en la ficha completa (28-oct-2026)', () => {
  test('CON cuenta: el corazón de la esquina guarda y quita, con la misma API que las tarjetas', async ({ page }) => {
    const errores: string[] = []
    await simular(page, errores)
    const guardadas = new Set<string>(); const llamadas: string[] = []
    await page.route('**/api/favoritos**', async (r) => {
      const req = r.request()
      if (req.method() === 'GET') return r.fulfill(json([...guardadas]))
      llamadas.push(`${req.method()} ${req.url().split('/api/')[1]} ${req.postData() ?? ''}`)
      const id = (req.postDataJSON?.() as { propiedadId?: string; propiedad_id?: string } | null)?.propiedadId ?? (req.postDataJSON?.() as { propiedad_id?: string } | null)?.propiedad_id ?? new URL(req.url()).searchParams.get('propiedadId') ?? ''
      if (req.method() === 'POST') guardadas.add(id); else guardadas.delete(id)
      return r.fulfill(json({ ok: true }))
    })
    await entrar(page)
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const corazon = page.locator('[data-corazon-ficha]')
    await expect(corazon).toBeVisible({ timeout: 30_000 })
    // esquina superior derecha de la foto principal
    const [c, g] = await Promise.all([corazon.boundingBox(), page.locator('.fx-galeria-banda').boundingBox()])
    expect(c!.y).toBeLessThan(g!.y + 80); expect(c!.x + c!.width).toBeGreaterThan(g!.x + g!.width * 0.5)
    expect(c!.width).toBeGreaterThanOrEqual(44)
    await expect(corazon).toHaveAttribute('aria-pressed', 'false')
    await corazon.click()
    await expect(corazon).toHaveAttribute('aria-pressed', 'true')
    await corazon.click()
    await expect(corazon).toHaveAttribute('aria-pressed', 'false')
    expect(llamadas.length).toBeGreaterThanOrEqual(2)
    expect(errores).toEqual([])
  })
  test('SIN cuenta: el corazón manda a entrar y no guarda nada', async ({ page }) => {
    await acotarTerceros(page)
    const llamadas: string[] = []
    await page.route('**/api/favoritos**', (r) => { if (r.request().method() !== 'GET') llamadas.push(r.request().method()); return r.fulfill(json([])) })
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const corazon = page.locator('[data-corazon-ficha]')
    await expect(corazon).toBeVisible({ timeout: 30_000 })
    await corazon.click()
    await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 })
    expect(llamadas).toEqual([])
  })
})

test.describe('la campana se recupera de un «todavía no disponible» (28-oct-2026)', () => {
  test('tras un 503 (migración sin aplicar) NO queda bloqueada: al volver a tocar, con el servidor ya bien, se guarda', async ({ page }) => {
    const errores: string[] = []
    await simular(page, errores)
    let disponible = false; let activo = false
    await page.route('**/api/portal/avisos-precio**', async (r) => {
      if (!disponible) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Los avisos de precio todavía no están disponibles.', codigo: 'no_disponible' }) })
      if (r.request().method() === 'POST') { activo = (r.request().postDataJSON() as { activo: boolean }).activo; return r.fulfill(json({ ok: true, activo })) }
      return r.fulfill(json({ activo }))
    })
    await entrar(page)
    await page.goto(FICHA, { waitUntil: 'domcontentloaded' })
    const campana = page.locator('[data-campana]')
    await expect(page.locator('[data-aviso-precio] [role="alert"]')).toContainText('muy pronto', { timeout: 30_000 })
    await expect(campana).toBeEnabled()                                   // antes quedaba deshabilitada hasta recargar
    disponible = true
    await campana.click()
    await expect(campana).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-aviso-precio] [role="alert"]')).toHaveCount(0)
    expect(errores).toEqual([])
  })
})

test.describe('campana del panel con número de avisos sin leer (28-oct-2026)', () => {
  test('muestra el número (sin leer + pendientes), lista los avisos, abrir uno baja el número y «Marcar todo» lo deja en los pendientes del resumen', async ({ page }) => {
    const errores: string[] = []
    await simular(page, errores)
    const noLeidas = NOTIFICACIONES.map((n) => ({ ...n, leida_en: null as string | null }))
    const leidas = new Set<number>(); const posts: string[] = []
    await page.route('**/api/portal/notificaciones', async (r) => {
      if (r.request().method() === 'POST') { const b = (r.request().postDataJSON?.() ?? {}) as { ids?: number[] }; posts.push(JSON.stringify(b)); for (const n of noLeidas) if (!b.ids || b.ids.includes(n.id)) leidas.add(n.id); return r.fulfill(json({ ok: true })) }
      const lista = noLeidas.map((n) => ({ ...n, leida_en: leidas.has(n.id) ? hace(0) : null }))
      return r.fulfill(json({ notificaciones: lista, sinLeer: lista.filter((n) => !n.leida_en).length }))
    })
    await entrar(page)
    await page.goto('/portal', { waitUntil: 'domcontentloaded' })
    const numero = page.locator('[data-campana-numero]')
    const otros = RESUMEN.avisos.filter((a) => a.id !== 'nuevas').length
    const esperado = NOTIFICACIONES.length + otros
    await expect(numero).toHaveText(String(esperado), { timeout: 30_000 })
    await expect(page.locator('[data-campana-panel]')).toHaveAttribute('aria-label', new RegExp(`Avisos: ${esperado} (pendientes|pendiente)`))
    await page.locator('[data-campana-panel]').click()
    await expect(page.locator('[data-aviso-sin-leer]')).toHaveCount(NOTIFICACIONES.length)
    // abrir un aviso lo marca leído y el número baja al instante
    const primero = page.locator('[data-aviso-sin-leer]').first()
    const id = Number(await primero.getAttribute('data-aviso-sin-leer'))
    await primero.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()))
    await primero.click()
    await expect(numero).toHaveText(String(esperado - 1))
    expect(posts).toContain(JSON.stringify({ ids: [id] }))
    // «Marcar todo como leído»
    await page.locator('[data-campana-panel]').click()
    await page.getByRole('button', { name: 'Marcar todo como leído' }).click()
    if (otros > 0) await expect(numero).toHaveText(String(otros)); else await expect(numero).toHaveCount(0)
    expect(posts.some((p) => p === '{}')).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    expect(errores).toEqual([])
  })
})
