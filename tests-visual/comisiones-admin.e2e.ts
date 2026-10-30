import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { esperarPanel, prepararPanel } from './ayudas-panel'
import { AHORA, PERFIL } from './datos-panel'

/**
 * Comisiones (Etapa C, migración 43): pantalla `/admin/comisiones` y revisión de la acreditación dentro de «Notas/Comisión».
 * Navegador REAL contra el build local; sesión y API simuladas (ver `ayudas-panel.ts`): nada sale a internet ni toca ninguna base.
 * La lógica de reparto, autoaprobación e idempotencia se prueba aparte contra Postgres real (`migracion-43-comision-operaciones.test.ts`
 * y el recorrido en el proyecto de staging); aquí se prueba lo que ve y hace una persona del equipo.
 */
const json = (c: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(c) })
const sinDesborde = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const GRAVES = async (page: Page, dentro?: string) => {
  const b = new AxeBuilder({ page })
  if (dentro) b.include(dentro)
  return (await b.analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
}

const op = (sobre: Record<string, unknown>) => ({
  id: '11111111-1111-4111-8111-111111111111', propiedad_id: 'bodega-san-juan', tipo: 'renta', base_centavos: 2_800_000, regla_version: 'borrador-2026-10-24',
  total_centavos: 2_800_000, vivebien_centavos: 1_400_000, colaborador_centavos: 0, colaborador_retenido_centavos: 1_400_000,
  retencion: 'acreditacion_no_verificada', reparto_estado: 'retenido', atribuible: true, atribucion_ref: 'cita:qa-001', estado: 'registrada',
  creado_por: 'asesor@vivebien.test', creado_en: '2026-09-10T15:00:00.000Z', estado_por: null, estado_en: null, estado_motivo: null,
  fecha_cierre: '2026-09-10', propiedad_folio: 'VB-2026-00001', propiedad_titulo: 'Bodega en Renta - Blvd. San Juan Bosco', precio_lista_centavos: 3_000_000, ...sobre,
})
const venta = (sobre: Record<string, unknown> = {}) => op({
  id: '44444444-4444-4444-8444-444444444444', propiedad_id: 'nave-mandujano', tipo: 'venta', base_centavos: 750_000_000, total_centavos: 26_250_000, vivebien_centavos: 26_250_000,
  colaborador_centavos: 0, colaborador_retenido_centavos: 0, retencion: 'sin_colaborador', reparto_estado: 'no_aplica', estado: 'confirmada', estado_por: 'admin@vivebien.test',
  fecha_cierre: '2026-08-20', creado_en: '2026-08-21T10:00:00.000Z', propiedad_folio: 'VB-2026-00006', propiedad_titulo: 'Nave industrial Mandujano', precio_lista_centavos: 790_000_000, ...sobre,
})
const CTX = (sobre: Record<string, unknown> = {}) => ({
  propiedad: { id: 'nave-mandujano', folio: 'VB-2026-00006', titulo: 'Nave industrial Mandujano', operacion: 'venta', precioCentavos: 790_000_000, estatus: 'disponible', estadoPub: 'publicada' },
  exenta: null, cuentaEncontrada: true, origenTipo: 'trato_directo', participa: false, acreditacion: 'sin_folio', motorEncendido: true, ...sobre,
})

async function abrir(page: Page, o: { ops?: unknown[]; status?: number; ctx?: unknown; patch?: (c: Record<string, unknown>) => { status: number; cuerpo: unknown }; ruta?: string } = {}) {
  await prepararPanel(page)
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
  const posts: Array<Record<string, unknown>> = []
  const patches: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
  const contextos: string[] = []
  let ops = o.ops ?? []
  await page.route('**/api/admin/comision/contexto**', (r) => { contextos.push(r.request().url()); return r.fulfill(json(o.ctx ?? CTX())) })
  await page.route('**/api/admin/comision/operaciones**', (r) => {
    const q = r.request()
    if (q.method() === 'POST') { posts.push(JSON.parse(q.postData() || '{}')); ops = [op({ id: '22222222-2222-4222-8222-222222222222' }), ...ops]; return r.fulfill(json({ ok: true, id: '2222' }, 201)) }
    if (q.method() === 'PATCH') {
      const cuerpo = JSON.parse(q.postData() || '{}'); patches.push({ url: q.url(), cuerpo })
      const resp = (o.patch ?? (() => ({ status: 200, cuerpo: { ok: true } })))(cuerpo)
      return r.fulfill(json(resp.cuerpo, resp.status))
    }
    if (o.status && o.status !== 200) return r.fulfill(json({ error: 'Las operaciones de comisión todavía no están disponibles.', codigo: 'no_disponible' }, o.status))
    return r.fulfill(json({ operaciones: ops }))
  })
  await page.goto(o.ruta ?? '/admin/comisiones')
  await esperarPanel(page)
  return { posts, patches, contextos }
}
const pestana = (page: Page, nombre: RegExp | string) => page.getByRole('tab', { name: nombre })

test.describe('/admin/comisiones · resumen', () => {
  test('sin cierres lo dice, ofrece registrar el primero y no pinta gráficas vacías', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Lo que dejan tus ventas y rentas' })).toBeVisible()
    await expect(page.getByText('Todavía no hay cierres registrados')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar el primer cierre' })).toBeVisible()
    await expect(page.locator('[data-kpi]')).toHaveCount(0)
    expect(await sinDesborde(page)).toBe(true)
  })

  test('con datos: cobrada, por cobrar, mes, y las gráficas con sus cifras en texto', async ({ page }) => {
    await abrir(page, { ops: [venta(), op({}), op({ id: '55555555-5555-4555-8555-555555555555', estado: 'anulada', total_centavos: 9_000_000, vivebien_centavos: 9_000_000, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', retencion: 'sin_colaborador' })] })
    await expect(page.locator('[data-kpi="Comisión cobrada"]')).toContainText('$262,500')
    await expect(page.locator('[data-kpi="Por cobrar"]')).toContainText('$28,000')
    await expect(page.locator('[data-kpi="Cierres"]')).toContainText('1 venta · 1 renta')
    await expect(page.getByText(/del precio anunciado/)).toBeVisible()
    await expect(page.getByRole('img', { name: /Comisión por mes, venta y renta/ })).toBeVisible()
    await expect(page.getByRole('img', { name: /Comisión por tipo: Venta \$262,500/ })).toBeVisible()
    await expect(page.locator('[data-cobro="confirmada"]')).toContainText('$262,500')
    await expect(page.locator('[data-cobro="registrada"]')).toContainText('$28,000')
    await expect(page.locator('[data-cobro="anulada"]')).toContainText('$90,000')
    await expect(page.locator('[data-reparto="ret"]')).toContainText('$14,000')
    await expect(page.locator('[data-top-propiedad="nave-mandujano"]')).toContainText('Nave industrial Mandujano')
    expect(await sinDesborde(page)).toBe(true)
  })

  test('flujo del dinero: entra la comisión, sale colaborador y gastos, queda el neto; y cada operación muestra lo pactado', async ({ page }) => {
    const compartida = venta({
      total_centavos: 12_000_000, base_centavos: 300_000_000, vivebien_centavos: 6_000_000, colaborador_centavos: 5_000_000, colaborador_retenido_centavos: 1_000_000,
      comision_bp: 400, colaborador_bp: 5000, ajuste_motivo: 'Se negoció 4 % con el propietario', fecha_cierre: '2026-09-10',
      gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }, { concepto: 'Publicidad', monto_centavos: 600_000 }],
    })
    await abrir(page, { ops: [compartida] })
    const f = page.locator('[data-flujo-dinero]')
    await expect(f.locator('[data-flujo-entra]')).toHaveText('$120,000')
    await expect(f.locator('[data-flujo-sale]')).toHaveText('$70,000')
    await expect(f.locator('[data-flujo-queda]')).toHaveText('$50,000')
    await expect(f).toContainText('Colaboradores $60,000 · gastos $10,000')
    await expect(f).toContainText('1 operación se separó de la regla')
    await expect(f.getByRole('img', { name: /Cada mes: lo que queda para VIVE BIEN/ })).toBeVisible()
    await pestana(page, /^Operaciones/).click()
    const o = page.locator('[data-operacion]')
    await expect(o.locator('[data-pactada]')).toHaveText('4 % del precio')
    await expect(o.locator('[data-gastos]')).toContainText('Fotografía $4,000')
    await expect(o.locator('[data-gastos]')).toContainText('queda para VIVE BIEN $50,000')
    await expect(o.locator('[data-motivo-ajuste]')).toHaveText('Se negoció 4 % con el propietario')
  })

  test('las operaciones anteriores (sin lo pactado ni gastos) siguen mostrándose con la regla', async ({ page }) => {
    await abrir(page, { ops: [venta()] })
    await pestana(page, /^Operaciones/).click()
    await expect(page.locator('[data-pactada]')).toHaveText('según la regla (3.5 %)')
    await expect(page.locator('[data-gastos]')).toHaveCount(0)
  })

  test('«ver historial» de una propiedad abre la lista filtrada con lo cobrado y lo pendiente', async ({ page }) => {
    await abrir(page, { ops: [venta(), venta({ id: '66666666-6666-4666-8666-666666666666', estado: 'registrada', fecha_cierre: '2026-09-02', total_centavos: 1_000_000 }), op({})] })
    await page.locator('[data-top-propiedad="nave-mandujano"]').getByRole('link', { name: 'ver historial' }).click()
    await expect(pestana(page, /^Operaciones/)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-historial-resumen]')).toContainText('2 operaciones')
    await expect(page.locator('[data-historial-resumen]')).toContainText('$262,500')
    await expect(page.locator('[data-historial-resumen]')).toContainText('$10,000')
    await expect(page.locator('[data-operacion]')).toHaveCount(2)
    await page.getByRole('button', { name: 'Ver todas las operaciones' }).click()
    await expect(page.locator('[data-operacion]')).toHaveCount(3)
  })

  test('sin axe graves ni desborde con datos', async ({ page }) => {
    await abrir(page, { ops: [venta(), op({})] })
    await expect(page.locator('[data-kpi="Comisión cobrada"]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })

  test('si la migración no está, lo dice (no enseña «sin cierres» como si todo estuviera bien)', async ({ page }) => {
    await abrir(page, { status: 503 })
    await expect(page.locator('p[role="alert"]')).toContainText('todavía no están disponibles')
    await expect(page.getByText('Todavía no hay cierres registrados')).toHaveCount(0)
  })
})

test.describe('/admin/comisiones · operaciones y seguimiento del cobro', () => {
  test('muestra el reparto retenido con su motivo, la fecha de cierre y el folio', async ({ page }) => {
    await abrir(page, { ops: [op({})] })
    await pestana(page, /^Operaciones/).click()
    const fila = page.locator('[data-operacion="11111111-1111-4111-8111-111111111111"]')
    await expect(fila).toContainText('Renta')
    await expect(fila).toContainText('VB-2026-00001')
    await expect(fila).toContainText('Cierre: 2026-09-10')
    await expect(fila).toContainText('$28,000')
    await expect(fila).toContainText('Parte del agente retenida')
    await expect(fila).toContainText('Acreditación sin verificar o vencida')
    await expect(fila).toContainText('retenido: $14,000')
    await expect(fila).toContainText('antes de impuestos')
    expect(await sinDesborde(page)).toBe(true)
  })

  test('los filtros por estado, tipo y texto', async ({ page }) => {
    await abrir(page, { ops: [venta(), op({})] })
    await pestana(page, /^Operaciones/).click()
    await expect(page.locator('[data-operacion]')).toHaveCount(2)
    await page.getByLabel('Tipo').selectOption('venta')
    await expect(page.locator('[data-operacion]')).toHaveCount(1)
    await page.getByLabel('Tipo').selectOption('')
    await page.getByLabel('Estado').selectOption('registrada')
    await expect(page.locator('[data-operacion]')).toHaveCount(1)
    await page.getByLabel('Estado').selectOption('')
    await page.getByLabel('Buscar por folio o título').fill('mandujano')
    await expect(page.locator('[data-operacion]')).toHaveCount(1)
    await page.getByLabel('Buscar por folio o título').fill('zzz')
    await expect(page.getByText('Ninguna operación coincide con el filtro.')).toBeVisible()
  })

  test('confirmar y anular piden un motivo de al menos 10 caracteres', async ({ page }) => {
    const { patches } = await abrir(page, { ops: [op({})] })
    await pestana(page, /^Operaciones/).click()
    const confirmar = page.getByRole('button', { name: 'Confirmar cobro' })
    await expect(confirmar).toBeDisabled()
    await page.getByLabel(/Motivo \(mínimo 10 caracteres/).fill('corto')
    await expect(confirmar).toBeDisabled()
    await page.getByLabel(/Motivo \(mínimo 10 caracteres/).fill('Primera renta recibida en la cuenta')
    await expect(confirmar).toBeEnabled()
    await confirmar.click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].cuerpo).toEqual({ accion: 'confirmar', antes: 'registrada', motivo: 'Primera renta recibida en la cuenta' })
    expect(patches[0].url).toContain('/api/admin/comision/operaciones/11111111-1111-4111-8111-111111111111')
  })

  test('liberar la parte del agente solo se ofrece si está retenida; el servidor decide', async ({ page }) => {
    const { patches } = await abrir(page, {
      ops: [op({}), op({ id: '33333333-3333-4333-8333-333333333333', reparto_estado: 'liberable', colaborador_centavos: 1_400_000, colaborador_retenido_centavos: 0, retencion: null })],
      patch: () => ({ status: 409, cuerpo: { error: 'Todavía no se cumplen las condiciones para liberar el reparto: acreditación verificada y vigente, y operación atribuible.', codigo: 'no_elegible' } }),
    })
    await pestana(page, /^Operaciones/).click()
    await expect(page.getByRole('button', { name: 'Intentar liberar la parte del agente' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Intentar liberar la parte del agente' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0].cuerpo).toMatchObject({ accion: 'liberar_reparto' })
    await expect(page.getByText(/Todavía no se cumplen las condiciones/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-operacion="33333333-3333-4333-8333-333333333333"]')).toContainText('Parte del agente liberable')
  })

  test('una operación anulada no ofrece acciones', async ({ page }) => {
    await abrir(page, { ops: [op({ estado: 'anulada', estado_por: 'admin@vivebien.test' })] })
    await pestana(page, /^Operaciones/).click()
    await expect(page.locator('[data-estado-operacion]')).toContainText('Anulada')
    await expect(page.getByRole('button', { name: 'Confirmar cobro' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Anular' })).toHaveCount(0)
  })
})

test.describe('/admin/comisiones · registrar un cierre (guiado)', () => {
  test('elige la propiedad, trae el precio y el tipo, muestra el cálculo y manda solo lo que escribió la persona', async ({ page }) => {
    const { posts, contextos } = await abrir(page)
    await page.getByRole('button', { name: 'Registrar el primer cierre' }).click()
    const form = page.locator('[data-formulario-cierre]')
    await form.getByLabel('Busca por folio o por título').fill('mandujano')
    await form.locator('[data-elegir-propiedad="nave-mandujano"]').click()
    await expect(form.locator('[data-propiedad-elegida="nave-mandujano"]')).toContainText('VB-2026-00006')
    await expect.poll(() => contextos.length).toBe(1)
    await expect(form.getByLabel('Precio total de la venta (MXN)')).toHaveValue('7900000')
    await expect(form.getByRole('radio', { name: 'Venta' })).toBeChecked()
    await expect(form.locator('[data-calculo-total]')).toHaveText('$276,500')
    await expect(form.locator('[data-calculo-neto]')).toHaveText('$276,500')
    // el cierre real fue más bajo que lo anunciado
    await form.getByLabel('Precio total de la venta (MXN)').fill('7500000')
    await expect(form.locator('[data-calculo-total]')).toHaveText('$262,500')
    await expect(form.getByText(/por debajo de lo anunciado/)).toBeVisible()
    const guardar = form.getByRole('button', { name: 'Registrar cierre' })
    await expect(guardar).toBeDisabled() // falta la atribución
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await expect(guardar).toBeDisabled() // atribuible exige su referencia
    await form.getByLabel(/Referencia/).fill('cita:abc-123')
    await form.getByLabel('Fecha de cierre').fill('2026-09-15')
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect.poll(() => posts.length).toBe(1)
    expect(Object.keys(posts[0]).sort()).toEqual(['atribucion_ref', 'atribuible', 'base_pesos', 'clave_idempotencia', 'comision_pct', 'comparte', 'fecha_cierre', 'gastos', 'propiedad_id', 'tipo'])
    expect(posts[0]).toMatchObject({ propiedad_id: 'nave-mandujano', tipo: 'venta', base_pesos: '7500000', fecha_cierre: '2026-09-15', atribuible: true, atribucion_ref: 'cita:abc-123', comision_pct: '3.5', comparte: false, gastos: [] })
    expect(String(posts[0].clave_idempotencia)).toMatch(/^op-[a-z0-9]+-[a-z0-9]+$/)
    await expect(pestana(page, /^Operaciones/)).toHaveAttribute('aria-selected', 'true')
  })

  test('llegando desde «Vendida/Rentada» (enlace con la propiedad y el tipo) ya viene todo elegido', async ({ page }) => {
    await abrir(page, { ctx: CTX({ propiedad: { id: 'bodega-san-juan', folio: 'VB-2026-00001', titulo: 'Bodega en Renta - Blvd. San Juan Bosco', operacion: 'renta', precioCentavos: 8_900_000, estatus: 'rentada', estadoPub: 'publicada' } }), ruta: '/admin/comisiones?nueva=1&propiedad=bodega-san-juan&tipo=renta' })
    await expect(pestana(page, 'Registrar un cierre')).toHaveAttribute('aria-selected', 'true')
    const form = page.locator('[data-formulario-cierre]')
    await expect(form.locator('[data-propiedad-elegida="bodega-san-juan"]')).toBeVisible()
    await expect(form.getByRole('radio', { name: 'Renta' })).toBeChecked()
    await expect(form.getByLabel('Renta mensual (MXN)')).toHaveValue('89000')
    await expect(form.locator('[data-calculo-total]')).toHaveText('$89,000')
  })

  test('con agente sin verificar muestra cuánto queda retenido y por qué, antes de guardar', async ({ page }) => {
    await abrir(page, { ctx: CTX({ origenTipo: 'inmobiliaria', participa: true, acreditacion: 'sin_folio' }), ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    const form = page.locator('[data-formulario-cierre]')
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await form.getByLabel(/Referencia/).fill('cita:abc-123')
    await expect(form.locator('[data-calculo-total]')).toHaveText('$276,500')
    await expect(form.locator('[data-calculo-neto]')).toHaveText('$138,250')
    await expect(form.locator('[data-calculo-colaborador]')).toHaveText('$138,250')
    await expect(form.locator('[data-estado-reparto]')).toHaveText('retenida')
    await expect(form.locator('[data-calculo]')).toContainText('no se libera hasta verificar')
    await expect(form.locator('[data-estado-colaborador]')).toContainText('pendiente de verificación')
  })

  for (const [nombre, sobre, texto, formulario] of [
    ['cuenta con «sin comisión»', { exenta: 'sin_comision' }, /exenta de comisión/, false],
    ['sin origen declarado', { origenTipo: null }, /Falta registrar cómo se maneja la propiedad/, true],
    ['módulo apagado', { motorEncendido: false }, /módulo de comisiones está apagado/, true],
  ] as const) {
    test(`${nombre}: lo explica y no deja guardar`, async ({ page }) => {
      await abrir(page, { ctx: CTX(sobre), ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
      await expect(page.locator('[data-bloqueo]')).toContainText(texto)
      const boton = page.getByRole('button', { name: 'Registrar cierre' })
      // Si la cuenta está exenta ni se muestra el formulario; si solo falta el origen o el módulo, se ve pero bloqueado.
      if (formulario) await expect(boton).toBeDisabled(); else await expect(boton).toHaveCount(0)
    })
  }

  test('el porcentaje se puede cambiar: recalcula, pide el motivo y lo manda junto con lo pactado', async ({ page }) => {
    const { posts } = await abrir(page, { ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    const form = page.locator('[data-formulario-cierre]')
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await form.getByLabel(/Referencia/).fill('cita:abc-123')
    await form.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    await expect(form.locator('[data-calculo-total]')).toHaveText('$105,000')
    await expect(form.locator('[data-calculo-descripcion]')).toHaveText('3.5 % de $3,000,000')
    await expect(form.locator('[data-ajuste-motivo]')).toHaveCount(0)
    await form.getByRole('button', { name: '4 %' }).click()
    await expect(form.locator('[data-calculo-total]')).toHaveText('$120,000')
    await expect(form.locator('[data-ajuste-motivo]')).toBeVisible()
    const guardar = form.getByRole('button', { name: 'Registrar cierre' })
    await expect(guardar).toBeDisabled()
    await expect(form.locator('[data-falta]')).toContainText('motivo')
    await form.getByLabel(/^Motivo/).fill('Se negoció 4 % con el propietario')
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ comision_pct: '4', ajuste_motivo: 'Se negoció 4 % con el propietario', comparte: false })
    for (const k of Object.keys(posts[0])) expect(k).not.toMatch(/total|centavos|neto|vivebien/)
  })

  test('comisión compartida: reparto editable, gastos y la cuenta de lo que entra, sale y queda', async ({ page }) => {
    const { posts } = await abrir(page, { ctx: CTX({ origenTipo: 'inmobiliaria', participa: true, acreditacion: 'verificado' }), ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    const form = page.locator('[data-formulario-cierre]')
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await form.getByLabel(/Referencia/).fill('cita:abc-123')
    await form.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    // por defecto el origen dice que hay agente: 50/50 sin pedir motivo
    await expect(form.locator('[data-comparte-si]')).toBeChecked()
    await expect(form.locator('[data-calculo-colaborador]')).toHaveText('$52,500')
    await expect(form.locator('[data-estado-reparto]')).toHaveText('liberable')
    await expect(form.locator('[data-calculo-neto]')).toHaveText('$52,500')
    await expect(form.locator('[data-ajuste-motivo]')).toHaveCount(0)
    // 60 / 40 y dos gastos
    await form.getByRole('button', { name: '60 / 40' }).click()
    await expect(form.locator('[data-calculo-colaborador]')).toHaveText('$63,000')
    await form.getByRole('button', { name: 'Fotografía' }).click()
    await form.getByRole('button', { name: 'Publicidad' }).click()
    const montos = form.getByLabel(/^Monto del gasto/)
    await montos.nth(0).fill('1500')
    await montos.nth(1).fill('2500')
    await expect(form.locator('[data-calculo-neto]')).toHaveText('$38,000')
    await expect(form.locator('[data-calculo]')).toContainText('Gasto: Fotografía')
    await expect(form.locator('[data-ajuste-motivo]')).toBeVisible()
    await form.getByLabel(/^Motivo/).fill('El agente trajo al comprador: 60 %')
    await form.getByRole('button', { name: 'Registrar cierre' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ comparte: true, colaborador_pct: '60', comision_pct: '3.5', gastos: [{ concepto: 'Fotografía', monto_pesos: '1500.00' }, { concepto: 'Publicidad', monto_pesos: '2500.00' }] })
  })

  test('decir que NO se comparte (aunque el origen tenga agente) o gastos mal escritos: avisa y no deja guardar', async ({ page }) => {
    await abrir(page, { ctx: CTX({ origenTipo: 'inmobiliaria', participa: true, acreditacion: 'verificado' }), ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    const form = page.locator('[data-formulario-cierre]')
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await form.getByLabel(/Referencia/).fill('cita:abc-123')
    const guardar = form.getByRole('button', { name: 'Registrar cierre' })
    await form.locator('[data-comparte-no]').check()
    await expect(form.locator('[data-ajuste-motivo]')).toBeVisible()
    await expect(guardar).toBeDisabled()
    await form.locator('[data-comparte-si]').check()
    await expect(guardar).toBeEnabled()
    await form.getByRole('button', { name: 'Gestoría' }).click()
    await expect(guardar).toBeDisabled() // el gasto no trae monto
    await form.getByLabel(/^Monto del gasto/).fill('999999999')
    await expect(form.locator('[data-cuenta-vacia]')).toContainText('mayores que la parte de VIVE BIEN')
    await form.getByLabel('Quitar el gasto 1').click()
    await expect(guardar).toBeEnabled()
  })

  test('renta: los meses se pueden cambiar (mes y medio)', async ({ page }) => {
    const { posts } = await abrir(page, { ctx: CTX({ propiedad: { id: 'bodega-san-juan', folio: 'VB-2026-00001', titulo: 'Bodega en Renta', operacion: 'renta', precioCentavos: 2_800_000, estatus: 'disponible', estadoPub: 'publicada' } }), ruta: '/admin/comisiones?nueva=1&propiedad=bodega-san-juan&tipo=renta' })
    const form = page.locator('[data-formulario-cierre]')
    await expect(form.locator('[data-calculo-total]')).toHaveText('$28,000')
    await form.getByRole('button', { name: '1.5 meses' }).click()
    await expect(form.locator('[data-calculo-total]')).toHaveText('$42,000')
    await expect(form.locator('[data-calculo-descripcion]')).toContainText('1.5 meses de renta')
    await form.getByRole('radio', { name: 'No', exact: true }).check()
    await form.getByLabel(/^Motivo/).fill('Contrato a dos años: mes y medio')
    await form.getByRole('button', { name: 'Registrar cierre' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ tipo: 'renta', renta_meses: '1.5', ajuste_motivo: 'Contrato a dos años: mes y medio' })
    expect(posts[0]).not.toHaveProperty('comision_pct')
  })

  test('sin axe graves ni desborde en el formulario con reparto y gastos', async ({ page }) => {
    await abrir(page, { ctx: CTX({ origenTipo: 'inmobiliaria', participa: true, acreditacion: 'verificado' }), ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    const form = page.locator('[data-formulario-cierre]')
    await form.getByRole('radio', { name: /Sí, se puede comprobar/ }).check()
    await form.getByRole('button', { name: '60 / 40' }).click()
    await form.getByRole('button', { name: 'Fotografía' }).click()
    await form.getByLabel(/^Monto del gasto/).fill('1500')
    await expect(form.locator('[data-ajuste-motivo]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })

  test('sin axe graves ni desborde en el formulario', async ({ page }) => {
    await abrir(page, { ruta: '/admin/comisiones?nueva=1&propiedad=nave-mandujano&tipo=venta' })
    await expect(page.locator('[data-calculo-total]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/comisiones · calculadora libre', () => {
  test('simula un trato sin guardar nada: porcentaje, reparto 60/40 y gastos', async ({ page }) => {
    const { posts } = await abrir(page)
    await pestana(page, 'Calculadora').click()
    const cal = page.locator('[data-calculadora-libre]')
    await expect(cal.locator('[data-cuenta-vacia]')).toContainText('precio total')
    await cal.getByLabel('Precio total de la venta (MXN)').fill('4,000,000')
    await expect(cal.locator('[data-calculo-total]')).toHaveText('$140,000')
    await cal.getByLabel('Porcentaje sobre el precio total').fill('4.25')
    await expect(cal.locator('[data-calculo-total]')).toHaveText('$170,000')
    await cal.locator('[data-comparte-si]').check()
    await cal.getByRole('button', { name: '60 / 40' }).click()
    await expect(cal.locator('[data-calculo-colaborador]')).toHaveText('$102,000')
    await expect(cal.locator('[data-calculo-neto]')).toHaveText('$68,000')
    await cal.getByRole('button', { name: 'Publicidad' }).click()
    await cal.getByLabel(/^Monto del gasto/).fill('5000')
    await expect(cal.locator('[data-calculo-neto]')).toHaveText('$63,000')
    // sin motivo (es una simulación) y sin ninguna petición de guardado
    await expect(cal.locator('[data-ajuste-motivo]')).toHaveCount(0)
    await cal.locator('[data-supuesto-liberada]').uncheck()
    await expect(cal.locator('[data-estado-reparto]')).toHaveText('retenida')
    expect(posts).toHaveLength(0)
  })

  test('sin axe graves ni desborde', async ({ page }) => {
    await abrir(page)
    await pestana(page, 'Calculadora').click()
    const cal = page.locator('[data-calculadora-libre]')
    await cal.getByLabel('Precio total de la venta (MXN)').fill('3000000')
    await cal.locator('[data-comparte-si]').check()
    await expect(cal.locator('[data-calculo-total]')).toBeVisible()
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('«Vendida» y «Rentada» desde Mis propiedades', () => {
  test('el menú de una venta ofrece «Vendida: registrar comisión», cambia el estatus y abre el motor con la propiedad elegida', async ({ page }) => {
    await prepararPanel(page)
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
    const patches: Array<Record<string, unknown>> = []
    await page.route('**/api/admin/propiedades/nave-mandujano', (r) => { if (r.request().method() === 'PATCH') { patches.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true })) } return r.continue() })
    await page.route('**/api/admin/comision/**', (r) => r.fulfill(json(r.request().url().includes('contexto') ? CTX() : { operaciones: [] })))
    await page.goto('/admin/propiedades')
    await esperarPanel(page)
    await page.getByRole('button', { name: 'Más acciones para Nave industrial Mandujano' }).first().click()
    await expect(page.getByRole('menuitem', { name: 'Archivar' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Vendida: registrar comisión' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ estatus: 'vendida' }) // vendida, NO archivada
    await expect(page).toHaveURL(/\/admin\/comisiones\?nueva=1&propiedad=nave-mandujano&tipo=venta/, { timeout: 30_000 })
    await expect(page.locator('[data-propiedad-elegida="nave-mandujano"]')).toBeVisible({ timeout: 30_000 })
  })

  test('una renta ofrece «Rentada» y una ya rentada ofrece registrar su comisión y volver a disponible (sin Pausar)', async ({ page }) => {
    await prepararPanel(page)
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
    await page.goto('/admin/propiedades')
    await esperarPanel(page)
    await page.getByRole('button', { name: /Más acciones para Local comercial Centro Max/ }).first().click()
    await expect(page.getByRole('menuitem', { name: 'Rentada: registrar comisión' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Vendida: registrar comisión' })).toHaveCount(0)
  })
})

test.describe('revisión de la acreditación dentro de «Notas/Comisión»', () => {
  const INTERNO = { origen: null, notas: [], subidaPor: null, veTodas: true }
  const ACRED = (sobre: Record<string, unknown> = {}) => ({
    folio: 'GTO-QA-001', municipio: 'León', aportoPor: 'agente@vivebien.test', estado: 'pendiente', etiqueta: 'Folio aportado · pendiente de verificación',
    verificadoPor: null, verificadoEn: null, vigenteHasta: null, motivo: null, ...sobre,
  })

  async function abrirHoja(page: Page, acred: unknown, status = 200) {
    await prepararPanel(page)
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
    const verificaciones: Array<Record<string, unknown>> = []
    await page.route('**/api/propiedades/*/interno', (r) => r.fulfill(json(INTERNO)))
    await page.route('**/api/propiedades/*/acreditacion', (r) => {
      const q = r.request()
      if (q.method() === 'POST') { verificaciones.push(JSON.parse(q.postData() || '{}')); return r.fulfill(json({ ok: true })) }
      return r.fulfill(json(acred, status))
    })
    await page.goto('/admin/propiedades')
    await esperarPanel(page)
    await page.locator('[data-notas-comision="nave-mandujano"]:visible').first().click({ timeout: 30_000 })
    return verificaciones
  }

  test('el equipo ve el folio y el estado «pendiente de verificación», y registra la revisión con motivo', async ({ page }) => {
    const verificaciones = await abrirHoja(page, ACRED())
    const bloque = page.locator('[data-verificacion-acreditacion]')
    await expect(bloque).toBeVisible({ timeout: 30_000 })
    await expect(bloque.locator('[data-acreditacion-estado]')).toContainText('pendiente de verificación')
    await expect(bloque).toContainText('GTO-QA-001')
    const registrar = bloque.getByRole('button', { name: 'Registrar revisión' })
    await expect(registrar).toBeDisabled()
    await bloque.getByLabel('Resultado de la revisión').selectOption('coincide')
    await bloque.getByLabel(/Motivo o evidencia/).fill('Aparece en el padrón con vigencia')
    await expect(registrar).toBeDisabled() // falta la vigencia
    await bloque.getByLabel(/Vigente hasta/).fill('2027-10-01')
    await expect(registrar).toBeEnabled()
    await registrar.click()
    await expect.poll(() => verificaciones.length).toBe(1)
    expect(verificaciones[0]).toEqual({ folio: 'GTO-QA-001', resultado: 'coincide', vigente_hasta: '2027-10-01', motivo: 'Aparece en el padrón con vigencia' })
  })

  test('«no coincide» no pide vigencia', async ({ page }) => {
    const verificaciones = await abrirHoja(page, ACRED())
    const bloque = page.locator('[data-verificacion-acreditacion]')
    await expect(bloque).toBeVisible({ timeout: 30_000 })
    await bloque.getByLabel('Resultado de la revisión').selectOption('no_coincide')
    await expect(bloque.getByLabel(/Vigente hasta/)).toHaveCount(0)
    await bloque.getByLabel(/Motivo o evidencia/).fill('No aparece en el padrón')
    await bloque.getByRole('button', { name: 'Registrar revisión' }).click()
    await expect.poll(() => verificaciones.length).toBe(1)
    expect(verificaciones[0]).toMatchObject({ resultado: 'no_coincide', motivo: 'No aparece en el padrón' })
  })

  test('el equipo elige al colaborador del directorio (o lo crea ahí mismo) y queda ligado a la propiedad', async ({ page }) => {
    const ORIGEN = { origen_tipo: 'trato_directo', titular_nombre: 'Luis Gómez Ramírez', titular_empresa: null, titular_telefono: '4778116501', titular_correo: 'luis@correo.mx', comision_tipo: null, comision_valor: null, comision_detalle: null }
    const LISTA = [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Laura Mendoza', empresa: 'Inmobiliaria Bajío' }]
    const ligas: Array<Record<string, unknown>> = []
    const altas: Array<Record<string, unknown>> = []
    await abrirHoja(page, ACRED())
    await page.route('**/api/propiedades/*/interno', (r) => r.fulfill(json({ ...INTERNO, origen: ORIGEN, colaboradores: LISTA, colaborador: null, puedeCrearColaborador: true })))
    await page.route('**/api/propiedades/*/colaborador', (r) => { ligas.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true })) })
    await page.route('**/api/admin/contabilidad/colaboradores', (r) => { altas.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill(json({ ok: true, id: '33333333-3333-4333-8333-333333333333' }, 201)) })
    await page.reload()
    await esperarPanel(page)
    await page.locator('[data-notas-comision="nave-mandujano"]:visible').first().click({ timeout: 30_000 })
    const bloque = page.locator('[data-colaborador-propiedad]')
    await expect(bloque).toBeVisible({ timeout: 30_000 })
    await expect(bloque.locator('[data-guardar-colaborador]')).toBeDisabled()
    await bloque.locator('[data-select-colaborador]').selectOption('11111111-1111-4111-8111-111111111111')
    await bloque.locator('[data-guardar-colaborador]').click()
    await expect.poll(() => ligas.length).toBe(1)
    expect(ligas[0]).toEqual({ colaborador_id: '11111111-1111-4111-8111-111111111111' })
    await expect(page.getByText('Colaborador ligado a la propiedad.')).toBeVisible()
    // Si no está en el directorio: «Crear colaborador nuevo» lo da de alta y lo liga.
    await bloque.locator('[data-select-colaborador]').selectOption('__crear')
    await expect(bloque.locator('[data-crear-y-ligar]')).toBeDisabled()
    await bloque.getByLabel('Nombre *').fill('Pedro Salas')
    await bloque.getByLabel('Empresa').fill('Casas del Norte')
    await bloque.locator('[data-crear-y-ligar]').click()
    await expect.poll(() => altas.length).toBe(1)
    expect(altas[0]).toMatchObject({ tipo: 'agente', nombre: 'Pedro Salas', empresa: 'Casas del Norte' })
    await expect.poll(() => ligas.length).toBe(2)
    expect(ligas[1]).toEqual({ colaborador_id: '33333333-3333-4333-8333-333333333333' })
    const graves = (await new AxeBuilder({ page }).include('[data-colaborador-propiedad]').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)
    expect(graves).toEqual([])
  })

  test('un admin que no puede crear colaboradores ve el directorio pero no la opción «Crear»', async ({ page }) => {
    const ORIGEN = { origen_tipo: 'trato_directo', titular_nombre: 'Luis Gómez Ramírez', titular_empresa: null, titular_telefono: '4778116501', titular_correo: 'luis@correo.mx', comision_tipo: null, comision_valor: null, comision_detalle: null }
    await abrirHoja(page, ACRED())
    await page.route('**/api/propiedades/*/interno', (r) => r.fulfill(json({ ...INTERNO, origen: ORIGEN, colaboradores: [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Laura Mendoza', empresa: null }], colaborador: null, puedeCrearColaborador: false })))
    await page.reload()
    await esperarPanel(page)
    await page.locator('[data-notas-comision="nave-mandujano"]:visible').first().click({ timeout: 30_000 })
    const bloque = page.locator('[data-colaborador-propiedad]')
    await expect(bloque).toBeVisible({ timeout: 30_000 })
    await expect(bloque.locator('option', { hasText: 'Crear colaborador nuevo' })).toHaveCount(0)
  })

  test('sin folio no hay nada que revisar: el bloque no aparece', async ({ page }) => {
    await abrirHoja(page, ACRED({ folio: null, estado: 'sin_folio', etiqueta: 'Sin folio aportado · pendiente de verificación' }))
    await expect(page.locator('[data-panel-interno]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-verificacion-acreditacion]')).toHaveCount(0)
  })

  test('si la ruta niega el acceso, no se muestra nada', async ({ page }) => {
    await abrirHoja(page, { error: 'No tienes permiso.' }, 403)
    await expect(page.locator('[data-panel-interno]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-verificacion-acreditacion]')).toHaveCount(0)
  })

  test('sin axe graves ni desborde', async ({ page }) => {
    await abrirHoja(page, ACRED())
    await expect(page.locator('[data-verificacion-acreditacion]')).toBeVisible({ timeout: 30_000 })
    expect(await GRAVES(page, '[data-verificacion-acreditacion]')).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('revisión de una propiedad (reemplaza la «Vista previa» pública que daba 404)', () => {
  const FOTOS = Array.from({ length: 6 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/muestra${i + 1}.jpg`)
  const REVISION = {
    propiedad: {
      id: 'c74434f7-a94b-4c6d-b9dc-cefb8014c007', titulo: 'QA-E48 Oficina de prueba', folio: 'VB-2026-00001', estado_pub: 'en_revision', enviada_en: '2026-10-25T22:23:10.000Z',
      tipo: 'oficina', operacion: 'renta', precio: 15000, moneda: 'MXN', precio_incluye_iva: false, metros: 86, ubicacion: 'León, Gto.', calle: 'Blvd. Campestre', colonia: 'Cañada del Refugio',
      ciudad: 'León', cp: '37358', descripcion: 'Oficina de prueba en el Bajío.\n\nSegundo párrafo de la descripción.', fotos: FOTOS, amenidades: ['Estacionamiento', 'Aire acondicionado'], completitud: 100, estatus: 'disponible',
      telefono: '4778116501',
    },
    dueno: { nombre: 'QA-E48 Publicador', email: 'qa-e48-publicador@example.com', telefono: '4778116501', whatsapp: '4778116501', rol: 'publicador', tipo_publicador: 'publicador', estado: 'activo' },
    aceptacion: { version: 'prueba-staging-1', hash: 'f3641f7e9ca9abcdef', aceptado_en: '2026-10-25T22:20:00.000Z' },
  }
  async function abrirRevision(page: Page, cuerpo: unknown = REVISION, status = 200, historial?: unknown[]) {
    await prepararPanel(page)
    if (historial) await page.route('**/api/admin/comision/operaciones**', (r) => r.fulfill(json({ operaciones: historial })))
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
    await page.route('**/api/admin/propiedades/*/revision', (r) => r.fulfill(json(cuerpo, status)))
    await page.route('**/api/propiedades/*/interno', (r) => r.fulfill(json({ origen: { origen_tipo: 'trato_directo', titular_nombre: 'Luis Gómez Ramírez', titular_empresa: null, titular_telefono: '4778116501', titular_correo: 'luis@correo.mx', comision_tipo: null, comision_valor: null, comision_detalle: null }, notas: [], subidaPor: null, veTodas: true })))
    await page.route('**/api/propiedades/*/acreditacion', (r) => r.fulfill(json({ folio: null, estado: 'sin_folio', etiqueta: 'x' })))
    await page.route('https://res.cloudinary.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ccc"/></svg>' }))
    await page.goto('/admin/propiedades/c74434f7-a94b-4c6d-b9dc-cefb8014c007/revision')
    await esperarPanel(page)
  }

  test('muestra todas las fotos, los datos completos, quién la sube, la aceptación de comisión y el origen con nombres y teléfono', async ({ page }) => {
    await abrirRevision(page)
    await expect(page.getByRole('heading', { level: 1, name: 'QA-E48 Oficina de prueba' })).toBeVisible()
    await expect(page.locator('[data-revision-fotos] img')).toHaveCount(6)
    const datos = page.locator('[data-revision-datos]')
    await expect(datos).toContainText('$15,000.00')
    await expect(datos).toContainText('más IVA')
    await expect(datos).toContainText('Blvd. Campestre')
    await expect(datos).toContainText('Segundo párrafo de la descripción.')
    await expect(datos).toContainText('Estacionamiento')
    const dueno = page.locator('[data-revision-dueno]')
    await expect(dueno).toContainText('qa-e48-publicador@example.com')
    await expect(page.locator('[data-revision-aceptacion]')).toContainText('prueba-staging-1')
    await expect(page.locator('[data-revision-aceptacion]')).toContainText('f3641f7e9ca9')
    const interno = page.locator('[data-revision-interno]')
    await expect(interno.locator('[data-panel-interno]')).toBeVisible({ timeout: 30_000 })
    await expect(interno.getByLabel('Nombre')).toHaveValue('Luis Gómez Ramírez')
    await expect(page.getByRole('link', { name: /Volver a la cola/ })).toHaveAttribute('href', '/admin/propiedades/pendientes')
    expect(await sinDesborde(page)).toBe(true)
  })

  test('muestra lo que ha dejado la propiedad: sus operaciones de comisión, lo cobrado y lo pendiente, con enlaces al motor', async ({ page }) => {
    const id = 'c74434f7-a94b-4c6d-b9dc-cefb8014c007'
    await abrirRevision(page, REVISION, 200, [
      op({ id: '77777777-7777-4777-8777-777777777777', propiedad_id: id, estado: 'confirmada', total_centavos: 1_500_000, fecha_cierre: '2026-06-01' }),
      op({ id: '88888888-8888-4888-8888-888888888888', propiedad_id: id, estado: 'registrada', total_centavos: 1_500_000, fecha_cierre: '2026-09-01' }),
    ])
    const h = page.locator('[data-historial-comisiones]')
    await expect(h).toBeVisible({ timeout: 30_000 })
    await expect(h).toContainText('2 operaciones')
    await expect(h).toContainText('cobrado $15,000')
    await expect(h).toContainText('por cobrar $15,000')
    await expect(h.getByRole('link', { name: 'Registrar un cierre' })).toHaveAttribute('href', `/admin/comisiones?nueva=1&propiedad=${id}`)
    await expect(h.getByRole('link', { name: /historial completo/ })).toHaveAttribute('href', `/admin/comisiones?historial=${id}`)
  })

  test('una propiedad sin cierres lo dice y ofrece registrarlo', async ({ page }) => {
    await abrirRevision(page, REVISION, 200, [])
    await expect(page.locator('[data-historial-comisiones]')).toContainText('Todavía no tiene cierres registrados')
  })

  test('si las operaciones no están disponibles, la revisión sigue sin ese bloque', async ({ page }) => {
    await abrirRevision(page)
    await expect(page.locator('[data-revision-datos]')).toBeVisible()
    await expect(page.locator('[data-historial-comisiones]')).toHaveCount(0)
  })

  test('una propiedad en revisión NO enlaza a la ficha pública (esa daba 404)', async ({ page }) => {
    await abrirRevision(page)
    await expect(page.getByRole('link', { name: /Ver la ficha pública/ })).toHaveCount(0)
  })

  test('sin cuenta dueña ni aceptación lo dice, y si falla la carga lo avisa', async ({ page }) => {
    await abrirRevision(page, { ...REVISION, dueno: null, aceptacion: null })
    await expect(page.locator('[data-revision-dueno]')).toContainText('propiedad de VIVE BIEN')
    await expect(page.locator('[data-revision-aceptacion]')).toContainText('ninguna registrada')
  })

  test('si la propiedad no existe, muestra el error', async ({ page }) => {
    await abrirRevision(page, { error: 'Esa propiedad no existe.' }, 404)
    await expect(page.locator('p[role="alert"]')).toContainText('no existe')
  })

  test('sin axe graves ni desborde', async ({ page }) => {
    await abrirRevision(page)
    await expect(page.locator('[data-revision-interno] [data-panel-interno]')).toBeVisible({ timeout: 30_000 })
    expect(await GRAVES(page)).toEqual([])
    expect(await sinDesborde(page)).toBe(true)
  })
})

test.describe('/admin/comisiones · Panorama (solo Super Admin)', () => {
  const dia = (atras: number) => new Date(AHORA.getTime() - atras * 86_400_000).toISOString().slice(0, 10)
  const LIBRO_PANORAMA = {
    operaciones: [
      { id: 'op-1', propiedad_id: 'p1', tipo: 'venta', base_centavos: 300_000_000, total_centavos: 12_000_000, vivebien_centavos: 6_000_000, colaborador_centavos: 6_000_000, colaborador_retenido_centavos: 0, reparto_estado: 'liberable', estado: 'confirmada', creado_en: `${dia(20)}T10:00:00Z`, fecha_cierre: dia(20), propiedad_folio: 'VB-1', propiedad_titulo: 'Casa Centro', gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }] },
      { id: 'op-2', propiedad_id: 'p2', tipo: 'renta', base_centavos: 2_800_000, total_centavos: 2_800_000, vivebien_centavos: 2_800_000, colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'registrada', creado_en: `${dia(45)}T10:00:00Z`, fecha_cierre: dia(45), propiedad_folio: 'VB-2', propiedad_titulo: 'Bodega Centro', gastos: [] },
    ],
    movimientos: [{ id: 'g1', fecha: dia(10), sentido: 'sale', clase: 'gasto', monto_centavos: 150_000, categoria: 'publicidad_digital', cuenta_id: null, propiedad_id: 'p1', operacion_id: null, concepto: 'Meta Ads campaña', referencia: null, reverso_de: null, motivo: null, creado_por: 'super@vivebien.test', creado_en: `${dia(10)}T10:00:00Z` }],
    cuentas: [], etiquetasDePropiedad: {}, truncado: false,
    propiedades: { p1: { tipo: 'casa', subtipo: null, operacion: 'venta', colonia: 'Centro', ciudad: 'León' }, p2: { tipo: 'bodega', subtipo: null, operacion: 'renta', colonia: 'Centro', ciudad: 'León' } },
  }
  async function abrirPanorama(page: Page, superAdmin: boolean) {
    await prepararPanel(page)
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin })))
    const libros: string[] = []
    const asesor: Array<Record<string, unknown>> = []
    await page.route('**/api/admin/comision/**', (r) => r.fulfill(json(r.request().url().includes('contexto') ? CTX() : { operaciones: [] })))
    await page.route('**/api/admin/contabilidad/libro', (r) => { libros.push(r.request().url()); return r.fulfill(json(LIBRO_PANORAMA)) })
    await page.route('**/api/admin/contabilidad/asesor', (r) => {
      if (r.request().method() !== 'POST') return r.fulfill(json({ configurada: true }))
      asesor.push(JSON.parse(r.request().postData() || '{}'))
      return r.fulfill(json({ texto: 'Diagnóstico\nLa casa deja más que la bodega.\nHallazgos:\n1. La promoción rinde.\nAcciones\n- Sigue invirtiendo en casas.', modelo: 'mercury-3', generado_en: AHORA.toISOString() }))
    })
    await page.goto('/admin/comisiones')
    await esperarPanel(page)
    return { libros, asesor }
  }
  test('un admin que no es Super Admin no ve la pestaña ni se pide el libro contable', async ({ page }) => {
    const { libros } = await abrirPanorama(page, false)
    await expect(pestana(page, 'Panorama')).toHaveCount(0)
    expect(libros).toEqual([])
  })
  test('KPI, tablas por tipo y por operación, comprobaciones que cuadran y el asesor con el modo «panorama»', async ({ page }) => {
    const { asesor } = await abrirPanorama(page, true)
    await pestana(page, 'Panorama').click()
    const p = page.locator('[data-panorama]')
    await expect(p.locator('[data-kpi="Comisiones"]')).toContainText('$148,000.00')
    await expect(p.locator('[data-por-operacion]')).toContainText('Venta')
    await expect(p.locator('[data-por-tipo] [data-tabla-grupos="tipo"]')).toContainText('Casa')
    await expect(p.locator('[data-por-tipo] [data-tabla-grupos="tipo"]')).toContainText('Bodega')
    await expect(p.locator('[data-comprobaciones]')).toBeVisible()
    await expect(p.locator('[data-comprobacion][data-ok="no"]').filter({ hasText: /suma/i })).toHaveCount(0)
    await expect(p.getByRole('img', { name: /Comisión neta y promoción por tipo/ })).toBeVisible()
    const chat = p.locator('[data-chat-asesor]')
    await chat.getByRole('button', { name: 'Analiza todo este panorama' }).click()
    await expect(chat.locator('[data-burbuja="asesor"]').last()).toContainText('La casa deja más que la bodega')
    expect(asesor[0]).toMatchObject({ modo: 'panorama' })
  })
  test('el periodo cambia las cifras y sin axe graves ni desborde', async ({ page }) => {
    await abrirPanorama(page, true)
    await pestana(page, 'Panorama').click()
    await page.locator('[data-panorama-periodo]').selectOption('mes')
    await expect(page.locator('[data-panorama] [data-kpi="Comisiones"]')).not.toContainText('$148,000.00')
    expect(await (async () => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id))()).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  })
})
