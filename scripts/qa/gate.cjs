/**
 * `npm run qa:gate` — puerta de calidad RÁPIDA y DETERMINISTA (E-39). Sin k6 (eso es `qa:performance`). Aborta en la primera falla y dice cuál.
 * Todo corre contra una RÉPLICA local de Supabase (`tests/performance/mock-supabase.mjs`): solo lecturas públicas anónimas, ninguna escritura.
 * Pasos:  1 typecheck · 2 pruebas críticas · 3 pruebas de seguridad · 4 escáner de secretos · 5 lint (sin empeorar) · 6 build ·
 *         7 navegador (sesión, publicador, revisión, CLS) · 8 axe (sin empeorar) · 9 baselines visuales · 10 smoke de API.
 * Opciones:  --rapido  solo 1–5 (bucle de desarrollo)   --desde=N  empieza en el paso N
 * Entorno de los procesos de prueba: EXPLÍCITO. De `.env.local` solo se leen variables NEXT_PUBLIC_* (públicas); TODA variable no pública que exista allí
 * (token de Telegram, claves de servicio, correo, cron…) se pasa VACÍA al servidor de prueba para que `.env.local` no la cargue, y la clave de servicio de
 * Supabase es una ficticia: el servidor de prueba no puede escribir en producción ni mandar avisos reales (observación 0010).
 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const RAPIDO = process.argv.includes('--rapido')
const DESDE_PEDIDO = Number((process.argv.find((a) => a.startsWith('--desde=')) ?? '--desde=1').split('=')[1])
// Los pasos 7–10 usan el servidor que arranca DESPUÉS del build (paso 6): reutilizar un `.next` viejo puede traer un `/api/catalogo` con un 503 cacheado
// por una regeneración fallida (observado en E-39, ver QA-022). Por eso `--desde` nunca salta el build.
const DESDE = DESDE_PEDIDO > 6 && !process.argv.includes('--rapido') ? 6 : DESDE_PEDIDO
const PUERTO = '3130', REPLICA = '54399'
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-gate-'))

const PUBLICO = {}
const VACIAS = {}
const envLocal = path.join(RAIZ, '.env.local')
if (fs.existsSync(envLocal)) {
  for (const l of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    if (m[1].startsWith('NEXT_PUBLIC_')) PUBLICO[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    else VACIAS[m[1]] = ''
  }
}

if (!RAPIDO_ARG() && (!PUBLICO.NEXT_PUBLIC_SUPABASE_URL || !PUBLICO.NEXT_PUBLIC_SUPABASE_ANON_KEY || !PUBLICO.NEXT_PUBLIC_FIREBASE_API_KEY)) {
  console.error('qa:gate: .env.local no trae NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_FIREBASE_API_KEY (variables públicas); el build y la réplica las necesitan.')
  process.exit(2)
}
function RAPIDO_ARG() { return process.argv.includes('--rapido') }

/** En batería Windows ralentiza los procesos y las capturas/esperas de Playwright fallan por tiempo, no por el código (visto en E-39: 47 de 48 capturas). */
function enBateria() {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1).BatteryStatus'], { encoding: 'utf8' })
  return String(r.stdout ?? '').trim() === '1'
}
if (!RAPIDO_ARG() && enBateria() && !process.env.QA_ACEPTAR_BATERIA) {
  console.error('qa:gate: el equipo está en BATERÍA; los pasos de navegador no son fiables (se ralentizan y fallan por tiempo). Enchúfalo, o exporta QA_ACEPTAR_BATERIA=1 y etiqueta el resultado.')
  process.exit(3)
}

/** Entorno EXPLÍCITO: solo lo imprescindible del sistema + lo público + lo no público VACÍO. */
function entorno(extra = {}) {
  const sistema = {}
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'PATHEXT', 'ProgramFiles', 'ProgramData', 'NUMBER_OF_PROCESSORS']) if (process.env[k]) sistema[k] = process.env[k]
  return { ...sistema, ...VACIAS, ...extra }
}
const entornoApp = () => entorno({ ...PUBLICO, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${REPLICA}`, SUPABASE_SERVICE_ROLE_KEY: 'dummy-local-key', CORREO_MARKETING: '1', CORREO_SECRETO: 'secreto-falso-solo-para-pruebas-locales-0123456789', QA_SERVIDOR_EXTERNO: '1', QA_PUERTO: PUERTO, QA_TIMEOUT_MS: '60000', QA_REINTENTOS: '2' })

let replica = null, servidor = null, n = 0
const resultados = []
const ejecutar = (cmd, args, env) => spawnSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', shell: true, ...(env ? { env } : {}) }).status ?? 1

function matarPuertos() {
  for (const port of [PUERTO, REPLICA]) spawnSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], { stdio: 'ignore' })
  replica = null; servidor = null
}
function resumen() {
  console.log('\n──────── resumen qa:gate ────────')
  for (const r of resultados) console.log(`${r.ok ? '✓' : '✗'} ${r.n}. ${r.nombre} (${r.seg} s)`)
}
async function esperar(url, ms = 120000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) { try { if ((await fetch(url)).status < 500) return true } catch { /* aún no */ } await new Promise((a) => setTimeout(a, 1500)) }
  return false
}
async function arrancarReplica(fixtura) {
  matarPuertos()
  replica = spawn('node', [path.join('tests', 'performance', 'mock-supabase.mjs')], { cwd: RAIZ, stdio: 'ignore', env: entorno({
    MOCK_PORT: REPLICA, REAL_SUPABASE_URL: PUBLICO.NEXT_PUBLIC_SUPABASE_URL ?? '', REAL_SUPABASE_ANON_KEY: PUBLICO.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    MOCK_FLAGS_JSON: '{"portalCliente":true,"citasEnLinea":false,"publisherPortal":false}',
    ...(fixtura ? { MOCK_FIXTURA: path.join(RAIZ, 'tests-visual', 'fixtura', 'publico.json') } : {}),
  }) })
  await new Promise((a) => setTimeout(a, 1500))
}
async function arrancarServidor() {
  await arrancarReplica(true)
  servidor = spawn('npx', ['next', 'start', '-p', PUERTO], { cwd: RAIZ, stdio: 'ignore', shell: true, env: entornoApp() })
  if (!(await esperar(`http://localhost:${PUERTO}/api/salud`))) throw new Error('el servidor de prueba no arrancó')
  // calentamiento: la primera petición en frío agota los 30 s de Playwright (observación 0015)
  for (const r of ['/', '/propiedades', '/entrar', '/contacto', '/ayuda', '/nosotros', '/admin', '/propiedades/sanjuan']) { try { await fetch(`http://localhost:${PUERTO}${r}`) } catch { /* se ignora */ } }
}

async function paso(nombre, f) {
  n++
  if (n < DESDE) return
  const t0 = Date.now()
  console.log(`\n▶ ${n}. ${nombre}`)
  let r
  try { r = await f() } catch (e) { console.error(String(e?.message ?? e)); r = 1 }
  const seg = Math.round((Date.now() - t0) / 1000)
  resultados.push({ n, nombre, ok: r === 0, seg })
  if (r !== 0) { console.error(`\n✗ FALLÓ el paso ${n}: ${nombre} (${seg} s)`); resumen(); matarPuertos(); process.exit(1) }
  console.log(`✓ ${nombre} (${seg} s)`)
}

const CRITICAS = ['tests/supabase-servidor-barrera.test.ts', 'tests/limites.test.ts', 'tests/salud.test.ts', 'tests/csp.test.ts', 'tests/ficha-cache.test.ts', 'tests/chaos-catalogo.test.ts',
  'tests/supabase-timeouts.test.ts', 'tests/visibilidad-publica.test.ts', 'tests/e37-accesibilidad.test.ts', 'tests/e38-observabilidad.test.ts', 'tests/qa021-sql.test.ts',
  'tests/baselines-visuales.test.ts', 'tests/entrar-medida-inicial.test.ts',
  'tests/favoritos-guardados.test.ts', 'tests/favoritos-guardias.test.ts',
  'tests/negocio.test.ts', 'tests/correo-institucional.test.ts',
  'tests/correo-seguridad.test.ts', 'tests/correo-plantillas.test.ts', 'tests/correo-enviar.test.ts', 'tests/correo-integracion.test.ts', 'tests/correo-guardias.test.ts', 'tests/migracion-62-correo.test.ts', 'tests/correo-emisor-cupo.test.ts', 'tests/marketing-panel.test.ts', 'tests/migracion-63-correo.test.ts', 'tests/migracion-64-ayuda-correos.test.ts', 'tests/migracion-66-ayuda-asegurar-categorias.test.ts', 'tests/consentimiento-promocional.test.ts', 'tests/correo-webhook-ruta.test.ts', 'tests/migracion-67-correo-eventos.test.ts', 'tests/correo-catalogo.test.ts', 'tests/correo-plantillas-eventos.test.ts', 'tests/correo-plantillas-pendientes.test.ts', 'tests/correo-aviso-lead.test.ts', 'tests/correo-pie-grupo-ponce.test.ts', 'tests/marketing-matriz-ui.test.ts', 'tests/correo-metricas.test.ts', 'tests/marketing-metricas.test.ts']  // `medios-optimizar` NO va: afirma comportamientos de V-1.1.95 (visor de fotos) que producción no tiene a propósito; sigue en la suite completa
const SEGURIDAD = ['tests/e35-fronteras.test.ts', 'tests/e39-guardias.test.ts', 'tests/e39-webhooks.test.ts', 'tests/guardia-produccion.test.ts', 'tests/entorno-staging.test.ts',
  'tests/diagnostico-sonda.test.ts', 'tests/cliente-seguridad.test.ts', 'tests/publicador-seguridad.test.ts']
const existentes = (l) => l.filter((f) => fs.existsSync(path.join(RAIZ, f)))

;(async () => {
  console.log(`qa:gate · ${RAPIDO ? 'modo rápido (pasos 1–5)' : '10 pasos'} · temporal ${TEMP}`)
  await paso('typecheck (tsc --noEmit)', () => ejecutar('npx', ['tsc', '--noEmit']))
  await paso('pruebas críticas (Vitest)', () => ejecutar('npx', ['vitest', 'run', ...existentes(CRITICAS)]))
  await paso('pruebas de seguridad (Vitest)', () => ejecutar('npx', ['vitest', 'run', ...existentes(SEGURIDAD)]))
  await paso('escáner de secretos', () => ejecutar('node', ['scripts/qa/escanear-secretos.cjs']))
  await paso('lint (sin empeorar)', () => ejecutar('node', ['scripts/qa/lint-comparar.cjs']))
  if (RAPIDO) { resumen(); console.log('\nqa:gate (rápido): TODO OK'); return }

  await paso('build (next build contra la réplica)', async () => {
    await arrancarReplica(false) // reenvía solo lecturas anónimas; las páginas de ayuda se prerenderizan con datos de solo lectura
    const r = ejecutar('npx', ['next', 'build'], entornoApp())
    matarPuertos()
    return r
  })
  await arrancarServidor()
  const E = entornoApp()
  await paso('navegador: sesión, publicador, revisión, CLS (Playwright)', () => ejecutar('npx', ['playwright', 'test', '-c', 'playwright.sesion.config.ts', '--grep-invert', '"axe ·"'], E))
  await paso('axe (sin empeorar)', () => {
    const salida = path.join(TEMP, 'axe.json')
    const r = ejecutar('npx', ['playwright', 'test', '-c', 'playwright.sesion.config.ts', 'axe-cierre'], { ...E, AXE_ETIQUETA: 'gate', AXE_SALIDA: salida })
    return r !== 0 ? r : ejecutar('node', ['scripts/qa/axe-comparar.cjs', JSON.stringify(salida).replace(/"/g, '')])
  })
  await paso('baselines visuales (Playwright)', () => ejecutar('npx', ['playwright', 'test'], E))
  await paso('smoke de API', () => ejecutar('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/qa/smoke-deployment.ts', 'staging', '--base', `http://localhost:${PUERTO}`, '--spec', 'scripts/qa/specs/gate-api.json']))
  matarPuertos()
  resumen()
  console.log('\nqa:gate: TODO OK')
})().catch((e) => { console.error(e); matarPuertos(); process.exit(1) })
