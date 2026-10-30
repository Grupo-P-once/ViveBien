/**
 * Verificación de `/entrar` en un navegador de verdad (V-1.1.93, tarea 03.07).
 *
 * Lo que `tests/entrar-disposiciones.test.ts` no puede comprobar porque es
 * código puro: que el DOM real acabe con la geometría correcta, que la
 * hidratación se corrija después de montar, que el mensaje de una contraseña
 * mal escrita no hable de Google y que el botón de WhatsApp no esté aquí.
 *
 * SALE CON CÓDIGO ≠ 0 SI ALGO FALLA. Es una prueba, no un informe: si alguien
 * reintroduce un fallo, esto se pone rojo.
 *
 * Firebase queda interceptado con respuestas simuladas: no se crea ninguna
 * cuenta y no se envía ningún correo.
 *
 *   node scripts/verificar-entrar.mjs [http://localhost:3140]
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://localhost:3140'
const SALIDA = 'docs/fase-3/capturas/entrar'

const problemas = []
const filas = []
const fallo = (t) => { problemas.push(t); console.log(`   FALLO · ${t}`) }
const bien = (t) => console.log(`   ok · ${t}`)

/** Dos segmentos con una bisagra en medio, como los entrega el navegador. */
const segs = (a, b) => [a, b].map(([x, y, width, height]) => ({ x, y, width, height }))

const VISTAS = [
  { id: '01-escritorio-ancho', w: 1920, h: 1080, espera: 'amplia' },
  { id: '02-escritorio-medio', w: 1366, h: 768, espera: 'amplia' },
  { id: '03-movil-vertical', w: 390, h: 844, espera: 'compacta' },
  { id: '04-movil-horizontal', w: 844, h: 390, espera: 'amplia' },
  { id: '05-estrecho', w: 320, h: 720, espera: 'compacta' },
  { id: '06-alto', w: 500, h: 1200, espera: 'compacta' },
  { id: '07-plegable-cerrado', w: 416, h: 657, espera: 'compacta' },
  {
    id: '08-plegable-abierto-ancho', w: 884, h: 1104, espera: 'dos-zonas',
    segmentos: segs([0, 0, 430, 1104], [454, 0, 430, 1104]), postura: 'continuous',
  },
  {
    id: '09-plegable-estrecho', w: 620, h: 900, espera: 'una-zona-de-dos',
    segmentos: segs([0, 0, 300, 900], [320, 0, 300, 900]), postura: 'continuous',
  },
  {
    id: '10-plegable-vertical', w: 820, h: 1100, espera: 'apilada',
    segmentos: segs([0, 0, 820, 540], [0, 560, 820, 540]), postura: 'continuous',
  },
]

/** Inyecta los segmentos ANTES de que corra nada de la página. */
async function conPlegable(ctx, v) {
  if (!v.segmentos) return
  await ctx.addInitScript(([ss, postura]) => {
    Object.defineProperty(window, 'viewport', {
      configurable: true,
      value: { segments: ss, addEventListener() {}, removeEventListener() {} },
    })
    Object.defineProperty(navigator, 'devicePosture', {
      configurable: true,
      value: { type: postura, addEventListener() {}, removeEventListener() {} },
    })
  }, [v.segmentos, v.postura])
}

/** Firebase nunca se toca de verdad. */
async function simularFirebase(page, { fallaContrasena = false } = {}) {
  await page.route(/identitytoolkit\.googleapis\.com/, (r) => {
    if (fallaContrasena && /signInWithPassword/.test(r.request().url())) {
      return r.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }),
      })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

const navegador = await chromium.launch()
await mkdir(SALIDA, { recursive: true })

/* ── 4 · Los diez viewports, con geometría medida ─────────────────────── */

console.log('\n── 4 · GEOMETRÍA EN LOS 10 VIEWPORTS ──')
for (const v of VISTAS) {
  const ctx = await navegador.newContext({ viewport: { width: v.w, height: v.h } })
  await conPlegable(ctx, v)
  const p = await ctx.newPage()
  await simularFirebase(p)
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)

  const disposicion = await p.getAttribute('main', 'data-disposicion')
  const medido = await p.getAttribute('main', 'data-medido')
  const columnas = await p.evaluate(() => getComputedStyle(document.querySelector('main')).gridTemplateColumns)
  const filasCss = await p.evaluate(() => getComputedStyle(document.querySelector('main')).gridTemplateRows)

  // ¿Algo se sienta encima del pliegue?
  let cruzan = []
  if (v.segmentos) {
    const [a, b] = [...v.segmentos].sort((s, t) => (s.x - t.x) || (s.y - t.y))
    const vertical = a.y === b.y
    const ini = vertical ? a.x + a.width : a.y + a.height
    const fin = vertical ? b.x : b.y
    cruzan = await p.evaluate(({ ini, fin, vertical }) => {
      const fuera = []
      const sel = 'input, button, h1, h2, h3, a, img, form, [role="tablist"], [role="alert"]'
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('[aria-hidden="true"]')) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const [i, f] = vertical ? [r.left, r.right] : [r.top, r.bottom]
        if (f > ini && i < fin) {
          fuera.push(`${el.tagName.toLowerCase()} «${(el.textContent || '').trim().slice(0, 22)}»`)
        }
      }
      return fuera
    }, { ini, fin, vertical })
  }

  const desborda = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

  const axe = await new AxeBuilder({ page: p }).analyze()
  const porGravedad = (g) => axe.violations.filter((x) => x.impact === g)
  const criticas = porGravedad('critical'), serias = porGravedad('serious')
  const moderadas = porGravedad('moderate'), menores = porGravedad('minor')

  await p.screenshot({ path: `${SALIDA}/${v.id}.png` })

  console.log(`\n ${v.id}  ${v.w}×${v.h}`)
  if (disposicion !== v.espera) fallo(`${v.id}: disposición ${disposicion}, se esperaba ${v.espera}`)
  else bien(`disposición ${disposicion}`)
  if (medido !== 'si') fallo(`${v.id}: la pantalla no llegó a medirse (data-medido=${medido})`)
  if (v.segmentos) {
    console.log(`   carriles → ${(v.segmentos[0].y === v.segmentos[1].y ? columnas : filasCss)}`)
    if (cruzan.length) fallo(`${v.id}: CRUZA LA BISAGRA → ${cruzan.join(' · ')}`)
    else bien('nada cruza la bisagra')
  }
  if (desborda) fallo(`${v.id}: desborda en horizontal`)
  if (criticas.length || serias.length) {
    fallo(`${v.id}: axe ${criticas.length} críticas, ${serias.length} serias → ${[...criticas, ...serias].map((x) => x.id).join(', ')}`)
  } else bien(`axe sin críticas ni serias (${moderadas.length} moderadas, ${menores.length} menores)`)

  filas.push({
    vista: v.id, viewport: `${v.w}×${v.h}`, disposicion, esperada: v.espera, medido,
    columnas, filas: filasCss, cruzaBisagra: cruzan.length, desborda,
    axe: { criticas: criticas.length, serias: serias.length, moderadas: moderadas.length, menores: menores.length },
  })
  await ctx.close()
}

/* ── 5 · Hidratación y cambios de tamaño ──────────────────────────────── */

console.log('\n── 5 · HIDRATACIÓN Y REDIMENSIONADO ──')
{
  // Lo que manda el servidor, antes de que corra ningún JavaScript.
  const html = await fetch(`${BASE}/entrar`).then((r) => r.text())
  const ssr = html.match(/data-disposicion="([a-z-]+)"/)?.[1]
  if (ssr === 'amplia') bien(`el servidor manda «${ssr}»`)
  else fallo(`el servidor manda «${ssr}», se esperaba «amplia»`)
  const ssrMedido = html.match(/data-medido="(\w+)"/)?.[1]
  if (ssrMedido === 'no') bien('y marcado como todavía sin medir')
  else fallo(`data-medido del servidor = «${ssrMedido}», se esperaba «no»`)

  // Y lo que el cliente hace con ello.
  const ctx = await navegador.newContext({ viewport: { width: 884, height: 1104 } })
  await conPlegable(ctx, VISTAS[7])
  const p = await ctx.newPage()
  await simularFirebase(p)
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  const tras = await p.getAttribute('main', 'data-disposicion')
  if (tras === 'dos-zonas') bien(`tras montar, el DOM dice «${tras}» (no se quedó congelado en «amplia»)`)
  else fallo(`tras montar el DOM sigue en «${tras}»; la hidratación no se corrigió`)

  // Y que los saltos de tamaño se noten en el DOM, no sólo en el CSS.
  const saltos = [
    ['dos-zonas → compacta', 390, 844, 'compacta'],
    ['compacta → amplia', 1440, 900, 'amplia'],
    ['amplia → compacta', 360, 800, 'compacta'],
  ]
  for (const [nombre, w, h, espera] of saltos) {
    await p.evaluate(() => { delete window.viewport })
    await p.setViewportSize({ width: w, height: h })
    await p.waitForTimeout(350)
    const d = await p.getAttribute('main', 'data-disposicion')
    if (d === espera) bien(`${nombre}: el atributo pasó a «${d}»`)
    else fallo(`${nombre}: el atributo se quedó en «${d}», se esperaba «${espera}»`)
  }

  // Girar: el mismo aparato con el pliegue en el otro eje.
  await p.evaluate(() => {
    Object.defineProperty(window, 'viewport', {
      configurable: true,
      value: { segments: [{ x: 0, y: 0, width: 820, height: 540 }, { x: 0, y: 560, width: 820, height: 540 }] },
    })
  })
  await p.setViewportSize({ width: 820, height: 1100 })
  await p.evaluate(() => window.dispatchEvent(new Event('orientationchange')))
  await p.waitForTimeout(350)
  const girado = await p.getAttribute('main', 'data-disposicion')
  if (girado === 'apilada') bien(`orientationchange → «${girado}»`)
  else fallo(`tras orientationchange el DOM dice «${girado}», se esperaba «apilada»`)
  await ctx.close()
}

/* ── 6 · Los mensajes ─────────────────────────────────────────────────── */

console.log('\n── 6 · MENSAJES DE ERROR ──')
{
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await ctx.newPage()
  await simularFirebase(p, { fallaContrasena: true })
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Correo electrónico').fill('qa@ejemplo.invalid')
  await p.getByPlaceholder('Contraseña').fill('una-mala')
  await p.getByRole('button', { name: /Iniciar sesión/ }).click()
  await p.waitForTimeout(1800)

  const textos = (await p.locator('[role="alert"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
  console.log(`   alertas: ${JSON.stringify(textos)}`)
  const dice = textos.join(' | ')
  if (/correo o la contraseña/i.test(dice)) bien('sale el mensaje de contraseña')
  else fallo(`no aparece el mensaje de contraseña; salió: «${dice}»`)
  if (/Google/i.test(dice)) fallo(`un fallo de contraseña menciona Google: «${dice}»`)
  else bien('y no menciona Google')

  await p.screenshot({ path: `${SALIDA}/flujo-error-contrasena.png` })
  await ctx.close()
}

/* ── 7 · WhatsApp ─────────────────────────────────────────────────────── */

console.log('\n── 7 · BOTÓN DE WHATSAPP ──')
{
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await ctx.newPage()
  await simularFirebase(p)

  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2200)   // el botón aparece a los 1,5 s
  const enEntrar = await p.getByLabel('Contactar por WhatsApp').count()
  if (enEntrar === 0) bien('ausente en /entrar')
  else fallo(`el botón de WhatsApp sigue en /entrar (${enEntrar})`)

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2200)
  const enPortada = await p.getByLabel('Contactar por WhatsApp').count()
  if (enPortada > 0) bien('sigue presente en la portada pública')
  else fallo('el botón de WhatsApp desapareció también de la portada')
  await ctx.close()
}

await navegador.close()

await writeFile(`${SALIDA}/verificacion.json`, JSON.stringify({ filas, problemas }, null, 2))

console.log(`\n${'─'.repeat(60)}`)
if (problemas.length) {
  console.log(`${problemas.length} PROBLEMA(S):`)
  for (const p of problemas) console.log(` · ${p}`)
  process.exit(1)
}
console.log('TODO CORRECTO')
