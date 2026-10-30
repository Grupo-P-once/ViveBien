// Sonda NO DESTRUCTIVA de Identity Toolkit (D-44, fase 3 del QA).
//
//   node scripts/sonda-identity-toolkit.mjs
//
// Comprueba, de verdad y contra Google, que la baja puede hacer su trabajo:
// credencial válida · token válido · endpoint accesible · permisos correctos ·
// formato correcto de la petición · interpretación correcta de USER_NOT_FOUND.
//
// ─────────────────────────────────────────────────────────────
// POR QUÉ ES SEGURA
//
// Las dos llamadas van contra un `localId` DELIBERADAMENTE INEXISTENTE. La
// respuesta esperada es `USER_NOT_FOUND`, que es precisamente lo que demuestra
// que la petición llegó, se autenticó y se entendió — **sin tocar ninguna
// cuenta**.
//
// El identificador tiene el formato real de Firebase —28 caracteres
// alfanuméricos— para que Identity Toolkit lo procese como procesaría uno de
// verdad; si fuera un texto con guiones, la respuesta podría ser un error de
// formato y no probaríamos nada.
//
// Si por un imposible ese identificador existiera, `accounts:update` le pondría
// `validSince` (cerrar sesiones) y `accounts:delete` lo borraría. Por eso se
// puede pasar como argumento, para comprobarlo ANTES contra la base:
//
//   node scripts/sonda-identity-toolkit.mjs <localId>
//
// y además el script rechaza el UID de QA y cualquier cosa que no tenga
// exactamente el formato esperado.
//
// NUNCA imprime el token, la clave, el correo de la cuenta de servicio ni la
// cabecera Authorization.
// ─────────────────────────────────────────────────────────────

import { cert } from 'firebase-admin/app'
import { randomBytes } from 'node:crypto'

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1'
const UID_QA_PROHIBIDO = 'uRnx8chsgdSNkDbOLju5QkGBr4x1'

const crudo = process.env.FIREBASE_SERVICE_ACCOUNT
if (!crudo || !crudo.trim()) {
  console.log('SIN CREDENCIAL en este entorno: FIREBASE_SERVICE_ACCOUNT no está puesta.')
  console.log('La sonda no puede correr aquí. Ejecútala donde sí esté (o tras `vercel env pull`).')
  process.exit(2)
}

const json = JSON.parse(crudo)
const cuenta = {
  projectId: json.project_id,
  clientEmail: json.client_email,
  privateKey: json.private_key,
}
if (!cuenta.projectId || !cuenta.clientEmail || !cuenta.privateKey) {
  console.error('FALLA · a la credencial le faltan campos obligatorios')
  process.exit(1)
}

// Identificador imposible, con el formato real de Firebase. Se comprueba antes
// de usarlo: 28 caracteres alfanuméricos y nunca el de QA.
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const generar = () => [...randomBytes(28)].map((b) => ALFABETO[b % ALFABETO.length]).join('')

const inexistente = process.argv[2] ?? generar()
if (!/^[A-Za-z0-9]{28}$/.test(inexistente)) {
  console.error('FALLA · el localId no tiene el formato de Firebase (28 alfanuméricos). Se aborta.')
  process.exit(1)
}
if (inexistente === UID_QA_PROHIBIDO) {
  console.error('FALLA · ése es el UID de la cuenta QA. Se aborta.')
  process.exit(1)
}

const problemas = []
const linea = (etiqueta, estado, detalle) =>
  console.log(`${estado === 'ok' ? '  OK  ' : ' FALLA'} · ${etiqueta}${detalle ? ' · ' + detalle : ''}`)

console.log('Sonda Identity Toolkit — no destructiva')
console.log(`  proyecto: ${cuenta.projectId}`)
console.log(`  localId de prueba: ${inexistente}`)
console.log('')

// ── 1 · Token OAuth de la cuenta de servicio ───────────────────────────────
let token = ''
try {
  const credencial = cert(cuenta)
  const t = await credencial.getAccessToken()
  token = typeof t?.access_token === 'string' ? t.access_token : ''
  if (!token) throw new Error('sin access_token')
  linea('credencial válida y Google entregó un token', 'ok', `${token.length} caracteres (no se imprime)`)
} catch (e) {
  linea('credencial / token', 'falla', e?.code ?? e?.name ?? 'desconocido')
  problemas.push('no se pudo obtener el token de servicio')
  console.error('\nPROBLEMAS:\n  · ' + problemas.join('\n  · '))
  process.exit(1)
}

// ── 2 · Las dos operaciones, contra un identificador inexistente ───────────
async function probar(operacion, cuerpo) {
  const url = `${IDENTITY_TOOLKIT}/projects/${cuenta.projectId}/${operacion}`
  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch (e) {
    linea(operacion, 'falla', `no se llegó a Google (${e?.code ?? e?.name})`)
    problemas.push(`${operacion}: sin red`)
    return
  }

  const texto = await r.text().catch(() => '')
  let mensaje = ''
  try { mensaje = JSON.parse(texto)?.error?.message ?? '' } catch { /* no era JSON */ }
  const identificador = String(mensaje).split(/[\s:]/)[0]

  if (identificador === 'USER_NOT_FOUND') {
    linea(operacion, 'ok', `HTTP ${r.status} · USER_NOT_FOUND, que es lo esperado`)
    return
  }
  if (r.ok) {
    // No debería pasar nunca con un identificador aleatorio.
    linea(operacion, 'falla', `HTTP ${r.status} · respondió OK a un localId inexistente`)
    problemas.push(`${operacion}: respuesta inesperada (OK)`)
    return
  }
  if (r.status === 401) problemas.push(`${operacion}: credencial rechazada (401)`)
  else if (r.status === 403) problemas.push(`${operacion}: permisos insuficientes (403)`)
  else problemas.push(`${operacion}: HTTP ${r.status} · ${identificador || 'sin identificador'}`)
  linea(operacion, 'falla', `HTTP ${r.status} · ${identificador || texto.slice(0, 120)}`)
}

await probar('accounts:delete', { localId: inexistente })
await probar('accounts:update', { localId: inexistente, validSince: String(Math.floor(Date.now() / 1000)) })

console.log('')
if (problemas.length) {
  console.error('PROBLEMAS:')
  for (const p of problemas) console.error('  ·', p)
  process.exit(1)
}
console.log('Todo correcto: la baja puede revocar y borrar en Firebase por REST.')
