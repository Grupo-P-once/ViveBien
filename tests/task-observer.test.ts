import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { localizarBash, mensajeSinBash } from './dobles/localizar-bash'

/**
 * vivebien-task-observer (meta-skill): carga, registra, recupera, archiva y NO modifica skills activas.
 * Los scripts son bash. Si no hay un bash que FUNCIONE (se busca con `tests/dobles/localizar-bash.ts`), las pruebas de comportamiento
 * FALLAN con un mensaje que dice qué instalar; ya no se omiten (E-48, 15-oct-2026). Las estáticas no necesitan bash.
 */
const RAIZ = path.join(__dirname, '..')
const SKILL = path.join(RAIZ, '.claude', 'skills', 'vivebien-task-observer')
const SKILLS = path.join(RAIZ, '.claude', 'skills')
// Antes: si `bash` no respondía «ok» (en Windows desde PowerShell resuelve al lanzador de WSL, roto sin distribución), las pruebas de
// comportamiento se OMITÍAN en silencio y la suite parecía completa (2282 aprobadas/13 omitidas en vez de 2289/6). Ahora se busca un bash
// que funcione de verdad (Git Bash incluido) y, si no hay ninguno, esas pruebas FALLAN con un mensaje que dice qué hacer. Ver
// `tests/dobles/localizar-bash.ts` y `tests/localizar-bash.test.ts`.
const BASH = localizarBash()
const bash = (): string => {
  if (!BASH.ruta) throw new Error(mensajeSinBash(BASH.probados))
  return BASH.ruta
}
const conBash = it

const aBash = (p: string) => p.replace(/\\/g, '/')
let ws: string
const run = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  execFileSync(bash(), [aBash(path.join(SKILL, 'scripts', script)), ...args], {
    encoding: 'utf8',
    env: { ...process.env, VIVEBIEN_OBSERVER_DIR: aBash(ws), ...env },
  })

/** Huella de TODO el árbol de skills (nombres + contenido) para probar que nada lo toca. */
function huella(dir: string): string {
  const h = createHash('sha256')
  const rec = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = path.join(d, n)
      if (statSync(p).isDirectory()) rec(p)
      else h.update(path.relative(SKILLS, p)).update(readFileSync(p))
    }
  }
  rec(dir)
  return h.digest('hex')
}

beforeAll(() => { ws = mkdtempSync(path.join(tmpdir(), 'observer-')) })
afterAll(() => { rmSync(ws, { recursive: true, force: true }) })

describe('la skill carga', () => {
  const md = readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8')
  const fm = md.split('---')[1]
  it('SKILL.md tiene frontmatter válido (name, description) y es corta (carga barata)', () => {
    expect(fm).toMatch(/^name: vivebien-task-observer$/m)
    expect(fm).toMatch(/^description: .{80,}/m)
    expect(md.split('\n').length).toBeLessThan(120)
  })
  it('trae README, referencia de conversión y los scripts', () => {
    for (const f of ['README.md', 'references/conversion.md', 'scripts/_comun.sh', 'scripts/nueva-observacion.sh', 'scripts/escanear.sh', 'scripts/archivar.sh']) {
      expect(existsSync(path.join(SKILL, f)), f).toBe(true)
    }
  })
  it('se activa de forma confiable: bloque en CLAUDE.md y hook SessionStart', () => {
    expect(readFileSync(path.join(RAIZ, 'CLAUDE.md'), 'utf8')).toMatch(/vivebien-task-observer/)
    const cfg = JSON.parse(readFileSync(path.join(RAIZ, '.claude', 'settings.json'), 'utf8'))
    expect(JSON.stringify(cfg.hooks.SessionStart)).toMatch(/escanear\.sh.*--hook/)
  })
  it('declara que nunca modifica skills activas y que las reglas de VIVE BIEN prevalecen', () => {
    expect(md).toMatch(/Nunca modifica una skill activa/)
    expect(md).toMatch(/prevalecen/)
    expect(md).toMatch(/BARRERA/)
  })
})

describe('hay un bash que funciona', () => {
  // Esta prueba existe para que la falta de bash NO sea una omisión silenciosa: falla con el mensaje de qué probar y qué instalar.
  it('se encontró un bash ejecutable (si no, las pruebas de comportamiento fallan; no se omiten)', () => {
    expect(BASH.ruta, mensajeSinBash(BASH.probados)).not.toBeNull()
  })
})

describe('registra y recupera observaciones', () => {
  conBash('registra una observación con id derivado, frontmatter y plantilla', () => {
    const ruta = run('nueva-observacion.sh', ['no-prometer-sin-evidencia', 'barrera', 'vivebien']).trim()
    expect(path.basename(ruta)).toBe('0001-no-prometer-sin-evidencia.md')
    const t = readFileSync(ruta, 'utf8')
    expect(t).toMatch(/^id: 0001$/m)
    expect(t).toMatch(/^status: abierta$/m)
    expect(t).toMatch(/^type: barrera$/m)
    expect(t).toMatch(/^skill: vivebien$/m)
    expect(t).toMatch(/## Problema[\s\S]*## Mejora propuesta[\s\S]*## Principio[\s\S]*## Destino/)
  })
  conBash('el segundo id es el siguiente y nunca se repite', () => {
    const r2 = run('nueva-observacion.sh', ['otra-cosa']).trim()
    expect(path.basename(r2)).toMatch(/^0002-otra-cosa\.md$/)
  })
  conBash('recupera lo abierto leyendo solo el frontmatter, con filtro opcional', () => {
    // le ponemos título a la 1 para que el índice sea útil
    const f = path.join(ws, 'observation-log', '0001-no-prometer-sin-evidencia.md')
    const t = readFileSync(f, 'utf8').replace('title: ""', 'title: "No prometer sin evidencia"')
    execFileSync(bash(), ['-c', `printf '%s' "$1" > "$2"`, '_', t, aBash(f)])
    const todo = run('escanear.sh')
    expect(todo).toMatch(/0001 \| abierta \| barrera \| vivebien \| No prometer sin evidencia/)
    expect(todo).toMatch(/— 2 abierta\(s\)/)
    expect(run('escanear.sh', ['prometer'])).toMatch(/— 1 abierta\(s\)/)
    expect(run('escanear.sh', ['--hook'])).toMatch(/2 observación\(es\) abierta\(s\)/)
  })
  conBash('archiva lo resuelto sin borrarlo y el contador no reinicia', () => {
    const f = path.join(ws, 'observation-log', '0002-otra-cosa.md')
    const t = readFileSync(f, 'utf8').replace('status: abierta', 'status: resuelta')
    execFileSync(bash(), ['-c', `printf '%s' "$1" > "$2"`, '_', t, aBash(f)])
    expect(run('archivar.sh')).toMatch(/archivadas: 1/)
    expect(existsSync(path.join(ws, 'observation-log', 'archive', '0002-otra-cosa.md'))).toBe(true)
    expect(run('escanear.sh')).toMatch(/— 1 abierta\(s\)/)
    expect(path.basename(run('nueva-observacion.sh', ['tercera']).trim())).toBe('0003-tercera.md')
  })
})

describe('no modifica skills activas (barrera estructural)', () => {
  conBash('registrar, escanear y archivar dejan el árbol .claude/skills idéntico', () => {
    const antes = huella(SKILLS)
    run('nueva-observacion.sh', ['sin-tocar-skills', 'mejora-skill', 'vivebien'])
    run('escanear.sh'); run('archivar.sh')
    expect(huella(SKILLS)).toBe(antes)
  })
  conBash('el observador se niega a vivir dentro de una carpeta de skills (rutas relativas o de skills)', () => {
    const antes = huella(SKILLS)
    for (const mala of ['relativa/ruta', aBash(path.join(SKILLS, 'vivebien')), aBash(path.join(RAIZ, '.claude', 'skills'))]) {
      const r = spawnSync(bash(), [aBash(path.join(SKILL, 'scripts', 'nueva-observacion.sh')), 'x'], { encoding: 'utf8', env: { ...process.env, VIVEBIEN_OBSERVER_DIR: mala } })
      expect(r.status, mala).not.toBe(0)
    }
    expect(huella(SKILLS)).toBe(antes)
  })
  conBash('rechaza slugs y tipos inválidos sin crear archivos', () => {
    const antes = readdirSync(path.join(ws, 'observation-log')).length
    for (const args of [['Mal Slug'], ['ok-slug', 'tipo-raro'], ['../escape']]) {
      expect(spawnSync(bash(), [aBash(path.join(SKILL, 'scripts', 'nueva-observacion.sh')), ...args], { encoding: 'utf8', env: { ...process.env, VIVEBIEN_OBSERVER_DIR: aBash(ws) } }).status).not.toBe(0)
    }
    expect(readdirSync(path.join(ws, 'observation-log')).length).toBe(antes)
  })
  it('el workspace por defecto está fuera del repo (no entra a ningún payload) y los scripts no escriben en .claude/skills', () => {
    const comun = readFileSync(path.join(SKILL, 'scripts', '_comun.sh'), 'utf8')
    expect(comun).toMatch(/\.claude\/projects\/C--Users-jemil-vivebien-next\/skill-observations/)
    for (const s of ['nueva-observacion.sh', 'archivar.sh', 'escanear.sh']) {
      expect(readFileSync(path.join(SKILL, 'scripts', s), 'utf8')).not.toMatch(/>\s*["']?[^\n]*\.claude\/skills/)
    }
  })
})
