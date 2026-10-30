import { expect, type Page } from '@playwright/test'

/**
 * El panel de cada rol (portal o administración) es una barra lateral fija desde 1024 px y un CAJÓN por debajo
 * (MOBILE_BREAKPOINT de `hooks/use-mobile.ts`): ahí la barra «existe» pero solo se ve al abrirla con su botón.
 */
const ancho = (page: Page) => page.viewportSize()?.width ?? 1440
const boton = (page: Page) => page.getByRole('button', { name: 'Mostrar u ocultar el menú' }).first()

/** El marco del rol está puesto: barra visible (escritorio) o su botón de menú (cajón). Nunca el «Panel del publicador» antiguo. */
export async function barraVisible(page: Page, nombre: 'Tu portal' | 'Panel de administración') {
  if (ancho(page) < 1024) await expect(boton(page)).toBeVisible({ timeout: 30_000 })
  else await expect(page.getByRole('navigation', { name: nombre })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Panel del publicador' })).toHaveCount(0)
}

/** Deja la barra abierta para poder usar sus enlaces (en escritorio ya lo está). */
export async function abrirBarra(page: Page, nombre: 'Tu portal' | 'Panel de administración') {
  const nav = page.getByRole('navigation', { name: nombre })
  if (ancho(page) < 1024 && !(await nav.first().isVisible().catch(() => false))) await boton(page).click()
  await expect(nav).toBeVisible({ timeout: 15_000 })
}
