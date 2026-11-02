/**
 * SOLO LECTURA. Re-verifica el stage D-80 final: recalcula hashes y compara con el manifiesto/payload, con producción (GET), con la base
 * y con el commit B. No escribe nada (salvo la salida en %TEMP%), no despliega.
 */
const { spawnSync } = process.getBuiltinModule('node:child_process')
const crypto = process.getBuiltinModule('node:crypto')
const fs = process.getBuiltinModule('node:fs')
const os = process.getBuiltinModule('node:os')
const path = process.getBuiltinModule('node:path')

const HOME = os.homedir()
const STAGE = path.join(HOME, 'vivebien-deploy-stage-d80-modo-pruebas')
const BASE = path.join(HOME, 'vivebien-deploy-stage-d75-final')
const REPO = path.join(HOME, 'vivebien-integracion-d78')
const AQUI = __dirname
const TEAM = 'team_WqoyIiavBLrfbGlwD2UqGZPW'
const PROD = 'dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z'
const DOC = {
  manifiestoD80: '7ea9168f54ccae00e76a63cf0c52132fbcda47b2744ccbaf19320dd5c914e318',
  payloadD80: 'f08c0c4159548e0b9d1dd7c938c6d4f0d550d822c56ccec833cc661e2fadb50e',
  manifiestoBase: '0282b61ae188808172e6c2e341bbf3d5333082e87d8e4189c8b85eac7bb1dc6d',
  payloadBase: 'fc8156d9c0aa1e945e58003ab0f0c5dda3769bd434dcadd17751ebb5aa815674',
}
const MARCA = '.armar_stage_marca'
const NO = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report'])
const PAYLOAD_RAIZ = new Set(['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'vercel.json'])
const PAYLOAD_FUERA = ['src/app/vista-previa/admin/', 'src/components/admin/VistaPreviaAdmin.tsx', 'src/lib/admin/vista-previa-permisos.ts']
const enPayload = (r) => !PAYLOAD_FUERA.some((p) => r.startsWith(p)) && (PAYLOAD_RAIZ.has(r) || r.startsWith('src/') || r.startsWith('public/'))

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')
const variantes = (b) => { const lf = Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'); return new Set([sha1(b), sha1(lf), sha1(Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1'))]) }
const normNl = (b) => Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
function walk(raiz) {
  const out = {}
  const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (NO.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else out[path.relative(raiz, p).split(path.sep).join('/')] = p } }
  rec(raiz)
  return out
}
function api(ruta) {
  for (let i = 0; i < 3; i++) {
    const r = spawnSync('vercel', ['api', ruta], { encoding: 'utf8', shell: true, maxBuffer: 256 * 1024 * 1024, timeout: 180000 })
    if (r.status === 0) { try { return JSON.parse(r.stdout) } catch { /* reintento */ } }
  }
  throw new Error('vercel api falló: ' + ruta)
}
const resultado = {}
const marca = (k, ok, detalle = '') => { resultado[k] = { ok, detalle }; console.log(`${ok ? 'OK ' : 'FALLA'}  ${k}${detalle ? ' · ' + detalle : ''}`) }

// 1 · archivos de referencia: sha256 recalculados
const mpath = path.join(AQUI, 'stage_manifest_d80v2.json'), ppath = path.join(AQUI, 'payload_esperado_d80v2.json')
const mD = fs.readFileSync(mpath), pD = fs.readFileSync(ppath)
marca('sha256 del manifiesto D-80 recalculado == documentado', sha256(mD) === DOC.manifiestoD80, sha256(mD))
marca('sha256 del payload D-80 recalculado == documentado', sha256(pD) === DOC.payloadD80, sha256(pD))
const mBase = fs.readFileSync(path.join(AQUI, 'stage_manifest_d75.json')), pBase = fs.readFileSync(path.join(AQUI, 'payload_esperado_d75.json'))
marca('sha256 del manifiesto base == aprobado (D-77/D-78)', sha256(mBase) === DOC.manifiestoBase)
marca('sha256 del payload base == aprobado (D-77/D-78)', sha256(pBase) === DOC.payloadBase)
const manifiesto = JSON.parse(mD), payload = JSON.parse(pD)

// 2 · el stage real vs su manifiesto
const archivos = walk(STAGE)
const reales = Object.keys(archivos).filter((r) => r !== MARCA)
const sobran = reales.filter((r) => !(r in manifiesto)), faltan = Object.keys(manifiesto).filter((r) => !(r in archivos))
let malos = []
for (const [r, h] of Object.entries(manifiesto)) { if (r in archivos && sha1(fs.readFileSync(archivos[r])) !== h) malos.push(r) }
marca('el stage coincide con su manifiesto (sha1 de cada archivo recalculado)', !sobran.length && !faltan.length && !malos.length, `${reales.length} archivos · sobran ${sobran.length} · faltan ${faltan.length} · distintos ${malos.length}`)

// 3 · payload recalculado desde el stage
const payloadReal = {}
for (const r of reales) if (enPayload(r)) payloadReal[r] = sha1(fs.readFileSync(archivos[r]))
const pdif = Object.keys({ ...payloadReal, ...payload }).filter((r) => payloadReal[r] !== payload[r])
marca('el payload recalculado del stage == payload_esperado_d80v2', !pdif.length, `${Object.keys(payloadReal).length} archivos · diferencias ${pdif.length}`)

// 4 · producción (GET): alias, árbol real y diferencias del stage
for (const dom of ['vivebienn.com', 'www.vivebienn.com']) {
  const a = api(`/v4/aliases/${dom}?teamId=${TEAM}`)
  marca(`${dom} sigue en ${PROD}`, a.deploymentId === PROD, a.deploymentId)
}
const arbol = api(`/v6/deployments/${PROD}/files?teamId=${TEAM}`)
const prod = {}
const rec = (ns, pre) => { for (const n of ns) { const r = pre ? pre + '/' + n.name : n.name; if (n.type === 'directory') rec(n.children || [], r); else prod[r] = n.uid } }
rec(arbol.find((n) => n.name === 'src').children || [], '')
marca('árbol real de producción: 382 archivos fuente', Object.keys(prod).length === 382, String(Object.keys(prod).length))
const baseMap = walk(BASE)
let baseDist = []
for (const [r, uid] of Object.entries(prod)) { const f = baseMap[r]; if (!f || !variantes(fs.readFileSync(f)).has(uid)) baseDist.push(r) }
marca('la base aprobada (-d75-final) sigue == producción (382/382)', !baseDist.length, `distintos ${baseDist.length}`)
let distintos = [], faltanProd = []
for (const [r, uid] of Object.entries(prod)) { const f = archivos[r]; if (!f) faltanProd.push(r); else if (!variantes(fs.readFileSync(f)).has(uid)) distintos.push(r) }
distintos.sort()
const ESPERADOS8 = ['next.config.ts', 'src/app/api/registro-lead/route.ts', 'src/app/api/usuarios/me/route.ts', 'src/components/Footer.tsx', 'src/components/QuieroPublicar.tsx', 'src/components/portal/ConfiguracionPortal.tsx', 'src/lib/limites.ts', 'vercel.json', 'src/lib/aviso-lead.ts', 'src/lib/citas/enviar.ts', 'src/lib/invitacion-correo.ts', 'src/lib/firebase.ts']
marca('stage vs producción: 370/382 iguales y faltan 0', Object.keys(prod).length - distintos.length === 370 && !faltanProd.length, `distintos ${distintos.length}`)
marca('los 12 distintos son EXACTAMENTE los 8 de D-80 + los 4 emisores del modo de pruebas', JSON.stringify(distintos) === JSON.stringify([...ESPERADOS8].sort()), distintos.join(', '))
const residuo = ['src/app/globals.css', 'src/app/propiedades/[id]/page-client.tsx', 'src/app/propiedades/page-client.tsx', 'src/components/PropertyCard.tsx', 'src/components/acceso/Entrar.tsx', 'src/components/portal/PortalShell.tsx', 'src/lib/asignar-slug.ts']
marca('ninguna de las 7 rutas del residuo de V-1.1.95 difiere de producción', residuo.every((r) => !distintos.includes(r)))

// 5 · cada cambio del stage == lo que hay en el commit B (sin fines de línea) y viene sólo de D-80
function blob(ref, r) { const x = spawnSync('git', ['-C', REPO, 'show', `${ref}:${r}`], { maxBuffer: 64 * 1024 * 1024 }); return x.status === 0 ? x.stdout : null }
const cambiosBase = reales.filter((r) => !(r in baseMap) || !normNl(fs.readFileSync(archivos[r])).equals(normNl(fs.readFileSync(baseMap[r]))))
const quitados = Object.keys(baseMap).filter((r) => !(r in archivos) && r !== MARCA)
let noEnB = []
for (const r of cambiosBase) { const b = blob('integracion/d80-correo', r); if (!b || !normNl(b).equals(normNl(fs.readFileSync(archivos[r])))) noEnB.push(r) }
marca('stage vs base: cambios = 51 (13 modificados + 38 nuevos) y no quita nada', cambiosBase.length === 51 && !quitados.length, `cambios ${cambiosBase.length} · quitados ${quitados.length}`)
marca('los 51 cambios son idénticos (salvo fines de línea) a los de la rama integracion/d80-correo (a6ebdb6)', !noEnB.length, noEnB.length ? noEnB.join(', ') : 'todos coinciden')
const noD80 = cambiosBase.filter((r) => !(/correo|recomendaciones|registro-lead|usuarios\/me|Footer|QuieroPublicar|ConfiguracionPortal|limites|next\.config|vercel\.json|e39-guardias|aviso-lead|citas\/enviar|invitacion-correo|lib\/firebase/.test(r)))
marca('ningún cambio del stage es ajeno a D-80', !noD80.length, noD80.join(', '))
// 6 · banderas: ningún archivo del stage trae valores de CORREO_*/RESEND_* ni .env
const envs = reales.filter((r) => /(^|\/)\.env/.test(r))
marca('el stage no contiene archivos .env', !envs.length, envs.join(', '))
let asign = []
for (const r of reales) { if (!/\.(ts|tsx|json|mjs|cjs|js)$/.test(r) || r.startsWith('tests/')) continue; const t = fs.readFileSync(archivos[r], 'latin1'); if (/\b(CORREO_(TRANSACCIONAL|MARKETING)|RESEND_API_KEY)\s*[:=]\s*['"`]?[A-Za-z0-9]/.test(t) && !/process\.env|env\./.test(t.split('\n').find((l) => /CORREO_(TRANSACCIONAL|MARKETING)|RESEND_API_KEY/.test(l)) || '')) asign.push(r) }
marca('ningún archivo de aplicación del stage asigna un valor a CORREO_*/RESEND_API_KEY', !asign.length, asign.join(', '))
fs.writeFileSync(path.join(os.tmpdir(), 'verificacion_stage_d80v2.json'), JSON.stringify(resultado, null, 1))
const fallas = Object.entries(resultado).filter(([, v]) => !v.ok)
console.log(`\nRESUMEN: ${Object.keys(resultado).length - fallas.length}/${Object.keys(resultado).length} comprobaciones OK`)
process.exit(fallas.length ? 1 : 0)
