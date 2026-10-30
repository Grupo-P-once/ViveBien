// QA visual y accesibilidad de «Eliminar mi cuenta» (D-35).
//
//   npx next dev -p 3120
//   node scripts/capturas-eliminar-cuenta.mjs
//
// Mide en los tres tamaños, para CLIENTE y para PUBLICADOR, con el diálogo
// cerrado y abierto. Sale con código 1 si algo falla: desbordamiento
// horizontal, violación seria de axe, botón sin nombre accesible, o foco que
// no entra en el diálogo.
//
// Bloquea cualquier petición a datos reales, como el resto de la batería.

import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3120'
const SALIDA = 'docs/fase-3/capturas/eliminar-cuenta'
const TAMANOS = [['escritorio', 1440, 834], ['tableta', 834, 1194], ['movil', 390, 844]]
const PERFILES = [['cliente', 0], ['publicador', 3]]
const DATOS_REALES = /\/api\/|supabase\.co|firestore\.googleapis|identitytoolkit|securetoken\.googleapis|res\.cloudinary\.com/

await mkdir(SALIDA, { recursive: true })
const navegador = await chromium.launch()
const problemas = []
const filas = []

for (const [perfil, propiedades] of PERFILES) {
  for (const [nombre, ancho, alto] of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } })
    const pagina = await ctx.newPage()
    const intentos = []
    await pagina.route('**/*', (ruta) => {
      const url = ruta.request().url()
      if (DATOS_REALES.test(url)) { intentos.push(url); return ruta.abort() }
      return ruta.continue()
    })

    const url = `${BASE}/vista-previa/portal?pantalla=configuracion&propiedades=${propiedades}`
    await pagina.goto(url, { waitUntil: 'networkidle' })

    // El cartel «Vista previa · datos de prueba» es mobiliario de la pantalla
    // de desarrollo: está fijo abajo y tapa lo que hay al final de la página,
    // que es justo donde vive esta sección. En el portal real no existe, así
    // que se oculta para poder pulsar y para que las capturas enseñen la
    // pantalla de verdad.
    await pagina.addStyleTag({ content: '[role="note"]{display:none !important}' })

    // ── Cerrado: la sección tiene que estar, y al final ──
    const seccion = pagina.getByRole('heading', { name: /Eliminar mi cuenta/i })
    await seccion.waitFor({ state: 'visible', timeout: 10_000 })

    const ordenCorrecto = await pagina.evaluate(() => {
      const t = document.body.innerText
      return t.lastIndexOf('Eliminar mi cuenta') > t.indexOf('Cerrar sesión')
    })
    if (!ordenCorrecto) problemas.push(`${perfil}/${nombre}: la sección NO está al final`)

    await pagina.screenshot({ path: `${SALIDA}/${perfil}-${nombre}-cerrado.png`, fullPage: true })

    const desbordaCerrado = await pagina.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (desbordaCerrado) problemas.push(`${perfil}/${nombre}: desbordamiento horizontal con el diálogo cerrado`)

    const axeCerrado = await new AxeBuilder({ page: pagina }).analyze()
    const seriasCerrado = axeCerrado.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
    for (const v of seriasCerrado) problemas.push(`${perfil}/${nombre} (cerrado) axe ${v.impact}: ${v.id}`)

    // ── Abierto: advertencia y confirmación ──
    await pagina.getByRole('button', { name: /Eliminar mi cuenta/i }).click()
    const dialogo = pagina.getByRole('dialog')
    await dialogo.waitFor({ state: 'visible', timeout: 10_000 })
    await pagina.waitForTimeout(400)   // que termine la animación

    await pagina.screenshot({ path: `${SALIDA}/${perfil}-${nombre}-advertencia.png`, fullPage: true })

    const desbordaAbierto = await pagina.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (desbordaAbierto) problemas.push(`${perfil}/${nombre}: desbordamiento horizontal con el diálogo abierto`)

    // El foco tiene que estar DENTRO del diálogo.
    const focoDentro = await pagina.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return !!d && !!document.activeElement && d.contains(document.activeElement)
    })
    if (!focoDentro) problemas.push(`${perfil}/${nombre}: el foco no entró en el diálogo`)

    // Todos los botones visibles tienen nombre accesible.
    const sinNombre = await pagina.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .filter((b) => b.offsetParent !== null)
        .filter((b) => !(b.innerText || '').trim() && !b.getAttribute('aria-label'))
        .length)
    if (sinNombre > 0) problemas.push(`${perfil}/${nombre}: ${sinNombre} botón(es) sin nombre accesible`)

    // El botón de confirmar nace DESACTIVADO.
    const confirmar = dialogo.getByRole('button', { name: /^Eliminar mi cuenta$/i })
    if (!(await confirmar.isDisabled())) problemas.push(`${perfil}/${nombre}: el botón de confirmar no nace desactivado`)

    const axeAbierto = await new AxeBuilder({ page: pagina }).analyze()
    const seriasAbierto = axeAbierto.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
    for (const v of seriasAbierto) problemas.push(`${perfil}/${nombre} (abierto) axe ${v.impact}: ${v.id}`)

    // ── Escribir ELIMINAR lo activa ──
    await dialogo.getByLabel(/Escribe ELIMINAR para confirmar/i).fill('ELIMINAR')
    await dialogo.getByLabel(/Tu contraseña/i).fill('una-contrasena-de-prueba').catch(() => {})
    await pagina.waitForTimeout(150)
    const activo = !(await confirmar.isDisabled())
    if (!activo) problemas.push(`${perfil}/${nombre}: escribir ELIMINAR no activó el botón`)
    await pagina.screenshot({ path: `${SALIDA}/${perfil}-${nombre}-confirmar.png`, fullPage: true })

    // ── El texto del publicador ──
    const texto = await pagina.evaluate(() => document.querySelector('[role="dialog"]').innerText)
    if (perfil === 'publicador' && !/propiedades siguen publicadas/i.test(texto)) {
      problemas.push(`${perfil}/${nombre}: falta el aviso de las propiedades`)
    }
    if (perfil === 'cliente' && /propiedades siguen publicadas/i.test(texto)) {
      problemas.push(`${perfil}/${nombre}: sale el aviso de publicador en una cuenta cliente`)
    }

    // ── Lo que NUNCA puede decir ──
    for (const [etiqueta, patron] of [
      ['promete borrar todo', /se borrar[áa]n? (todos )?tus datos|todos tus datos ser[áa]n/i],
      ['promete recuperación', /recuperar tu cuenta|deshacer la baja/i],
      ['promete plazos', /\b(20|30|14|15)\s*d[íi]as/i],
    ]) {
      if (patron.test(texto)) problemas.push(`${perfil}/${nombre}: el texto ${etiqueta}`)
    }

    // ── Nada privado de más ──
    if (/token|uid|Bearer|service_role/i.test(texto)) {
      problemas.push(`${perfil}/${nombre}: el diálogo enseña algo técnico que no debería`)
    }

    if (intentos.length) problemas.push(`${perfil}/${nombre}: pidió datos reales (${intentos[0]})`)

    filas.push({
      perfil, tamano: nombre, ancho,
      desbordaCerrado, desbordaAbierto, focoDentro,
      botonesSinNombre: sinNombre,
      confirmarSeActiva: activo,
      axeSerias: seriasCerrado.length + seriasAbierto.length,
      axeTotal: axeCerrado.violations.length + axeAbierto.violations.length,
    })

    await ctx.close()
  }
}

await navegador.close()
await writeFile(`${SALIDA}/resultados.json`, JSON.stringify({ filas, problemas }, null, 2))

console.table(filas)
if (problemas.length) {
  console.error('\nPROBLEMAS:')
  for (const p of problemas) console.error('  ·', p)
  process.exit(1)
}
console.log('\nTodo limpio: sin desbordamiento, sin violaciones serias de axe, foco correcto y textos honestos.')
