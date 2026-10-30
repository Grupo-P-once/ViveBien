import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * D-80 — los correos que Firebase Auth manda por su cuenta (restablecer contraseña y verificar correo) no pasan por Resend, así que
 * `CORREO_MODO_PRUEBAS` no los alcanza. Se cubren con el EMULADOR de Firebase Auth: con `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR` la sesión
 * habla con un servidor local que NO envía nada. Parte estática (siempre corre) + parte con emulador (corre si `FIREBASE_AUTH_EMULATOR_PRUEBAS`
 * apunta a uno, p. ej. `127.0.0.1:9099`; arrancar con `firebase emulators:start --only auth --project demo-vivebien`).
 */
const RAIZ = join(__dirname, '..')
const SRC = join(RAIZ, 'src')
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) archivos(p, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split('\\').join('/')
const TODOS = archivos(SRC)

describe('inventario estático: dónde Firebase manda correo por su cuenta', () => {
  it('sólo estos archivos llaman a los envíos de correo de Firebase (si aparece otro, hay que cubrirlo a propósito)', () => {
    const llamadas = TODOS.filter((f) => /\b(sendPasswordResetEmail|sendEmailVerification|sendSignInLinkToEmail|verifyBeforeUpdateEmail)\(/.test(codigo(readFileSync(f, 'utf8')))).map(rel).sort()
    expect(llamadas).toEqual(['src/components/acceso/Entrar.tsx', 'src/components/admin/AdminShell.tsx', 'src/components/cuenta/CuentaYSeguridad.tsx'])
  })

  it('todas esas llamadas usan el `auth` de src/lib/firebase.ts (el único lugar que sabe conectarse al emulador)', () => {
    for (const f of ['src/components/acceso/Entrar.tsx', 'src/components/cuenta/CuentaYSeguridad.tsx', 'src/components/admin/AdminShell.tsx']) {
      expect(readFileSync(join(RAIZ, f), 'utf8'), f).toMatch(/from ['"][^'"]*lib\/firebase['"]/)
    }
    const dueños = TODOS.filter((f) => /\bgetAuth\(/.test(codigo(readFileSync(f, 'utf8')))).map(rel)
    expect(dueños).toEqual(['src/lib/firebase.ts'])
  })

  it('el emulador sólo se conecta a esta máquina y sólo si la variable existe', () => {
    const t = codigo(readFileSync(join(SRC, 'lib', 'firebase.ts'), 'utf8'))
    expect(t).toMatch(/NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR/)
    expect(t).toMatch(/\(127\\\.0\\\.0\\\.1\|localhost\|\\\[::1\\\]\):/)
    expect(t).toMatch(/connectAuthEmulator\(auth, `http:\/\/\$\{EMULADOR_AUTH\}`/)
    // Ningún archivo de entorno versionado la activa.
    for (const f of ['.env.example', '.env.production', 'vercel.json']) {
      if (existsSync(join(RAIZ, f))) expect(readFileSync(join(RAIZ, f), 'utf8'), f).not.toMatch(/FIREBASE_AUTH_EMULATOR/)
    }
  })
})

type Cargado = { auth: import('firebase/auth').Auth }
async function cargarFirebase(valor: string | undefined): Promise<Cargado> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'clave-falsa-de-pruebas')
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'demo-vivebien')
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'demo-vivebien.firebaseapp.com')
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR', valor ?? '')
  const { deleteApp, getApps } = await import('firebase/app')
  for (const a of getApps()) await deleteApp(a)
  return (await import('../src/lib/firebase')) as unknown as Cargado
}

describe('conexión al emulador (sin red)', () => {
  it('sin la variable —producción— no se conecta a ningún emulador', async () => {
    expect((await cargarFirebase(undefined)).auth.emulatorConfig).toBeNull()
  })
  it('una dirección que no es de esta máquina se IGNORA', async () => {
    for (const v of ['evil.example.com:9099', 'http://127.0.0.1:9099', '127.0.0.1', '127.0.0.1:9099/x', '10.0.0.5:9099', 'localhost.evil.test:9099', '127.0.0.1.evil.test:9099']) {
      expect((await cargarFirebase(v)).auth.emulatorConfig, v).toBeNull()
    }
  })
  it('una dirección local sí conecta', async () => {
    const { auth } = await cargarFirebase('127.0.0.1:9099')
    expect(auth.emulatorConfig).toMatchObject({ host: '127.0.0.1', port: 9099 })
  })
})

const EMULADOR = process.env.FIREBASE_AUTH_EMULATOR_PRUEBAS?.trim()
// El SDK de Firebase (build de Node) toma `fetch` al CARGARSE, no en cada llamada: el registro de URLs se instala aquí, antes de importarlo, y no con vi.spyOn.
const urls: string[] = []
const original = globalThis.fetch
if (EMULADOR) {
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    urls.push(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url)
    return original(entrada, init)
  }) as typeof fetch
}
describe.runIf(!!EMULADOR && /^127\.0\.0\.1:\d+$/.test(EMULADOR))('con el emulador real: los correos de Firebase se quedan en el emulador', () => {
  const PROYECTO = 'demo-vivebien'
  const CORREO = `cliente.real.${Date.now()}@cliente-real.test` // único por corrida: el emulador conserva los códigos viejos
  const limpiar = () => fetch(`http://${EMULADOR}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' })
  beforeAll(async () => { await limpiar() })
  afterAll(async () => { await limpiar(); globalThis.fetch = original; vi.unstubAllEnvs() })

  it('restablecer contraseña y verificar correo: el emulador recibe ambos códigos y NINGUNA petición sale a un servidor de Google', async () => {
    const { auth } = await cargarFirebase(EMULADOR)
    const { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } = await import('firebase/auth')
    const cred = await createUserWithEmailAndPassword(auth, CORREO, 'Clave-De-Prueba-1!')
    urls.length = 0
    await sendEmailVerification(cred.user)
    await sendPasswordResetEmail(auth, CORREO)

    expect(urls.length).toBeGreaterThanOrEqual(2)
    for (const u of urls) expect(u.startsWith(`http://${EMULADOR}/`), u).toBe(true)
    // El emulador imita la ruta del servicio real (`/identitytoolkit.googleapis.com/…`), pero el ANFITRIÓN es el local: ninguna URL empieza por un servidor de Google.
    expect(urls.filter((u) => /^https?:\/\/[^/]*(googleapis|google\.com|firebaseapp|vivebienn)/.test(u))).toEqual([])

    const r = await (await fetch(`http://${EMULADOR}/emulator/v1/projects/${PROYECTO}/oobCodes`)).json() as { oobCodes: Array<{ email: string; requestType: string }> }
    const tipos = r.oobCodes.filter((c) => c.email === CORREO).map((c) => c.requestType).sort()
    expect(tipos).toEqual(['PASSWORD_RESET', 'VERIFY_EMAIL'])
  })
})
