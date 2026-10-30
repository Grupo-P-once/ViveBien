/**
 * Barrera de QA de despliegues (D-61, observaciones 0001 y 0002 del Task Observer).
 *
 * Tres validaciones DISTINTAS que nunca se mezclan, cada una con su propio modo y sus propias prohibiciones:
 *
 *   candidato   → el deployment staged (`--prod --skip-domain`). Con `next.config.ts` redirigiendo `*.vercel.app` → vivebienn.com
 *                 (308), SUS PÁGINAS NO SON NAVEGABLES: solo se prueban rutas `/api/*`; de las páginas únicamente se comprueba que
 *                 respondan esa redirección. Mirar HTML ahí valida OTRA cosa (producción vigente), no el candidato.
 *                 Leer un deployment protegido con `vercel curl` CREA un token de bypass del proyecto (observación 0001): por eso exige
 *                 `--permitir-bypass` y, si el proyecto no tenía ninguno, lo REVOCA al terminar (solo ese, con guardas).
 *   staging     → el MISMO build del staging servido en local (páginas, fichas, sitemap, visual). Rechaza cualquier base que no sea local.
 *   produccion  → SOLO después de promover: rechaza ejecutarse mientras `vivebienn.com` no sirva el deployment esperado.
 *
 * Solo lectura (GET). Nunca imprime ni guarda secretos. Uso:
 *   node scripts/qa/smoke-deployment.ts candidato   --dpl dpl_X --spec scripts/qa/specs/ejemplo-*.json --permitir-bypass [--dir <staging>]
 *   node scripts/qa/smoke-deployment.ts staging     --base http://localhost:3133 --spec scripts/qa/specs/ejemplo-*.json
 *   node scripts/qa/smoke-deployment.ts produccion  --esperado dpl_X --spec scripts/qa/specs/ejemplo-*.json
 * Formato de la spec: scripts/qa/specs/ejemplo-candidato.json / ejemplo-staging.json
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export type Modo = 'candidato' | 'staging' | 'produccion'
export const DOMINIO = 'https://vivebienn.com'
export const MODOS: readonly Modo[] = ['candidato', 'staging', 'produccion']

export type Chequeo = {
  nombre: string
  ruta: string
  /** Código HTTP esperado (en `candidato` y para páginas se ignora: se exige la redirección 308 al dominio). */
  estado?: number
  /** Texto que NO debe aparecer en el cuerpo. */
  noContiene?: string[]
  /** Texto que debe aparecer en el cuerpo. */
  contiene?: string[]
  /** En `candidato`, una PÁGINA solo puede declararse con `redireccion: true` (se verifica la redirección 308, no el contenido). */
  redireccion?: boolean
  /** Para JSON: ruta de propiedad con la longitud del arreglo esperada, p. ej. {"campo":"propiedades","longitud":7}. */
  longitudJson?: { campo?: string; longitud: number }
}
export type Spec = { chequeos: Chequeo[] }

/** ¿`next.config.ts` redirige las páginas de *.vercel.app a vivebienn.com? (la regla que vuelve no navegable al candidato). */
export function redireccionVercelAppActiva(nextConfigSrc: string): boolean {
  return /\.\+\\\.vercel\\\.app/.test(nextConfigSrc)
}

export const esRutaApi = (ruta: string) => ruta.startsWith('/api/')

/** Qué se permite pedir en cada modo. Lanza si la validación se está usando para lo que no sirve. */
export function validarRuta(modo: Modo, ruta: string, redireccionActiva: boolean, esperaRedireccion: boolean): 'api' | 'pagina-redireccion' | 'pagina' {
  if (!ruta.startsWith('/') || ruta.includes('://') || ruta.includes('..')) throw new Error(`Ruta no válida: ${ruta}`)
  if (modo === 'candidato' && redireccionActiva && !esRutaApi(ruta)) {
    if (!esperaRedireccion) {
      throw new Error(`PROHIBIDO validar la página ${ruta} en el candidato: *.vercel.app redirige (308) a ${DOMINIO} por next.config.ts. ` +
        'Valídala en modo «staging» (mismo build en local) y, tras promover, en «produccion». Aquí solo se admite `esperaRedireccion: true`.')
    }
    return 'pagina-redireccion'
  }
  return esRutaApi(ruta) ? 'api' : 'pagina'
}

/** Cada modo solo acepta su tipo de base. */
export function validarBase(modo: Modo, base: string): void {
  let u: URL
  try { u = new URL(base) } catch { throw new Error(`Base no válida: ${base}`) }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (modo === 'staging' && !local) throw new Error(`«staging» solo valida el build en LOCAL (localhost). Base rechazada: ${u.host}.`)
  if (modo === 'produccion' && u.origin !== DOMINIO) throw new Error(`«produccion» solo acepta ${DOMINIO}. Base rechazada: ${u.origin}.`)
  if (modo === 'candidato' && (local || u.origin === DOMINIO)) throw new Error('«candidato» se valida contra el deployment (dpl_…), no contra local ni producción.')
}

/** El smoke de producción es POST-promoción: se niega mientras el dominio no sirva el deployment esperado. */
export function validarPostPromocion(aliasDeploymentId: string | undefined, esperado: string): void {
  if (!/^dpl_[A-Za-z0-9]+$/.test(esperado)) throw new Error('--esperado debe ser un dpl_…')
  if (aliasDeploymentId !== esperado) {
    throw new Error(`«produccion» es post-promoción: vivebienn.com sirve ${aliasDeploymentId ?? '(nada)'} y se esperaba ${esperado}. ` +
      'Antes de promover, valida el candidato (modo «candidato») y el build (modo «staging»).')
  }
}

export type MetaBypass = { scope?: string; createdAt?: number }
const HOLGURA_RELOJ_MS = 60_000

/**
 * ¿Qué hacer con los secretos de bypass tras leer el candidato? (observación 0001)
 * Se revoca SOLO un secreto que cumpla TODO: no existía antes, es `automation-bypass`, nació dentro de esta ejecución (createdAt ≥ inicio − holgura)
 * y es el único así. Ante cualquier duda (varios, sin fecha, otro scope) NO se revoca nada y se pide revisión a mano.
 */
export function secretoParaRevocar(antes: Record<string, MetaBypass>, despues: Record<string, MetaBypass>, inicioMs: number): string | null {
  const propios = Object.entries(despues).filter(([k, m]) =>
    !(k in antes) && m?.scope === 'automation-bypass' && typeof m.createdAt === 'number' && m.createdAt >= inicioMs - HOLGURA_RELOJ_MS)
  return propios.length === 1 && Object.keys(despues).filter((k) => !(k in antes)).length === 1 ? propios[0][0] : null
}

/** Una spec sin chequeos, o con chequeos que no esperan nada, aprobaría en vacío: se rechaza antes de empezar. */
export function validarSpec(spec: unknown): asserts spec is Spec {
  const cs = (spec as Spec | null)?.chequeos
  if (!Array.isArray(cs) || cs.length === 0) throw new Error('La spec no tiene chequeos: un smoke vacío aprobaría sin comprobar nada.')
  for (const c of cs) {
    if (typeof c?.nombre !== 'string' || typeof c?.ruta !== 'string') throw new Error('Cada chequeo necesita `nombre` y `ruta`.')
    const espera = c.estado !== undefined || c.redireccion === true || (c.contiene?.length ?? 0) > 0 || (c.noContiene?.length ?? 0) > 0 || c.longitudJson !== undefined
    if (!espera) throw new Error(`El chequeo «${c.nombre}» no espera nada (estado, contiene, noContiene, longitudJson o redireccion).`)
  }
}

export type Respuesta = { estado: number; cuerpo: string; location?: string }

export function evaluar(modo: Modo, c: Chequeo, r: Respuesta, redireccionActiva: boolean): { ok: boolean; detalle: string } {
  const tipo = validarRuta(modo, c.ruta, redireccionActiva, c.redireccion === true)
  if (tipo === 'pagina-redireccion') {
    const ok = r.estado === 308 && r.location === DOMINIO + c.ruta
    return { ok, detalle: `redirección esperada 308 → ${DOMINIO}${c.ruta}; recibido ${r.estado}` }
  }
  const fallos: string[] = []
  if (c.estado !== undefined && r.estado !== c.estado) fallos.push(`HTTP ${r.estado} ≠ ${c.estado}`)
  for (const t of c.contiene ?? []) if (!r.cuerpo.includes(t)) fallos.push(`falta «${t}»`)
  for (const t of c.noContiene ?? []) if (r.cuerpo.includes(t)) fallos.push(`no debía contener «${t}»`)
  if (c.longitudJson) {
    try {
      const j = JSON.parse(r.cuerpo) as unknown
      const arr = c.longitudJson.campo ? (j as Record<string, unknown>)[c.longitudJson.campo] : j
      if (!Array.isArray(arr) || arr.length !== c.longitudJson.longitud) fallos.push(`longitud JSON ≠ ${c.longitudJson.longitud}`)
    } catch { fallos.push('el cuerpo no es JSON') }
  }
  return { ok: fallos.length === 0, detalle: fallos.length ? fallos.join('; ') : `HTTP ${r.estado}` }
}

// ───────────────────────────── CLI ─────────────────────────────
const vercel = (args: string[], input?: string) =>
  spawnSync('vercel', args, { encoding: 'utf8', input, shell: process.platform === 'win32', timeout: 120_000 })
const vercelApi = (ruta: string): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = vercel(['api', ruta, '--raw'])
  if (r.status !== 0) throw new Error(`vercel api ${ruta.split('?')[0]} falló (código ${r.status})`)
  return JSON.parse(r.stdout)
}

function parsearCrudo(salida: string): Respuesta {
  const t = salida.replace(/\r\n/g, '\n')
  let resto = t
  while (/^HTTP\/\S+ 100 /.test(resto)) resto = resto.split('\n\n').slice(1).join('\n\n')
  const [cab, ...c] = resto.split('\n\n')
  const lineas = cab.split('\n')
  const location = lineas.find((l) => l.toLowerCase().startsWith('location:'))?.split(':').slice(1).join(':').trim()
  return { estado: Number(lineas[0].split(' ')[1]), cuerpo: c.join('\n\n'), location }
}

async function pedirDirecto(url: string): Promise<Respuesta> {
  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'vivebien-smoke/2 (solo lectura)' } })
  return { estado: res.status, cuerpo: await res.text(), location: res.headers.get('location') ?? undefined }
}

function flag(argv: string[], nombre: string): string | undefined {
  const i = argv.indexOf(nombre)
  return i >= 0 ? argv[i + 1] : undefined
}

export async function main(argv: string[]): Promise<number> {
  const modo = argv[0] as Modo
  if (!MODOS.includes(modo)) { console.error(`Modo: ${MODOS.join(' | ')}`); return 2 }
  const specRuta = flag(argv, '--spec')
  if (!specRuta) { console.error('Falta --spec <archivo.json>'); return 2 }
  const spec: unknown = JSON.parse(readFileSync(specRuta, 'utf8'))
  validarSpec(spec)
  const dir = flag(argv, '--dir') ?? process.cwd()
  const redireccion = redireccionVercelAppActiva(readFileSync(`${dir}/next.config.ts`, 'utf8'))
  // Antes de tocar Vercel o la red: una spec que pide validar una página donde no se puede se rechaza entera.
  for (const c of spec.chequeos) validarRuta(modo, c.ruta, redireccion, c.redireccion === true)
  let pedir: (ruta: string) => Promise<Respuesta>
  let limpiar: () => void = () => {}

  if (modo === 'candidato') {
    const dpl = flag(argv, '--dpl')
    if (!dpl || !/^dpl_[A-Za-z0-9]+$/.test(dpl)) { console.error('Falta --dpl dpl_…'); return 2 }
    if (!argv.includes('--permitir-bypass')) {
      console.error('Leer un candidato protegido con `vercel curl` CREA un token de bypass del proyecto (observación 0001). ' +
        'Repite con --permitir-bypass SOLO si el usuario lo aprobó; el token que se cree se revoca al terminar.')
      return 2
    }
    const proyecto = JSON.parse(readFileSync(`${dir}/.vercel/project.json`, 'utf8')) as { projectId: string; orgId: string }
    const rutaProyecto = `/v9/projects/${proyecto.projectId}?teamId=${proyecto.orgId}`
    const antes = (vercelApi(rutaProyecto).protectionBypass ?? {}) as Record<string, MetaBypass>
    const inicio = Date.now()
    limpiar = () => {
      const despues = (vercelApi(rutaProyecto).protectionBypass ?? {}) as Record<string, MetaBypass>
      const secreto = secretoParaRevocar(antes, despues, inicio)
      if (secreto) {
        // El secreto solo viaja por stdin; no se imprime ni se escribe.
        vercel(['api', `/v1/projects/${proyecto.projectId}/protection-bypass?teamId=${proyecto.orgId}`, '-X', 'PATCH', '--input', '-', '--silent'],
          JSON.stringify({ revoke: { secret: secreto, regenerate: false } }))
      }
      const fin = (vercelApi(rutaProyecto).protectionBypass ?? {}) as Record<string, unknown>
      if (!secreto && Object.keys(despues).some((k) => !(k in antes))) console.log('bypass: apareció un secreto que NO se pudo atribuir con certeza a esta ejecución: NO se revocó; revísalo a mano.')
      console.log(`bypass: antes ${Object.keys(antes).length} · tras revocar ${Object.keys(fin).length} ${Object.keys(fin).length === Object.keys(antes).length ? '(restaurado)' : '(¡REVISAR A MANO!)'}`)
    }
    pedir = async (ruta) => {
      const r = vercel(['curl', ruta, '--deployment', dpl, '--', '-s', '-i'])
      return parsearCrudo(r.stdout ?? '')
    }
  } else if (modo === 'staging') {
    const base = flag(argv, '--base') ?? 'http://localhost:3133'
    validarBase('staging', base)
    pedir = (ruta) => pedirDirecto(base + ruta)
  } else {
    const esperado = flag(argv, '--esperado') ?? ''
    const alias = vercelApi('/v4/aliases/vivebienn.com') as { deploymentId?: string }
    validarPostPromocion(alias.deploymentId, esperado)
    validarBase('produccion', DOMINIO)
    pedir = (ruta) => pedirDirecto(DOMINIO + ruta)
  }

  let fallos = 0
  try {
    for (const c of spec.chequeos) {
      const e = evaluar(modo, c, await pedir(c.ruta), redireccion)
      if (!e.ok) fallos++
      console.log(`${e.ok ? 'PASS' : 'FAIL'} [${modo}] ${c.nombre} · ${e.detalle}`)
    }
  } finally {
    limpiar()
  }
  console.log(fallos ? `SMOKE ${modo}: ${fallos} FALLO(S)` : `SMOKE ${modo}: todo PASS`)
  return fallos ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e: Error) => { console.error('ABORTA:', e.message); process.exit(2) })
}
