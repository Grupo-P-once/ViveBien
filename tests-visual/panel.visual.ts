import { expect, test } from '@playwright/test'
import { esperarPanel, prepararPanel } from './ayudas-panel'

/**
 * Capturas del panel de administración.
 *
 * Con sesión simulada y datos fijos (ver `ayudas-panel.ts`): ninguna petición
 * llega a la base, y la captura sólo cambia si cambia el diseño.
 */

test.beforeEach(async ({ page }) => {
  await prepararPanel(page)
})

test('panel · dashboard', async ({ page }) => {
  await page.goto('/admin')
  await esperarPanel(page)
  await expect(page).toHaveScreenshot('panel-dashboard.png', { fullPage: true })
})

test('panel · actividad', async ({ page }) => {
  await page.goto('/admin/actividad')
  await esperarPanel(page)
  await expect(page).toHaveScreenshot('panel-actividad.png', { fullPage: true })
})

test('panel · registros', async ({ page }) => {
  await page.goto('/admin/registros')
  await esperarPanel(page)
  await expect(page).toHaveScreenshot('panel-registros.png', { fullPage: true })
  // Las ocho columnas tienen que caber sin que la tabla se salga de su tarjeta:
  // si la última se va fuera, en una captura no se nota y aquí sí. Va DESPUÉS de
  // la captura: mirar la columna desplaza la tabla y saldría torcida.
  const fecha = page.getByRole('button', { name: 'Ordenar por Fecha' })
  if (await fecha.count()) {
    await fecha.scrollIntoViewIfNeeded()
    await expect(fecha).toBeInViewport()
  }
})

test('panel · alta manual de registro', async ({ page }) => {
  await page.goto('/admin/registros')
  await esperarPanel(page)
  await page.getByRole('button', { name: /Agregar manualmente/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page).toHaveScreenshot('panel-alta-manual.png')
})

test('panel · usuarios', async ({ page }) => {
  await page.goto('/admin/usuarios')
  await esperarPanel(page)
  await expect(page).toHaveScreenshot('panel-usuarios.png', { fullPage: true })
})

test('panel · invitar a alguien', async ({ page }) => {
  await page.goto('/admin/usuarios')
  await esperarPanel(page)
  await page.getByRole('button', { name: /Nuevo usuario/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page).toHaveScreenshot('panel-invitar.png')
})

test('panel · propiedades', async ({ page }) => {
  await page.goto('/admin/propiedades')
  await esperarPanel(page)
  await expect(page).toHaveScreenshot('panel-propiedades.png', { fullPage: true })
})

test('panel · notificaciones abiertas', async ({ page }) => {
  await page.goto('/admin')
  await esperarPanel(page)
  await page.getByRole('button', { name: /Notificaciones/ }).click()
  await expect(page.getByText('Por revisar: Local comercial Centro Max')).toBeVisible()
  await page.waitForTimeout(400)
  await expect(page).toHaveScreenshot('panel-notificaciones.png')
})

test('panel · búsqueda global', async ({ page }) => {
  await page.goto('/admin')
  await esperarPanel(page)
  await page.getByRole('button', { name: /Buscar propiedades/ }).click()
  await page.getByPlaceholder(/Nombre, folio/).fill('nave')
  await expect(page.getByRole('dialog').getByText('Nave industrial Mandujano')).toBeVisible()
  await page.waitForTimeout(600)
  await expect(page).toHaveScreenshot('panel-busqueda.png')
})
