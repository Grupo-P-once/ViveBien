import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

/**
 * R-16 (D-62): los baselines visuales deben estar declarados, con hash, y no pueden cambiar en silencio.
 *
 * 15-oct-2026 (E-48): estas pruebas YA NO escriben ni restauran capturas reales. Antes, «cambiada en silencio» le añadía un byte a
 * `tests-visual/capturas/movil-390/contacto.png` y lo restauraba al final: si Vitest se interrumpía a mitad, la línea base quedaba
 * corrupta (y cada corrida le cambiaba la fecha). Ahora los escenarios de fallo se arman en una carpeta TEMPORAL que se crea y se borra
 * con try/finally, y una prueba comprueba que no cambió ni un byte ni una fecha de las capturas versionadas.
 */
const require = createRequire(import.meta.url)
type Resultado = { problemas: string[]; obsoletas: number; total: number }
const { verificar } = require('../scripts/qa/baselines.cjs') as { verificar: (dir?: string) => Resultado }
const DIR = path.resolve(__dirname, '..', 'tests-visual', 'capturas')

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

/** Foto de cada captura real: tamaño, fecha de modificación (exacta) y sha256. */
function huellaReal(): Record<string, { bytes: number; mtimeMs: number; sha256: string }> {
  const out: Record<string, { bytes: number; mtimeMs: number; sha256: string }> = {}
  const rec = (d: string) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) { rec(p); continue }
      const s = fs.statSync(p)
      out[path.relative(DIR, p).replace(/\\/g, '/')] = { bytes: s.size, mtimeMs: s.mtimeMs, sha256: sha(fs.readFileSync(p)) }
    }
  }
  rec(DIR)
  return out
}

/** Carpeta temporal con UNA captura declarada y correcta; se borra siempre, pase lo que pase. */
function conCarpetaTemporal(fn: (dir: string, png: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baselines-'))
  try {
    const proyecto = path.join(dir, 'movil-390')
    fs.mkdirSync(proyecto)
    const png = path.join(proyecto, 'ejemplo.png')
    const bytes = Buffer.from('captura-de-ejemplo')
    fs.writeFileSync(png, bytes)
    fs.writeFileSync(path.join(dir, 'BASELINES.json'), JSON.stringify({
      nota: 'prueba', entradas: [{ proyecto: 'movil-390', nombre: 'ejemplo', viewport: '390x844', ruta: '/', fecha: '2026-10-15', version: 'V-prueba', estado: 'obsoleta', motivo: 'solo para la prueba', sha256: sha(bytes) }],
    }))
    fn(dir, png)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('baselines visuales (R-16)', () => {
  it('el manifiesto coincide con los archivos (solo lectura sobre las capturas reales)', () => {
    const r = verificar()
    expect(r.problemas).toEqual([])
    expect(r.total).toBeGreaterThan(0)
  })

  it('la carpeta temporal de partida es válida (sin ella los dos casos de abajo no probarían nada)', () => {
    conCarpetaTemporal((dir) => { expect(verificar(dir).problemas).toEqual([]) })
  })

  it('una captura nueva sin declarar se detecta', () => {
    conCarpetaTemporal((dir) => {
      fs.writeFileSync(path.join(dir, 'movil-390', '__sin-declarar.png'), Buffer.from('x'))
      expect(verificar(dir).problemas.join('\n')).toContain('sin declarar')
    })
  })

  it('una captura cambiada en silencio se detecta (sha256)', () => {
    conCarpetaTemporal((dir, png) => {
      fs.writeFileSync(png, Buffer.concat([fs.readFileSync(png), Buffer.from('0')]))
      expect(verificar(dir).problemas.join('\n')).toContain('sha256 distinto')
    })
  })

  it('una captura declarada cuyo archivo ya no existe se detecta', () => {
    conCarpetaTemporal((dir, png) => {
      fs.rmSync(png)
      expect(verificar(dir).problemas.join('\n')).toContain('el archivo no existe')
    })
  })

  it('la carpeta temporal se borra aunque la verificación falle', () => {
    let usada = ''
    expect(() => conCarpetaTemporal((dir) => { usada = dir; throw new Error('falla a propósito') })).toThrow('falla a propósito')
    expect(usada).not.toBe('')
    expect(fs.existsSync(usada)).toBe(false)
  })

  it('verificar en una carpeta temporal NO cambia bytes, tamaño ni fecha de ninguna captura versionada', () => {
    const antes = huellaReal()
    expect(Object.keys(antes).length).toBeGreaterThan(0)
    conCarpetaTemporal((dir, png) => {
      fs.writeFileSync(path.join(dir, 'movil-390', '__sin-declarar.png'), Buffer.from('x'))
      fs.writeFileSync(png, Buffer.concat([fs.readFileSync(png), Buffer.from('0')]))
      verificar(dir)
    })
    verificar()
    expect(huellaReal()).toEqual(antes)   // mismos archivos, mismos bytes, MISMA fecha (mtimeMs exacto)
  })
})
