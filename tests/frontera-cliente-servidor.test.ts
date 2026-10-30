import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

/**
 * V-1.1.87 · D-42 — La frontera entre cliente y servidor se comprueba, no se
 * confía.
 *
 * `src/lib/config/flags.ts` importaba `supabaseAdmin` de `auth-server.ts`. La
 * pantalla de Super Admin es un componente de cliente y necesitaba las
 * etiquetas de los flags, así que el grafo de módulos del navegador acababa
 * incluyendo `auth-server.ts` entero. No se filtró nada —el compilador podaba
 * todo menos un efecto de módulo—, pero **depender de la poda para que un
 * secreto no viaje es apostar, no diseñar**.
 *
 * Esta prueba recorre el grafo de imports desde cada módulo de cliente y falla
 * si alcanza algo del servidor, por muchos saltos que haya en medio.
 */

const RAIZ = resolve(process.cwd(), 'src')

/** Lo que NUNCA puede alcanzarse desde un módulo de cliente. */
const PROHIBIDO = [
  { patron: /(^|\/)auth-server$/, que: 'auth-server (supabaseAdmin, service role)' },
  { patron: /(^|\/)firebase-admin$/, que: 'firebase-admin (credencial de servidor)' },
  { patron: /(^|\/)config\/flags-servidor$/, que: 'flags-servidor (lee la base)' },
]

/** Además: nada que declare `server-only`. */
const MARCA_SERVIDOR = /^import ['"]server-only['"]/m

function archivosDe(dir: string): string[] {
  const salida: string[] = []
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e)
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta))
    else if (/\.(ts|tsx)$/.test(e) && !/\.d\.ts$/.test(e)) salida.push(ruta)
  }
  return salida
}

const TODOS = archivosDe(RAIZ)
const leer = (f: string) => readFileSync(f, 'utf8')

/** Resuelve un import relativo o con alias `@/` a un archivo real. */
function resolver(desde: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(RAIZ, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(desde), spec)
  else return null // paquete de node_modules
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try {
      if (statSync(cand).isFile()) return cand
    } catch { /* siguiente */ }
  }
  return null
}

/** Los imports de un archivo, saltándose los de sólo tipos (se borran al compilar). */
function importsDe(src: string): string[] {
  const fuera: string[] = []
  for (const m of src.matchAll(/^\s*import\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/gm)) {
    if (m[1]) continue // `import type { X } from …`
    const nombres = m[2] ?? ''
    // `import { type A, type B } from …` también se borra entero.
    const soloTipos = /^\s*\{[^}]*\}\s*$/.test(nombres)
      && nombres.replace(/[{}]/g, '').split(',').filter((n) => n.trim()).every((n) => n.trim().startsWith('type '))
    if (soloTipos) continue
    fuera.push(m[3])
  }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) fuera.push(m[1])
  return fuera
}

const esCliente = (src: string) => /^\s*['"]use client['"]/.test(src)

/** Desde `inicio`, ¿se alcanza algo prohibido? Devuelve el camino si sí. */
function caminoProhibido(inicio: string): string[] | null {
  const vistos = new Set<string>()
  const pila: Array<{ f: string; camino: string[] }> = [{ f: inicio, camino: [inicio] }]

  while (pila.length) {
    const { f, camino } = pila.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)

    const src = leer(f)
    if (f !== inicio && MARCA_SERVIDOR.test(src)) return camino

    for (const spec of importsDe(src)) {
      const prohibido = PROHIBIDO.find((p) => p.patron.test(spec.replace(/^@\//, '')))
      if (prohibido) return [...camino, `${spec}  ← ${prohibido.que}`]
      const destino = resolver(f, spec)
      if (destino && !vistos.has(destino)) pila.push({ f: destino, camino: [...camino, destino] })
    }
  }
  return null
}

const corto = (f: string) => relative(process.cwd(), f).split('\\').join('/')

describe('la frontera entre cliente y servidor', () => {
  const clientes = TODOS.filter((f) => esCliente(leer(f)))

  it('hay componentes de cliente que revisar (si no, la prueba no prueba nada)', () => {
    expect(clientes.length).toBeGreaterThan(10)
  })

  it('NINGÚN módulo de cliente alcanza código de servidor, ni a través de otros', () => {
    const malos: string[] = []
    for (const c of clientes) {
      const camino = caminoProhibido(c)
      if (camino) malos.push(camino.map(corto).join('\n      → '))
    }
    expect(malos, `caminos de cliente a servidor:\n\n   ${malos.join('\n\n   ')}`).toEqual([])
  })

  it('el que fue el problema real: la pantalla de flags ya no arrastra auth-server', () => {
    const pantalla = join(RAIZ, 'app', 'admin', 'configuracion', 'page.tsx')
    expect(esCliente(leer(pantalla))).toBe(true)
    expect(caminoProhibido(pantalla)).toBeNull()
  })

  it('`config/flags` es puro: no importa nada del servidor', () => {
    const puro = join(RAIZ, 'lib', 'config', 'flags.ts')
    const src = leer(puro)
    expect(MARCA_SERVIDOR.test(src)).toBe(false)
    expect(src).not.toMatch(/auth-server|supabaseAdmin/)
    expect(caminoProhibido(puro)).toBeNull()
  })

  it('`config/flags-servidor` sí está marcado como de servidor', () => {
    expect(MARCA_SERVIDOR.test(leer(join(RAIZ, 'lib', 'config', 'flags-servidor.ts')))).toBe(true)
  })
})
