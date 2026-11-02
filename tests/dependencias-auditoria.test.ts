import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * DEP-1 / DEP-2 (3-nov-2026) — decisiones de dependencias que mantienen `npm audit` en 0 (completo y con --omit=dev). Si alguien las deshace sin
 * saberlo, vuelven los avisos; esta prueba lo dice antes. No sustituye a `npm audit`: fija el porqué de cada decisión.
 */
const raiz = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(raiz, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> }
const mayor = (v: string) => Number(v.split('.')[0])

describe('dependencias y auditoría', () => {
  it('rimraf usa glob 14 (DEP-1) y todo minimatch del árbol es de la línea 11 o posterior (DEP-2)', () => {
    expect(pkg.overrides.rimraf).toEqual({ glob: '^14.0.3' })
    expect(pkg.overrides.minimatch).toBe('^11.0.4')
    const versiones = Object.entries(lock.packages).filter(([k]) => /(^|\/)node_modules\/minimatch$/.test(k)).map(([k, v]) => [k, v.version!] as const)
    expect(versiones.length).toBeGreaterThan(0)
    for (const [k, v] of versiones) expect(mayor(v), `${k}@${v}`).toBeGreaterThanOrEqual(11)
  })

  it('el paquete `shadcn` (CLI con deepmerge sin versión corregida) ya no está en el árbol; el CSS que usaba vive en src/app', () => {
    expect(pkg.dependencies?.shadcn).toBeUndefined()
    expect(pkg.devDependencies?.shadcn).toBeUndefined()
    expect(Object.keys(lock.packages).filter((k) => /node_modules\/(shadcn|deepmerge|@hono\/node-server|ts-morph)$/.test(k))).toEqual([])
    const globals = readFileSync(join(raiz, 'src/app/globals.css'), 'utf8')
    expect(globals).toMatch(/@import "\.\/shadcn-tailwind\.css";/)
    expect(globals).not.toMatch(/@import "shadcn\//)
    const css = readFileSync(join(raiz, 'src/app/shadcn-tailwind.css'), 'utf8')
    expect(css).toMatch(/licencia MIT/)
    expect(css).toMatch(/@custom-variant data-open/)
    expect(css).toMatch(/@keyframes accordion-down/)
  })

  it('las herramientas de desarrollo no están en dependencies (no viajan a producción)', () => {
    for (const nombre of ['eslint', 'eslint-config-next', 'typescript-eslint', 'vitest', 'shadcn']) expect(pkg.dependencies?.[nombre], nombre).toBeUndefined()
  })
})
