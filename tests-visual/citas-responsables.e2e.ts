import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { esperarPanel, prepararPanel } from './ayudas-panel'
import { PERFIL } from './datos-panel'

/**
 * «Responsables de citas» (decisión del dueño, 9-nov-2026): quién atiende las visitas de cada propiedad. Navegador REAL contra el build local; sesión y API simuladas
 * (`ayudas-panel.ts`): nada sale a internet ni toca la base. Lo que se comprueba es lo que ve y envía la persona: no la lógica del servidor (eso lo cubren
 * `citas-responsables-ruta` y `citas-responsables-db`).
 */
const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
type Propiedad = { id: string; titulo: string; publicada: boolean; responsableUid: string | null; duenoUid: string | null; duenoNombre: string | null; efectivo: { uid: string; nombre: string; origen: string } | null }
type Datos = { equipo: { uid: string; nombre: string; atiende: boolean } | null; titularAutomatico?: { uid: string; nombre: string } | null; candidatos: Array<{ uid: string; nombre: string; rol: string }>; propiedades: Propiedad[] }

const base = (): Datos => ({
  equipo: { uid: 'adm', nombre: 'Ana Admin', atiende: true },
  titularAutomatico: { uid: 'adm', nombre: 'Ana Admin' },
  candidatos: [{ uid: 'adm', nombre: 'Ana Admin', rol: 'admin' }, { uid: 'ase', nombre: 'Beto Asociado', rol: 'publicador' }],
  propiedades: [
    { id: 'p1', titulo: 'Nave A', publicada: true, responsableUid: null, duenoUid: 'pub', duenoNombre: 'Carla Publicadora', efectivo: { uid: 'adm', nombre: 'Ana Admin', origen: 'equipo' } },
    { id: 'p2', titulo: 'Casa B', publicada: false, responsableUid: null, duenoUid: 'adm', duenoNombre: 'Ana Admin', efectivo: { uid: 'adm', nombre: 'Ana Admin', origen: 'dueno' } },
    { id: 'p3', titulo: 'Local C', publicada: true, responsableUid: 'ase', duenoUid: 'pub', duenoNombre: 'Carla Publicadora', efectivo: { uid: 'ase', nombre: 'Beto Asociado', origen: 'asignado' } },
  ],
})

async function entrar(page: Page, o: { datos?: Datos; put?: (c: Record<string, unknown>) => { status: number; cuerpo: unknown } } = {}) {
  await prepararPanel(page)
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: false })))
  const puts: Array<Record<string, unknown>> = []
  let datos = o.datos ?? base()
  await page.route('**/api/admin/citas/responsables', async (r) => {
    if (r.request().method() === 'PUT') {
      const cuerpo = JSON.parse(r.request().postData() || '{}') as Record<string, unknown>
      puts.push(cuerpo)
      const res = o.put ? o.put(cuerpo) : { status: 200, cuerpo: { ok: true } }
      if (res.status === 200 && cuerpo.ambito === 'propiedad') {
        datos = { ...datos, propiedades: datos.propiedades.map((p) => p.id === cuerpo.propiedadId ? { ...p, responsableUid: cuerpo.a as string | null } : p) }
      }
      return r.fulfill(json(res.cuerpo, res.status))
    }
    return r.fulfill(json(datos))
  })
  await page.goto('/admin/citas/responsables')
  await esperarPanel(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Propiedades' })).toBeVisible({ timeout: 15_000 })
  return { puts }
}

test.describe('Responsables de citas', () => {
  test('muestra al responsable del equipo, cada propiedad con quien la atiende y su origen, sin botones activos hasta que algo cambia', async ({ page }) => {
    await entrar(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Responsables de citas' })).toBeVisible()
    await expect(page.locator('#responsable-equipo')).toHaveValue('adm')
    await expect(page.getByText('Atiende: Ana Admin (responsable del equipo)')).toBeVisible()
    await expect(page.getByText('Atiende: Ana Admin (el dueño)')).toBeVisible()
    await expect(page.getByText('Atiende: Beto Asociado (responsable asignado)')).toBeVisible()
    await expect(page.locator('#resp-p3')).toHaveValue('ase')
    for (const nombre of [/Guardar el responsable de Nave A/, /Guardar el responsable de Local C/]) await expect(page.getByRole('button', { name: nombre })).toBeDisabled()
  })

  test('asignar a una propiedad pide el motivo, manda lo que la pantalla VIO como «antes» y enseña lo que quedó guardado', async ({ page }) => {
    const { puts } = await entrar(page)
    await page.locator('#resp-p1').selectOption('ase')
    const guardar = page.getByRole('button', { name: /Guardar el responsable de Nave A/ })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole('button', { name: 'Guardar cambio' })).toBeDisabled() // sin motivo no se guarda
    await dialogo.getByLabel(/Motivo/).fill('El asociado atiende las visitas de esta nave')
    await dialogo.getByRole('button', { name: 'Guardar cambio' }).click()
    await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
    expect(puts).toEqual([{ ambito: 'propiedad', propiedadId: 'p1', antes: null, a: 'ase', motivo: 'El asociado atiende las visitas de esta nave' }])
    await expect(page.locator('#resp-p1')).toHaveValue('ase') // vuelve a leer la lista
  })

  test('si otra persona cambió la asignación (409) se dice con claridad y se vuelve a leer lo que quedó', async ({ page }) => {
    await entrar(page, { put: () => ({ status: 409, cuerpo: { error: 'Otra persona cambió esta asignación mientras la mirabas. Recarga la página para ver cómo quedó.', codigo: 'conflicto' } }) })
    await page.locator('#resp-p2').selectOption('ase')
    await page.getByRole('button', { name: /Guardar el responsable de Casa B/ }).click()
    await page.getByRole('dialog').getByLabel(/Motivo/).fill('Cambio de responsable por vacaciones')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambio' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /Otra persona cambió/ })).toBeVisible()
  })

  test('sin responsable del equipo configurado atiende el TITULAR AUTOMÁTICO y la pantalla lo dice (ya no hay «sin asesor» por falta de configuración)', async ({ page }) => {
    const datos = base()
    datos.equipo = null
    datos.propiedades[0].efectivo = { uid: 'adm', nombre: 'Ana Admin', origen: 'automatico' }
    await entrar(page, { datos })
    await expect(page.getByText('Atiende: Ana Admin (titular automático del equipo)')).toBeVisible()
    await expect(page.getByText(/las atiende automáticamente Ana Admin/)).toBeVisible()
    await expect(page.getByText(/Nadie atiende todavía/)).toHaveCount(0)
  })

  test('una propiedad sin nadie que atienda lo dice (no puede recibir citas)', async ({ page }) => {
    const datos = base()
    datos.propiedades[0].efectivo = null
    await entrar(page, { datos })
    await expect(page.getByText(/Nadie atiende todavía/)).toBeVisible()
  })

  test('cambiar al responsable del equipo también pide motivo y envía el ámbito «equipo»', async ({ page }) => {
    const { puts } = await entrar(page)
    await page.locator('#responsable-equipo').selectOption('ase')
    await page.getByRole('button', { name: 'Guardar', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel(/Motivo/).fill('Cambia quien coordina las visitas del equipo')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambio' }).click()
    await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
    expect(puts[0]).toMatchObject({ ambito: 'equipo', antes: 'adm', a: 'ase' })
  })

  test('sin desborde horizontal y sin violaciones graves ni críticas de accesibilidad', async ({ page }) => {
    await entrar(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    const graves = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(graves).toEqual([])
  })

  test('el calendario del equipo enlaza a esta pantalla (la función es alcanzable)', async ({ page }) => {
    await prepararPanel(page)
    await page.goto('/admin/citas')
    await esperarPanel(page)
    await expect(page.getByRole('link', { name: 'Responsables de citas' })).toHaveAttribute('href', '/admin/citas/responsables')
  })
})
