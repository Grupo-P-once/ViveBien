/**
 * Compara una corrida de `qa:performance` (escalones k6 de tasa constante) con la línea base de E-34 y deja el informe en `docs/QA/performance/`.
 *   node scripts/qa/comparar-rendimiento.cjs <escalones.tsv> [--rss=MB] [--etiqueta=nombre]
 * REGLAS (generosas a propósito: la máquina de pruebas no es la de producción y la réplica tiene latencia de BD ≈ 0):
 *   · 100 y 200 req/s: 0 % de errores y p95 ≤ max(2 × base, base + 30 ms)
 *   · 300 req/s: errores ≤ 0,1 % y p95 ≤ 3 × base + 50 ms (la base de este escalón es muy ruidosa: 115–293 ms)
 *   · 450 req/s: errores ≤ 2 % y caudal logrado ≥ 93 % del mínimo de la base (≈ 400 req/s) — NO es una promesa de capacidad
 *   · memoria RSS al terminar ≤ 700 MB (E-34: 566–572 MB; E-33 fugaba hasta ~1,9 GB)
 * El resultado detecta REGRESIONES respecto a E-34; no garantiza capacidad en producción.
 */
const fs = process.getBuiltinModule('node:fs')
const path = process.getBuiltinModule('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const [tsv] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const opt = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1]
if (!tsv) { console.error('uso: node scripts/qa/comparar-rendimiento.cjs <escalones.tsv> [--rss=MB] [--etiqueta=x]'); process.exit(2) }
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs', 'QA', 'performance', 'baseline-e34.json'), 'utf8'))
const filas = fs.readFileSync(tsv, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split('\t')).map((c) => ({
  objetivo: Number(c[0]), rps: Number(c[1]), p50: Number(c[2]), p95: Number(c[3]), p99: Number(c[4]), error: Number(c[5]), descartadas: Number(c[6]),
}))
const rss = opt('rss') ? Number(opt('rss')) : null
const etiqueta = opt('etiqueta') ?? 'actual'
const fallos = []
const lineas = []
for (const f of filas) {
  const b = base.escalones[String(f.objetivo)]
  if (!b) continue
  const bp95 = Math.max(...b.p95), brps = Math.min(...b.rps)
  let limiteP95 = null, limiteErr = null, notas = []
  if (f.objetivo <= 200) { limiteP95 = Math.max(2 * bp95, bp95 + 30); limiteErr = 0 }
  else if (f.objetivo === 300) { limiteP95 = 3 * bp95 + 50; limiteErr = 0.1 }
  else { limiteErr = 2; if (f.rps < 0.93 * brps) notas.push(`caudal ${f.rps} < ${Math.round(0.93 * brps)}`) }
  if (limiteP95 !== null && f.p95 > limiteP95) notas.push(`p95 ${f.p95} ms > ${Math.round(limiteP95)} ms`)
  if (f.error > limiteErr) notas.push(`errores ${f.error} % > ${limiteErr} %`)
  if (notas.length) fallos.push(`${f.objetivo} req/s: ${notas.join('; ')}`)
  lineas.push(`| ${f.objetivo} | ${f.rps} | ${f.p50} | ${f.p95} | ${f.p99} | ${f.error} | ${f.descartadas} | ${b.p95.join(' / ')} | ${notas.length ? '✗ ' + notas.join('; ') : '✓'} |`)
}
if (rss !== null && rss > 700) fallos.push(`RSS ${rss} MB > 700 MB`)
const hoy = new Date().toISOString().slice(0, 16).replace(':', '')
const dir = path.join(RAIZ, 'docs', 'QA', 'performance')
fs.mkdirSync(dir, { recursive: true })
const informe = `# Regresión de rendimiento (${etiqueta}) — ${new Date().toISOString()}

Base: E-34 (2 repeticiones, ver \`baseline-e34.json\`). Réplica local de Supabase, un proceso \`next start\`; **detecta regresiones, no garantiza capacidad**.

| req/s objetivo | req/s logrados | p50 ms | p95 ms | p99 ms | errores % | descartadas | p95 base E-34 | veredicto |
|---|---|---|---|---|---|---|---|---|
${lineas.join('\n')}

RSS al terminar: ${rss ?? 'no medido'} MB (base E-34: ${base.rssMB.join(' / ')} MB).
**Resultado: ${fallos.length ? 'REGRESIÓN — ' + fallos.join(' | ') : 'sin regresión'}**
`
fs.writeFileSync(path.join(dir, `${hoy}-${etiqueta}.md`), informe)
fs.writeFileSync(path.join(dir, `${hoy}-${etiqueta}.json`), JSON.stringify({ etiqueta, rss, filas, fallos }, null, 1) + '\n')
console.log(informe)
process.exit(fallos.length ? 1 : 0)
