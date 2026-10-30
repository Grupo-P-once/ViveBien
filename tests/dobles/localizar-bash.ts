import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Localiza un `bash` que FUNCIONE de verdad (15-oct-2026, E-48).
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * `tests/task-observer.test.ts` probaba `spawnSync('bash', ['-c', 'echo ok'])` y, si no devolvía «ok», OMITÍA en silencio las 7 pruebas de
 * comportamiento. En Windows, desde PowerShell, `bash` resuelve a `C:\Windows\System32\bash.exe`, el lanzador de WSL, que falla
 * («execvpe(/bin/bash) failed») cuando no hay ninguna distribución instalada: la suite salía «verde» con 2282 aprobadas y 13 omitidas en
 * vez de 2289 y 6, y nada decía que faltaba cubrir la skill. Además, dos de esas pruebas esperan `status !== 0`, que con un `bash` que no
 * arranca (`status: null`) se cumple por la razón equivocada.
 *
 * AHORA
 *  · Se busca un bash en lugares conocidos ANTES que el de PATH (Git Bash de Windows, o `VIVEBIEN_BASH`) y cada candidato se VALIDA
 *    ejecutándolo (`echo ok`), no solo comprobando que el archivo exista.
 *  · Si ninguno funciona, quien lo use debe FALLAR con `mensajeSinBash` (qué se probó y qué hacer), nunca omitir.
 *
 * Código con todo inyectable (entorno, plataforma, existencia de archivos, ejecución): se prueba sin depender de la máquina.
 * ─────────────────────────────────────────────────────────────
 */

export type Ejecutar = (ruta: string, args: string[], opciones: { encoding: 'utf8'; timeout: number }) => { status: number | null; stdout?: string | null }

/** ¿Este ejecutable arranca de verdad y responde «ok»? Un lanzador roto (WSL sin distribución) devuelve estado ≠ 0 o no imprime «ok». */
export function bashFunciona(ruta: string, ejecutar: Ejecutar = spawnSync as unknown as Ejecutar): boolean {
  try {
    const r = ejecutar(ruta, ['-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000 })
    return r.status === 0 && String(r.stdout ?? '').trim() === 'ok'
  } catch {
    return false
  }
}

export type Entorno = Record<string, string | undefined>

/** Rutas a probar, en orden. En Windows el Git Bash va ANTES que el `bash` de PATH (que puede ser el lanzador de WSL). */
export function candidatosDeBash(entorno: Entorno, plataforma: string, existe: (ruta: string) => boolean = existsSync): string[] {
  // Lo que el usuario fuerza se prueba SIEMPRE (aunque no exista): si está mal, el mensaje final lo dice en vez de ignorarlo.
  const forzado = entorno.VIVEBIEN_BASH ? [entorno.VIVEBIEN_BASH] : []
  const lista: string[] = []

  if (plataforma === 'win32') {
    const bases = [entorno.ProgramFiles, entorno['ProgramFiles(x86)'], entorno.ProgramW6432, entorno.LOCALAPPDATA ? path.join(entorno.LOCALAPPDATA, 'Programs') : undefined]
    for (const b of bases) {
      if (!b) continue
      lista.push(path.win32.join(b, 'Git', 'bin', 'bash.exe'), path.win32.join(b, 'Git', 'usr', 'bin', 'bash.exe'))
    }
    // Git en PATH: <raíz>\cmd\git.exe  →  <raíz>\bin\bash.exe
    for (const d of (entorno.PATH ?? entorno.Path ?? '').split(';')) {
      if (/[\\/]Git[\\/]cmd[\\/]?$/i.test(d)) lista.push(path.win32.join(d, '..', 'bin', 'bash.exe'))
    }
    // Las rutas absolutas solo cuentan si el archivo existe; `bash` (de PATH) se prueba siempre, al final.
    return unicos([...forzado, ...lista.filter((r) => existe(r)), 'bash'])
  }

  return unicos([...forzado, 'bash', ...['/bin/bash', '/usr/bin/bash'].filter((r) => existe(r))])
}

const unicos = (xs: string[]) => [...new Set(xs)]

export type ResultadoBash = { ruta: string | null; probados: Array<{ ruta: string; funciona: boolean }> }

/** Devuelve el primer bash que FUNCIONA (o `ruta: null` con todo lo que se probó). */
export function localizarBash(opciones: {
  entorno?: Entorno
  plataforma?: string
  existe?: (ruta: string) => boolean
  funciona?: (ruta: string) => boolean
} = {}): ResultadoBash {
  const entorno = opciones.entorno ?? process.env
  const plataforma = opciones.plataforma ?? process.platform
  const funciona = opciones.funciona ?? ((r: string) => bashFunciona(r))
  const probados: ResultadoBash['probados'] = []
  for (const ruta of candidatosDeBash(entorno, plataforma, opciones.existe)) {
    const ok = funciona(ruta)
    probados.push({ ruta, funciona: ok })
    if (ok) return { ruta, probados }
  }
  return { ruta: null, probados }
}

/** Mensaje accionable cuando no hay bash: qué se probó y cómo arreglarlo. */
export function mensajeSinBash(probados: ResultadoBash['probados']): string {
  const lista = probados.length ? probados.map((p) => `  · ${p.ruta} → ${p.funciona ? 'funciona' : 'NO arranca'}`).join('\n') : '  (no había ningún candidato)'
  return [
    'No hay un `bash` que funcione, y las pruebas de comportamiento de task-observer lo necesitan (NO se omiten: sin esto la suite no está completa).',
    'Candidatos probados:',
    lista,
    'Qué hacer: en Windows, instala Git for Windows (trae Git Bash) o define VIVEBIEN_BASH con la ruta a su bash.exe',
    '(por ejemplo C:\\Program Files\\Git\\bin\\bash.exe). El `bash.exe` de C:\\Windows\\System32 es el lanzador de WSL y falla si no hay una distribución instalada.',
    'Tampoco sirve ejecutar la suite desde un shell donde `bash` apunte a ese lanzador sin Git Bash disponible en las rutas anteriores.',
  ].join('\n')
}
