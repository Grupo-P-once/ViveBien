import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { esperarPanel, prepararPanel } from './ayudas-panel'
import { AHORA, PERFIL } from './datos-panel'

/**
 * Contabilidad de comisiones (migraciones 47 y 48): `/admin/contabilidad`, solo Super Admin. Navegador REAL contra el build local; sesión y API simuladas (ver `ayudas-panel.ts`).
 * El reloj del navegador está fijado en AHORA (17-sep-2026): las fechas de los datos se calculan a partir de él. La lógica contable se prueba aparte (vitest + PGlite).
 */
const json = (c: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(c) })
const sinDesborde = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const GRAVES = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
const fecha = (atras: number) => new Date(AHORA.getTime() - atras * 86_400_000).toISOString().slice(0, 10)

const OPERACIONES = [
  { id: 'op-1', propiedad_id: 'p1', tipo: 'venta', base_centavos: 300_000_000, total_centavos: 12_000_000, vivebien_centavos: 6_000_000, colaborador_centavos: 6_000_000, colaborador_retenido_centavos: 0, reparto_estado: 'liberable', estado: 'confirmada', creado_en: `${fecha(20)}T10:00:00Z`, fecha_cierre: fecha(20), propiedad_folio: 'VB-2026-00006', propiedad_titulo: 'Nave Mandujano', gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }] },
  { id: 'op-2', propiedad_id: 'p2', tipo: 'renta', base_centavos: 2_800_000, total_centavos: 2_800_000, vivebien_centavos: 2_800_000, colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'registrada', creado_en: `${fecha(45)}T10:00:00Z`, fecha_cierre: fecha(45), propiedad_folio: 'VB-2026-00001', propiedad_titulo: 'Bodega San Juan', gastos: [] },
]
const mov = (s: Record<string, unknown>) => ({ cuenta_id: null, propiedad_id: null, operacion_id: null, referencia: null, reverso_de: null, motivo: null, creado_por: 'super@vivebien.test', creado_en: `${fecha(1)}T10:00:00Z`, clase: 'gasto', sentido: 'sale', categoria: 'otro', ...s })
const MOVIMIENTOS = [
  mov({ id: 'g1', fecha: fecha(10), monto_centavos: 150_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p1', concepto: 'Lonas El Juanito', referencia: 'F-118' }),
  mov({ id: 'd1', fecha: fecha(8), clase: 'devolucion', sentido: 'entra', monto_centavos: 50_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p1', concepto: 'Devolución de lonas', reverso_de: 'g1', motivo: 'Lona de mala calidad, devuelven' }),
  ...[60, 30, 1].map((d, i) => mov({ id: `h${i}`, fecha: fecha(d), monto_centavos: 29_900, categoria: 'software_suscripciones', concepto: 'Suscripción de diseño' })),
  mov({ id: 'g9', fecha: fecha(5), monto_centavos: 80_000, categoria: 'publicidad_impresa', cuenta_id: 'c-lonas', propiedad_id: 'p9', concepto: 'Lona del terreno' }),
]
const CUENTAS = [
  { id: 'c-meta', nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', notas: null, activa: true, creado_en: '2026-01-05T00:00:00Z' },
  { id: 'c-lonas', nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa', identificador: null, notas: null, activa: true, creado_en: '2026-02-01T00:00:00Z' },
]
const NOTA = { id: 'nota-1', titulo: 'Plazo de la balanza mensual', tema: 'fiscal', texto: 'Para 2027 el plazo cambió; verificar en la RMF vigente.', vigente_desde: '2026-10-28', retirada: false, retirada_por: null, retirada_en: null, retirada_motivo: null, creado_por: 'super@vivebien.test', creado_en: '2026-10-28T10:00:00Z' }
const NOTA_RETIRADA = { ...NOTA, id: 'nota-0', titulo: 'Criterio anterior', retirada: true, retirada_por: 'super@vivebien.test', retirada_en: '2026-10-29T10:00:00Z', retirada_motivo: 'Sustituido por la nota nueva' }
const CONOCIMIENTO = (vigente = true) => ({
  notas: [NOTA, NOTA_RETIRADA], version: '2026-10-26', fuentes: ['Fuente de prueba: https://ejemplo.test/'],
  vigencia: vigente ? { corte: '2026-10-28', edadEnDias: 3, vigente: true, diasParaRevisar: 117 } : { corte: '2026-10-26', edadEnDias: 150, vigente: false, diasParaRevisar: -30 },
})
const ESTADO_CONECTADO = { configurada: true, proveedor: 'inception', etiqueta: 'Inception (Mercury), API directa', modelo: 'mercury-3', esfuerzo: 'medium', llaves: { gateway: false, inception: true }, falta: null,
  variables: { gateway: 'AI_GATEWAY_API_KEY', inception: 'INCEPTION_API_KEY', proveedor: 'CONTABILIDAD_IA_PROVEEDOR', modelo: 'CONTABILIDAD_MODELO_IA', esfuerzo: 'CONTABILIDAD_ESFUERZO_IA' } }
const ESTADO_SIN_LLAVE = { ...ESTADO_CONECTADO, configurada: false, proveedor: null, etiqueta: null, modelo: null, esfuerzo: null, llaves: { gateway: false, inception: false } }
const LIBRO = { operaciones: OPERACIONES, movimientos: MOVIMIENTOS, cuentas: CUENTAS, etiquetasDePropiedad: { p9: 'Terreno Silao' }, truncado: false }

const RELLENO_DE_GASTO = {
  relleno: { tipo: 'movimiento', campos: { clase: 'gasto', fecha: fecha(1), monto: '1500.00', concepto: 'Lonas para la nave', categoria: 'publicidad_impresa', cuenta_id: 'c-lonas' } },
  resumen: 'Gasto: $1,500.00 · Lonas para la nave · Publicidad impresa · Lonas El Juanito', generado_en: AHORA.toISOString(),
}
const RELLENO_DE_CUENTA = { relleno: { tipo: 'cuenta', campos: { nombre: 'Impresos Torres', categoria: 'publicidad_impresa', identificador: 'ABC-77' } }, resumen: 'Cuenta nueva: Impresos Torres · Publicidad impresa · ID ABC-77', generado_en: AHORA.toISOString() }
const REPORTE_PREVIO = {
  telegram: { configurado: true },
  alerta: { nivel: 'aviso', titulo: 'Contabilidad VIVE BIEN · quincena del 1–15 de septiembre de 2026', datos: { Cierres: '2', Ingresos: '$130,000 (sin quincena anterior con la que comparar)', Gastos: '$14,800' }, accion: 'Cobrar 1 comisión con más de 30 días ($28,000).' },
}

async function abrir(page: Page, o: { relleno?: { status: number; cuerpo: unknown }; libro?: unknown; status?: number; superAdmin?: boolean; asesor?: { status: number; cuerpo: unknown }; conocimiento?: { status: number; cuerpo: unknown }; estadoAsesor?: unknown; prueba?: { status: number; cuerpo: unknown } } = {}) {
  await prepararPanel(page)
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: o.superAdmin ?? true })))
  const posts: Array<Record<string, unknown>> = []
  const cuentasPosts: Array<Record<string, unknown>> = []
  const patches: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
  const asesor: Array<Record<string, unknown>> = []
  const pruebas: Array<Record<string, unknown>> = []
  const libros: string[] = []
  const notasPosts: Array<Record<string, unknown>> = []
  const notasPatches: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
  const rellenos: Array<Record<string, unknown>> = []
  const reportesPosts: Array<Record<string, unknown>> = []
  await page.route('**/api/admin/contabilidad/libro', (r) => { libros.push(r.request().url()); return o.status && o.status !== 200 ? r.fulfill(json({ error: 'La contabilidad todavía no está disponible.', codigo: 'no_disponible' }, o.status)) : r.fulfill(json(o.libro ?? LIBRO)) })
  await page.route('**/api/admin/contabilidad/movimientos', (r) => { posts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: 'nuevo' }, 201)) })
  await page.route('**/api/admin/contabilidad/cuentas', (r) => { cuentasPosts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: 'nueva' }, 201)) })
  await page.route('**/api/admin/contabilidad/cuentas/*', (r) => { patches.push({ url: r.request().url(), cuerpo: JSON.parse(r.request().postData() || '{}') }); return r.fulfill(json({ ok: true })) })
  await page.route('**/api/admin/contabilidad/asesor', (r) => {
    if (r.request().method() === 'GET') return r.fulfill(json(o.estadoAsesor ?? ESTADO_CONECTADO))
    const cuerpoPedido = JSON.parse(r.request().postData() || '{}') as Record<string, unknown>
    if (cuerpoPedido.modo === 'prueba') {
      pruebas.push(cuerpoPedido)
      const x = o.prueba ?? { status: 200, cuerpo: { ok: true, proveedor: 'inception', etiqueta: 'Inception (Mercury), API directa', modelo: 'mercury-3', ms: 812, muestra: 'OK' } }
      return r.fulfill(json(x.cuerpo, x.status))
    }
    if (cuerpoPedido.modo === 'rellenar') {
      rellenos.push(cuerpoPedido)
      const x = o.relleno ?? { status: 200, cuerpo: RELLENO_DE_GASTO }
      return r.fulfill(json(x.cuerpo, x.status))
    }
    asesor.push(cuerpoPedido)
    const x = o.asesor ?? { status: 200, cuerpo: { texto: 'Diagnóstico\nLa utilidad del periodo es positiva.\nHallazgos:\n1. Hay una renta por cobrar de más de 30 días.\nAcciones\n- Cobra primero la renta de la Bodega San Juan.\n- Revisa la suscripción de diseño.', modelo: 'anthropic/claude-haiku-5.5', generado_en: AHORA.toISOString() } }
    return r.fulfill(json(x.cuerpo, x.status))
  })
  await page.route('**/api/admin/contabilidad/reporte', (r) => {
    if (r.request().method() === 'POST') { reportesPosts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true })) }
    return r.fulfill(json(REPORTE_PREVIO))
  })
  await page.route('**/api/admin/contabilidad/conocimiento', (r) => {
    if (r.request().method() === 'POST') { notasPosts.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: 'nota-nueva' }, 201)) }
    const x = o.conocimiento ?? { status: 200, cuerpo: CONOCIMIENTO() }
    return r.fulfill(json(x.cuerpo, x.status))
  })
  await page.route('**/api/admin/contabilidad/conocimiento/*', (r) => { notasPatches.push({ url: r.request().url(), cuerpo: JSON.parse(r.request().postData() || '{}') }); return r.fulfill(json({ ok: true })) })
  await page.goto('/admin/contabilidad')
  await esperarPanel(page)
  return { posts, cuentasPosts, patches, asesor, libros, notasPosts, notasPatches, pruebas, rellenos, reportesPosts }
}
const pestana = (page: Page, nombre: string) => page.getByRole('tab', { name: nombre })

test.describe('/admin/contabilidad · acceso', () => {
  test('un admin que no es Super Admin ve el aviso y la contabilidad ni se pide', async ({ page }) => {
    const { libros } = await abrir(page, { superAdmin: false })
    await expect(page.getByText('Esta pantalla es sólo para Super Admin.')).toBeVisible()
    expect(libros).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
  test('si falta preparar la base de datos, lo dice sin enseñar un libro a medias', async ({ page }) => {
    await abrir(page, { status: 503 })
    await expect(page.locator('[data-error-contabilidad]')).toContainText('falta preparar la base de datos')
    await expect(page.locator('[data-flujo-mensual]')).toHaveCount(0)
  })
  test('en el menú, «Comisiones» se despliega con «Contabilidad» solo para Super Admin', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'En el teléfono el menú es un cajón; la estructura es la misma.')
    await abrir(page)
    const menu = page.getByRole('navigation', { name: 'Panel de administración' })
    // Estando en /admin/contabilidad, el grupo «Comisiones» ya está abierto (tiene un hijo activo).
    await expect(menu.getByRole('button', { name: 'Comisiones' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Cierres y comisiones' })).toHaveAttribute('href', '/admin/comisiones')
    await expect(menu.getByRole('link', { name: 'Contabilidad' })).toHaveAttribute('href', '/admin/contabilidad')
  })
})

test.describe('/admin/contabilidad · resumen', () => {
  test('lo que entra, lo que sale y lo que queda, con sus gráficas y cifras en texto', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Lo que entra y lo que sale' })).toBeVisible()
    await expect(page.locator('[data-kpi="Entró"]')).toContainText('$148,500.00')
    await expect(page.locator('[data-kpi="Entró"]')).toContainText('Cobrado $120,000.00 · por cobrar $28,000.00')
    await expect(page.locator('[data-kpi="Salió"]')).toContainText('$67,197.00')
    await expect(page.locator('[data-kpi="Queda"]')).toContainText('$81,303.00')
    await expect(page.getByRole('img', { name: /Lo que entra y lo que sale cada mes/ })).toBeVisible()
    await expect(page.locator('[data-categoria="gasto_operacion"]')).toContainText('$4,000.00')
    await expect(page.locator('[data-categoria="publicidad_impresa"]')).toContainText('Ya descontados $500.00 de devoluciones')
    await expect(page.locator('[data-gasto-cuenta]')).toContainText('Lonas El Juanito')
  })
  test('«Para mejorar el negocio»: recomendaciones, gastos hormiga y propiedades', async ({ page }) => {
    await abrir(page)
    await expect(page.locator('[data-recomendacion="hormiga"]')).toContainText('1 gasto hormiga')
    await expect(page.locator('[data-recomendacion="sin-cierre"]')).toContainText('Terreno Silao')
    await expect(page.locator('[data-recomendacion="por-cobrar"]')).toContainText('$28,000.00')
    await expect(page.locator('[data-recomendacion="cuentas-dormidas"]')).toContainText('Meta Ads')
    await expect(page.locator('[data-hormiga]')).toContainText('Suscripción de diseño')
    await expect(page.locator('[data-hormiga]')).toContainText('3 cargos')
    await expect(page.locator('[data-propiedad-deja]').first()).toContainText('Nave Mandujano')
    await expect(page.locator('[data-propiedad-sin-cierre]')).toContainText('gasto sin cierre')
  })
  test('el periodo cambia las cifras: «este mes» deja fuera lo de agosto', async ({ page }) => {
    await abrir(page)
    await page.locator('[data-periodo]').selectOption('mes')
    await expect(page.locator('[data-kpi="Entró"]')).toContainText('$500.00') // solo la devolución de septiembre
    await expect(page.locator('[data-kpi="Entró"]')).not.toContainText('$148,500.00')
  })
  test('sin movimientos: lo explica y ofrece registrar el primero', async ({ page }) => {
    await abrir(page, { libro: { operaciones: [], movimientos: [], cuentas: [], etiquetasDePropiedad: {}, truncado: false } })
    await expect(page.getByText('Todavía no hay movimientos')).toBeVisible()
    await page.getByRole('button', { name: 'Registrar un gasto' }).click()
    await expect(pestana(page, 'Gastos y cuentas')).toHaveAttribute('aria-selected', 'true')
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    await expect(page.locator('[data-flujo-mensual]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · libro diario', () => {
  test('lista todo, suma lo que se ve sin contar lo anulado y filtra', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Libro diario').click()
    const libro = page.locator('[data-libro-diario]')
    await expect(libro.locator('[data-linea]')).toHaveCount(10) // 3 de la venta (comisión, colaborador, gasto), 1 de la renta, el gasto, su devolución, 3 de hormiga y el gasto sin cierre
    await expect(libro.locator('[data-total-entra]')).toHaveText('$148,500.00')
    await expect(libro.locator('[data-total-sale]')).toHaveText('$67,197.00')
    await libro.getByLabel('Buscar').fill('LONAS')
    await expect(libro.locator('[data-linea]')).toHaveCount(2)
    await libro.getByLabel('Buscar').fill('')
    await libro.getByLabel('Movimiento').selectOption('entra')
    await expect(libro.locator('[data-linea]')).toHaveCount(3)
    await expect(libro.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled()
  })
  test('una devolución parcial y una anulación se registran como asientos vinculados, con motivo', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Libro diario').click()
    const fila = page.locator('[data-linea="mov:g1"]')
    await fila.getByRole('button', { name: 'Registrar devolución' }).click()
    const form = page.locator('[data-correccion="devolucion"]')
    await expect(form.getByLabel(/^Monto devuelto/)).toHaveValue('1000') // lo que queda: 1,500 − 500 ya devueltos
    const enviar = form.getByRole('button', { name: 'Registrar devolución' })
    await expect(enviar).toBeDisabled()
    await form.getByLabel(/^Motivo/).fill('La segunda lona también llegó rota')
    await form.getByLabel(/^Monto devuelto/).fill('300')
    await enviar.click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'devolucion', monto_pesos: '300', reverso_de: 'g1', motivo: 'La segunda lona también llegó rota' })
    expect(String(posts[0].clave_idempotencia)).toMatch(/^dev-/)
    await page.locator('[data-linea="mov:g9"]').getByRole('button', { name: 'Anular' }).click()
    const anular = page.locator('[data-correccion="anulacion"]')
    await expect(anular.getByLabel(/^Monto que se revierte/)).toHaveValue('800')
    await anular.getByLabel(/^Motivo/).fill('Se capturó en la propiedad equivocada')
    await anular.getByRole('button', { name: 'Anular' }).click()
    await expect.poll(() => posts.length).toBe(2)
    expect(posts[1]).toMatchObject({ clase: 'anulacion', monto_pesos: '800', reverso_de: 'g9' })
  })
  test('lo que viene de una comisión no se corrige aquí, y una devolución solo se anula', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Libro diario').click()
    await expect(page.locator('[data-linea="op:op-1:ingreso"] [data-accion]')).toHaveCount(0)
    await expect(page.locator('[data-linea="mov:d1"] [data-accion="devolucion"]')).toHaveCount(0)
    await expect(page.locator('[data-linea="mov:d1"] [data-accion="anulacion"]')).toHaveCount(1)
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Libro diario').click()
    await page.locator('[data-linea="mov:g1"]').getByRole('button', { name: 'Registrar devolución' }).click()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · gastos y cuentas', () => {
  test('registra un gasto ligado a una cuenta y a una propiedad; la cuenta pone la categoría y el concepto sugiere otra', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await expect(f.getByRole('button', { name: 'Registrar gasto' })).toBeDisabled()
    await f.getByLabel('Cuenta o lugar de gasto').selectOption('c-lonas')
    await expect(f.getByLabel('Categoría')).toHaveValue('publicidad_impresa')
    await f.getByLabel('Monto (MXN)').fill('2500.50')
    await f.getByLabel('Concepto').fill('Lonas para la nave de Mandujano')
    await f.getByLabel(/^Referencia/).fill('F-119')
    await f.getByLabel(/^Propiedad/).selectOption({ index: 1 })
    await f.getByRole('button', { name: 'Registrar gasto' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'gasto', monto_pesos: '2500.50', concepto: 'Lonas para la nave de Mandujano', referencia: 'F-119', categoria: 'publicidad_impresa', cuenta_id: 'c-lonas' })
    expect(String(posts[0].propiedad_id).length).toBeGreaterThan(0)
    expect(Object.keys(posts[0])).not.toContain('sentido')
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('') // listo para el siguiente
  })
  test('sin cuenta, el concepto sugiere la categoría y la persona la confirma', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByLabel('Concepto').fill('Campaña de Meta Ads de octubre')
    await f.getByRole('button', { name: /Parece «Publicidad digital»/ }).click()
    await expect(f.getByLabel('Categoría')).toHaveValue('publicidad_digital')
  })
  test('un ingreso extra no pide categoría; crear y desactivar una cuenta', async ({ page }) => {
    const { posts, cuentasPosts, patches } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: /Un ingreso extra/ }).check()
    await expect(f.getByLabel('Categoría')).toHaveCount(0)
    await f.getByLabel('Monto (MXN)').fill('300')
    await f.getByLabel('Concepto').fill('Reembolso de seguro')
    await f.getByRole('button', { name: 'Registrar ingreso' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'ingreso_extra', monto_pesos: '300' })
    const c = page.locator('[data-cuentas]')
    await c.getByLabel('Nombre').fill('Impresos Torres')
    await c.getByLabel('Tipo de gasto').selectOption('publicidad_impresa')
    await c.getByLabel(/^Identificador/).fill('ABC-77')
    await c.getByRole('button', { name: 'Guardar cuenta' }).click()
    await expect.poll(() => cuentasPosts.length).toBe(1)
    expect(cuentasPosts[0]).toEqual({ nombre: 'Impresos Torres', categoria: 'publicidad_impresa', identificador: 'ABC-77' })
    await c.locator('[data-cuenta="c-meta"]').getByRole('button', { name: 'Desactivar' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].cuerpo).toEqual({ activa: false })
    expect(patches[0].url).toContain('/cuentas/c-meta')
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    await page.locator('[data-formulario-gasto]').getByLabel('Concepto').fill('Lonas')
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · chat con el asesor (estilo Mensajes)', () => {
  test('arranca con un saludo, escribes, ves tu burbuja, «escribiendo…» y la respuesta formateada; las cifras las arma el servidor', async ({ page }) => {
    const { asesor } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    await expect(chat.getByText('Asesor contable', { exact: true })).toBeVisible()
    await expect(chat.locator('[data-burbuja="asesor"]').first()).toContainText('Hola, soy tu asesor contable')
    await expect(chat.locator('[data-separador]')).toContainText(/^Hoy \d{2}:\d{2}$/)
    const entrada = chat.getByLabel('Escribe tu pregunta al asesor')
    await expect(chat.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await entrada.fill('¿Cuánto gasté en lonas?')
    await chat.getByRole('button', { name: 'Enviar' }).click()
    await expect(chat.locator('[data-burbuja="persona"]')).toContainText('¿Cuánto gasté en lonas?')
    await expect(chat.locator('[data-burbuja="asesor"]').last()).toContainText('Hallazgos')
    await expect(chat.locator('[data-burbuja="asesor"]').last()).toContainText('Cobra primero la renta de la Bodega San Juan.')
    await expect(chat.locator('[data-entrega]')).toHaveText('Leído')
    expect(asesor[0]).toMatchObject({ modo: 'periodo', periodo: 'tres_meses', pregunta: '¿Cuánto gasté en lonas?', historial: [] })
    expect(Object.keys(asesor[0]).sort()).toEqual(['historial', 'modo', 'periodo', 'pregunta']) // ninguna cifra sale del navegador
    await expect(entrada).toHaveValue('') // la barra queda vacía, lista para seguir
  })
  test('un seguimiento lleva la conversación previa como contexto; Enter envía y Mayús+Enter hace salto de línea', async ({ page }) => {
    const { asesor } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    const entrada = chat.getByLabel('Escribe tu pregunta al asesor')
    await entrada.fill('¿En qué gasto más?')
    await entrada.press('Enter')
    await expect(chat.locator('[data-burbuja="asesor"]')).toHaveCount(2)
    await entrada.fill('línea 1')
    await entrada.press('Shift+Enter')
    await entrada.type('línea 2')
    await expect(entrada).toHaveValue('línea 1\nlínea 2')
    await entrada.fill('¿y eso qué recorto primero?')
    await entrada.press('Enter')
    await expect.poll(() => asesor.length).toBe(2)
    expect(asesor[1].pregunta).toBe('¿y eso qué recorto primero?')
    const h = asesor[1].historial as Array<{ rol: string; texto: string }>
    expect(h.map((t) => t.rol)).toEqual(['persona', 'asesor'])
    expect(h[0].texto).toBe('¿En qué gasto más?')
    expect(h.some((t) => /Hola, soy tu asesor/.test(t.texto))).toBe(false) // el saludo no es parte de la conversación
  })
  test('las sugerencias en píldoras preguntan; la primera pide el análisis del periodo sin pregunta', async ({ page }) => {
    const { asesor } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    await chat.getByRole('button', { name: 'Explícame este periodo' }).click()
    await expect(chat.locator('[data-burbuja="persona"]')).toContainText('Explícame este periodo')
    await expect.poll(() => asesor.length).toBe(1)
    expect(asesor[0]).toMatchObject({ pregunta: '' })
    await chat.getByRole('button', { name: '¿Qué gastos hormiga tengo?' }).click()
    await expect.poll(() => asesor.length).toBe(2)
    expect(asesor[1]).toMatchObject({ pregunta: '¿Qué gastos hormiga tengo?' })
  })
  test('«Nueva conversación» vuelve al saludo', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    await chat.getByRole('button', { name: 'Explícame este periodo' }).click()
    await expect(chat.locator('[data-burbuja="asesor"]')).toHaveCount(2)
    await chat.getByRole('button', { name: 'Nueva conversación' }).click()
    await expect(chat.locator('[data-burbuja]')).toHaveCount(1)
    await expect(chat.locator('[data-burbuja="asesor"]')).toContainText('Hola, soy tu asesor contable')
  })
  test('si el asesor falla o no está configurado, lo dice en una burbuja con «Reintentar» y lo demás sigue funcionando', async ({ page }) => {
    await abrir(page, { asesor: { status: 503, cuerpo: { error: 'El asesor de IA todavía no está configurado.', codigo: 'ia_no_configurada' } } })
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    await chat.getByRole('button', { name: 'Explícame este periodo' }).click()
    await expect(chat.locator('[data-burbuja][data-tipo="error"]')).toContainText('todavía no está configurado')
    await expect(chat.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    await pestana(page, 'Resumen').click()
    await expect(page.locator('[data-recomendacion="hormiga"]')).toBeVisible()
  })
  test('lo que escribe el modelo se muestra como texto, nunca como HTML', async ({ page }) => {
    await abrir(page, { asesor: { status: 200, cuerpo: { texto: 'Diagnóstico\n<img src=x onerror="window.__pwn=1"> **fuerte**', modelo: 'mercury-3', proveedor: 'inception', generado_en: AHORA.toISOString() } } })
    await pestana(page, 'Asesor IA').click()
    const chat = page.locator('[data-chat-asesor]')
    await chat.getByRole('button', { name: 'Explícame este periodo' }).click()
    await expect(chat.locator('[data-burbuja="asesor"]').last()).toContainText('<img src=x onerror="window.__pwn=1"> fuerte')
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined()
    await expect(chat.locator('img')).toHaveCount(0)
  })
  test('el hilo se puede recorrer con el teclado y tiene un nombre para lectores de pantalla', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const hilo = page.getByRole('log', { name: 'Conversación con el asesor contable' })
    await expect(hilo).toHaveAttribute('tabindex', '0')
    await expect(hilo).toHaveAttribute('aria-live', 'polite')
  })
  test('sin axe graves ni desborde (con una respuesta en pantalla)', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Asesor IA').click()
    await page.locator('[data-chat-asesor]').getByRole('button', { name: 'Explícame este periodo' }).click()
    await expect(page.locator('[data-burbuja="asesor"]').last()).toContainText('Hallazgos')
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · conexión del asesor (solo pegas la llave)', () => {
  test('conectado: dice proveedor, modelo y razonamiento, y «Probar conexión» confirma que responde y cuánto tarda', async ({ page }) => {
    const { pruebas, asesor } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const c = page.locator('[data-conexion-asesor]')
    await expect(c.locator('[data-estado-conexion="conectado"]')).toContainText('Inception (Mercury), API directa')
    await expect(c.locator('[data-estado-conexion="conectado"]')).toContainText('mercury-3')
    await expect(c.locator('[data-estado-conexion="conectado"]')).toContainText('razonamiento medium')
    await c.getByRole('button', { name: 'Probar conexión' }).click()
    await expect(c.locator('[data-resultado-prueba="ok"]')).toContainText('respondió en 812 ms')
    expect(pruebas).toEqual([{ modo: 'prueba' }]) // sin cifras, sin periodo, sin pregunta
    expect(asesor).toHaveLength(0)
  })
  test('sin llave: lo dice, deshabilita la prueba y muestra los pasos con los nombres exactos de las variables', async ({ page }) => {
    await abrir(page, { estadoAsesor: ESTADO_SIN_LLAVE })
    await pestana(page, 'Asesor IA').click()
    const c = page.locator('[data-conexion-asesor]')
    await expect(c.locator('[data-estado-conexion="sin-llave"]')).toContainText('Sin conectar')
    await expect(c.getByRole('button', { name: 'Probar conexión' })).toBeDisabled()
    const pasos = c.locator('[data-pasos-conexion]')
    await expect(pasos).toHaveAttribute('open', '')
    await expect(pasos).toContainText('vercel env add INCEPTION_API_KEY preview')
    await expect(pasos).toContainText('vercel env add CONTABILIDAD_IA_PROVEEDOR preview')
    await expect(pasos).toContainText('vercel env add AI_GATEWAY_API_KEY preview')
    await expect(pasos).toContainText('inception/mercury-3')
    await expect(pasos).toContainText('volver a desplegar el Preview')
    await expect(pasos).toContainText('no se escribe en esta pantalla ni en el chat')
  })
  test('la llave NUNCA se teclea en la aplicación: no hay campo de contraseña ni de llave, y el estado no la trae', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Asesor IA').click()
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await expect(page.getByLabel(/llave|api key|token/i)).toHaveCount(0)
    const texto = await page.locator('[data-conexion-asesor]').innerText()
    expect(texto).not.toMatch(/sk[-_][A-Za-z0-9]{10,}/)
  })
  test('si el proveedor rechaza la llave, la prueba lo dice con claridad', async ({ page }) => {
    await abrir(page, { prueba: { status: 502, cuerpo: { error: 'El proveedor rechazó la llave del asesor: no es válida, venció o no tiene permiso. Revísala o genera otra y vuelve a guardarla.', codigo: 'ia_clave' } } })
    await pestana(page, 'Asesor IA').click()
    await page.getByRole('button', { name: 'Probar conexión' }).click()
    await expect(page.locator('[data-resultado-prueba="error"]')).toContainText('rechazó la llave')
  })
  test('el estado con el Gateway y falta de la llave del proveedor elegido se explica', async ({ page }) => {
    await abrir(page, { estadoAsesor: { ...ESTADO_SIN_LLAVE, falta: 'INCEPTION_API_KEY' } })
    await pestana(page, 'Asesor IA').click()
    await expect(page.locator('[data-estado-conexion="sin-llave"]')).toContainText('le falta su llave (INCEPTION_API_KEY)')
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page, { estadoAsesor: ESTADO_SIN_LLAVE })
    await pestana(page, 'Asesor IA').click()
    await expect(page.locator('[data-pasos-conexion]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · base de conocimiento y notas del contador', () => {
  test('muestra qué tan al día está la base y las notas vigentes y retiradas', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const n = page.locator('[data-notas-contador]')
    await expect(n.locator('[data-vigencia-base="vigente"]')).toContainText('corte 2026-10-28')
    await expect(n.locator('[data-vigencia-base="vigente"]')).toContainText('se revisa en 117 días')
    await expect(n.locator('[data-nota="nota-1"]')).toContainText('Plazo de la balanza mensual')
    await expect(n.locator('[data-nota="nota-1"]')).toContainText('Fiscal')
    await expect(n.getByText('Notas retiradas (1)')).toBeVisible()
  })
  test('si la base lleva más de 120 días, lo dice con claridad', async ({ page }) => {
    await abrir(page, { conocimiento: { status: 200, cuerpo: CONOCIMIENTO(false) } })
    await pestana(page, 'Asesor IA').click()
    await expect(page.locator('[data-vigencia-base="vencida"]')).toContainText('150 días sin revisarse')
  })
  test('agrega una nota: el servidor recibe título, tema, texto, fecha y clave; no hay botón de editar', async ({ page }) => {
    const { notasPosts } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const n = page.locator('[data-nota-nueva]')
    const guardar = n.getByRole('button', { name: 'Guardar nota' })
    await expect(guardar).toBeDisabled()
    await n.getByLabel('Título').fill('Umbral de aviso en arrendamiento')
    await n.getByLabel('Tema').selectOption('pld')
    await n.getByLabel(/^La nota/).fill('Según la reforma citada, el umbral cambió; verificar en el DOF antes de usarlo.')
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect.poll(() => notasPosts.length).toBe(1)
    expect(notasPosts[0]).toMatchObject({ titulo: 'Umbral de aviso en arrendamiento', tema: 'pld', texto: 'Según la reforma citada, el umbral cambió; verificar en el DOF antes de usarlo.', vigente_desde: '2026-09-17' })
    expect(String(notasPosts[0].clave_idempotencia)).toMatch(/^nota-/)
    await expect(page.getByRole('button', { name: /editar/i })).toHaveCount(0)
  })
  test('retirar una nota pide el motivo; no la borra', async ({ page }) => {
    const { notasPatches } = await abrir(page)
    await pestana(page, 'Asesor IA').click()
    const fila = page.locator('[data-nota="nota-1"]')
    await fila.getByRole('button', { name: 'Retirar' }).click()
    const retirar = fila.getByRole('button', { name: 'Retirar nota' })
    await expect(retirar).toBeDisabled()
    await fila.getByLabel(/^Motivo/).fill('La reforma de enero la sustituye')
    await retirar.click()
    await expect.poll(() => notasPatches.length).toBe(1)
    expect(notasPatches[0].cuerpo).toEqual({ motivo: 'La reforma de enero la sustituye' })
    expect(notasPatches[0].url).toContain('/conocimiento/nota-1')
  })
  test('sin la migración de las notas, lo dice y el asesor sigue disponible', async ({ page }) => {
    await abrir(page, { conocimiento: { status: 503, cuerpo: { error: 'La contabilidad todavía no está disponible.', codigo: 'no_disponible' } } })
    await pestana(page, 'Asesor IA').click()
    await expect(page.locator('[data-error-notas]')).toContainText('migración 49')
    await expect(page.locator('[data-chat-asesor]').getByRole('button', { name: 'Explícame este periodo' })).toBeVisible()
  })
})

test.describe('integración con /admin/comisiones', () => {
  test('Super Admin ve el enlace a Contabilidad y el asesor opina sobre un trato en la calculadora', async ({ page }) => {
    const { asesor } = await abrir(page)
    await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: [] })))
    await page.goto('/admin/comisiones')
    await esperarPanel(page)
    await expect(page.locator('[data-ir-contabilidad]')).toHaveAttribute('href', '/admin/contabilidad')
    await page.getByRole('tab', { name: 'Calculadora' }).click()
    const cal = page.locator('[data-calculadora-libre]')
    const opinar = cal.getByRole('button', { name: '¿Qué opina el asesor de este trato?' })
    await expect(opinar).toBeDisabled()
    await cal.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    await cal.getByRole('button', { name: '4 %' }).click()
    await opinar.click()
    await expect(cal.locator('[data-opinion-ia] [data-respuesta-ia]')).toBeVisible()
    expect(asesor[0]).toMatchObject({ modo: 'operacion', tipo: 'venta', base_pesos: '3000000', comision_pct: '4', comparte: false, gastos: [] })
    for (const k of Object.keys(asesor[0])) expect(k).not.toMatch(/total|centavos|neto|vivebien/)
  })
  test('la opinión sobre un trato se ve como tarjeta: veredicto a la vista, «Por qué» y «Qué ajustar»; sin formato, texto tal cual', async ({ page }) => {
    const texto = 'Veredicto: Conviene ajustar\nPor qué:\n- La comisión del 4 % está en el rango habitual.\n- Los gastos se comen el 12 % de la parte de VIVE BIEN.\nQué ajustar:\n- Negociar la fotografía.'
    await abrir(page, { asesor: { status: 200, cuerpo: { texto, modelo: 'mercury-3', generado_en: AHORA.toISOString() } } })
    await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: [] })))
    await page.goto('/admin/comisiones')
    await esperarPanel(page)
    await page.getByRole('tab', { name: 'Calculadora' }).click()
    const cal = page.locator('[data-calculadora-libre]')
    await cal.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    await cal.getByRole('button', { name: '4 %' }).click()
    await cal.getByRole('button', { name: '¿Qué opina el asesor de este trato?' }).click()
    const r = cal.locator('[data-respuesta-ia]')
    await expect(r.locator('[data-veredicto="Conviene ajustar"]')).toBeVisible()
    await expect(r.locator('[data-bloque-opinion="op-porque"] li')).toHaveCount(2)
    await expect(r.locator('[data-bloque-opinion="op-ajustar"]')).toContainText('Negociar la fotografía')
    expect(await new AxeBuilder({ page }).analyze().then((x) => x.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id))).toEqual([])
  })
  test('si el modelo no sigue el formato, se muestra su texto tal cual y no se inventa un veredicto', async ({ page }) => {
    await abrir(page, { asesor: { status: 200, cuerpo: { texto: 'El trato se ve bien.\n- Cobra pronto.', modelo: 'mercury-3', generado_en: AHORA.toISOString() } } })
    await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: [] })))
    await page.goto('/admin/comisiones')
    await esperarPanel(page)
    await page.getByRole('tab', { name: 'Calculadora' }).click()
    const cal = page.locator('[data-calculadora-libre]')
    await cal.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    await cal.getByRole('button', { name: '4 %' }).click()
    await cal.getByRole('button', { name: '¿Qué opina el asesor de este trato?' }).click()
    await expect(cal.locator('[data-opinion-sin-formato]')).toContainText('El trato se ve bien.')
    await expect(cal.locator('[data-veredicto]')).toHaveCount(0)
  })
  test('un admin que no es Super Admin no ve ni el enlace ni el botón del asesor', async ({ page }) => {
    await abrir(page, { superAdmin: false })
    await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: [] })))
    await page.goto('/admin/comisiones')
    await esperarPanel(page)
    await expect(page.locator('[data-ir-contabilidad]')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Calculadora' }).click()
    await expect(page.locator('[data-opinion-ia]')).toHaveCount(0)
  })
})

test.describe('/admin/contabilidad · autollenado con IA', () => {
  test('una instrucción llena el formulario de gasto, lleva a «Gastos y cuentas» y NO guarda nada', async ({ page }) => {
    const { rellenos, posts } = await abrir(page)
    const caja = page.locator('[data-autollenado]')
    await expect(caja).toBeVisible()
    await caja.getByLabel(/Dile a la IA/).fill('gasté 1,500 en lonas ayer con Lonas El Juanito')
    await caja.getByRole('button', { name: 'Llenar el formulario' }).click()
    await expect(pestana(page, 'Gastos y cuentas')).toHaveAttribute('aria-selected', 'true')
    const f = page.locator('[data-formulario-gasto]')
    await expect(f.locator('[data-autollenado-aviso]')).toContainText('Llenado con IA')
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('1500.00')
    await expect(f.getByLabel('Concepto')).toHaveValue('Lonas para la nave')
    await expect(f.getByLabel('Categoría')).toHaveValue('publicidad_impresa')
    await expect(f.getByLabel('Cuenta o lugar de gasto')).toHaveValue('c-lonas')
    expect(rellenos).toHaveLength(1)
    expect(rellenos[0]).toMatchObject({ modo: 'rellenar', pregunta: 'gasté 1,500 en lonas ayer con Lonas El Juanito' })
    expect(posts).toEqual([]) // llenar no registra: la persona revisa y registra
    await f.getByRole('button', { name: 'Registrar gasto' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'gasto', monto_pesos: '1500.00', cuenta_id: 'c-lonas' })
  })
  test('una instrucción de cuenta nueva llena «Nueva cuenta»', async ({ page }) => {
    const { cuentasPosts } = await abrir(page, { relleno: { status: 200, cuerpo: RELLENO_DE_CUENTA } })
    await page.locator('[data-autollenado]').getByLabel(/Dile a la IA/).fill('crea la cuenta Impresos Torres, impresos, id ABC-77')
    await page.locator('[data-autollenado]').getByRole('button', { name: 'Llenar el formulario' }).click()
    const c = page.locator('[data-cuentas]')
    await expect(c.getByLabel('Nombre')).toHaveValue('Impresos Torres')
    await expect(c.getByLabel('Tipo de gasto')).toHaveValue('publicidad_impresa')
    await expect(c.getByLabel(/^Identificador/)).toHaveValue('ABC-77')
    expect(cuentasPosts).toEqual([])
  })
  test('el historial guarda las instrucciones y un toque la vuelve a lanzar', async ({ page }) => {
    const { rellenos } = await abrir(page)
    const caja = page.locator('[data-autollenado]')
    await caja.getByLabel(/Dile a la IA/).fill('gasté 1,500 en lonas')
    await caja.getByRole('button', { name: 'Llenar el formulario' }).click()
    await pestana(page, 'Resumen').click()
    await caja.getByRole('button', { name: 'Historial de instrucciones' }).click()
    await caja.locator('[data-autollenado-historial] button', { hasText: 'gasté 1,500 en lonas' }).click()
    await expect.poll(() => rellenos.length).toBe(2)
  })
  test('si la IA no pudo sacar datos, el error se ve y no cambia nada', async ({ page }) => {
    await abrir(page, { relleno: { status: 422, cuerpo: { error: 'No pude sacar datos de eso.', codigo: 'sin_datos' } } })
    const caja = page.locator('[data-autollenado]')
    await caja.getByLabel(/Dile a la IA/).fill('hola qué tal')
    await caja.getByRole('button', { name: 'Llenar el formulario' }).click()
    await expect(caja.getByRole('alert')).toContainText('No pude sacar datos')
    await expect(pestana(page, 'Resumen')).toHaveAttribute('aria-selected', 'true')
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · estados financieros', () => {
  test('estado de resultados y balance con las cifras del libro, y el balance cuadra', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Estados financieros').click()
    const er = page.locator('[data-estado-de-resultados]')
    await expect(er).toContainText('Estado de resultados')
    await expect(page.locator('[data-balance-general] [data-cuadra="si"]')).toBeVisible()
    await expect(page.locator('[data-limites-estados]')).toContainText('Qué NO son estos estados')
    await expect(er).toContainText('No calculado: lo determina el contador')
    await expect(er.locator('[data-fila-er="ingresos"]')).toContainText('$')
  })
  test('descarga el CSV y trae el reporte quincenal con vista previa y confirmación antes de enviar', async ({ page }) => {
    const { reportesPosts } = await abrir(page)
    await pestana(page, 'Estados financieros').click()
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
    expect(descarga.suggestedFilename()).toMatch(/^estados-financieros-vivebien-\d{4}-\d{2}-\d{2}\.csv$/)
    const q = page.locator('[data-reporte-quincenal]')
    await q.getByRole('button', { name: 'Ver vista previa' }).click()
    await expect(q.locator('[data-reporte-vista]')).toContainText('quincena del 1–15 de septiembre de 2026')
    expect(reportesPosts).toEqual([]) // la vista previa no manda nada
    await q.getByRole('button', { name: 'Enviar ahora al grupo' }).click()
    await expect(q.locator('[data-confirmar-reporte]')).toContainText('no se puede retirar')
    expect(reportesPosts).toEqual([])
    await q.getByRole('button', { name: 'Sí, enviar' }).click()
    await expect.poll(() => reportesPosts.length).toBe(1)
    expect(reportesPosts[0]).toEqual({ confirmar: true })
  })
  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Estados financieros').click()
    await page.locator('[data-reporte-quincenal]').getByRole('button', { name: 'Ver vista previa' }).click()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · editar cuentas existentes', () => {
  test('cambia nombre y tipo con PATCH y solo manda lo que cambió', async ({ page }) => {
    const { patches } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    await page.locator('[data-cuenta="c-meta"]').getByRole('button', { name: 'Editar' }).click()
    const e = page.locator('[data-editor-cuenta]')
    await expect(e.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    await e.getByLabel('Nombre').fill('Meta Ads México')
    await e.getByLabel('Tipo de gasto').selectOption('publicidad_impresa')
    await e.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].url).toContain('/cuentas/c-meta')
    expect(patches[0].cuerpo).toEqual({ nombre: 'Meta Ads México', categoria: 'publicidad_impresa' })
  })
  test('cancelar no manda nada, y sin axe graves', async ({ page }) => {
    const { patches } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    await page.locator('[data-cuenta="c-lonas"]').getByRole('button', { name: 'Editar' }).click()
    expect(await GRAVES(page)).toEqual([])
    await page.locator('[data-editor-cuenta]').getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.locator('[data-editor-cuenta]')).toHaveCount(0)
    expect(patches).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/contabilidad · aportación al grupo y pago al colaborador', () => {
  test('una aportación a una empresa del grupo no pide categoría ni propiedad, explica que no es gasto y manda su clase', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: /Dinero que entrego a una empresa del grupo/ }).check()
    await expect(f.locator('[data-nota-aportacion]')).toContainText(/no baja la utilidad/)
    await expect(f.getByLabel('Categoría')).toHaveCount(0)
    await expect(f.getByLabel(/^Propiedad/)).toHaveCount(0)
    await f.getByLabel('Monto (MXN)').fill('40000')
    await f.getByLabel('Concepto').fill('Aportación de capital a ANDAX')
    await f.getByRole('button', { name: 'Registrar aportación' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'aportacion_grupo', monto_pesos: '40000', concepto: 'Aportación de capital a ANDAX' })
    expect(posts[0].categoria).toBeUndefined()
    expect(posts[0].propiedad_id).toBeUndefined()
  })
  test('el pago al colaborador pide la operación, propone lo que falta pagar y manda operacion_id', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: 'Pago al colaborador' }).check()
    await expect(f.locator('[data-nota-pago]')).toContainText('NO verifica su acreditación')
    await expect(f.getByRole('button', { name: 'Registrar pago' })).toBeDisabled()
    const sel = f.locator('[data-operacion-pago]')
    await expect(sel.locator('option').nth(1)).toContainText('Nave Mandujano')
    await expect(sel.locator('option').nth(1)).toContainText('falta pagar $60,000.00')
    await sel.selectOption('op-1')
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('60000.00')
    await expect(f.getByLabel('Concepto')).toHaveValue(/Pago al colaborador · Nave Mandujano/)
    await f.getByLabel('Monto (MXN)').fill('25000')
    await expect(f.getByRole('button', { name: 'Registrar pago' })).toBeDisabled()
    await f.getByLabel('Nombre de quien recibe (aparece en la constancia)').fill('Laura Mendoza')
    await f.getByRole('button', { name: 'Registrar pago' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'pago_colaborador', monto_pesos: '25000', operacion_id: 'op-1' })
    expect(posts[0].categoria).toBeUndefined()
    expect(posts[0].cuenta_id).toBeUndefined()
  })
  test('con la parte del colaborador retenida avisa que se registra el pago sin acreditación verificada', async ({ page }) => {
    const retenida = { ...OPERACIONES[0], reparto_estado: 'retenido', colaborador_centavos: 0, colaborador_retenido_centavos: 4_000_000 }
    await abrir(page, { libro: { ...LIBRO, operaciones: [retenida, OPERACIONES[1]] } })
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: 'Pago al colaborador' }).check()
    await f.locator('[data-operacion-pago]').selectOption('op-1')
    await expect(f.locator('[data-aviso-retenido]')).toContainText('sigue retenida')
    await expect(f.getByLabel('Monto (MXN)')).toHaveValue('40000.00')
  })
  test('lo ya pagado baja lo pendiente; sin nada pendiente lo dice; el libro no cuenta el pago dos veces; sin axe graves', async ({ page }) => {
    const pago = mov({ id: 'pc1', fecha: fecha(2), clase: 'pago_colaborador', categoria: 'pago_colaborador', monto_centavos: 6_000_000, operacion_id: 'op-1', propiedad_id: 'p1', concepto: 'Pago al colaborador en efectivo' })
    await abrir(page, { libro: { ...LIBRO, movimientos: [...MOVIMIENTOS, pago] } })
    await expect(page.locator('[data-kpi="Salió"]')).toContainText('(pagado $60,000.00)')
    await expect(page.locator('[data-kpi="Salió"]')).toContainText('$67,197.00') // el pago NO se suma otra vez
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: 'Pago al colaborador' }).check()
    await expect(f.locator('[data-operacion-pago] option').first()).toContainText('No hay operaciones con parte de colaborador pendiente')
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
  test('el dinero que regresa una empresa del grupo se registra como aportación recibida (entra, no es ingreso)', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Gastos y cuentas').click()
    const f = page.locator('[data-formulario-gasto]')
    await f.getByRole('radio', { name: /Dinero que me regresa o aporta una empresa del grupo/ }).check()
    await expect(f.locator('[data-nota-aportacion-recibida]')).toContainText('NO es un ingreso')
    await f.getByLabel('Monto (MXN)').fill('15000')
    await f.getByLabel('Concepto').fill('Aportación de ANDAX')
    await f.getByRole('button', { name: 'Registrar dinero recibido' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ clase: 'aportacion_recibida_grupo', monto_pesos: '15000' })
    expect(posts[0].categoria).toBeUndefined()
  })
  test('en estados financieros lo entregado al grupo NO es inversión: baja el capital y el balance sigue cuadrando', async ({ page }) => {
    const ap = mov({ id: 'ap1', fecha: fecha(1), clase: 'aportacion_grupo', categoria: 'aportacion_grupo', monto_centavos: 4_000_000, concepto: 'Aportación de capital a ANDAX' })
    await abrir(page, { libro: { ...LIBRO, movimientos: [...MOVIMIENTOS, ap] } })
    await pestana(page, 'Estados financieros').click()
    await expect(page.locator('[data-bg="inversiones"]')).toHaveCount(0)
    await expect(page.locator('[data-bg="grupo"]')).toContainText('-$40,000.00')
    await expect(page.locator('[data-balance-general] [data-cuadra="si"]')).toBeVisible()
  })
})
