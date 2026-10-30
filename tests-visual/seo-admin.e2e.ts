import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { esperarPanel, prepararPanel } from './ayudas-panel'
import { PERFIL } from './datos-panel'

/**
 * Apartado «SEO» del panel (Super Admin, 22-oct-2026). Navegador REAL contra el build local; sesión y API simuladas (ver `ayudas-panel.ts`):
 * nada sale a internet ni toca la base. Las exportaciones de Search Console son las REALES del propietario (cobertura del 15-oct-2026).
 */
const CAPTURAS = join(process.env.EVIDENCIA_DIR || join(process.cwd(), 'evidencia-seo'), 'seo')
mkdirSync(CAPTURAS, { recursive: true })
const csv = (n: string) => ({ name: n.replace('cobertura-', '').replace('.csv', '') + '.csv', mimeType: 'text/csv', buffer: readFileSync(`tests/fixtures/seo/${n}`) })
const json = (c: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(c) })

const AUDITORIA = {
  origen: 'https://preview.test', cual: 'propio', alcance: 'rapida', generado: '2026-10-22T18:00:00.000Z', duracionMs: 31000,
  resumen: { paginas: 3, porGravedad: { critica: 1, alta: 1, media: 1, baja: 0 }, indice: 62, msMedio: 140, con200: 2 },
  hallazgos: [
    { id: 'http-5xx', gravedad: 'critica', ruta: '/rota', mensaje: 'Error del servidor (503).', evidencia: 'HTTP 503', correccion: 'Corregir el error.' },
    { id: 'sin-canonica', gravedad: 'alta', ruta: '/nosotros', mensaje: 'Falta la URL canónica.', evidencia: 'No hay <link rel="canonical">', correccion: 'Declarar la canónica propia.' },
    { id: 'sin-descripcion', gravedad: 'media', ruta: '/contacto', mensaje: 'Falta la meta descripción.', evidencia: 'No hay meta description', correccion: 'Escribir un resumen único.' },
  ],
  paginas: [
    { ruta: '/', estado: 200, redireccion: null, ms: 120, enSitemap: true, titulo: 'Vive Bien', noindex: false, jsonld: ['RealEstateAgent'] },
    { ruta: '/nosotros', estado: 200, redireccion: null, ms: 160, enSitemap: true, titulo: 'Nosotros', noindex: false, jsonld: [] },
    { ruta: '/rota', estado: 503, redireccion: null, ms: 140, enSitemap: false, titulo: null, noindex: false, jsonld: [] },
  ],
  omitidas: ['/admin (robots.txt)'], sitemaps: [{ url: 'https://preview.test/sitemap.xml', estado: 200, tipo: 'urlset', urls: 72, conLastmod: 28 }],
}
const ROBOTS = {
  origen: 'https://preview.test', cual: 'propio', generado: '2026-10-22T18:00:00.000Z',
  robots: { grupos: [{ agentes: ['*'], permite: ['/'], niega: ['/admin', '/api'], retraso: null }], sitemaps: ['https://vivebienn.com/sitemap.xml'] },
  rastreadores: [{ agente: 'Googlebot', tipo: 'Buscador (Google)', estado: 'permitido' }, { agente: 'GPTBot', tipo: 'IA de OpenAI: entrenamiento', estado: 'bloqueado' }, { agente: 'ClaudeBot', tipo: 'IA de Anthropic: entrenamiento', estado: 'parcial' }],
  sitemaps: [{ url: 'https://preview.test/sitemap.xml', estado: 200, tipo: 'urlset', urls: 72, conLastmod: 28 }],
}
const NEGOCIO = {
  origen: 'https://preview.test', cual: 'propio', generado: '2026-10-22T18:00:00.000Z',
  negocio: { nombre: 'VIVE BIEN Grupo Inmobiliario', telefono: '477 811 6501', direccion: 'Blvd. Campestre 2910, Local 10, Cañada del Refugio, León, Gto. 37358', horario: 'Lun – Vie: 9:00 – 18:00 | Sáb – Dom: 11:00 – 14:00', coordenadas: { lat: 21.1530178, lng: -101.7283955 } },
  comprobaciones: [
    { campo: 'Teléfono (datos estructurados)', esperado: '+524778116501', encontrado: '+524778116501', estado: 'ok' },
    { campo: 'Horario (datos estructurados)', esperado: 'Se declara solo cuando esté confirmado', encontrado: null, estado: 'falta', nota: 'A propósito no se publica.' },
  ],
  observadoGoogleMaps: { fecha: '2026-10-22', nombre: 'VIVE BIEN GRUPO INMOBILIARIO', categoria: 'Agencia inmobiliaria', direccion: '37358, Cañada del Refugio, 37358 León de los Aldama, Gto.', telefono: '477 811 6501', sitio: 'vivebienn.com', horario: 'Abierto · Cierra a las 5:30 p.m. (jueves)', codigoPlus: '573C+6J León de los Aldama, Guanajuato', coordenadas: { lat: 21.1530178, lng: -101.7283955 } },
  avisoDireccion: 'La dirección operativa (Blvd. Campestre 2910 Local 10 o 2502 Int. 201) sigue pendiente de confirmar por el propietario.',
}

async function entrar(page: Page, ruta: string, { superAdmin = true } = {}) {
  await prepararPanel(page)
  await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin })))
  const pedidas: string[] = []
  await page.route('**/api/admin/seo/**', (r) => {
    const u = r.request().url(); pedidas.push(u)
    if (u.includes('/auditoria')) return r.fulfill(json(AUDITORIA))
    if (u.includes('/robots')) return r.fulfill(json(ROBOTS))
    if (u.includes('/negocio')) return r.fulfill(json(NEGOCIO))
    return r.fulfill({ status: 404, body: '{}' })
  })
  await page.goto(ruta)
  await esperarPanel(page)
  return pedidas
}
const sinDesborde = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const GRAVES = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)

test.describe('SEO · menú y acceso', () => {
  test('el grupo «SEO» aparece solo para Super Admin y lleva a sus 6 páginas', async ({ page }) => {
    await entrar(page, '/admin/seo')
    const ancho = page.viewportSize()!.width
    if (ancho < 1024) await page.getByRole('button', { name: /Abrir|menú|Toggle Sidebar/i }).first().click().catch(() => {})
    const nav = page.getByRole('navigation', { name: 'Panel de administración' })
    await expect(nav.getByRole('button', { name: 'SEO' })).toBeVisible()
    for (const t of ['Resumen', 'Indexación', 'Rendimiento', 'Salud técnica', 'Robots y sitemap', 'Negocio y local']) await expect(nav.getByRole('link', { name: t })).toBeAttached()
  })
  test('un admin que NO es Super Admin no ve el grupo en el menú', async ({ page }) => {
    await entrar(page, '/admin', { superAdmin: false })
    const ancho = page.viewportSize()!.width
    if (ancho < 1024) await page.getByRole('button', { name: /Abrir|menú|Toggle Sidebar/i }).first().click().catch(() => {})
    await expect(page.getByRole('navigation', { name: 'Panel de administración' }).getByRole('button', { name: 'SEO' })).toHaveCount(0)
  })
  test('SEC-9 · un admin que NO es Super Admin y abre la URL de SEO ve el aviso, sin la pantalla y sin pedir datos (todas las páginas de la sección)', async ({ page }) => {
    const pedidas = await entrar(page, '/admin', { superAdmin: false }) // se entra por el tablero: el aviso no lleva h1 y `esperarPanel` espera uno
    for (const ruta of ['/admin/seo', '/admin/seo/indexacion', '/admin/seo/rendimiento', '/admin/seo/salud', '/admin/seo/robots', '/admin/seo/negocio', '/admin/seo/tareas', '/admin/seo/ia']) {
      await page.goto(ruta)
      await expect(page.getByRole('alert').filter({ hasText: 'sólo para Super Admin' }), ruta).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: /Auditoría rápida|Importar CSV/i }), ruta).toHaveCount(0)
    }
    expect(pedidas, 'un admin común no debe disparar peticiones a /api/admin/seo').toEqual([])
  })
  test('SEC-9 · el Super Admin SÍ ve la pantalla de SEO completa (el guardia no la rompe)', async ({ page }) => {
    await entrar(page, '/admin/seo')
    await expect(page.getByText('Resumen de SEO')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'sólo para Super Admin' })).toHaveCount(0)
  })
  test('si la API responde 403 se muestra el mensaje, no una pantalla vacía', async ({ page }) => {
    await prepararPanel(page)
    await page.route('**/api/usuarios/me', (r) => r.fulfill(json({ ...PERFIL, superAdmin: true })))
    await page.route('**/api/admin/seo/robots*', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Tu cuenta no puede hacer eso."}' }))
    await page.goto('/admin/seo/robots'); await esperarPanel(page)
    // Next añade su propio anunciador de rutas con role="alert": se filtra por el texto del error.
    await expect(page.getByRole('alert').filter({ hasText: 'Tu cuenta no puede hacer eso.' })).toBeVisible()
  })
})

test.describe('SEO · Resumen, Indexación y Rendimiento con exportaciones reales de Search Console', () => {
  test('importar la cobertura real muestra 54 indexadas, 16 sin indexar y 3 motivos por corregir', async ({ page }) => {
    await entrar(page, '/admin/seo')
    await expect(page.getByText('Aún no hay datos de Search Console')).toBeVisible()
    await page.getByLabel('Importar archivos CSV de Search Console').setInputFiles([csv('cobertura-grafico.csv'), csv('cobertura-problemas-criticos.csv')])
    await expect(page.locator('[data-kpi="Páginas indexadas"]')).toContainText('54')
    await expect(page.locator('[data-kpi="Sin indexar"]')).toContainText('16')
    await expect(page.locator('[data-kpi="Sin indexar"]')).toContainText('3 por corregir')
    await expect(page.getByRole('list', { name: 'Archivos importados' })).toContainText('grafico.csv')
    await expect(page.getByText(/Search Console: «Soft 404»/)).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-resumen.png`), fullPage: true })
  })
  test('Indexación: 7 motivos; redirección y noindex salen «Normal»; 404 y soft 404 «Revisar»; hay gráfica accesible', async ({ page }) => {
    await entrar(page, '/admin/seo/indexacion')
    await page.getByLabel('Importar archivos CSV de Search Console').setInputFiles([csv('cobertura-grafico.csv'), csv('cobertura-problemas-criticos.csv')])
    const tabla = page.getByRole('table', { name: 'Motivos de no indexación' })
    await expect(tabla.getByRole('row')).toHaveCount(8)   // encabezado + 7
    await expect(tabla.getByRole('row', { name: /Página con redirección/ })).toContainText('Normal')
    await expect(tabla.getByRole('row', { name: /noindex/ })).toContainText('Normal')
    await expect(tabla.getByRole('row', { name: /Soft 404/ })).toContainText('Revisar')
    await expect(page.getByRole('img', { name: /indexadas 54, sin indexar 16/ })).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-indexacion.png`), fullPage: true })
  })
  test('lo importado se recuerda al cambiar de página y se puede quitar', async ({ page }) => {
    await entrar(page, '/admin/seo/indexacion')
    await page.getByLabel('Importar archivos CSV de Search Console').setInputFiles([csv('cobertura-problemas-criticos.csv')])
    await expect(page.getByRole('table', { name: 'Motivos de no indexación' })).toBeVisible()
    await page.reload(); await esperarPanel(page)
    await expect(page.getByRole('table', { name: 'Motivos de no indexación' })).toBeVisible()
    await page.getByRole('button', { name: 'Quitar lo importado' }).click()
    await expect(page.getByText('Sin motivos importados')).toBeVisible()
  })
  test('Rendimiento: lee consultas y páginas en español y propone oportunidades (heurística)', async ({ page }) => {
    await entrar(page, '/admin/seo/rendimiento')
    const consultas = 'Consultas principales,Clics,Impresiones,CTR,Posición\ncasas en león,1,200,"0,5%","9,2"\nnaves industriales león,12,300,4%,3.1\nterrenos silao,0,40,0%,18\n'
    const paginas = 'Páginas principales,Clics,Impresiones,CTR,Posición\nhttps://vivebienn.com/,13,500,2.6%,4.4\n'
    await page.getByLabel('Importar archivos CSV de Search Console').setInputFiles([{ name: 'Consultas.csv', mimeType: 'text/csv', buffer: Buffer.from(consultas) }, { name: 'Páginas.csv', mimeType: 'text/csv', buffer: Buffer.from(paginas) }])
    await expect(page.locator('[data-kpi="Clics"]')).toContainText('1')
    const op = page.getByRole('table', { name: 'Oportunidades' })
    await expect(op).toContainText('casas en león'); await expect(op).toContainText('terrenos silao')
    await expect(op).not.toContainText('naves industriales león')   // 4 % de CTR: ya rinde
    await expect(page.getByRole('table', { name: 'Páginas principales' })).toContainText('https://vivebienn.com/')
    expect(await GRAVES(page)).toEqual([])
  })
  test('un archivo que no es de Search Console se rechaza con un mensaje claro', async ({ page }) => {
    await entrar(page, '/admin/seo')
    await page.getByLabel('Importar archivos CSV de Search Console').setInputFiles([{ name: 'otro.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2\n') }, { name: 'datos.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }])
    await expect(page.getByRole('status').filter({ hasText: 'No reconozco estos encabezados' })).toBeVisible()
    await expect(page.getByText(/no es un CSV/)).toBeVisible()
  })
})

test.describe('SEO · Salud técnica, Robots y Negocio', () => {
  test('la auditoría pide el origen elegido, muestra hallazgos por gravedad y se puede filtrar', async ({ page }) => {
    const pedidas = await entrar(page, '/admin/seo/salud')
    await page.getByLabel('Producción (vivebienn.com)').check()
    await page.getByRole('button', { name: /Auditoría rápida/ }).click()
    await expect(page.locator('[data-kpi="Críticas"]')).toContainText('1')
    expect(pedidas.some((u) => u.includes('origen=produccion') && u.includes('alcance=rapida'))).toBe(true)
    const t = page.getByRole('table', { name: 'Hallazgos de la auditoría' })
    await expect(t.getByRole('row')).toHaveCount(4)
    await page.getByRole('button', { name: 'Altas' }).click()
    await expect(t.getByRole('row')).toHaveCount(2)
    await expect(t).toContainText('Falta la URL canónica.')
    await expect(page.getByRole('table', { name: 'Páginas revisadas' })).toContainText('503')
    await expect(page.getByText(/Omitidas: \/admin \(robots\.txt\)/)).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-salud.png`), fullPage: true })
  })
  test('Robots y sitemap: reglas, rastreadores de IA con su estado y cobertura de «lastmod»', async ({ page }) => {
    await entrar(page, '/admin/seo/robots')
    await expect(page.getByRole('table', { name: 'Rastreadores' }).getByRole('row', { name: /GPTBot/ })).toContainText('Bloqueado')
    await expect(page.getByRole('table', { name: 'Rastreadores' }).getByRole('row', { name: /ClaudeBot/ })).toContainText('Parcial')
    await expect(page.getByRole('table', { name: 'Sitemaps' })).toContainText('28 (39 %)')
    await expect(page.getByRole('table', { name: 'Sitemaps' })).toContainText('44 URL sin «lastmod»')
    await expect(page.getByText(/Google indica que no usa llms\.txt/)).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })
  test('Negocio y local: lo del sitio, lo observado en Google Maps y las diferencias (dirección sin calle y horario)', async ({ page }) => {
    await entrar(page, '/admin/seo/negocio')
    await expect(page.getByRole('note')).toContainText('2502 Int. 201')
    const t = page.getByRole('table', { name: 'Sitio contra Google Maps' })
    await expect(t.getByRole('row', { name: /Teléfono/ })).toContainText('Coincide')
    await expect(t.getByRole('row', { name: /Dirección/ })).toContainText('Es distinto')
    await expect(t.getByRole('row', { name: /Dirección/ })).toContainText('no tiene la calle')
    await expect(t.getByRole('row', { name: /Horario/ })).toContainText('Es distinto')
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-negocio.png`), fullPage: true })
  })
})

test.describe('SEO · Rendimiento en vivo (Fase B, con la API simulada)', () => {
  test('sin configuración muestra qué falta y deja importar CSV', async ({ page }) => {
    await entrar(page, '/admin/seo/rendimiento')
    await page.route('**/api/admin/seo/gsc*', (r) => r.fulfill(json({ configurado: false, faltan: ['GSC_SITE_URL'] })))
    await page.getByRole('button', { name: 'Traer de Search Console' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Falta: GSC_SITE_URL' })).toBeVisible()
    await expect(page.getByLabel('Importar archivos CSV de Search Console')).toBeAttached()
    expect(await GRAVES(page)).toEqual([])
  })
  test('configurado trae consultas, páginas y fechas, usa el periodo elegido y calcula oportunidades', async ({ page }) => {
    await entrar(page, '/admin/seo/rendimiento')
    const pedidas: string[] = []
    await page.route('**/api/admin/seo/gsc*', (r) => {
      const u = new URL(r.request().url()); pedidas.push(`${u.searchParams.get('dimension')}:${u.searchParams.get('dias')}`)
      const d = u.searchParams.get('dimension')
      const filas = d === 'query'
        ? [{ clave: 'valuador', clics: 0, impresiones: 16, ctr: 0, posicion: 9.2 }, { clave: 'vive inmobiliaria', clics: 3, impresiones: 11, ctr: 27, posicion: 2 }]
        : d === 'page' ? [{ clave: 'https://vivebienn.com/', clics: 8, impresiones: 95, ctr: 8.4, posicion: 5 }] : [{ clave: '2026-10-19', clics: 3, impresiones: 24, ctr: 12.5, posicion: 7 }]
      return r.fulfill(json({ configurado: true, generado: '2026-10-23T08:00:00Z', dimension: d, rango: { desde: '2026-09-23', hasta: '2026-10-20', dias: 90 }, filas }))
    })
    await page.getByLabel('Periodo de Search Console').selectOption('90')
    await page.getByRole('button', { name: 'Traer de Search Console' }).click()
    await expect(page.getByText('Del 2026-09-23 al 2026-10-20 · en vivo')).toBeVisible()
    expect(pedidas.sort()).toEqual(['date:90', 'page:90', 'query:90'])
    await expect(page.locator('[data-kpi="Clics"]')).toContainText('3')
    await expect(page.getByRole('table', { name: 'Oportunidades' })).toContainText('valuador')
    await expect(page.getByRole('table', { name: 'Oportunidades' })).not.toContainText('vive inmobiliaria')
    await expect(page.getByRole('table', { name: 'Páginas principales' })).toContainText('https://vivebienn.com/')
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-rendimiento-vivo.png`), fullPage: true })
  })
  test('si Google falla se ve el error con «Reintentar»', async ({ page }) => {
    await entrar(page, '/admin/seo/rendimiento')
    await page.route('**/api/admin/seo/gsc*', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"No se pudo consultar Search Console. Revisa que la cuenta de servicio sea usuaria de la propiedad."}' }))
    await page.getByRole('button', { name: 'Traer de Search Console' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo consultar Search Console' }).first()).toBeVisible()
  })
})

test.describe('SEO · Fase C: Qué hacer, IA y respuestas e historial (API simulada)', () => {
  const T = (o: object) => ({ id: '3f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', titulo: 'Agregar h1 al catálogo', detalle: null, area: 'tecnico', prioridad: 'alta', estado: 'pendiente', evidencia: 'Revisión 23-oct', creada_por: 'su@x.com', creada_en: '2026-10-23T10:00:00Z', resuelta_en: null, ...o })

  test('Qué hacer: lista abiertas por prioridad, agrega una tarea y cambia su estado', async ({ page }) => {
    await entrar(page, '/admin/seo')
    let tareas = [T({}), T({ id: '4f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', titulo: 'Corregir horario en Maps', prioridad: 'baja', area: 'local' }), T({ id: '5f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', titulo: 'Tarea ya cerrada', estado: 'hecha' })]
    const enviados: Array<{ m: string; b: unknown }> = []
    await page.route('**/api/admin/seo/tareas', async (r) => {
      const m = r.request().method(); const b = m === 'GET' ? null : JSON.parse(r.request().postData() || '{}'); enviados.push({ m, b })
      if (m === 'POST') { tareas = [T({ id: '6f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', ...(b as object) }), ...tareas]; return r.fulfill(json({ tarea: tareas[0] })) }
      if (m === 'PATCH') { tareas = tareas.map((t) => (t.id === (b as { id: string }).id ? { ...t, estado: (b as { estado: string }).estado } : t)); return r.fulfill(json({ tarea: tareas[0] })) }
      return r.fulfill(json({ tareas }))
    })
    await page.goto('/admin/seo/tareas'); await esperarPanel(page)
    const abiertas = page.getByRole('list', { name: 'Tareas abiertas' })
    await expect(abiertas.getByRole('listitem')).toHaveCount(2)
    await expect(abiertas.getByRole('listitem').first()).toContainText('Agregar h1 al catálogo')   // prioridad alta antes que baja
    await expect(page.getByRole('list', { name: 'Tareas cerradas' })).toHaveCount(0)               // las cerradas empiezan ocultas
    await page.getByLabel('Título').fill('Añadir lastmod real al sitemap')
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await expect(page.getByText('Tarea agregada.')).toBeVisible()
    expect(enviados.find((x) => x.m === 'POST')?.b).toMatchObject({ titulo: 'Añadir lastmod real al sitemap', area: 'tecnico', prioridad: 'media' })
    await expect(abiertas.getByRole('listitem')).toHaveCount(3)
    await page.getByLabel('Estado de «Corregir horario en Maps»').selectOption('hecha')
    await expect(abiertas.getByRole('listitem')).toHaveCount(2)
    expect(enviados.find((x) => x.m === 'PATCH')?.b).toEqual({ id: '4f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', estado: 'hecha' })
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-tareas.png`), fullPage: true })
  })

  test('IA y respuestas: registra una observación y la borra', async ({ page }) => {
    await entrar(page, '/admin/seo')
    let lista = [{ id: '7f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', prompt: 'mejores naves industriales en León', motor: 'chatgpt', aparece: false, cita_url: null, nota: 'No salió', observado_en: '2026-10-22' }]
    let enviado: unknown = null
    await page.route('**/api/admin/seo/prompts*', async (r) => {
      const m = r.request().method()
      if (m === 'POST') { enviado = JSON.parse(r.request().postData() || '{}'); lista = [{ id: '8f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6', cita_url: null, nota: null, ...(enviado as object) } as never, ...lista]; return r.fulfill(json({ prompt: lista[0] })) }
      if (m === 'DELETE') { const id = new URL(r.request().url()).searchParams.get('id'); lista = lista.filter((o) => o.id !== id); return r.fulfill(json({ ok: true })) }
      return r.fulfill(json({ prompts: lista }))
    })
    await page.goto('/admin/seo/ia'); await esperarPanel(page)
    await expect(page.locator('[data-kpi="Con VIVE BIEN citada"]')).toContainText('0 de 1')
    await page.getByLabel('Pregunta').fill('casas en venta en León Gto')
    await page.getByLabel('¿Aparece VIVE BIEN?').selectOption('si')
    await page.getByRole('button', { name: 'Registrar', exact: true }).click()
    await expect(page.getByText('Observación registrada.')).toBeVisible()
    expect(enviado).toMatchObject({ prompt: 'casas en venta en León Gto', motor: 'chatgpt', aparece: true })
    await expect(page.locator('[data-kpi="Con VIVE BIEN citada"]')).toContainText('1 de 2')
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.getByRole('button', { name: /Borrar observación «casas en venta/ }).click()
    await expect(page.locator('[data-kpi="Observaciones"]')).toContainText('1')
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-ia.png`), fullPage: true })
  })

  test('Rendimiento: guarda una foto del historial con el periodo elegido y la muestra', async ({ page }) => {
    await entrar(page, '/admin/seo')
    let fotos: object[] = []
    let enviado: unknown = null
    await page.route('**/api/admin/seo/historial', async (r) => {
      if (r.request().method() === 'POST') {
        enviado = JSON.parse(r.request().postData() || '{}')
        fotos = [{ id: 'a1', tomado_en: '2026-10-23T16:00:00Z', periodo_dias: 90, rango_desde: '2026-07-24', rango_hasta: '2026-10-20', clics: 11, impresiones: 254, ctr: 4.331, posicion: 15.5 }]
        return r.fulfill(json({ foto: fotos[0] }))
      }
      return r.fulfill(json({ fotos }))
    })
    await page.goto('/admin/seo/rendimiento'); await esperarPanel(page)
    await expect(page.getByRole('table', { name: 'Historial de cifras' })).toHaveCount(0)
    await expect(page.getByText('Aún no hay fotos')).toBeVisible()
    await page.getByLabel('Periodo de Search Console').selectOption('90')
    await page.getByRole('button', { name: 'Guardar foto (90 días)' }).click()
    await expect(page.getByText('Foto guardada.')).toBeVisible()
    expect(enviado).toEqual({ dias: 90 })       // solo el periodo: las cifras las calcula el servidor
    const t = page.getByRole('table', { name: 'Historial de cifras' })
    await expect(t).toContainText('254'); await expect(t).toContainText('4.3 %'); await expect(t).toContainText('2026-07-24 → 2026-10-20 (90 d)')
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
  })

  test('con la migración pendiente se ve el mensaje claro, no una pantalla rota', async ({ page }) => {
    await entrar(page, '/admin/seo')
    await page.route('**/api/admin/seo/tareas', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Esta función necesita la migración 37 de la base de datos, que todavía no está aplicada.","codigo":"migracion_pendiente"}' }))
    await page.goto('/admin/seo/tareas'); await esperarPanel(page)
    await expect(page.getByRole('alert').filter({ hasText: 'migración 37' }).first()).toBeVisible()
  })

  test('el menú de Super Admin trae las dos entradas nuevas', async ({ page }) => {
    await entrar(page, '/admin/seo')
    if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: /Abrir|menú|Toggle Sidebar/i }).first().click().catch(() => {})
    const nav = page.getByRole('navigation', { name: 'Panel de administración' })
    for (const t of ['Qué hacer', 'IA y respuestas']) await expect(nav.getByRole('link', { name: t })).toBeAttached()
  })
})

test.describe('Métricas · Google Analytics para Super Admin (API simulada)', () => {
  const GA = {
    configurado: true, generado: '2026-10-24T10:00:00Z', propiedad: '531571829', dias: 28,
    totales: { usuarios: 120, usuariosNuevos: 90, sesiones: 150, vistas: 480, interaccion: 62.3, duracionMedia: 74 },
    porDia: [{ fecha: '2026-10-21', usuarios: 3, sesiones: 4 }, { fecha: '2026-10-22', usuarios: 5, sesiones: 6 }],
    canales: [{ clave: 'Organic Search', a: 100, b: 80 }, { clave: 'Direct', a: 50, b: 40 }],
    paginas: [{ clave: '/', a: 200, b: 90 }, { clave: '/propiedades', a: 90, b: 50 }],
    eventos: [{ clave: 'click_whatsapp', a: 14, b: 9 }, { clave: 'generate_lead', a: 3, b: 3 }, { clave: 'page_view', a: 480, b: 120 }, { clave: 'evento_raro', a: 1, b: 1 }],
  }

  test('muestra visitantes, contactos, canales, páginas y acciones con nombres claros', async ({ page }) => {
    await entrar(page, '/admin/seo')
    const pedidas: string[] = []
    await page.route('**/api/admin/analitica/ga*', (r) => { pedidas.push(r.request().url()); return r.fulfill(json(GA)) })
    await page.goto('/admin/metricas'); await esperarPanel(page)
    await expect(page.getByRole('heading', { name: 'Google Analytics' })).toBeVisible()
    await expect(page.locator('[data-kpi="Visitantes"]')).toContainText('120')
    await expect(page.locator('[data-kpi="Visitas (sesiones)"]')).toContainText('150')
    await expect(page.locator('[data-kpi="Tiempo por visita"]')).toContainText('1 min 14 s')
    await expect(page.locator('[data-kpi="Clic en WhatsApp"]')).toContainText('14')
    await expect(page.locator('[data-kpi="Formulario enviado (lead)"]')).toContainText('3')
    await expect(page.getByRole('table', { name: 'Canales de adquisición' })).toContainText('Organic Search')
    await expect(page.getByRole('table', { name: 'Páginas más vistas' })).toContainText('/propiedades')
    const ev = page.getByRole('table', { name: 'Eventos de Google Analytics' })
    await expect(ev).toContainText('Clic en WhatsApp'); await expect(ev).toContainText('evento_raro')
    expect(pedidas[0]).toContain('dias=28')
    await page.getByLabel('Periodo de Google Analytics').selectOption('7')
    await expect.poll(() => pedidas.some((u) => u.includes('dias=7'))).toBe(true)
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-metricas-ga.png`), fullPage: true })
  })

  test('sin conexión dice qué falta; con Google rechazando dice qué hacer', async ({ page }) => {
    await entrar(page, '/admin/seo')
    let modo: 'falta' | 'acceso' = 'falta'
    await page.route('**/api/admin/analitica/ga*', (r) => (modo === 'falta'
      ? r.fulfill(json({ configurado: false, faltan: ['GSC_SITE_URL'] }))
      : r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"Falta agregar la cuenta de servicio como «Lector» en la propiedad de Google Analytics.","codigo":"sin_acceso"}' })))
    await page.goto('/admin/metricas'); await esperarPanel(page)
    await expect(page.getByRole('status').filter({ hasText: 'Falta: GSC_SITE_URL' })).toBeVisible()
    modo = 'acceso'
    await page.getByRole('button', { name: 'Actualizar Google Analytics' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Lector' }).first()).toBeVisible()
  })

  test('un admin que NO es Super Admin no ve la sección ni la pide al servidor', async ({ page }) => {
    await entrar(page, '/admin', { superAdmin: false })
    let pidio = false
    await page.route('**/api/admin/analitica/ga*', (r) => { pidio = true; return r.fulfill(json(GA)) })
    await page.goto('/admin/metricas'); await esperarPanel(page)
    await expect(page.getByRole('heading', { name: 'Google Analytics' })).toHaveCount(0)
    expect(pidio).toBe(false)
  })
})

test.describe('Métricas · Rendimiento por propiedad (administración, API simulada)', () => {
  const P = (id: string, nombre: string, extra: object = {}) => ({
    id, folio: 'VB-' + id, nombre, tipo: 'casa', operacion: 'venta', estado: 'publicada', precio: 1000000, diasPublicada: 30, vistas: 5, vistasAnteriores: 5, cambioVistas: 0,
    tarjeta: 2, whatsapp: 0, telefono: 0, correo: 0, contactos: 0, solicitudes: 0, guardadas: 0, contactosPor100: 0, vistasHistorico: 5, senal: 'bien', ...extra,
  })
  const DATOS = {
    dias: 30, faltan: [],
    totales: { propiedades: 3, vistas: 40, tarjeta: 21, contactos: 5, solicitudes: 2, sinVistas: 1, contactosPor100: 17.5 },
    propiedades: [
      P('a', 'Nave industrial Mandujano', { vistas: 30, cambioVistas: 20, tarjeta: 12, whatsapp: 3, telefono: 1, contactos: 4, solicitudes: 2, guardadas: 5, contactosPor100: 20, senal: 'bien' }),
      P('b', 'Casa en Cañada', { vistas: 10, cambioVistas: -50, tarjeta: 9, whatsapp: 1, contactos: 1, contactosPor100: 10, senal: 'sin_contacto' }),
      P('c', 'Terreno Silao', { vistas: 0, cambioVistas: null, tarjeta: 0, contactosPor100: null, senal: 'sin_vistas' }),
    ],
  }

  test('muestra totales, cada propiedad con su cambio y su señal, y se puede ordenar', async ({ page }) => {
    await entrar(page, '/admin/seo')
    const pedidas: string[] = []
    await page.route('**/api/admin/analitica/propiedades*', (r) => { pedidas.push(r.request().url()); return r.fulfill(json(DATOS)) })
    await page.goto('/admin/metricas'); await esperarPanel(page)
    await expect(page.getByRole('heading', { name: 'Rendimiento por propiedad' })).toBeVisible()
    await expect(page.locator('[data-kpi="Vistas de fichas"]')).toContainText('40')
    await expect(page.locator('[data-kpi="Contactos por 100 vistas"]')).toContainText('17.5')
    const tabla = page.getByRole('table', { name: 'Rendimiento por propiedad' })
    const filas = tabla.getByRole('row')
    await expect(filas).toHaveCount(4)                                              // encabezado + 3
    await expect(filas.nth(1)).toContainText('Nave industrial Mandujano')           // por vistas, de mayor a menor
    await expect(filas.nth(1)).toContainText('▲ 20 %')
    await expect(tabla.getByRole('row', { name: /Casa en Cañada/ })).toContainText('▼ 50 %')
    await expect(tabla.getByRole('row', { name: /Casa en Cañada/ })).toContainText('Muchas vistas, sin contacto')
    await expect(tabla.getByRole('row', { name: /Terreno Silao/ })).toContainText('Sin vistas')
    // Se ordena por nombre (el botón del encabezado de la TABLA; «Propiedades» del menú es otro botón).
    await tabla.getByRole('button', { name: 'Propiedad', exact: true }).click()
    await tabla.getByRole('button', { name: 'Propiedad', exact: true }).click()
    await expect(tabla.getByRole('columnheader', { name: /^Propiedad/ })).toHaveAttribute('aria-sort', /ascending|descending/)
    await page.getByLabel('Periodo del rendimiento por propiedad').selectOption('7')
    await expect.poll(() => pedidas.some((u) => u.includes('dias=7'))).toBe(true)
    expect(await sinDesborde(page)).toBe(true)
    expect(await GRAVES(page)).toEqual([])
    await page.screenshot({ path: join(CAPTURAS, `${test.info().project.name}-metricas-propiedades.png`), fullPage: true })
  })
})
