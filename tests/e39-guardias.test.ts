import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * E-39 · GUARDIAS ESTÁTICAS. Cada una detecta un patrón que ya costó caro (o que podría) SIN bloquear código legítimo; fallan en el árbol
 * con un mensaje que dice QUÉ archivo y POR QUÉ. Complementan (no repiten) la barrera de Supabase de R-01 (`supabase-servidor-barrera.test.ts`:
 * un solo `createClient` de servidor, sin auto-refresco).
 */
const RAIZ = path.join(__dirname, '..')
const SRC = path.join(RAIZ, 'src')

function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === '.next' || n === 'capturas') return []
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? archivos(p, ext) : ext.test(n) ? [p] : []
  })
}
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/')
const leer = (p: string) => readFileSync(p, 'utf8')
const codigo = archivos(SRC, /\.(ts|tsx)$/)
const rutasApi = archivos(path.join(SRC, 'app', 'api'), /^route\.ts$/)

describe('guardia · sin caracteres de control en el código (observación 0006: «\\b» escrito desde un script quedó como retroceso)', () => {
  it('src/, tests/ y scripts/ no contienen NUL, retroceso, tabulador vertical, avance de página ni otros controles (salvo tab, LF y CR)', () => {
    const todos = [...codigo, ...archivos(path.join(RAIZ, 'tests'), /\.(ts|tsx|cjs|mjs)$/), ...archivos(path.join(RAIZ, 'scripts'), /\.(ts|cjs|mjs|py)$/)]
    const malos: string[] = []
    for (const f of todos) {
      const t = leer(f)
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i)
        if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127) { malos.push(`${rel(f)} (posición ${i}, código ${c})`); break }
      }
    }
    expect(malos).toEqual([])
  })
})

describe('guardia · secretos fuera del navegador', () => {
  it('ninguna variable NEXT_PUBLIC_* tiene nombre de secreto (se publica en el JS del cliente)', () => {
    const malos: string[] = []
    for (const f of codigo) for (const m of leer(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]*/g)) if (/(SERVICE|SECRET|PRIVATE|PASSWORD|PASSWD|CREDENTIAL)/.test(m[0])) malos.push(`${rel(f)}: ${m[0]}`)
    expect(malos).toEqual([])
  })
  it('un archivo «use client» solo lee variables NEXT_PUBLIC_* (o NODE_ENV)', () => {
    const malos: string[] = []
    for (const f of codigo) {
      const t = leer(f)
      if (!/^\s*['"]use client['"]/m.test(t.slice(0, 400))) continue
      for (const m of t.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!/^NEXT_PUBLIC_/.test(m[1]) && m[1] !== 'NODE_ENV') malos.push(`${rel(f)}: process.env.${m[1]}`)
    }
    expect(malos).toEqual([])
  })
  it('la clave de servicio de Supabase solo se lee en código de servidor (nunca en componentes de cliente)', () => {
    const malos = codigo.filter((f) => /^\s*['"]use client['"]/m.test(leer(f).slice(0, 400)) && /SERVICE_ROLE/.test(leer(f))).map(rel)
    expect(malos).toEqual([])
  })
})

describe('guardia · respuestas privadas no cacheables', () => {
  // Misma lógica que usa `next.config.ts`: las rutas privadas declaradas allí.
  const cfg = leer(path.join(RAIZ, 'next.config.ts'))
  const privadas = [...(cfg.match(/const rutasPrivadas = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/"\/api\/([a-z0-9-]+)\/:path\*"/g)].map((m) => m[1])
  const AUTH = /\b(requireAdmin|exigirPortal|exigir|requireRole|getPerfil)\s*\(/
  // Públicas a propósito (sin sesión): se autentican por secreto/firma o no llevan datos de nadie.
  const PUBLICAS = new Set(['acceso', 'ayuda', 'catalogo', 'registro-lead', 'salud', 'telegram', 'whatsapp'])

  it('toda carpeta de /api con rutas que exigen sesión está en `rutasPrivadas` (Cache-Control private, no-store + Vary)', () => {
    const grupos = new Map<string, boolean>()
    for (const f of rutasApi) {
      const g = rel(f).split('/')[3] // src/app/api/<grupo>/…
      grupos.set(g, (grupos.get(g) ?? false) || AUTH.test(leer(f)))
    }
    const sinCubrir = [...grupos].filter(([g, conAuth]) => conAuth && !privadas.includes(g) && !PUBLICAS.has(g)).map(([g]) => g)
    expect(sinCubrir, 'añádelas a `rutasPrivadas` en next.config.ts').toEqual([])
  })
  it('las carpetas públicas no están marcadas como privadas por error (el catálogo debe seguir cacheable)', () => {
    for (const g of ['catalogo', 'salud', 'ayuda', 'telegram', 'whatsapp', 'registro-lead', 'acceso']) expect(privadas, g).not.toContain(g)
  })
})

describe('guardia · rutas públicas que ESCRIBEN llevan límite de peticiones', () => {
  const AUTH = /\b(requireAdmin|exigirPortal|exigir|requireRole|getPerfil)\s*\(/
  // Se autentican por secreto/firma del proveedor (probado en e39-webhooks.test.ts), no por sesión.
  const WEBHOOKS = new Set(['telegram', 'whatsapp'])
  it('un POST/PUT/PATCH/DELETE sin sesión debe pasar por `frenarAsync(`/`frenar(`', () => {
    const sin: string[] = []
    for (const f of rutasApi) {
      const t = leer(f)
      const g = rel(f).split('/')[3]
      if (WEBHOOKS.has(g) || AUTH.test(t)) continue
      if (/export\s+(async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/.test(t) && !/\bfrenar(Async)?\s*\(/.test(t)) sin.push(rel(f))
    }
    expect(sin).toEqual([])
  })
})

describe('guardia · webhooks', () => {
  const webhooks = rutasApi.filter((f) => /\/webhook\/route\.ts$/.test(rel(f)))
  it('hay al menos 2 webhooks (Telegram y WhatsApp) y todos cumplen lo mínimo', () => {
    expect(webhooks.length).toBeGreaterThanOrEqual(2)
    for (const f of webhooks) {
      const t = leer(f)
      expect(t, rel(f) + ': secreto/firma en tiempo constante').toMatch(/timingSafeEqual|verificarWebhook\(/)
      expect(t, rel(f) + ': tope de tamaño del cuerpo').toMatch(/MAX_CUERPO/)
      expect(t, rel(f) + ': registros saneados').toMatch(/limpiarTexto/)
    }
  })
})

describe('guardia · registros sin secretos', () => {
  /** Quita el CONTENIDO de los literales de texto (el nombre de una variable dentro de un mensaje no es un valor) y conserva las expresiones `${…}`. */
  function soloExpresiones(linea: string): string {
    return linea
      .replace(/`([^`]*)`/g, (_m, c: string) => ' ' + [...c.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).join(' ') + ' ')
      .replace(/'[^']*'|"[^"]*"/g, ' ')
  }
  const PROHIBIDO = /\b(process\.env|authorization|cookie|cookies|password|passwd|secreto|secret|service_role|apikey|api_key|headers)\b/i
  it('ningún console.* de src/ imprime variables de entorno, cabeceras, cookies, contraseñas ni secretos', () => {
    const malos: string[] = []
    for (const f of codigo) {
      leer(f).split('\n').forEach((l, i) => {
        if (/^\s*(\*|\/\/)/.test(l) || !/console\.(error|warn|log|info|debug)\(/.test(l)) return
        const args = l.slice(l.indexOf('console.'))
        if (PROHIBIDO.test(soloExpresiones(args))) malos.push(`${rel(f)}:${i + 1}: ${l.trim().slice(0, 110)}`)
      })
    }
    expect(malos).toEqual([])
  })
})
