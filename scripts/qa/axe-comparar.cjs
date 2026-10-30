/**
 * Puerta de accesibilidad «sin empeorar» (E-39). Lee la salida (una línea JSON por medición) de `tests-visual/axe-cierre.e2e.ts` y la compara con
 * `docs/QA/axe-baseline.json`: falla si sube el total de `critical` o `serious`, o si aparece una regla/ruta/ancho NUEVO con esos impactos.
 * moderate y minor se informan, no bloquean (la deuda estructural conocida está en docs/QA/E37_CALIDAD_UX.md).
 *   node scripts/qa/axe-comparar.cjs <salida.json>              → compara
 *   node scripts/qa/axe-comparar.cjs <salida.json> --escribir   → fija la línea base (solo tras revisar que mejoró)
 */
const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const BASE = path.join(RAIZ, 'docs', 'QA', 'axe-baseline.json')
const [archivo] = process.argv.slice(2)
if (!archivo) { console.error('uso: node scripts/qa/axe-comparar.cjs <salida.json> [--escribir]'); process.exit(2) }

const filas = fs.readFileSync(archivo, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const totales = { critical: 0, serious: 0, moderate: 0, minor: 0 }
const criticas = {} // "<proyecto> <ruta> <regla>" -> nodos, solo critical/serious
for (const f of filas) {
  for (const k of Object.keys(totales)) totales[k] += f.porImpacto[k] ?? 0
  for (const [regla, v] of Object.entries(f.reglas)) if (v.impacto === 'critical' || v.impacto === 'serious') criticas[`${f.proyecto} ${f.ruta} ${regla}`] = v.nodos
}
if (process.argv.includes('--escribir')) {
  fs.writeFileSync(BASE, JSON.stringify({ nota: 'Generado por scripts/qa/axe-comparar.cjs --escribir', mediciones: filas.length, totales, criticas }, null, 1) + '\n')
  console.log(`axe: línea base escrita (${filas.length} mediciones; ${JSON.stringify(totales)})`)
  process.exit(0)
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'))
const problemas = []
if (filas.length < base.mediciones) problemas.push(`faltan mediciones (${filas.length} de ${base.mediciones}): un tiempo de espera no cuenta como «sin problemas»`)
for (const k of ['critical', 'serious']) if (totales[k] > base.totales[k]) problemas.push(`${k}: ${totales[k]} > base ${base.totales[k]}`)
for (const [k, n] of Object.entries(criticas)) if (n > (base.criticas[k] ?? 0)) problemas.push(`peor/nuevo: ${k} (${n} nodos; base ${base.criticas[k] ?? 0})`)
for (const p of problemas) console.error('  ✗ ' + p)
console.log(`axe: ${filas.length} mediciones · ${JSON.stringify(totales)} (base ${JSON.stringify(base.totales)}) · ${problemas.length ? 'EMPEORÓ' : 'sin empeorar'}`)
process.exit(problemas.length ? 1 : 0)
