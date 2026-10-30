import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { esperarPanel, prepararPanel } from './ayudas-panel'
import { AHORA, PERFIL } from './datos-panel'

/**
 * Comisión externa, directorio de colaboradores y constancia de pago (migración 55): `/admin/contabilidad`, solo Super Admin. Navegador REAL contra el build local; sesión y API
 * simuladas. Reloj fijado en AHORA. La lógica se prueba aparte (vitest + PGlite).
 */
const json = (c: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(c) })
const sinDesborde = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const GRAVES = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
const fecha = (atras: number) => new Date(AHORA.getTime() - atras * 86_400_000).toISOString().slice(0, 10)

const COLABORADORES = [
  { id: '11111111-1111-4111-8111-111111111111', tipo: 'agente', nombre: 'Laura Mendoza', empresa: 'Inmobiliaria Bajío', telefono: '4771234567', correo: null, municipio: 'León', folio_acreditacion: null, notas: null, activo: true, creado_en: '2026-09-01T00:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', tipo: 'inmobiliaria', nombre: 'Casas del Norte', empresa: null, telefono: null, correo: null, municipio: null, folio_acreditacion: null, notas: null, activo: false, creado_en: '2026-09-02T00:00:00Z' },
]
const EXTERNAS = [
  { id: 'ex-1', fecha: fecha(9), descripcion: 'Cliente buscaba casa en Cañada', tipo: 'renta', colaborador_id: COLABORADORES[0].id, contraparte: null, parte_centavos: 1_000_000, total_centavos: 2_000_000, porcentaje_bp: 5000, estado: 'por_cobrar', cobrada_en: null, metodo_cobro: null, referencia: null, adjunto: null, creado_por: 'super@vivebien.test', creado_en: `${fecha(9)}T10:00:00Z` },
]
const OP = { id: '4c68eb9b-7cba-4590-a629-1d6e45c520ce', propiedad_id: 'p1', tipo: 'renta', base_centavos: 8_000_000, total_centavos: 8_000_000, vivebien_centavos: 4_000_000, colaborador_centavos: 4_000_000, colaborador_retenido_centavos: 0, reparto_estado: 'liberable', estado: 'confirmada', creado_en: `${fecha(3)}T10:00:00Z`, fecha_cierre: fecha(3), propiedad_folio: 'VB-2026-00001', propiedad_titulo: 'Bodega en Renta – Blvd. San Juan Bosco', gastos: [], creado_por: 'super@vivebien.test' }
const OP2 = { ...OP, id: '5d79fc9c-8dcb-4691-b73a-2e7f56d631df', estado: 'confirmada', colaborador_centavos: 0, colaborador_retenido_centavos: 2_000_000, reparto_estado: 'retenido', propiedad_titulo: 'Nave Mandujano', propiedad_folio: 'VB-2026-00006', vivebien_centavos: 2_000_000, total_centavos: 4_000_000 }
const PAGO = { id: 'pg-1', fecha: fecha(2), sentido: 'sale', clase: 'pago_colaborador', monto_centavos: 4_000_000, categoria: 'pago_colaborador', cuenta_id: null, propiedad_id: 'p1', operacion_id: OP.id, concepto: 'Pago en efectivo al colaborador de la renta de la bodega', referencia: null, reverso_de: null, motivo: null, creado_por: 'super@vivebien.test', creado_en: `${fecha(2)}T10:00:00Z` }
const CONSTANCIAS = { 'pg-1': { folio: 'CP-2026-0001', colaborador_id: COLABORADORES[0].id, colaborador_nombre: 'Laura Mendoza', metodo: 'transferencia', comprobante: null } }
const LIBRO = { operaciones: [OP, OP2], movimientos: [PAGO], cuentas: [], etiquetasDePropiedad: {}, truncado: false, externas: EXTERNAS, constancias: CONSTANCIAS }
const CONSTANCIA = { id: '33333333-3333-4333-8333-333333333333', folio: 'CP-2026-0001', colaborador_nombre: 'Laura Mendoza', metodo: 'transferencia', referencia: 'SPEI 123', comprobante: null, monto_centavos: 4_000_000, fecha_pago: fecha(2), descripcion: 'Parte del colaborador · Bodega San Juan' }

async function abrir(page: Page, ruta = '/admin/comisiones') {
  await prepararPanel(page)
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: true })))
  const externasPosts: Array<Record<string, unknown>> = []
  const externasPatches: Array<Record<string, unknown>> = []
  const colabPosts: Array<Record<string, unknown>> = []
  await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: [OP, OP2] })))
  await page.route('**/api/admin/comision/contexto**', (r) => r.fulfill(json({})))
  await page.route('**/api/admin/contabilidad/libro', (r) => r.fulfill(json(LIBRO)))
  await page.route('**/api/admin/contabilidad/reporte', (r) => r.fulfill(json({ telegram: { configurado: false }, alerta: null })))
  await page.route('**/api/admin/contabilidad/colaboradores', (r) => {
    if (r.request().method() === 'POST') { colabPosts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: 'nuevo' }, 201)) }
    return r.fulfill(json({ colaboradores: COLABORADORES }))
  })
  await page.route('**/api/admin/contabilidad/externas', (r) => { externasPosts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: 'ex-nueva' }, 201)) })
  await page.route('**/api/admin/contabilidad/externas/*', (r) => { externasPatches.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true })) })
  await page.route('**/api/admin/contabilidad/constancias/CP-2026-0001', (r) => r.fulfill(json({ constancia: CONSTANCIA })))
  await page.goto(ruta)
  await esperarPanel(page)
  return { externasPosts, externasPatches, colabPosts }
}

test.describe('pestañas de Comisiones y de Contabilidad', () => {
  test('Contabilidad ya no trae «Comisión externa» ni «Colaboradores»; viven en Comisiones y cierres', async ({ page }) => {
    await abrir(page, '/admin/contabilidad')
    const tabs = page.getByRole('tablist', { name: 'Secciones de contabilidad' }).getByRole('tab')
    await expect(tabs).toHaveCount(5)
    await expect(page.getByRole('tab', { name: 'Comisión externa' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Colaboradores' })).toHaveCount(0)
  })
  test('las pestañas de Comisiones se leen completas, sin encimarse ni desbordar la pantalla', async ({ page }) => {
    await abrir(page)
    const tabs = page.getByRole('tablist', { name: 'Secciones de comisiones' }).getByRole('tab')
    await expect(tabs).toHaveCount(7)
    const cajas = await tabs.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, sw: e.scrollWidth, cw: e.clientWidth } }))
    for (const c of cajas) expect(c.sw).toBeLessThanOrEqual(c.cw + 1)
    for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i], b = cajas[j]
      const choca = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1
      expect(choca, `la pestaña ${i} se encima con la ${j}`).toBe(false)
    }
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })
})

test.describe('/admin/comisiones · comisión externa', () => {
  test('registrar una comisión ya cobrada manda lo justo y la lista enseña lo que le tocó a VIVE BIEN', async ({ page }) => {
    const { externasPosts } = await abrir(page)
    await page.getByRole('tab', { name: 'Comisión externa' }).click()
    await expect(page.locator('[data-externa="ex-1"]')).toContainText('$10,000.00')
    await expect(page.locator('[data-externa="ex-1"]')).toContainText('Por cobrar')
    await expect(page.locator('[data-externa="ex-1"]')).toContainText('con Laura Mendoza')
    const registrar = page.locator('[data-registrar-externa]')
    await expect(registrar).toBeDisabled()
    await page.getByLabel('¿Qué pasó?').fill('Cliente pidió bodega en Silao')
    await page.getByLabel('Lo que le tocó a VIVE BIEN (MXN)').fill('7,500.00')
    await page.locator('[data-ya-cobrada]').check()
    await page.getByLabel('Cómo').selectOption('transferencia')
    await expect(registrar).toBeEnabled()
    expect(await GRAVES(page)).toEqual([])
    await registrar.click()
    await expect.poll(() => externasPosts.length).toBe(1)
    expect(externasPosts[0]).toMatchObject({ descripcion: 'Cliente pidió bodega en Silao', parte_pesos: '7,500.00', cobrada: true, metodo_cobro: 'transferencia', tipo: 'renta' })
    expect(String(externasPosts[0].clave_idempotencia)).toMatch(/^ext-/)
  })
  test('marcar como cobrada pide la fecha y el método, y manda el estado que se veía', async ({ page }) => {
    const { externasPatches } = await abrir(page)
    await page.getByRole('tab', { name: 'Comisión externa' }).click()
    await page.locator('[data-cobrar-externa]').click()
    await page.getByLabel('Cómo').last().selectOption('efectivo')
    await page.locator('[data-confirmar-cobro]').click()
    await expect.poll(() => externasPatches.length).toBe(1)
    expect(externasPatches[0]).toMatchObject({ accion: 'cobrar', antes: 'por_cobrar', metodo_cobro: 'efectivo' })
  })
})

test.describe('/admin/comisiones · colaboradores', () => {
  test('el directorio enseña activos y esconde los desactivados hasta que se piden', async ({ page }) => {
    await abrir(page)
    await page.getByRole('tab', { name: 'Colaboradores' }).click()
    await expect(page.getByText('Laura Mendoza').first()).toBeVisible()
    await expect(page.getByText('Casas del Norte')).toHaveCount(0)
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })
})

test.describe('/admin/comisiones · recibo y historial', () => {
  test('en Operaciones sale «Descargar recibo» y el recibo membretado trae el total, el reparto y la constancia del pago', async ({ page }) => {
    await abrir(page)
    await page.getByRole('tab', { name: /^Operaciones/ }).click()
    await expect(page.locator(`[data-operacion="${OP.id}"] [data-descargar-recibo]`)).toHaveAttribute('href', `/admin/comisiones/recibo/${OP.id}`)
    await page.goto(`/admin/comisiones/recibo/${OP.id}`)
    const hoja = page.locator('[data-recibo]')
    await expect(hoja).toBeVisible()
    await expect(hoja).toContainText('Recibo de comisión')
    await expect(hoja).toContainText(/ochenta mil pesos/i)
    await expect(hoja).toContainText('Bodega en Renta')
    await expect(hoja.locator('[data-fecha-emision]')).toContainText('17 de septiembre de 2026')
    await expect(hoja.locator('[data-pagos-colaborador]')).toContainText('CP-2026-0001')
    await expect(page.locator('[data-imprimir]')).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })
  test('en Colaboradores, «Ver historial» lista sus pagos con la constancia y el recibo de la operación', async ({ page }) => {
    await abrir(page)
    await page.getByRole('tab', { name: 'Colaboradores' }).click()
    const ficha = page.locator(`[data-colaborador="${COLABORADORES[0].id}"]`)
    await expect(ficha.locator('[data-pagado]')).toContainText('$40,000.00')
    await ficha.locator('[data-ver-historial]').click()
    const h = ficha.locator('[data-historial] [data-pago-historial]')
    await expect(h).toHaveCount(1)
    await expect(h).toContainText('Constancia CP-2026-0001')
    await expect(h.getByRole('link', { name: 'Recibo de la comisión' })).toHaveAttribute('href', `/admin/comisiones/recibo/${OP.id}`)
    expect(await GRAVES(page)).toEqual([])
  })
})

test.describe('autollenado del pago al colaborador', () => {
  test('al elegir al colaborador se propone la forma de pago que se usó la última vez con él', async ({ page }) => {
    await abrir(page, '/admin/contabilidad')
    await page.getByRole('tab', { name: 'Gastos y cuentas' }).click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: 'Pago al colaborador' }).check()
    await expect(f.locator('[data-metodo="efectivo"]')).toBeChecked()
    await f.locator('[data-operacion-pago]').selectOption(OP2.id)
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('20000.00')
    await f.locator('[data-colaborador-directorio]').selectOption(COLABORADORES[0].id)
    await expect(f.getByLabel('Nombre de quien recibe (aparece en la constancia)')).toHaveValue('Laura Mendoza')
    await expect(f.locator('[data-metodo="transferencia"]')).toBeChecked()
  })
  test('al liberar la parte del colaborador se abre el pago ya lleno', async ({ page }) => {
    await abrir(page)
    await page.getByRole('tab', { name: /^Operaciones/ }).click()
    await page.locator(`[data-operacion="${OP2.id}"]`).getByRole('button', { name: 'Intentar liberar la parte del agente' }).click()
    await page.waitForURL(new RegExp(`/admin/contabilidad\\?pago=${OP2.id}`))
    const f = page.locator('[data-formulario-gasto]')
    await expect(f.locator('[data-operacion-pago]')).toHaveValue(OP2.id)
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('20000.00')
    await expect(f.getByLabel('Concepto')).toHaveValue(/Pago al colaborador · Nave Mandujano/)
  })
})

test.describe('/admin/contabilidad/constancia/[folio]', () => {
  test('la hoja membretada trae el folio, el monto en letra, las firmas y el anexo de la transferencia', async ({ page }) => {
    await abrir(page, '/admin/contabilidad/constancia/CP-2026-0001')
    const hoja = page.locator('[data-constancia]')
    await expect(hoja).toBeVisible()
    await expect(hoja.locator('[data-folio]')).toHaveText('CP-2026-0001')
    await expect(hoja.locator('[data-fecha-emision]')).toContainText('17 de septiembre de 2026')
    await expect(hoja).toContainText('Laura Mendoza')
    await expect(hoja).toContainText(/cuarenta mil pesos/i)
    await expect(hoja.locator('[data-anexo]')).toContainText('comprobante de la transferencia')
    await expect(page.locator('[data-adjuntar-tardio]')).toBeVisible()
    await expect(page.locator('[data-imprimir]')).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })
})
