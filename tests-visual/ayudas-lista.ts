import { expect, type Locator, type Page } from '@playwright/test'

/**
 * La lista «Mis propiedades» de Publicador y Asociado (R8.5) es la misma tabla que la de Admin: una fila por propiedad en pantallas
 * anchas y una tarjeta en el teléfono; las acciones salen del menú «Más acciones para …» de cada fila.
 */
export const fila = (page: Page, titulo: string): Locator => page.locator('tr:visible, li:visible').filter({ hasText: titulo }).first()

/** Abre el menú de la fila y devuelve el elemento de menú con ese nombre (sin pulsarlo). */
export async function itemDeMenu(page: Page, titulo: string, nombre: RegExp | string): Promise<Locator> {
  await fila(page, titulo).getByRole('button', { name: /Más acciones para/ }).click()
  return page.getByRole('menuitem', { name: nombre })
}

/** Pulsa una acción del menú de la fila. */
export async function accion(page: Page, titulo: string, nombre: RegExp | string) {
  const item = await itemDeMenu(page, titulo, nombre)
  await expect(item).toBeVisible()
  await item.click()
}
