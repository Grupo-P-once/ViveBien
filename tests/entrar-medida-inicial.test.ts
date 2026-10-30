import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { disposicionDe, MEDIDA_SSR, medidaInicialDe } from '../src/lib/pantalla/plegables'

/**
 * R-08 / QA-008 (D-62): /entrar pintaba SIEMPRE la disposición de escritorio en el servidor y la corregía al hidratar → CLS 0,31 (390 px) y
 * 0,48 (768 px). Ahora el primer pintado acierta la disposición según el dispositivo.
 */
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const TABLET_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const ESCRITORIO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('medidaInicialDe', () => {
  it('teléfono (pista de cliente o User-Agent) → disposición compacta, como la que medirá el navegador a 390 px', () => {
    for (const [ua, ch] of [[CHROME_ANDROID, '?1'], [IPHONE, null], [ESCRITORIO, '?1']] as const) {
      expect(disposicionDe(medidaInicialDe(ua, ch))).toBe('compacta')
    }
  })
  it('tableta vertical → compacta (820 px < 1024)', () => {
    expect(disposicionDe(medidaInicialDe(IPAD, '?0'))).toBe('compacta')
    expect(disposicionDe(medidaInicialDe(TABLET_ANDROID, '?0'))).toBe('compacta')
  })
  it('escritorio y desconocido → la disposición amplia de siempre (nada cambia para ellos)', () => {
    expect(medidaInicialDe(ESCRITORIO, '?0')).toBe(MEDIDA_SSR)
    expect(medidaInicialDe(null)).toBe(MEDIDA_SSR)
    expect(medidaInicialDe(undefined, undefined)).toBe(MEDIDA_SSR)
    expect(disposicionDe(MEDIDA_SSR)).toBe('amplia')
  })
  it('no confunde un User-Agent hostil ni vacío', () => {
    expect(medidaInicialDe('<script>', '')).toBe(MEDIDA_SSR)
    expect(medidaInicialDe('Mobi'.repeat(100000))).toEqual({ ...MEDIDA_SSR, ancho: 390, alto: 844 })
  })
})

describe('cableado', () => {
  const SRC = path.join(__dirname, '..', 'src')
  const leer = (r: string) => readFileSync(path.join(SRC, r), 'utf8')
  it('la página lee las pistas del navegador y las pasa; el hook las usa como estado inicial (misma en servidor y cliente: sin desajuste de hidratación)', () => {
    expect(leer('app/entrar/page.tsx')).toMatch(/sec-ch-ua-mobile/)
    expect(leer('app/entrar/page.tsx')).toMatch(/<Entrar medidaInicial=\{medidaInicial\}/)
    expect(leer('components/acceso/Entrar.tsx')).toMatch(/usePlegable\(medidaInicial\)/)
    expect(leer('hooks/usePlegable.ts')).toMatch(/useState<Medida>\(inicial\)/)
    expect(leer('hooks/usePlegable.ts')).toMatch(/usePlegable\(inicial: Medida = MEDIDA_SSR\)/)
  })
})
