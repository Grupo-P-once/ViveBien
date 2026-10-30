import { test, expect } from '@playwright/test'
import { prepararPaginaPublica, esperarQuieta } from './ayudas'

/**
 * Capturas base del SITIO PÚBLICO.
 *
 * Existen para una cosa concreta: el rediseño del panel instala shadcn/ui, que
 * trae estilos base, y `globals.css` es compartido con el sitio público. Estas
 * capturas se tomaron ANTES de instalar nada; si después de instalarlo alguna
 * no coincide, el panel se está colando en el sitio.
 */

const PAGINAS = [
  { nombre: 'portada', ruta: '/' },
  { nombre: 'catalogo', ruta: '/propiedades' },
  // E-37: ficha PÚBLICA estable (datos públicos congelados en la fixtura; ninguna propiedad inventada).
  { nombre: 'ficha', ruta: '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl' },
  { nombre: 'ficha-pausada', ruta: '/propiedades/sanjuan' }, // D-59: la visibilidad pública está pausada, la ficha responde 404 (ese ES el estado verdadero)
  { nombre: 'nosotros', ruta: '/nosotros' },
  { nombre: 'valuador', ruta: '/valuador' },
  { nombre: 'contacto', ruta: '/contacto' },
]

for (const p of PAGINAS) {
  test(`sitio público · ${p.nombre}`, async ({ page }) => {
    await prepararPaginaPublica(page)
    await page.goto(p.ruta)
    await esperarQuieta(page)
    await expect(page).toHaveScreenshot(`${p.nombre}.png`)
  })
}
