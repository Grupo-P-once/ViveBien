// Revisión visual y funcional de `/entrar` (tarea 03.07). SÓLO LECTURA.
//
//   npx next dev -p 3140
//   node scripts/revisar-entrar.mjs
//
// ─────────────────────────────────────────────────────────────
// NADA DE ESTO TOCA NADA REAL
//
// Las llamadas a Firebase se interceptan y se contestan con respuestas
// enlatadas. Así se prueban de verdad los mensajes de error, el alta y la
// recuperación de contraseña **sin crear ninguna cuenta, sin mandar ningún
// correo y sin gastar el límite de intentos del proyecto**.
//
// Los plegables se simulan sembrando `window.viewport.segments` y
// `navigator.devicePosture`, que es exactamente lo que lee `usePlegable`.
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3140'
const SALIDA = 'docs/fase-3/capturas/entrar'

/** Los diez tamaños del encargo. `segmentos` simula un plegable. */
const VISTAS = [
  { id: '01-escritorio-ancho', ancho: 1920, alto: 1080, espera: 'amplia' },
  { id: '02-escritorio-medio', ancho: 1366, alto: 768, espera: 'amplia' },
  { id: '03-movil-vertical', ancho: 390, alto: 844, espera: 'compacta' },
  { id: '04-movil-horizontal', ancho: 844, alto: 390, espera: 'amplia' },
  { id: '05-estrecho', ancho: 320, alto: 720, espera: 'compacta' },
  { id: '06-alto', ancho: 500, alto: 1200, espera: 'compacta' },
  { id: '07-plegable-cerrado', ancho: 416, alto: 657, postura: 'folded', espera: 'compacta' },
  {
    id: '08-plegable-abierto-ancho', ancho: 884, alto: 1104, postura: 'continuous', espera: 'dos-zonas',
    segmentos: [{ x: 0, y: 0, width: 430, height: 1104 }, { x: 454, y: 0, width: 430, height: 1104 }],
  },
  {
    id: '09-plegable-estrecho', ancho: 620, alto: 900, postura: 'continuous', espera: 'una-zona-de-dos',
    segmentos: [{ x: 0, y: 0, width: 300, height: 900 }, { x: 320, y: 0, width: 300, height: 900 }],
  },
  {
    id: '10-plegable-vertical', ancho: 820, alto: 1100, postura: 'continuous', espera: 'apilada',
    segmentos: [{ x: 0, y: 0, width: 820, height: 540 }, { x: 0, y: 560, width: 820, height: 540 }],
  },
]

/** Respuestas enlatadas de Firebase, por lo que se pide. */
function firebaseFalso(caso) {
  return async (ruta) => {
    const url = ruta.request().url()
    const responder = (cuerpo, status = 200) =>
      ruta.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })

    if (url.includes('signInWithPassword')) {
      if (caso === 'contrasena-mala') return responder({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }, 400)
      if (caso === 'no-registrado') return responder({ error: { code: 400, message: 'EMAIL_NOT_FOUND' } }, 400)
      return responder({ idToken: 't', localId: 'uid-falso', email: 'qa@ejemplo.invalid', refreshToken: 'r', expiresIn: '3600' })
    }
    if (url.includes('accounts:signUp')) {
      if (caso === 'alta-repetida') return responder({ error: { code: 400, message: 'EMAIL_EXISTS' } }, 400)
      return responder({ idToken: 't', localId: 'uid-falso', email: 'qa@ejemplo.invalid', refreshToken: 'r', expiresIn: '3600' })
    }
    if (url.includes('accounts:sendOobCode')) return responder({ email: 'qa@ejemplo.invalid' })
    if (url.includes('accounts:lookup')) return responder({ users: [{ localId: 'uid-falso', email: 'qa@ejemplo.invalid', emailVerified: true }] })
    return responder({})
  }
}

async function preparar(ctx, vista, caso) {
  const pagina = await ctx.newPage()

  if (vista?.segmentos || vista?.postura) {
    await pagina.addInitScript(({ segmentos, postura }) => {
      if (segmentos) {
        Object.defineProperty(window, 'viewport', {
          value: { segments: segmentos, addEventListener() {}, removeEventListener() {} },
          configurable: true,
        })
      }
      if (postura) {
        Object.defineProperty(navigator, 'devicePosture', {
          value: { type: postura, addEventListener() {}, removeEventListener() {} },
          configurable: true,
        })
      }
    }, { segmentos: vista.segmentos ?? null, postura: vista.postura ?? null })
  }

  await pagina.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, firebaseFalso(caso))
  await pagina.route(/\/api\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  return pagina
}

await mkdir(SALIDA, { recursive: true })
const navegador = await chromium.launch()
const problemas = []
const filas = []
const flujo = []

await fetch(`${BASE}/entrar`).catch(() => {})   // calentar la ruta en dev

// ── 1 · Las diez vistas ───────────────────────────────────────────────────
for (const v of VISTAS) {
  const ctx = await navegador.newContext({ viewport: { width: v.ancho, height: v.alto } })
  const pagina = await preparar(ctx, v)
  await pagina.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(500)

  const disposicion = await pagina.getAttribute('main', 'data-disposicion')
  if (disposicion !== v.espera) problemas.push(`${v.id}: disposición ${disposicion}, se esperaba ${v.espera}`)

  // ¿Algo cruza la bisagra?
  const cruces = v.segmentos
    ? await pagina.evaluate((segs) => {
      const orden = [...segs].sort((a, b) => a.x - b.x || a.y - b.y)
      const vertical = Math.abs(orden[0].x - orden[1].x) > Math.abs(orden[0].y - orden[1].y)
      const desde = vertical ? orden[0].x + orden[0].width : orden[0].y + orden[0].height
      const hasta = vertical ? orden[1].x : orden[1].y
      if (hasta <= desde) return []
      const malos = []
      for (const el of document.querySelectorAll('input, button, a, h1, h2, img, form')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const ini = vertical ? r.left : r.top
        const fin = vertical ? r.right : r.bottom
        if (ini < hasta && fin > desde) {
          malos.push(`${el.tagName.toLowerCase()}${el.textContent ? ' «' + el.textContent.trim().slice(0, 24) + '»' : ''}`)
        }
      }
      return malos
    }, v.segmentos)
    : []
  if (cruces.length) problemas.push(`${v.id}: CRUZA LA BISAGRA → ${cruces.join(' · ')}`)

  // En `una-zona-de-dos`, todo debe caber en un solo segmento.
  let enUnSegmento = null
  if (v.espera === 'una-zona-de-dos' && v.segmentos) {
    enUnSegmento = await pagina.evaluate((segs) => {
      const tarjeta = document.querySelector('form')?.closest('div')
      if (!tarjeta) return 'sin tarjeta'
      const r = tarjeta.getBoundingClientRect()
      const dentro = segs.find((s) => r.left >= s.x - 2 && r.right <= s.x + s.width + 2)
      return dentro ? 'sí' : `no (x ${Math.round(r.left)}–${Math.round(r.right)})`
    }, v.segmentos)
    if (enUnSegmento !== 'sí') problemas.push(`${v.id}: la tarjeta NO cabe en un segmento — ${enUnSegmento}`)
  }

  const desborda = await pagina.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  if (desborda) problemas.push(`${v.id}: desbordamiento horizontal`)

  await pagina.screenshot({ path: `${SALIDA}/${v.id}.png`, fullPage: false })

  const axe = await new AxeBuilder({ page: pagina }).analyze()
  const serias = axe.violations.filter((x) => ['serious', 'critical'].includes(x.impact))
  for (const s of serias) problemas.push(`${v.id}: axe ${s.impact} · ${s.id} (${s.nodes.length})`)

  filas.push({
    vista: v.id, viewport: `${v.ancho}×${v.alto}`, disposicion,
    esperada: v.espera, cruzaBisagra: cruces.length, enUnSegmento,
    desborda, axeSerias: serias.length, axeTotal: axe.violations.length,
  })
  await ctx.close()
}

// ── 2 · El flujo ──────────────────────────────────────────────────────────
const anotar = (paso, resultado) => flujo.push({ paso, resultado })

async function conPagina(caso, fn) {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } })
  const pagina = await preparar(ctx, null, caso)
  try { await fn(pagina) } finally { await ctx.close() }
}

// A · sin sesión
await conPagina('ok', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  anotar('A · /entrar sin sesión', await p.locator('h2').first().innerText())
})

// C y D · correo y contraseña
await conPagina('contrasena-mala', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Correo electrónico').fill('qa@ejemplo.invalid')
  await p.getByPlaceholder('Contraseña').fill('mala')
  await p.getByRole('button', { name: /Iniciar sesión/ }).click()
  await p.waitForTimeout(900)
  const err = await p.getByRole('alert').innerText().catch(() => '(sin mensaje)')
  anotar('D · contraseña incorrecta', err)
  await p.screenshot({ path: `${SALIDA}/flujo-error-contrasena.png` })
})

// F · correo no registrado
await conPagina('no-registrado', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Correo electrónico').fill('nadie@ejemplo.invalid')
  await p.getByPlaceholder('Contraseña').fill('loquesea')
  await p.getByRole('button', { name: /Iniciar sesión/ }).click()
  await p.waitForTimeout(900)
  anotar('F · correo no registrado', await p.getByRole('alert').innerText().catch(() => '(sin mensaje)'))
})

// E · ¿olvidaste tu contraseña?
await conPagina('ok', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /Olvidaste tu contraseña/ }).click()
  await p.waitForTimeout(400)
  anotar('E · olvidé la contraseña, sin correo', await p.getByRole('alert').innerText().catch(() => '(sin mensaje)'))

  await p.getByPlaceholder('Correo electrónico').fill('qa@ejemplo.invalid')
  await p.getByRole('button', { name: /Olvidaste tu contraseña/ }).click()
  await p.waitForTimeout(900)
  anotar('E · olvidé la contraseña, con correo', await p.getByRole('status').first().innerText().catch(() => '(sin mensaje)'))
  await p.screenshot({ path: `${SALIDA}/flujo-recuperar.png` })
})

// G · crear cuenta (interceptado: NO se crea nada)
await conPagina('alta-repetida', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Crear cuenta' }).first().click()
  await p.waitForTimeout(300)
  const hayNombre = await p.getByPlaceholder('Tu nombre').isVisible()
  await p.screenshot({ path: `${SALIDA}/flujo-crear-cuenta.png` })
  await p.getByPlaceholder('Correo electrónico').fill('qa@ejemplo.invalid')
  await p.getByPlaceholder('Contraseña').fill('unaContrasenaLarga1')
  await p.locator('form').getByRole('button', { name: /Crear cuenta/ }).click()
  await p.waitForTimeout(900)
  anotar('G · crear cuenta', `campo nombre: ${hayNombre ? 'sí' : 'NO'} · ${await p.getByRole('alert').innerText().catch(() => '(sin mensaje)')}`)
})

// I · refresco: ¿se conserva lo escrito?
await conPagina('ok', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Correo electrónico').fill('memoria@ejemplo.invalid')
  await p.getByRole('button', { name: 'Crear cuenta' }).first().click()
  await p.waitForTimeout(400)
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const correo = await p.getByPlaceholder('Correo electrónico').inputValue()
  const pestana = await p.getByRole('button', { name: 'Crear cuenta' }).first().getAttribute('aria-current')
  anotar('I · refresco', `correo «${correo}» · pestaña activa: ${pestana}`)
  const guardado = await p.evaluate(() => sessionStorage.getItem('vivebien:entrar'))
  anotar('I · lo guardado', guardado ?? '(nada)')
  if (/contrase|password/i.test(guardado ?? '')) problemas.push('SE GUARDA LA CONTRASEÑA')
})

// J, K, L, M · el parámetro `siguiente`
for (const [etiqueta, crudo] of [
  ['J', '/portal/'], ['K', '/admin/'], ['L', '/dashboard?clasico=1'],
  ['M', 'https://otro.com/roban-sesion'], ['M', '//otro.com'],
]) {
  await conPagina('ok', async (p) => {
    await p.goto(`${BASE}/entrar?siguiente=${encodeURIComponent(crudo)}`, { waitUntil: 'networkidle' })
    const guardado = await p.evaluate(() => sessionStorage.getItem('vivebien:entrar'))
    const leido = JSON.parse(guardado ?? '{}').siguiente ?? null
    anotar(`${etiqueta} · siguiente=${crudo}`, `la pantalla lo toma como: ${leido ?? 'NADA (descartado)'}`)
    if (crudo.includes('otro.com') && leido) problemas.push(`OPEN REDIRECT: se aceptó ${crudo}`)
  })
}

// ── 3 · Teclado y foco ────────────────────────────────────────────────────
await conPagina('ok', async (p) => {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  const orden = []
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press('Tab')
    orden.push(await p.evaluate(() => {
      const a = document.activeElement
      if (!a) return '(nada)'
      const nombre = a.getAttribute('aria-label') || a.getAttribute('placeholder') || a.textContent?.trim().slice(0, 22) || a.tagName
      const e = getComputedStyle(a)
      const visible = e.outlineStyle !== 'none' || e.boxShadow !== 'none'
      return `${a.tagName.toLowerCase()}:${nombre}${visible ? '' : ' ⚠ SIN FOCO VISIBLE'}`
    }))
  }
  anotar('Foco con Tab', orden.join(' → '))
  await p.screenshot({ path: `${SALIDA}/foco-teclado.png` })
})

// ── 4 · /dashboard y ?clasico=1 ───────────────────────────────────────────
for (const ruta of ['/dashboard', '/dashboard?clasico=1']) {
  await conPagina('ok', async (p) => {
    await p.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(2500)
    const url = p.url().replace(BASE, '')
    const texto = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 90)
    anotar(`Dashboard ${ruta}`, `acabó en ${url} · ${texto}`)
    await p.screenshot({ path: `${SALIDA}/dashboard-${ruta.includes('clasico') ? 'clasico' : 'normal'}.png` })
  })
}

// ── 5 · prefers-reduced-motion ────────────────────────────────────────────
{
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' })
  const p = await preparar(ctx, null, 'ok')
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  const transicion = await p.evaluate(() => getComputedStyle(document.querySelector('main')).transition)
  anotar('prefers-reduced-motion', `transition: ${transicion}`)
  await ctx.close()
}

await navegador.close()
await writeFile(`${SALIDA}/resultados.json`, JSON.stringify({ filas, flujo, problemas }, null, 2))

console.table(filas)
console.log('\n── FLUJO ──')
for (const f of flujo) console.log(`  ${f.paso}\n      ${f.resultado}`)
if (problemas.length) {
  console.error('\n── PROBLEMAS ──')
  for (const x of problemas) console.error('  ·', x)
} else {
  console.log('\nSin problemas detectados.')
}
