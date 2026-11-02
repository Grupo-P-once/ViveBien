// SOLO LECTURA: ¿las 7 rutas del residuo de V-1.1.95 en el árbol de trabajo valen en HEAD lo mismo que en producción?
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
/* eslint-enable @typescript-eslint/no-require-imports */
const TEAM = 'team_WqoyIiavBLrfbGlwD2UqGZPW', PROD = 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z'
const R = 'C:/Users/jemil/vivebien-next'
const RUTAS = ['src/app/globals.css', 'src/app/propiedades/[id]/page-client.tsx', 'src/app/propiedades/page-client.tsx', 'src/components/PropertyCard.tsx', 'src/components/acceso/Entrar.tsx', 'src/components/portal/PortalShell.tsx', 'src/lib/asignar-slug.ts']
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const variantes = (b) => { const lf = Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'); return new Set([sha1(b), sha1(lf), sha1(Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1'))]) }
const r = spawnSync('vercel', ['api', `/v6/deployments/${PROD}/files?teamId=${TEAM}`], { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024 })
const prod = {}
const rec = (ns, pre) => { for (const n of ns) { const p = pre ? pre + '/' + n.name : n.name; if (n.type === 'directory') rec(n.children || [], p); else prod[p] = n.uid } }
rec(JSON.parse(r.stdout).find((n) => n.name === 'src').children, '')
for (const f of RUTAS) {
  const h = spawnSync('git', ['-C', R, 'show', 'HEAD:' + f], { maxBuffer: 64 * 1024 * 1024 })
  const enHead = h.status === 0
  console.log(`${f}: HEAD ${enHead ? (variantes(h.stdout).has(prod[f]) ? '== producción' : '!= producción') : 'no existe en HEAD'}`)
}
// cuántos archivos de producción difieren de HEAD y de qué clase
const salida = spawnSync('git', ['-C', R, 'status', '--porcelain', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\0').filter(Boolean)
const sucios = new Map(salida.map((s) => [s.slice(3), s.slice(0, 2)]))
let mod = 0, nuevo = 0
for (const f of Object.keys(prod)) { const e = sucios.get(f); if (e === '??') nuevo++; else if (e) mod++ }
console.log(`archivos de producción que en el árbol de trabajo están: modificados ${mod}, sin versionar ${nuevo}, limpios ${Object.keys(prod).length - mod - nuevo}`)
