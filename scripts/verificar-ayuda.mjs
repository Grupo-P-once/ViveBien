/**
 * QA del Centro de Ayuda (V-1.1.94, fase 3c-3).
 *
 * Contra el CONTENIDO REAL de producción: la migración 27 ya está aplicada,
 * así que esto lee lo que de verdad hay. No hay datos de prueba ni inventados.
 *
 * SALE CON CÓDIGO ≠ 0 SI ALGO FALLA. Es una prueba, no un informe.
 *
 * Lo que más importa no es que se vea bien: es que **no se filtre nada**.
 * Hay cuatro ámbitos en la misma tabla y tres son internos. Por eso se
 * comprueba dos veces —por la API y por la pantalla— y con los dos roles.
 *
 *   node scripts/verificar-ayuda.mjs [http://localhost:3110]
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://localhost:3110'
const SALIDA = 'docs/fase-3/capturas/ayuda'
const TAMANOS = [['escritorio', 1440, 900], ['tableta', 834, 1194], ['movil', 390, 844]]

const problemas = []
const fallo = (t) => { problemas.push(t); console.log(`   FALLO · ${t}`) }
const bien = (t) => console.log(`   ok · ${t}`)

const env = await readFile('.env.local', 'utf8')
const v = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const SUPA = v('NEXT_PUBLIC_SUPABASE_URL')
const ANON = v('NEXT_PUBLIC_SUPABASE_ANON_KEY')

await mkdir(SALIDA, { recursive: true })

/* ── 1 · Lo que la API deja ver a quien no ha entrado ─────────────────── */

console.log('\n── 1 · RLS: lo que ve `anon` por la API ──')

const comoAnon = async (ruta) => {
  const r = await fetch(`${SUPA}/rest/v1/${ruta}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  const j = await r.json().catch(() => null)
  return { http: r.status, filas: Array.isArray(j) ? j : null }
}

const arts = await comoAnon('knowledge_articles?select=slug,ambito,estado,estado_producto,aviso')
const cats = await comoAnon('knowledge_categories?select=slug,ambito')

if (!arts.filas || !cats.filas) {
  fallo('no se pudo consultar la API como anon')
} else {
  const fugas = arts.filas.filter((a) => a.ambito !== 'publica' || a.estado !== 'PUBLICADO')
  if (fugas.length) fallo(`${fugas.length} artículos filtrados: ${fugas.map((f) => `${f.ambito}/${f.estado}`).join(', ')}`)
  else bien(`${arts.filas.length} artículos visibles, todos publica/PUBLICADO`)

  const futuros = arts.filas.filter((a) => a.estado_producto === 'futuro')
  if (futuros.length) fallo(`${futuros.length} artículos «futuro» visibles: ${futuros.map((f) => f.slug).join(', ')}`)
  else bien('ningún artículo «futuro» es visible')

  const sinAviso = arts.filas.filter((a) => a.estado_producto !== 'disponible' && !a.aviso?.trim())
  if (sinAviso.length) fallo(`${sinAviso.length} no disponibles SIN aviso: ${sinAviso.map((s) => s.slug).join(', ')}`)
  else bien(`los ${arts.filas.filter((a) => a.estado_producto !== 'disponible').length} parciales visibles llevan su aviso`)

  const catsInternas = cats.filas.filter((c) => c.ambito !== 'publica')
  if (catsInternas.length) fallo(`categorías internas visibles: ${catsInternas.map((c) => c.slug).join(', ')}`)
  else bien(`${cats.filas.length} categorías visibles, ninguna interna`)
}

for (const t of ['knowledge_article_versions', 'knowledge_article_sources', 'knowledge_searches', 'knowledge_change_events', 'knowledge_feedback']) {
  const r = await comoAnon(`${t}?select=id`)
  const cerrado = r.http >= 400 || r.filas?.length === 0
  if (cerrado) bien(`${t}: cerrado`)
  else fallo(`${t}: ${r.filas?.length} filas visibles para anon`)
}

const escritura = await fetch(`${SUPA}/rest/v1/knowledge_articles`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'intruso', titulo: 'X' }),
})
if (escritura.status >= 400) bien(`escribir un artículo como anon: rechazado (${escritura.status})`)
else fallo(`¡anon pudo escribir un artículo! HTTP ${escritura.status}`)

/* ── 2 · Las cuatro rutas, en tres tamaños ────────────────────────────── */

const navegador = await chromium.launch()

const RUTAS = [
  ['portada', '/ayuda'],
  ['categoria', '/ayuda/mi-cuenta'],
  ['articulo', '/ayuda/mi-cuenta/como-iniciar-sesion'],
  ['articulo-parcial', '/ayuda/busquedas-y-alertas/como-funcionan-las-alertas'],
  ['buscar', '/ayuda/buscar?q=guardar'],
  ['buscar-sin-resultados', '/ayuda/buscar?q=zzzznoexiste'],
]

console.log('\n── 2 · Las rutas en escritorio, tableta y móvil ──')

for (const [id, ruta] of RUTAS) {
  for (const [nombre, ancho, alto] of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } })
    const p = await ctx.newPage()
    const errores = []
    p.on('pageerror', (e) => errores.push(e.message))

    const res = await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await p.waitForTimeout(600)
    await p.screenshot({ path: `${SALIDA}/${id}-${nombre}.png`, fullPage: true })

    const r = await p.evaluate(() => ({
      desborda: document.documentElement.scrollWidth - window.innerWidth,
      migas: document.querySelector('[aria-label="Dónde estás"]') !== null,
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
      enlaceAyudaEnMenu: [...document.querySelectorAll('a[href="/ayuda"]')].length,
      texto: document.body.innerText,
    }))

    const axe = await new AxeBuilder({ page: p }).analyze()
    const graves = axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')

    const linea = `${id.padEnd(22)} ${nombre.padEnd(11)}`
    if (res?.status() !== 200) fallo(`${linea} HTTP ${res?.status()}`)
    if (r.desborda > 0) fallo(`${linea} desborda ${r.desborda}px`)
    if (graves.length) fallo(`${linea} axe: ${graves.map((x) => x.id).join(', ')}`)
    if (errores.length) fallo(`${linea} JS: ${errores[0].slice(0, 70)}`)
    if (r.texto.includes('No pudimos consultar')) fallo(`${linea} sirvió la copia: no llegó a la base`)

    // El aviso del artículo parcial es lo que impide que parezca disponible.
    if (id === 'articulo-parcial' && !r.texto.includes('Todavía no te mandamos un correo')) {
      fallo(`${linea} el artículo parcial NO enseña su aviso`)
    }
    if (id !== 'portada' && !r.migas) fallo(`${linea} sin migas de pan`)
    if (['portada', 'articulo'].includes(id) && r.jsonLd === 0) fallo(`${linea} sin JSON-LD`)
    if (id === 'buscar-sin-resultados' && !r.texto.includes('No encontramos nada')) {
      fallo(`${linea} sin salida cuando no hay resultados`)
    }

    console.log(`  ${linea} HTTP ${res?.status()}  desborde ${r.desborda}  axe ${graves.length}  js ${errores.length}  jsonLd ${r.jsonLd}`)
    await ctx.close()
  }
}

/* ── 3 · Lo que NO debe existir públicamente ──────────────────────────── */

console.log('\n── 3 · 404 para lo que no es público ──')

const DEBEN_SER_404 = [
  ['categoría de ámbito publicador', '/ayuda/publicadores'],
  ['artículo de ámbito publicador', '/ayuda/publicadores/tu-panel-de-publicador'],
  ['artículo futuro en borrador', '/ayuda/consultas-y-visitas/google-calendar'],
  ['artículo futuro en borrador (2)', '/ayuda/vender-o-rentar/como-solicitar-ser-publicador'],
  ['categoría inventada', '/ayuda/no-existe'],
  ['slug con mayúsculas', '/ayuda/Mi-Cuenta'],
]

const ctx404 = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
for (const [que, ruta] of DEBEN_SER_404) {
  const p = await ctx404.newPage()
  const res = await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  if (res?.status() === 404) bien(`${que}: 404`)
  else fallo(`${que} (${ruta}) devolvió ${res?.status()}, no 404`)
  await p.close()
}
await ctx404.close()

/* ── 4 · Los 31 publicados, cada uno en su sitio ──────────────────────── */

console.log('\n── 4 · Todos los artículos públicos responden ──')

const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const pagina = await ctx.newPage()
const visibles = await comoAnon('knowledge_articles?select=slug,knowledge_categories!inner(slug)&ambito=eq.publica&estado=eq.PUBLICADO')
let vistos = 0
for (const a of visibles.filas ?? []) {
  const cat = a.knowledge_categories?.slug
  if (!cat) { fallo(`el artículo «${a.slug}» no tiene categoría`); continue }
  const res = await pagina.goto(`${BASE}/ayuda/${cat}/${a.slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  if (res?.status() === 200) vistos++
  else fallo(`/ayuda/${cat}/${a.slug} devolvió ${res?.status()}`)
}
bien(`${vistos} de ${visibles.filas?.length ?? 0} artículos públicos responden 200`)

/* ── 5 · Sitemap ──────────────────────────────────────────────────────── */

console.log('\n── 5 · Sitemap ──')
const sm = await (await fetch(`${BASE}/sitemap.xml`)).text()
const enSitemap = [...sm.matchAll(/<loc>([^<]*\/ayuda[^<]*)<\/loc>/g)].map((m) => m[1])
if (enSitemap.some((u) => u.endsWith('/ayuda'))) bien('/ayuda está')
else fallo('/ayuda no está en el sitemap')
// Coincidencia EXACTA: `includes` daba un falso positivo porque la categoría
// `buscar-propiedades` empieza igual que la ruta del buscador.
if (enSitemap.some((u) => u.replace(/\/$/, '').endsWith('/ayuda/buscar'))) fallo('/ayuda/buscar NO debería estar en el sitemap')
else bien('/ayuda/buscar fuera del sitemap, como debe')
for (const interno of ['publicadores', 'google-calendar', 'como-solicitar-ser-publicador']) {
  if (enSitemap.some((u) => u.includes(interno))) fallo(`«${interno}» anunciado en el sitemap`)
  else bien(`«${interno}» no se anuncia`)
}
console.log(`   rutas de ayuda en el sitemap: ${enSitemap.length}`)

/* ── 6 · El enlace desde el sitio ─────────────────────────────────────── */

console.log('\n── 6 · Integración en la navegación ──')
for (const [nombre, ancho, alto] of TAMANOS) {
  const c = await navegador.newContext({ viewport: { width: ancho, height: alto } })
  const p = await c.newPage()
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await p.waitForTimeout(500)
  const n = await p.locator('a[href="/ayuda"]').count()
  if (n > 0) bien(`${nombre}: ${n} enlace(s) al Centro desde la portada`)
  else fallo(`${nombre}: la portada no enlaza al Centro`)
  await c.close()
}

await navegador.close()
await writeFile(`${SALIDA}/qa.json`, JSON.stringify({ base: BASE, problemas, cuando: new Date().toISOString() }, null, 2))

console.log(`\n${'─'.repeat(60)}`)
if (problemas.length) {
  console.log(`${problemas.length} PROBLEMA(S):`)
  for (const p of problemas) console.log(` · ${p}`)
  process.exit(1)
}
console.log('QA DEL CENTRO DE AYUDA: TODO CORRECTO')
