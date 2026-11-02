/**
 * SOLO LECTURA. Huella de los archivos FUENTE del candidato (todo menos lo generado) y comprobación de su payload contra
 * `payload_esperado_d80.json` (el del stage, sha256 6e64feee…). Se corre ANTES y DESPUÉS del gate para probar que las pruebas no tocaron la fuente.
 *   node huella_candidato.cjs <etiqueta>
 */
const crypto = process.getBuiltinModule('node:crypto')
const fs = process.getBuiltinModule('node:fs')
const os = process.getBuiltinModule('node:os')
const path = process.getBuiltinModule('node:path')

const RAIZ = path.join(os.homedir(), 'vivebien-candidato-d80')
const ETIQUETA = process.argv[2] || 'huella'
const NO = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report'])
const IGNORAR = new Set(['.env.local', 'next-env.d.ts', 'tsconfig.tsbuildinfo'])
const PAYLOAD_RAIZ = new Set(['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'vercel.json'])
const PAYLOAD_FUERA = ['src/app/vista-previa/admin/', 'src/components/admin/VistaPreviaAdmin.tsx', 'src/lib/admin/vista-previa-permisos.ts']
const enPayload = (r) => !PAYLOAD_FUERA.some((p) => r.startsWith(p)) && (PAYLOAD_RAIZ.has(r) || r.startsWith('src/') || r.startsWith('public/'))
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const archivos = {}
const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (NO.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else { const r = path.relative(RAIZ, p).split(path.sep).join('/'); if (!IGNORAR.has(r)) archivos[r] = sha1(fs.readFileSync(p)) } } }
rec(RAIZ)
const huella = sha256(Object.keys(archivos).sort().map((r) => `${r}\t${archivos[r]}`).join('\n'))
const payloadEsperado = JSON.parse(fs.readFileSync(path.join(__dirname, 'payload_esperado_d80.json'), 'utf8'))
const payloadReal = {}
for (const r of Object.keys(archivos)) if (enPayload(r)) payloadReal[r] = archivos[r]
const dif = Object.keys({ ...payloadReal, ...payloadEsperado }).filter((r) => payloadReal[r] !== payloadEsperado[r])
const salida = { etiqueta: ETIQUETA, archivos: Object.keys(archivos).length, huella_fuente: huella, payload_archivos: Object.keys(payloadReal).length, payload_diferencias_vs_esperado: dif.length }
console.log(JSON.stringify(salida))
fs.writeFileSync(path.join(os.tmpdir(), `huella_candidato_${ETIQUETA}.json`), JSON.stringify({ ...salida, mapa: archivos }))
process.exit(dif.length ? 1 : 0)
