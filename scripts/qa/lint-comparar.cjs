/**
 * Puerta de lint «sin empeorar» (E-39). El repo hereda errores de lint antiguos (reglas de React 19 y `any`); exigir 0 hoy bloquearía todo. Esta puerta
 * falla SOLO si el número de errores POR ARCHIVO sube respecto a `docs/QA/lint-baseline.json` o aparece un archivo nuevo con errores.
 *   node scripts/qa/lint-comparar.cjs               → compara
 *   node scripts/qa/lint-comparar.cjs --escribir    → fija la línea base con el estado actual (solo tras revisar que mejoró o es esperado)
 */
const { spawnSync } = process.getBuiltinModule('node:child_process')
const fs = process.getBuiltinModule('node:fs')
const path = process.getBuiltinModule('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const BASE = path.join(RAIZ, 'docs', 'QA', 'lint-baseline.json')
const r = spawnSync('npx', ['eslint', '-f', 'json', 'src'], { cwd: RAIZ, encoding: 'utf8', shell: true, maxBuffer: 1 << 28 })
let datos
try { datos = JSON.parse(r.stdout) } catch { console.error('lint: eslint no produjo JSON\n' + (r.stderr || '').slice(0, 400)); process.exit(2) }
const actual = {}
let avisos = 0
for (const f of datos) {
  avisos += f.warningCount
  if (f.errorCount) actual[path.relative(RAIZ, f.filePath).split(path.sep).join('/')] = f.errorCount
}
const total = Object.values(actual).reduce((a, b) => a + b, 0)
if (process.argv.includes('--escribir')) {
  fs.writeFileSync(BASE, JSON.stringify({ nota: 'Generado por scripts/qa/lint-comparar.cjs --escribir', errores: total, avisos, porArchivo: actual }, null, 1) + '\n')
  console.log(`lint: línea base escrita (${total} errores, ${avisos} avisos, ${Object.keys(actual).length} archivos)`)
  process.exit(0)
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'))
const peores = Object.entries(actual).filter(([f, n]) => n > (base.porArchivo[f] ?? 0))
for (const [f, n] of peores) console.error(`  ✗ ${f}: ${n} errores (base ${base.porArchivo[f] ?? 0})`)
console.log(`lint: ${total} errores (base ${base.errores}), ${avisos} avisos (base ${base.avisos}); ${peores.length ? peores.length + ' archivo(s) empeoraron' : 'sin empeorar'}`)
process.exit(peores.length ? 1 : 0)
