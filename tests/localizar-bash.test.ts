import { describe, expect, it } from 'vitest'
import { bashFunciona, candidatosDeBash, localizarBash, mensajeSinBash, type Ejecutar } from './dobles/localizar-bash'

/**
 * Localizador de bash (15-oct-2026, E-48): un `bash` roto (el lanzador de WSL sin distribución) NO puede hacer que las pruebas de
 * task-observer se omitan en silencio. Cubre: bash ausente, bash que no arranca, bash que funciona y el orden de búsqueda.
 * Todo inyectado (entorno, plataforma, archivos, ejecución): no depende de la máquina donde corra.
 */

const GIT = 'C:\\Program Files\\Git\\bin\\bash.exe'
const ENTORNO_WIN = { ProgramFiles: 'C:\\Program Files', PATH: 'C:\\Windows\\system32;C:\\Program Files\\Git\\cmd' }

describe('bashFunciona (¿arranca y dice «ok»?)', () => {
  const con = (r: { status: number | null; stdout?: string | null } | 'lanza'): Ejecutar => () => {
    if (r === 'lanza') throw new Error('spawn')
    return r
  }
  it('un bash real: estado 0 e imprime ok', () => {
    expect(bashFunciona('x', con({ status: 0, stdout: 'ok\n' }))).toBe(true)
  })
  it('el lanzador de WSL sin distribución: estado distinto de 0 y nada en stdout', () => {
    expect(bashFunciona('x', con({ status: 1, stdout: '' }))).toBe(false)
  })
  it('estado 0 pero sin «ok» (otro programa llamado bash) no cuenta', () => {
    expect(bashFunciona('x', con({ status: 0, stdout: 'hola' }))).toBe(false)
  })
  it('no arranca (estado null) o lanza: es falso, no una excepción', () => {
    expect(bashFunciona('x', con({ status: null, stdout: null }))).toBe(false)
    expect(bashFunciona('x', con('lanza'))).toBe(false)
  })
  it('con el ejecutor real, una ruta que no existe es falso', () => {
    expect(bashFunciona('C:\\no\\existe\\bash.exe')).toBe(false)
  })
})

describe('orden de búsqueda', () => {
  it('Windows: lo forzado primero, luego Git Bash (solo si existe) y al final el bash de PATH', () => {
    const c = candidatosDeBash({ ...ENTORNO_WIN, VIVEBIEN_BASH: 'D:\\mio\\bash.exe' }, 'win32', (r) => r === GIT)
    expect(c).toEqual(['D:\\mio\\bash.exe', GIT, 'bash'])
  })
  it('Windows: lo forzado se prueba aunque no exista (si está mal, el mensaje lo dirá)', () => {
    expect(candidatosDeBash({ VIVEBIEN_BASH: 'D:\\mal\\bash.exe' }, 'win32', () => false)).toEqual(['D:\\mal\\bash.exe', 'bash'])
  })
  it('Windows: encuentra Git Bash a partir de git.exe en PATH, aunque no esté en Archivos de programa', () => {
    const git = 'D:\\Herramientas\\Git\\bin\\bash.exe'
    const c = candidatosDeBash({ PATH: 'C:\\Windows;D:\\Herramientas\\Git\\cmd' }, 'win32', (r) => r === git)
    expect(c).toEqual([git, 'bash'])
  })
  it('Windows sin Git Bash instalado: solo queda el bash de PATH', () => {
    expect(candidatosDeBash(ENTORNO_WIN, 'win32', () => false)).toEqual(['bash'])
  })
  it('Linux/macOS: bash de PATH primero y las rutas clásicas solo si existen', () => {
    expect(candidatosDeBash({}, 'linux', (r) => r === '/bin/bash')).toEqual(['bash', '/bin/bash'])
  })
})

describe('localizarBash', () => {
  it('bash AUSENTE: devuelve null y lista TODO lo que probó (nadie lo omite en silencio)', () => {
    const r = localizarBash({ entorno: { ...ENTORNO_WIN, VIVEBIEN_BASH: 'D:\\mal\\bash.exe' }, plataforma: 'win32', existe: (x) => x === GIT, funciona: () => false })
    expect(r.ruta).toBeNull()
    expect(r.probados).toEqual([
      { ruta: 'D:\\mal\\bash.exe', funciona: false },
      { ruta: GIT, funciona: false },
      { ruta: 'bash', funciona: false },
    ])
  })

  it('bash NO EJECUTABLE en PATH (lanzador de WSL) pero con Git Bash: usa Git Bash y ni siquiera llega a probar el de PATH', () => {
    const r = localizarBash({ entorno: ENTORNO_WIN, plataforma: 'win32', existe: (x) => x === GIT, funciona: (x) => x === GIT })
    expect(r.ruta).toBe(GIT)
    expect(r.probados).toEqual([{ ruta: GIT, funciona: true }])
  })

  it('bash NO EJECUTABLE en PATH y sin Git Bash: null (el caso que antes dejaba 13 omitidas y la suite «verde»)', () => {
    const r = localizarBash({ entorno: ENTORNO_WIN, plataforma: 'win32', existe: () => false, funciona: () => false })
    expect(r.ruta).toBeNull()
    expect(r.probados).toEqual([{ ruta: 'bash', funciona: false }])
  })

  it('un Git Bash que existe pero no arranca no gana: se sigue con el siguiente que sí funciona', () => {
    const r = localizarBash({ entorno: ENTORNO_WIN, plataforma: 'win32', existe: (x) => x === GIT, funciona: (x) => x === 'bash' })
    expect(r.ruta).toBe('bash')
    expect(r.probados).toEqual([{ ruta: GIT, funciona: false }, { ruta: 'bash', funciona: true }])
  })

  it('bash FUNCIONAL solo en PATH (Linux/macOS/CI): se usa tal cual', () => {
    const r = localizarBash({ entorno: {}, plataforma: 'linux', existe: () => false, funciona: (x) => x === 'bash' })
    expect(r).toEqual({ ruta: 'bash', probados: [{ ruta: 'bash', funciona: true }] })
  })
})

describe('mensajeSinBash (accionable)', () => {
  const m = mensajeSinBash([{ ruta: 'D:\\mal\\bash.exe', funciona: false }, { ruta: 'bash', funciona: false }])
  it('dice que NO se omite, qué se probó y cada candidato como «NO arranca»', () => {
    expect(m).toMatch(/NO se omiten/)
    expect(m).toContain('D:\\mal\\bash.exe → NO arranca')
    expect(m).toContain('bash → NO arranca')
  })
  it('dice qué hacer: instalar Git for Windows o fijar VIVEBIEN_BASH, y avisa del lanzador de WSL', () => {
    expect(m).toMatch(/Git for Windows/)
    expect(m).toMatch(/VIVEBIEN_BASH/)
    expect(m).toMatch(/WSL/)
  })
  it('sin candidatos también es legible', () => {
    expect(mensajeSinBash([])).toMatch(/no había ningún candidato/)
  })
})
