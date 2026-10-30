// Compara dos heap snapshots y lista lo que más creció (por tipo+nombre de constructor). Uso: node --max-old-space-size=6000 comparar-snapshots.cjs a.heapsnapshot b.heapsnapshot [top]
const fs = require('fs')
function agrega(ruta) {
  const s = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  const nf = s.snapshot.meta.node_fields
  const nt = s.snapshot.meta.node_types[0]
  const k = nf.length
  const iT = nf.indexOf('type'), iN = nf.indexOf('name'), iS = nf.indexOf('self_size')
  const out = new Map()
  const n = s.nodes
  for (let i = 0; i < n.length; i += k) {
    const tipo = nt[n[i + iT]]
    if (tipo === 'synthetic') continue
    const nombre = tipo === 'string' || tipo === 'concatenated string' || tipo === 'sliced string' ? '(cadena)' : (s.strings[n[i + iN]] || '').slice(0, 60)
    const clave = tipo + ' :: ' + nombre
    const e = out.get(clave) || { c: 0, b: 0 }
    e.c++; e.b += n[i + iS]
    out.set(clave, e)
  }
  return out
}
const A = agrega(process.argv[2]), B = agrega(process.argv[3]), TOP = Number(process.argv[4] || 25)
const filas = []
for (const [k, b] of B) { const a = A.get(k) || { c: 0, b: 0 }; filas.push({ k, dc: b.c - a.c, db: b.b - a.b, c: b.c }) }
filas.sort((x, y) => y.db - x.db)
console.log('Δ bytes (MB) | Δ objetos | total objetos | constructor')
for (const f of filas.slice(0, TOP)) console.log((f.db / 1048576).toFixed(2).padStart(10), String(f.dc).padStart(10), String(f.c).padStart(10), ' ', f.k)
