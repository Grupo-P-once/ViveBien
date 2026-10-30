// Capturas y MEDIDAS de la vista previa del portal (3b-1, V-1.1.85).
//
//   1. En otra terminal:  npx next dev -p 3109
//   2. Aquí:              node scripts/capturas-portal.mjs
//
// Diez pantallas × tres casos × tres tamaños. No se mira si «se ve bien»: se
// mide el desborde horizontal, cuántas columnas tiene la rejilla de tarjetas y
// si axe encuentra violaciones graves (D-28.7, D-32).
//
// Bloquea —y ANOTA— cualquier intento de hablar con algo real: la API del
// sitio, Supabase, Firebase, Cloudinary y la analítica. Si la vista previa
// intentara pedir datos, guardar o avisar, el script termina con error.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3109'
const SALIDA = 'docs/fase-3/capturas'
// Los tres tamaños acordados: 1440×834, 834×1194 y 390×844.
const TAMANOS = [['escritorio', 1440, 834], ['tableta', 834, 1194], ['movil', 390, 844]]
const PANTALLAS = [
  'inicio', 'guardadas', 'busquedas', 'alertas', 'consultas',
  'me-interesan', 'visitas', 'perfil', 'mi-busqueda', 'configuracion',
]
const CASOS = ['lleno', 'vacio']

const DATOS_REALES = /\/api\/|supabase\.co|firestore\.googleapis|identitytoolkit|securetoken\.googleapis|res\.cloudinary\.com|api\.cloudinary\.com/
const ANALITICA = /googletagmanager\.com|google-analytics\.com/

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch()
const intentos = []
const analitica = []
const resultados = []

/** Columnas de verdad de la primera rejilla de tarjetas (se cuentan por su posición). */
const columnasDeLaRejilla = (pagina) => pagina.evaluate(() => {
  const rejilla = [...document.querySelectorAll('ul, div')].find((e) => {
    const s = getComputedStyle(e)
    return s.display === 'grid' && e.querySelectorAll('article').length >= 2
  })
  if (!rejilla) return null
  const arriba = [...rejilla.querySelectorAll('article')].map((a) => Math.round(a.getBoundingClientRect().top))
  return arriba.filter((t) => t === arriba[0]).length
})

async function ver(caso, pantalla, nombre, ancho, alto) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 })
  const pagina = await ctx.newPage()
  await pagina.route('**/*', (ruta) => {
    const url = ruta.request().url()
    if (DATOS_REALES.test(url)) { intentos.push(`${caso}/${pantalla}/${nombre}: ${ruta.request().method()} ${url}`); return ruta.abort() }
    if (ANALITICA.test(url)) { analitica.push(url); return ruta.abort() }
    return ruta.continue()
  })
  const errores = []
  pagina.on('pageerror', (e) => errores.push(e.message))

  const r = await pagina.goto(`${BASE}/vista-previa/portal?caso=${caso}&pantalla=${pantalla}`, { waitUntil: 'networkidle', timeout: 90_000 })
  await pagina.waitForTimeout(700)

  const marca = await pagina.getByText('Vista previa · datos de prueba').count()
  const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const columnas = await columnasDeLaRejilla(pagina)
  const { violations } = await new AxeBuilder({ page: pagina }).analyze()
  const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

  const archivo = `${SALIDA}/${pantalla}-${caso}-${ancho}.png`
  await pagina.screenshot({ path: archivo, fullPage: true })
  resultados.push({
    pantalla, caso, tamano: `${nombre} ${ancho}`, http: r?.status(), marca: marca > 0,
    desborde, columnas, axeGraves: graves.length,
    axeQue: graves.map((v) => v.id).join(' ') || '—',
    errores: errores.length, archivo,
  })
  await ctx.close()
}

for (const caso of CASOS) {
  for (const pantalla of PANTALLAS) {
    for (const [nombre, ancho, alto] of TAMANOS) await ver(caso, pantalla, nombre, ancho, alto)
  }
}
// La cuenta suspendida enseña el mismo aviso en cualquier pantalla: basta el Inicio.
for (const [nombre, ancho, alto] of TAMANOS) await ver('suspendido', 'inicio', nombre, ancho, alto)

await navegador.close()

const informe = { base: BASE, resultados, intentosDeDatosReales: intentos, analiticaBloqueada: analitica.length }
writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2))
console.table(resultados, ['pantalla', 'caso', 'tamano', 'http', 'marca', 'desborde', 'columnas', 'axeGraves', 'axeQue', 'errores'])
console.log(`Intentos de hablar con datos reales: ${intentos.length}`)
for (const i of intentos) console.log('  ✗', i)
console.log(`Peticiones de analítica del layout bloqueadas: ${analitica.length}`)

const malos = resultados.filter((r) => r.desborde > 0 || r.axeGraves > 0 || r.errores > 0 || !r.marca || r.http !== 200)
if (malos.length) {
  console.log('\nPROBLEMAS:')
  for (const m of malos) console.log(' ✗', m.pantalla, m.caso, m.tamano, JSON.stringify(m))
}
if (intentos.length || malos.length) process.exit(1)
