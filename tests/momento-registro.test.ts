import { describe, it, expect, beforeEach } from 'vitest'
import {
  contarFichaVista,
  debeOfrecerRegistro,
  marcarOfrecido,
  FICHAS_ANTES_DE_OFRECER,
  DIAS_DE_ESPERA,
} from '../src/lib/momento-registro'

/** localStorage de mentira: los tests corren en Node, sin navegador. */
beforeEach(() => {
  const datos: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => datos[k] ?? null,
    setItem: (k: string, v: string) => { datos[k] = v },
    removeItem: (k: string) => { delete datos[k] },
    clear: () => { for (const k of Object.keys(datos)) delete datos[k] },
    key: () => null,
    length: 0,
  } as Storage
})

describe('contarFichaVista', () => {
  it('cuenta propiedades distintas, no recargas', () => {
    expect(contarFichaVista('casa-1')).toBe(1)
    expect(contarFichaVista('casa-1')).toBe(1)
    expect(contarFichaVista('casa-2')).toBe(2)
  })
  it('no crece sin límite', () => {
    for (let i = 0; i < 40; i++) contarFichaVista(`p-${i}`)
    expect(contarFichaVista('p-nueva')).toBeLessThanOrEqual(20)
  })
})

describe('debeOfrecerRegistro', () => {
  it('NO en la portada ni en la primera ficha: pedir antes de dar', () => {
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: 0 })).toBe(false)
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: 1 })).toBe(false)
  })

  it('sí al segundo anuncio abierto', () => {
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: FICHAS_ANTES_DE_OFRECER })).toBe(true)
  })

  it('nunca a quien ya inició sesión', () => {
    expect(debeOfrecerRegistro({ conSesion: true, fichasVistas: 9 })).toBe(false)
  })

  it('respeta a quien ya dejó sus datos antes', () => {
    localStorage.setItem('vb_registered', '1')
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: 9 })).toBe(false)
  })

  it('no insiste al día siguiente a quien lo cerró', () => {
    const ahora = Date.now()
    marcarOfrecido(ahora)
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: 5, ahora: ahora + 86_400_000 })).toBe(false)
  })

  it('vuelve a ofrecerlo pasado el plazo', () => {
    const ahora = Date.now()
    marcarOfrecido(ahora)
    const despues = ahora + (DIAS_DE_ESPERA + 1) * 86_400_000
    expect(debeOfrecerRegistro({ conSesion: false, fichasVistas: 5, ahora: despues })).toBe(true)
  })
})
