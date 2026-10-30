/**
 * SOLO LECTURA. Compara el árbol REAL de producción (dpl_99T2…) con FINAL, D75, MAIN_WT (árbol de trabajo) y HEAD.
 * Sólo hace GET con `vercel api`; no escribe en ningún árbol ni despliega nada.
 */
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const TEAM = 'team_WqoyIiavBLrfbGlwD2UqGZPW'
const PROD = 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z'
const HOME = os.homedir()
const [REPO, REF] = process.argv.slice(2)
if (!REPO || !REF) throw new Error('uso: node verificar_commit.cjs <repo> <ref>')
const ARBOLES = {}
const NO = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report', '.vercel', '.turbo'])

function api(ruta) {
  if (!/^\/v\d+\/[A-Za-z0-9_\/.?=&-]+$/.test(ruta)) throw new Error('ruta no permitida')
  for (let i = 0; i < 3; i++) {
    const r = spawnSync('vercel', ['api', ruta], { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024, timeout: 180000 })
    if (r.status === 0) { try { return JSON.parse(r.stdout) } catch { /* reintento */ } }
  }
  throw new Error('vercel api falló: ' + ruta)
}
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
function variantes(b) {
  const lf = Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
  const crlf = Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1')
  return new Set([sha1(b), sha1(lf), sha1(crlf)])
}
function mapaProd(nodos) {
  const raiz = nodos.find((n) => n.name === 'src')
  const out = {}
  const rec = (ns, pre) => { for (const n of ns) { const r = pre ? pre + '/' + n.name : n.name; if (n.type === 'directory') rec(n.children || [], r); else out[r] = n.uid } }
  rec(raiz.children || [], '')
  return out
}
function leerDir(raiz) {
  const out = {}
  const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (NO.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else { try { out[path.relative(raiz, p).split(path.sep).join('/')] = fs.readFileSync(p) } catch { /* ilegible */ } } } }
  rec(raiz)
  return out
}
function leerHead() {
  const lista = spawnSync('git', ['-C', REPO, 'ls-tree', '-r', '-z', REF], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 })
  const out = {}
  for (const l of lista.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const m = l.match(/^\d+ blob ([0-9a-f]+)\t(.*)$/)
    if (!m) continue
    const b = spawnSync('git', ['-C', REPO, 'cat-file', 'blob', m[1]], { maxBuffer: 256 * 1024 * 1024 })
    out[m[2]] = b.stdout
  }
  return out
}
function top(rutas, n = 10) {
  const c = {}
  for (const r of rutas) { const p = r.split('/'); const k = p.length > 2 && ['src', 'docs', 'tests', 'supabase', 'scripts', 'tests-visual'].includes(p[0]) ? p[0] + '/' + p[1] : p[0]; c[k] = (c[k] || 0) + 1 }
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n))
}

function main() {
  for (const dom of ['vivebienn.com', 'www.vivebienn.com']) {
    const a = api(`/v4/aliases/${dom}?teamId=${TEAM}`)
    console.log(`${dom} → ${a.deploymentId}`)
    if (a.deploymentId !== PROD) throw new Error(`${dom} ya no apunta a ${PROD}`)
  }
  const prod = mapaProd(api(`/v6/deployments/${PROD}/files?teamId=${TEAM}`))
  const resultado = { produccion: PROD, archivos_fuente: Object.keys(prod).length }
  console.log('archivos fuente de producción:', resultado.archivos_fuente)
  const locales = {}
  for (const [k, v] of Object.entries(ARBOLES)) locales[k] = leerDir(v)
  locales[REF] = leerHead()
  for (const [k, loc] of Object.entries(locales)) {
    const di = [], fa = []
    let ig = 0
    for (const [r, uid] of Object.entries(prod)) {
      const b = loc[r]
      if (!b) fa.push(r)
      else if (variantes(b).has(uid)) ig++
      else di.push(r)
    }
    const so = Object.keys(loc).filter((r) => !(r in prod)).sort()
    resultado[k] = { iguales: ig, distintos: di.length, faltan_en_local: fa.length, sobran_vs_produccion: so.length, distintos_lista: di.sort().slice(0, 80), faltan_lista: fa.sort().slice(0, 40), sobran_por_carpeta: top(so) }
    console.log(`${k}: iguales ${ig}/${Object.keys(prod).length} · distintos ${di.length} · faltan ${fa.length} · sobran ${so.length}`)
  }
  const destino = path.join(os.tmpdir(), 'verificacion_commit.json')
  fs.writeFileSync(destino, JSON.stringify(resultado, null, 1))
  console.log('guardado en', destino)
}
main()
