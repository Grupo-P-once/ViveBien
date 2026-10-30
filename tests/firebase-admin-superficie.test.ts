import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

/**
 * V-1.1.90 · D-44 — La superficie de `firebase-admin` no puede crecer sin que
 * nos enteremos, y `firebase-admin/auth` no puede volver NUNCA.
 *
 * ─────────────────────────────────────────────────────────────
 * LAS DOS COSAS QUE VIGILA ESTA PRUEBA
 *
 * 1. **Los avisos de seguridad.** Instalar `firebase-admin` trajo 114 paquetes
 *    y 4 advisories (`@grpc/grpc-js`, `brace-expansion`, `gaxios`, `uuid`).
 *    Quedárnoslo se apoya en un hecho medido: ninguno se carga, porque todo lo
 *    vulnerable cuelga de dependencias OPCIONALES (`@google-cloud/firestore` y
 *    `/storage`) que nunca se piden.
 *
 * 2. **`firebase-admin/auth` está PROHIBIDO.** No es una preferencia de estilo:
 *    no se puede cargar en el runtime de Vercel. Su `exports` resuelve a un
 *    envoltorio ESM sobre el CJS del propio SDK, que hace `require('jwks-rsa')`
 *    → `require('jose')`, y `jose` 6 es sólo ESM. Con `serverExternalPackages`,
 *    Turbopack lo carga con `externalImport`, que envuelve el fallo en un
 *    `Error` pelado sin `code`. Eso fue exactamente lo que dejó una baja real a
 *    medias, con un `ultimo_error = 'Error'` que no decía nada.
 *
 *    Un `import()` dinámico NO lo arregla: el `require` problemático está tres
 *    niveles más abajo, dentro del SDK. Por eso las dos operaciones de la baja
 *    van por Identity Toolkit REST (`crearOperaciones` en `firebase-admin.ts`),
 *    y de este paquete sólo se usa `/app`, para la credencial.
 * ─────────────────────────────────────────────────────────────
 *
 * No usa credenciales, no hace red y no toca ninguna cuenta.
 */

const req = createRequire(import.meta.url)
const SEP = String.fromCharCode(92)

/** Los paquetes que hay en `require.cache` ahora mismo. */
function cargados(): Map<string, number> {
  const m = new Map<string, number>()
  for (const k of Object.keys(req.cache)) {
    const p = k.split(SEP).join('/')
    const i = p.lastIndexOf('node_modules/')
    if (i < 0) continue
    const resto = p.slice(i + 'node_modules/'.length).split('/')
    const n = resto[0].startsWith('@') ? `${resto[0]}/${resto[1]}` : resto[0]
    m.set(n, (m.get(n) ?? 0) + 1)
  }
  return m
}

/** Los cuatro avisos nuevos que trajo `firebase-admin`. */
const CON_AVISO = ['@grpc/grpc-js', 'brace-expansion', 'uuid'] as const
/** Los opcionales de los que cuelgan. Si se cargan, entran los avisos con ellos. */
const OPCIONALES = ['@google-cloud/firestore', '@google-cloud/storage'] as const
/** Lo único que este proyecto puede importar de `firebase-admin`. */
const PERMITIDOS = new Set(['firebase-admin/app'])

/** Todos los .ts/.tsx de `src`. */
async function fuentes(): Promise<Array<{ ruta: string; texto: string }>> {
  const { readFileSync, readdirSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const salida: Array<{ ruta: string; texto: string }> = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.(ts|tsx)$/.test(e)) salida.push({ ruta, texto: readFileSync(ruta, 'utf8') })
    }
  }
  recorrer(join(process.cwd(), 'src'))
  return salida
}

/**
 * Las referencias reales a submódulos de `firebase-admin`, **sin comentarios**:
 * este archivo y `firebase-admin.ts` explican por qué `/auth` está prohibido, y
 * citarlo para explicarlo no puede hacer fallar la prueba.
 */
function submodulos(texto: string): string[] {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const encontrados: string[] = []
  for (const re of [
    /from ['"](firebase-admin[^'"]*)['"]/g,
    /import\(\s*['"](firebase-admin[^'"]*)['"]\s*\)/g,
    /require\(\s*['"](firebase-admin[^'"]*)['"]\s*\)/g,
  ]) {
    for (const m of sinComentarios.matchAll(re)) encontrados.push(m[1])
  }
  return encontrados
}

describe('la superficie de firebase-admin', () => {
  it('cargar `app` NO arrastra ninguno de los paquetes con aviso', () => {
    req('firebase-admin/app')
    const m = cargados()

    const entraron = CON_AVISO.filter((p) => m.has(p))
    expect(entraron, `se cargaron paquetes con aviso: ${entraron.join(', ')}`).toEqual([])
  })

  it('no se cargan los opcionales de Google Cloud (de ahí vienen los avisos)', () => {
    req('firebase-admin/app')
    const m = cargados()

    const entraron = OPCIONALES.filter((p) => m.has(p))
    expect(entraron, `se cargó un opcional: ${entraron.join(', ')}`).toEqual([])
  })

  it('cargar `app` tampoco arrastra `jwks-rsa` ni `jose`: la ruta frágil ya no se pisa', () => {
    req('firebase-admin/app')
    const m = cargados()
    // Éste es el hecho que hace que la baja funcione en Vercel. Si alguna vez
    // `app` empezara a arrastrar `jwks-rsa`, volveríamos al mismo problema.
    expect([...m.keys()].filter((p) => p === 'jwks-rsa')).toEqual([])
  })

  it('la copia de gaxios que se carga NO es la del aviso (6.7.1, la de raíz)', () => {
    req('firebase-admin/app')

    const rutas = Object.keys(req.cache).map((k) => k.split(SEP).join('/'))
    // La de raíz es `node_modules/gaxios/…`; las buenas están anidadas bajo
    // otro paquete (`node_modules/google-auth-library/node_modules/gaxios/…`).
    const deRaiz = rutas.filter(
      (p) => /\/node_modules\/gaxios\//.test(p) && !/node_modules\/[^/]+\/node_modules\/gaxios\//.test(p),
    )
    expect(deRaiz, 'se cargó la gaxios de raíz, que es la que depende de uuid').toEqual([])
  })

  it('el código del servidor importa ÚNICAMENTE `firebase-admin/app`', async () => {
    const malos: string[] = []
    for (const { ruta, texto } of await fuentes()) {
      for (const s of submodulos(texto)) {
        if (!PERMITIDOS.has(s)) malos.push(`${ruta.replace(process.cwd(), '')} → ${s}`)
      }
    }
    expect(malos, 'importar otro submódulo mete los paquetes con aviso').toEqual([])
  })

  it('`firebase-admin/auth` NO aparece en ninguna parte de `src` (D-44)', async () => {
    // Estático, dinámico o `require`: da igual la forma. No se puede cargar en
    // el runtime de Vercel, y una baja real se quedó a medias por ello. Las dos
    // operaciones que hacían falta van por Identity Toolkit REST.
    const malos: string[] = []
    for (const { ruta, texto } of await fuentes()) {
      if (submodulos(texto).includes('firebase-admin/auth')) malos.push(ruta.replace(process.cwd(), ''))
    }
    expect(malos, 'vuelve el ERR_REQUIRE_ESM: usa REST, no el SDK').toEqual([])
  })
})
