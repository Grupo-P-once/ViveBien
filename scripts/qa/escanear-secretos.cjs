/**
 * Escáner de secretos del árbol (E-39, puerta `qa:gate`). Busca en el CÓDIGO versionable (src, scripts, tests, docs, supabase, configuración raíz)
 * formas que son secretos reales. NUNCA imprime el valor: solo archivo, línea y tipo. Excluye node_modules, .next, .git y los `.env*` locales (que
 * no se versionan y por eso mismo no deben aparecer dentro de ningún archivo versionable).
 *   · JWT cuyo rol es `service_role` (la clave `anon` es pública por diseño y se permite);
 *   · asignaciones `SUPABASE_SERVICE_ROLE_KEY=…`, `TELEGRAM_BOT_TOKEN=…`, `*_SECRET=…`, `*_API_KEY=…` con un valor largo;
 *   · token de bot de Telegram (`123456789:AA…`), claves de AWS (`AKIA…`), bloques de clave privada (`-----BEGIN … PRIVATE KEY-----`), `sk_live_…`.
 * Falsos positivos conocidos: ninguno en el árbol actual; si aparece uno legítimo se lista aquí con su motivo, no se desactiva la regla.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const fs = require('node:fs')
const path = require('node:path')
/* eslint-enable @typescript-eslint/no-require-imports */

const RAIZ = path.resolve(__dirname, '..', '..')
const CARPETAS = ['src', 'scripts', 'tests', 'tests-visual', 'docs', 'supabase', 'design', 'docker', 'public']
const RAIZ_ARCHIVOS = ['package.json', 'next.config.ts', 'vercel.json', 'README.md', 'tsconfig.json', 'AGENTS.md', 'CLAUDE.md']
const SALTAR = new Set(['node_modules', '.next', '.git', 'capturas', 'test-results', 'reports'])
const EXT = /\.(ts|tsx|js|cjs|mjs|json|md|sql|sh|py|yml|yaml|css|html|txt)$/i

function recorrer(dir, salida) {
  if (!fs.existsSync(dir)) return
  for (const n of fs.readdirSync(dir)) {
    if (SALTAR.has(n)) continue
    const p = path.join(dir, n)
    const st = fs.statSync(p)
    if (st.isDirectory()) recorrer(p, salida)
    else if (EXT.test(n) && st.size < 3_000_000) salida.push(p)
  }
}

const REGLAS = [
  { tipo: 'JWT con rol service_role', re: /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g, valida: (m) => { try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role' } catch { return false } } },
  { tipo: 'asignación de secreto con valor', re: /\b(SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|WHATSAPP_APP_SECRET|WHATSAPP_VERIFY_TOKEN|CRON_SECRET|SALUD_SECRETO|RESEND_API_KEY|FIREBASE_PRIVATE_KEY|CLOUDINARY_API_SECRET)\s*[=:]\s*["']?([A-Za-z0-9_\-./+=:]{20,})/g, valida: (m) => !/^(mock|dummy|ejemplo|tu[-_]|xxx|\.\.\.|\$\{|process\.env)/i.test(m[2]) && !/dummy-local-key|valor-que-no-debe|secreto-de|secreto-super|app-secret-de|verify-token-de/i.test(m[2]) },
  { tipo: 'token de bot de Telegram', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/g, valida: (m) => !/ABC|AAH?dqTcvCH1vGWJxfSeofSAs0K5PALDsaw|AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw12/.test(m[0]) },
  { tipo: 'clave de AWS', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { tipo: 'clave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { tipo: 'clave sk_live', re: /\bsk_live_[A-Za-z0-9]{16,}/g },
]

const archivos = []
for (const c of CARPETAS) recorrer(path.join(RAIZ, c), archivos)
for (const f of RAIZ_ARCHIVOS) if (fs.existsSync(path.join(RAIZ, f))) archivos.push(path.join(RAIZ, f))
// Valores FICTICIOS de pruebas (se documentan con su motivo; la regla sigue activa para todo lo demás).
const PERMITIDOS = {
  'tests/entorno-staging.test.ts': 'prueba de que la barrera NO imprime un token de mentira',
  'tests/salud.test.ts': 'token de bot ficticio (AAAA…) para comprobar que /api/salud no lo revela',
  'tests/firebase-rest.test.ts': 'texto de error de prueba que menciona la frase «clave privada»',
}
const hallazgos = []
for (const f of archivos) {
  const t = fs.readFileSync(f, 'utf8')
  const rel = path.relative(RAIZ, f).split(path.sep).join('/')
  if (PERMITIDOS[rel]) continue
  for (const r of REGLAS) {
    for (const m of t.matchAll(r.re)) {
      if (r.valida && !r.valida(m)) continue
      hallazgos.push(`${rel}:${t.slice(0, m.index).split('\n').length} · ${r.tipo}`)
    }
  }
}
for (const h of hallazgos) console.error('  ✗ ' + h)
console.log(`secretos: ${archivos.length} archivos revisados, ${hallazgos.length} hallazgo(s)`)
process.exit(hallazgos.length ? 1 : 0)
