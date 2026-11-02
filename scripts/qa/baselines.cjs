/**
 * Manifiesto de baselines visuales (R-16 · D-62). Cada captura de `tests-visual/capturas/<proyecto>/<nombre>.png` debe estar declarada con su
 * viewport, ruta, fecha, versión de la que salió y sha256. Una captura cambiada sin pasar por aquí, o no declarada, es deriva silenciosa.
 *
 *   node scripts/qa/baselines.cjs verificar                       → falla si el manifiesto y los archivos no coinciden
 *   node scripts/qa/baselines.cjs registrar --version V --fixtura F [--estado vigente|obsoleta] [--motivo "..."]
 *        → (re)escribe el manifiesto: lo que cambió de hash se marca con la fecha de hoy; lo que no, conserva su estado.
 * Una captura «vigente» debe haberse tomado con fixtura congelada (datos deterministas); sin ella solo puede ser «obsoleta» (declarada, no gate).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
/* eslint-enable @typescript-eslint/no-require-imports */

const RAIZ = path.resolve(__dirname, '..', '..')
const DIR = path.join(RAIZ, 'tests-visual', 'capturas')
const MANIFIESTO = path.join(DIR, 'BASELINES.json')
const VIEWPORTS = { 'escritorio-1440': '1440x900', 'tableta-768': '768x1024', 'movil-390': '390x844' }
const RUTAS = { portada: '/', catalogo: '/propiedades', ficha: '/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl', 'ficha-pausada': '/propiedades/sanjuan', nosotros: '/nosotros', valuador: '/valuador', contacto: '/contacto' }

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
function archivos(dir = DIR) {
  const out = []
  for (const proy of fs.readdirSync(dir)) {
    const d = path.join(dir, proy)
    if (!fs.statSync(d).isDirectory()) continue
    for (const f of fs.readdirSync(d)) if (f.endsWith('.png')) out.push({ proy, nombre: f.replace(/\.png$/, ''), ruta: path.join(d, f) })
  }
  return out.sort((a, b) => (a.proy + a.nombre).localeCompare(b.proy + b.nombre))
}
const leer = (dir = DIR) => {
  const manifiesto = path.join(dir, 'BASELINES.json')
  return fs.existsSync(manifiesto) ? JSON.parse(fs.readFileSync(manifiesto, 'utf8')) : { entradas: [] }
}

/**
 * `dir` solo existe para PROBAR esta verificación en una carpeta temporal (tests/baselines-visuales.test.ts): las pruebas ya no escriben ni
 * restauran capturas reales. Por defecto, la carpeta de capturas del repo; `registrar` y `validar` siguen usando solo esa.
 */
function verificar(dir = DIR) {
  const m = leer(dir)
  const p = []
  const porClave = new Map(m.entradas.map((e) => [e.proyecto + '/' + e.nombre, e]))
  const vistos = new Set()
  for (const a of archivos(dir)) {
    const k = a.proy + '/' + a.nombre
    vistos.add(k)
    const e = porClave.get(k)
    if (!e) { p.push(`${k}: captura sin declarar en BASELINES.json`); continue }
    if (e.sha256 !== sha(a.ruta)) p.push(`${k}: el archivo cambió sin registrarse (sha256 distinto)`)
    for (const c of ['viewport', 'ruta', 'fecha', 'version', 'estado']) if (!e[c]) p.push(`${k}: falta «${c}»`)
    if (e.estado === 'vigente' && !e.fixtura) p.push(`${k}: «vigente» exige fixtura congelada`)
    if (e.estado === 'obsoleta' && !e.motivo) p.push(`${k}: «obsoleta» exige motivo`)
    if (e.estado !== 'vigente' && e.estado !== 'obsoleta') p.push(`${k}: estado inválido`)
  }
  for (const k of porClave.keys()) if (!vistos.has(k)) p.push(`${k}: declarada pero el archivo no existe`)
  return { problemas: p, obsoletas: m.entradas.filter((e) => e.estado === 'obsoleta').length, total: m.entradas.length }
}

function registrar(arg) {
  const get = (n) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : undefined }
  const version = get('--version'); if (!version) throw new Error('--version es obligatoria')
  const fixtura = get('--fixtura')
  const estadoNuevo = get('--estado') || (fixtura ? 'vigente' : 'obsoleta')
  const motivo = get('--motivo')
  const hoy = new Date().toISOString().slice(0, 10)
  const previo = new Map(leer().entradas.map((e) => [e.proyecto + '/' + e.nombre, e]))
  const entradas = archivos().map((a) => {
    const h = sha(a.ruta), k = a.proy + '/' + a.nombre, e = previo.get(k)
    if (e && e.sha256 === h) return e
    const base = a.nombre.replace(/^panel-.*/, 'panel')
    return { proyecto: a.proy, nombre: a.nombre, viewport: VIEWPORTS[a.proy] || 'desconocido', ruta: RUTAS[a.nombre] || (base === 'panel' ? '/admin (panel)' : '?'), fecha: hoy, version, estado: estadoNuevo, ...(fixtura ? { fixtura } : {}), ...(motivo ? { motivo } : {}), sha256: h }
  })
  fs.writeFileSync(MANIFIESTO, JSON.stringify({ nota: 'Generado por scripts/qa/baselines.cjs. No editar a mano.', entradas }, null, 1) + '\n')
  return entradas.length
}

/** Marca como vigentes (re-validadas por una corrida real que pasó contra el candidato) las capturas cuyo nombre empieza por --prefijo. */
function validar(arg) {
  const get = (n) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : undefined }
  const prefijo = get('--prefijo'), version = get('--version'), fixtura = get('--fixtura')
  if (!prefijo || !version || !fixtura) throw new Error('--prefijo, --version y --fixtura son obligatorios')
  const m = leer(), hoy = new Date().toISOString().slice(0, 10)
  let n = 0
  for (const e of m.entradas) if (e.nombre.startsWith(prefijo)) { Object.assign(e, { estado: 'vigente', version, fixtura, fecha: hoy }); delete e.motivo; n++ }
  fs.writeFileSync(MANIFIESTO, JSON.stringify(m, null, 1) + '\n')
  return n
}

module.exports = { verificar, registrar, validar }
if (require.main === module) {
  const [cmd, ...resto] = process.argv.slice(2)
  if (cmd === 'registrar') console.log('registradas', registrar(resto))
  else if (cmd === 'validar') console.log('validadas', validar(resto))
  else {
    const r = verificar()
    for (const x of r.problemas) console.error('✗', x)
    console.log(`baselines: ${r.total} declaradas, ${r.obsoletas} obsoletas, ${r.problemas.length} problemas`)
    process.exit(r.problemas.length ? 1 : 0)
  }
}
