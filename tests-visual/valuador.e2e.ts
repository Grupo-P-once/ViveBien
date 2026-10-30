import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acotarTerceros } from './ayudas-red'

/**
 * Valuador rehecho: flujo en pasos, validación, resultado, «insuficiente», avance conservado, accesibilidad y desbordes, en 390 y 1440 (y los demás
 * anchos del proyecto). `/api/valuador` va SIMULADA para probar la interfaz con datos deterministas (la lógica de cálculo la cubren
 * `tests/valuador-estimar.test.ts` y `tests/valuador-ruta.test.ts`). No se manda ni se guarda nada real.
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-valuador'), 'valuador')
mkdirSync(CAPTURAS, { recursive: true })

const comps = [24000, 25000, 25500, 26000].map((ppm, i) => ({ id: `p${i}`, slug: `casa-${i}`, etiqueta: `Casa ${i + 1} en Campestre`, colonia: 'Campestre', metros: 150, precio: ppm * 150, ppm, similitud: 0.9, parecido: ['misma colonia', 'tamaño parecido'] }))
const ESTIMADO = {
  entrada: { operacion: 'venta', tipo: 'casa', colonia: 'Campestre', metros: 150, recamaras: 3, banos: 2 },
  resultado: { estado: 'estimado', rango: { min: 3_600_000, central: 3_770_000, max: 3_900_000 }, ppm: { min: 24000, mediana: 25100, max: 26000 },
    confianza: { nivel: 'medio', puntos: 5, motivos: ['4 comparables (lo ideal son 6 o más)', '4 de tu misma colonia', 'precios muy parecidos entre sí'] },
    comparables: comps, total_considerados: 4, descartados_atipicos: 0, factores: ['Valor por m² de referencia: mediana ponderada de 4 comparables.'], faltantes: ['Más anuncios comparables de tu zona (precios de cierre reales mejorarían mucho la estimación).'] },
  fecha: '2026-10-21T12:00:00.000Z', aviso: 'Estimación orientativa de mercado basada en precios de oferta de VIVE BIEN. No es un avalúo oficial, hipotecario ni certificado.',
}
const INSUFICIENTE = { ...ESTIMADO, resultado: { estado: 'insuficiente', motivo: 'Solo hay 1 anuncio comparable en VIVE BIEN y para este tipo de inmueble se necesitan al menos 3.', comparables_encontrados: 1, minimo_requerido: 3, faltantes: [] } }

async function abrir(page: Page, respuesta: unknown = ESTIMADO) {
  await acotarTerceros(page)
  await page.route('**/api/valuador', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { colonias: [{ nombre: 'Campestre', n: 6 }, { nombre: 'Cañada del Refugio', n: 3 }], conteo: { 'venta:casa': 6 } } })
    return route.fulfill({ json: respuesta })
  })
  await page.goto('/valuador')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Valuador')
  await page.evaluate(() => sessionStorage.removeItem('vivebien:valuador'))
  await page.reload()
  await expect(page.locator('#val-t1')).toBeVisible()
}
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test.describe('valuador · flujo en pasos', () => {
  test('recorre los 3 pasos y muestra una estimación explicada, sin pedir contacto antes', async ({ page }) => {
    await abrir(page)
    // sin teléfono ni correo en ningún paso previo al resultado
    expect(await page.locator('input[type="tel"], input[type="email"]').count()).toBe(0)
    await expect(page.getByText('Paso 1 de 3')).toBeVisible()
    await page.getByLabel('Venta', { exact: true }).check({ force: true })
    await page.getByLabel('Casa', { exact: true }).check({ force: true })
    await expect(page.getByRole('status').filter({ hasText: /Hoy hay 6 anuncios/ })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.locator('#val-t2')).toBeFocused()
    await page.getByLabel('Colonia o fraccionamiento').fill('Campestre')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.locator('#val-t3')).toBeFocused()
    expect(await page.locator('input[type="tel"], input[type="email"]').count()).toBe(0)
    await page.getByLabel(/Superficie construida/).fill('150')
    await page.getByLabel(/Recámaras/).fill('3')
    await page.getByRole('button', { name: /Ver estimación/ }).click()
    await expect(page.locator('#val-tr')).toBeFocused()
    await expect(page.getByText(/Entre|–/).first()).toBeVisible()
    await expect(page.locator('.val-rango')).toContainText('$3,600,000')
    await expect(page.locator('.val-rango')).toContainText('$3,900,000')
    await expect(page.locator('.val-confianza')).toContainText('Confianza media')
    await expect(page.locator('.val-comps li')).toHaveCount(4)
    await expect(page.locator('.val-aviso')).toContainText('Esto no es un avalúo')
    await expect(page.locator('.val-aviso a[href*="leon.gob.mx"]')).toHaveAttribute('target', '_blank')
    // el contacto es opcional y posterior: aparece DESPUÉS del resultado y el formulario sigue cerrado
    await expect(page.getByRole('link', { name: /Hablar con un asesor por WhatsApp/ })).toHaveAttribute('href', /wa\.me\/52/)
    expect(await page.locator('input[type="tel"]').count()).toBe(0)
    await page.getByRole('button', { name: /Prefiero que me llamen/ }).click()
    await expect(page.getByRole('button', { name: 'Enviar mis datos' })).toBeDisabled()   // sin consentimiento no se envía
    expect(await sinDesborde(page)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, 'resultado.png'), fullPage: true })
  })

  test('valida cada paso: mensaje claro, foco en el campo y nada avanza sin lo necesario', async ({ page }) => {
    await abrir(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Elige si quieres estimar una venta o una renta.')).toBeVisible()
    await expect(page.getByText('Elige el tipo de inmueble.')).toBeVisible()
    await expect(page.locator('#val-t1')).toBeVisible()
    await page.getByLabel('Renta mensual').check({ force: true })
    await page.getByLabel('Terreno', { exact: true }).check({ force: true })
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText(/Escribe tu colonia o marca/)).toBeVisible()
    await expect(page.getByLabel('Colonia o fraccionamiento')).toBeFocused()
    await page.getByLabel(/No la encuentro/).check()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByLabel(/Superficie del terreno/)).toBeVisible()      // un terreno no pregunta por recámaras
    await expect(page.getByLabel(/Recámaras/)).toHaveCount(0)
    await page.getByRole('button', { name: /Ver estimación/ }).click()
    await expect(page.getByText(/Escribe la superficie en m²/)).toBeVisible()
  })

  test('sin comparables suficientes NO muestra una cifra y ofrece revisión humana', async ({ page }) => {
    await abrir(page, INSUFICIENTE)
    await page.getByLabel('Venta', { exact: true }).check({ force: true })
    await page.getByLabel('Casa', { exact: true }).check({ force: true })
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel(/No la encuentro/).check()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel(/Superficie construida/).fill('150')
    await page.getByRole('button', { name: /Ver estimación/ }).click()
    await expect(page.locator('#val-tr')).toContainText('no podemos')
    await expect(page.locator('.val-vacio')).toContainText('se necesitan al menos 3')
    await expect(page.locator('.val-rango')).toHaveCount(0)
    await expect(page.locator('.val-medidor')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Ver propiedades similares/ })).toHaveAttribute('href', '/propiedades?op=venta&tipo=casa')
    await expect(page.locator('.val-btn-verde')).toBeVisible()
  })

  test('conserva el avance al volver y al recargar (solo en esta pestaña)', async ({ page }) => {
    await abrir(page)
    await page.getByLabel('Venta', { exact: true }).check({ force: true })
    await page.getByLabel('Departamento', { exact: true }).check({ force: true })
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel('Colonia o fraccionamiento').fill('Cañada del Refugio')
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page.getByLabel('Departamento', { exact: true })).toBeChecked()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByLabel('Colonia o fraccionamiento')).toHaveValue('Cañada del Refugio')
    await page.reload()
    await expect(page.locator('.val-paso-n')).toContainText('Paso 2 de 3')
    await expect(page.getByLabel('Colonia o fraccionamiento')).toHaveValue('Cañada del Refugio')
  })

  test('accesibilidad (axe) en el paso 1 y en el resultado: sin críticas ni serias, contraste incluido', async ({ page }) => {
    await abrir(page)
    for (const etapa of ['paso 1', 'resultado']) {
      if (etapa === 'resultado') {
        await page.getByLabel('Venta', { exact: true }).check({ force: true }); await page.getByLabel('Casa', { exact: true }).check({ force: true })
        await page.getByRole('button', { name: 'Continuar' }).click(); await page.getByLabel(/No la encuentro/).check()
        await page.getByRole('button', { name: 'Continuar' }).click(); await page.getByLabel(/Superficie construida/).fill('150')
        await page.getByRole('button', { name: /Ver estimación/ }).click(); await expect(page.locator('#val-tr')).toBeVisible()
      }
      const r = await new AxeBuilder({ page }).analyze()
      const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${etapa} · ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
      expect(graves).toEqual([])
    }
  })

  test('la página se ve completa sin desbordes y con un solo h1', async ({ page }) => {
    await abrir(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('[data-seccion="val-info"]')).toContainText('Lo que no es')
    expect(await sinDesborde(page)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, 'paso1.png'), fullPage: true })
  })
})
