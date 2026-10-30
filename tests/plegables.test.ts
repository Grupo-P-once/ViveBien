import { describe, expect, it } from 'vitest'
import {
  CLAVE_ESTADO, destinoSeguro, disposicionDe, duracionMs, ejeDelPliegue, enDosZonas,
  hayBisagra, huecoDeLaBisagra, leerEstado, segmentoPrincipal, serializarEstado,
  type Medida, type Segmento,
} from '../src/lib/pantalla/plegables'

/**
 * V-1.1.93 · tarea 03.07 — El reparto de la pantalla de acceso.
 *
 * Lo que se prueba aquí, sobre todo, es que **no se mira el modelo**. Los casos
 * usan las medidas reales de un iPhone Duo, un Galaxy Z Fold8 y un Fold8 Ultra,
 * pero la función nunca sabe cuál es cuál: sólo ve segmentos y tamaño. Un
 * plegable que no existe todavía cae en la misma rama que estos.
 */

const medida = (m: Partial<Medida>): Medida => ({
  segmentos: [], postura: 'desconocida', ancho: 1440, alto: 900, ...m,
})

/** Dos segmentos lado a lado, con el hueco de la bisagra entre medias. */
const ladoALado = (ancho: number, alto: number, hueco = 0): Segmento[] => [
  { x: 0, y: 0, width: ancho, height: alto },
  { x: ancho + hueco, y: 0, width: ancho, height: alto },
]

/** Dos segmentos uno encima del otro. */
const unoSobreOtro = (ancho: number, alto: number, hueco = 0): Segmento[] => [
  { x: 0, y: 0, width: ancho, height: alto },
  { x: 0, y: alto + hueco, width: ancho, height: alto },
]

describe('el eje del pliegue', () => {
  it('lado a lado → bisagra vertical', () => {
    expect(ejeDelPliegue(ladoALado(420, 900))).toBe('vertical')
  })

  it('uno sobre otro → bisagra horizontal', () => {
    expect(ejeDelPliegue(unoSobreOtro(800, 450))).toBe('horizontal')
  })

  it('sin dos segmentos no hay pliegue', () => {
    expect(ejeDelPliegue([])).toBeNull()
    expect(ejeDelPliegue([{ x: 0, y: 0, width: 400, height: 800 }])).toBeNull()
  })

  it('el hueco de la bisagra se mide, para dejarlo libre', () => {
    expect(huecoDeLaBisagra(ladoALado(420, 900, 24))).toBe(24)
    expect(huecoDeLaBisagra(unoSobreOtro(800, 450, 18))).toBe(18)
    expect(huecoDeLaBisagra([])).toBe(0)
  })
})

describe('la decisión, con medidas reales de tres plegables', () => {
  // ⚠ Las medidas del encargo (1878 × 2670, etc.) son **píxeles de diseño**,
  // no de CSS: el navegador ve bastantes menos, según la densidad. Aquí van
  // las de CSS aproximadas, que es lo que llega a la función. Y la función NO
  // sabe qué dispositivo es cada una: sólo ve segmentos y tamaño.
  const casos: Array<[string, Medida, string]> = [
    ['iPhone Duo cerrado', medida({ ancho: 466, alto: 678, postura: 'folded' }), 'compacta'],
    ['iPhone Duo abierto', medida({ ancho: 940, alto: 1335, postura: 'continuous', segmentos: ladoALado(458, 1335, 24) }), 'dos-zonas'],
    ['Galaxy Z Fold8 cerrado', medida({ ancho: 416, alto: 657, postura: 'folded' }), 'compacta'],
    ['Galaxy Z Fold8 abierto', medida({ ancho: 884, alto: 1104, postura: 'continuous', segmentos: ladoALado(430, 1104, 24) }), 'dos-zonas'],
    ['Fold8 Ultra cerrado (ancho y bajo)', medida({ ancho: 840, alto: 360, postura: 'folded' }), 'amplia'],
    ['Fold8 Ultra abierto', medida({ ancho: 1092, alto: 984, postura: 'continuous', segmentos: ladoALado(534, 984, 24) }), 'dos-zonas'],
    ['escritorio', medida({ ancho: 1440, alto: 900 }), 'amplia'],
    ['tableta vertical', medida({ ancho: 834, alto: 1112 }), 'compacta'],
    ['móvil normal', medida({ ancho: 390, alto: 844 }), 'compacta'],
  ]

  for (const [nombre, m, esperada] of casos) {
    it(`${nombre} → ${esperada}`, () => {
      expect(disposicionDe(m)).toBe(esperada)
    })
  }
})

describe('cuándo NO se parte en dos', () => {
  it('con mitades estrechas, TODO va a un segmento — la bisagra no se ignora', () => {
    // Un pliegue que dejaría el formulario en 300 px no da para repartir.
    // Pero pintar la versión compacta a lo ancho partiría un campo por el
    // pliegue, así que se mete todo en un segmento y el otro queda libre.
    const m = medida({ ancho: 620, alto: 900, segmentos: ladoALado(300, 900, 20) })
    expect(disposicionDe(m)).toBe('una-zona-de-dos')
  })

  it('con bisagra horizontal y mitades aplastadas, lo mismo', () => {
    const m = medida({ ancho: 800, alto: 460, segmentos: unoSobreOtro(800, 220, 20) })
    expect(disposicionDe(m)).toBe('una-zona-de-dos')
  })

  it('siempre que haya dos segmentos, hay bisagra que respetar', () => {
    expect(hayBisagra('dos-zonas')).toBe(true)
    expect(hayBisagra('apilada')).toBe(true)
    expect(hayBisagra('una-zona-de-dos')).toBe(true)
    expect(hayBisagra('compacta')).toBe(false)
    expect(hayBisagra('amplia')).toBe(false)
  })

  it('el segmento que recibe el contenido es el mayor, y no baila', () => {
    const desiguales: Segmento[] = [
      { x: 0, y: 0, width: 300, height: 900 },
      { x: 320, y: 0, width: 500, height: 900 },
    ]
    expect(segmentoPrincipal(desiguales)?.width).toBe(500)
    // A igualdad, el primero: dos renders seguidos dan lo mismo.
    const iguales = ladoALado(400, 900, 20)
    expect(segmentoPrincipal(iguales)).toBe(iguales[0])
    expect(segmentoPrincipal([])).toBeNull()
  })

  it('bisagra horizontal con sitio → apilada', () => {
    const m = medida({ ancho: 820, alto: 1100, segmentos: unoSobreOtro(820, 540, 20) })
    expect(disposicionDe(m)).toBe('apilada')
  })

  it('`enDosZonas` distingue las que separan marca y formulario', () => {
    expect(enDosZonas('dos-zonas')).toBe(true)
    expect(enDosZonas('apilada')).toBe(true)
    expect(enDosZonas('compacta')).toBe(false)
    expect(enDosZonas('amplia')).toBe(false)
  })
})

describe('el modelo no se mira', () => {
  it('un plegable que no existe hoy cae en la rama correcta', () => {
    // Inventado: 3:2 al abrir, bisagra vertical, segmentos holgados.
    const futuro = medida({ ancho: 1000, alto: 700, postura: 'continuous', segmentos: ladoALado(488, 700, 24) })
    expect(disposicionDe(futuro)).toBe('dos-zonas')
  })

  it('un navegador que no sabe nada de plegables no se rompe', () => {
    // Sin segmentos y sin postura: decide sólo el tamaño.
    expect(disposicionDe(medida({ ancho: 1440, alto: 900, segmentos: [], postura: 'desconocida' }))).toBe('amplia')
    expect(disposicionDe(medida({ ancho: 390, alto: 844, segmentos: [], postura: 'desconocida' }))).toBe('compacta')
  })

  it('la postura sola no decide: manda el sitio que hay', () => {
    // `folded` con una pantalla exterior ancha sigue dando dos columnas.
    expect(disposicionDe(medida({ ancho: 1200, alto: 800, postura: 'folded' }))).toBe('amplia')
  })
})

describe('la animación', () => {
  it('abrir el dispositivo se anima más que cerrarlo', () => {
    const abrir = duracionMs('compacta', 'dos-zonas', { motivo: 'pliegue', menosMovimiento: false })
    const cerrar = duracionMs('dos-zonas', 'compacta', { motivo: 'pliegue', menosMovimiento: false })
    expect(abrir).toBe(400)
    expect(cerrar).toBe(320)
    expect(abrir).toBeGreaterThan(cerrar)
  })

  it('redimensionar o girar NO se anima', () => {
    // Si se animara, cada arrastre del ratón sería una animación.
    expect(duracionMs('compacta', 'amplia', { motivo: 'tamano', menosMovimiento: false })).toBe(0)
  })

  it('`prefers-reduced-motion` gana siempre', () => {
    expect(duracionMs('compacta', 'dos-zonas', { motivo: 'pliegue', menosMovimiento: true })).toBe(0)
  })

  it('si no cambia la disposición, no hay animación', () => {
    expect(duracionMs('amplia', 'amplia', { motivo: 'pliegue', menosMovimiento: false })).toBe(0)
  })
})

describe('lo que se conserva al abrir, cerrar o cambiar de pestaña', () => {
  it('se guarda el correo y la pestaña activa', () => {
    const crudo = serializarEstado({ correo: 'quien@ejemplo.invalid', pestana: 'crear', siguiente: '/portal' })
    expect(leerEstado(crudo)).toEqual({ correo: 'quien@ejemplo.invalid', pestana: 'crear', siguiente: '/portal' })
  })

  it('LA CONTRASEÑA NO SE GUARDA', () => {
    // Dejarla en sessionStorage la expone a cualquier script de la página.
    const crudo = serializarEstado({ correo: 'quien@ejemplo.invalid', pestana: 'ingresar' })
    expect(crudo).not.toMatch(/contrase|password|pass/i)
    // Sólo estas tres claves pueden salir, nunca una más.
    for (const k of Object.keys(JSON.parse(crudo))) {
      expect(['correo', 'pestana', 'siguiente']).toContain(k)
    }
  })

  it('un estado corrupto no rompe nada', () => {
    expect(leerEstado(null)).toBeNull()
    expect(leerEstado('{no es json')).toBeNull()
    expect(leerEstado('{}')).toEqual({ correo: '', pestana: 'ingresar', siguiente: undefined })
  })

  it('una pestaña inventada cae en `ingresar`', () => {
    expect(leerEstado('{"pestana":"otra"}')?.pestana).toBe('ingresar')
  })

  it('la clave tiene espacio de nombres propio', () => {
    expect(CLAVE_ESTADO).toBe('vivebien:entrar')
  })
})

describe('a dónde se vuelve después de entrar', () => {
  it('sólo rutas de este sitio', () => {
    expect(destinoSeguro('/portal')).toBe('/portal')
    expect(destinoSeguro('/admin/usuarios?x=1')).toBe('/admin/usuarios?x=1')
  })

  it('un redirector abierto queda descartado', () => {
    for (const malo of [
      'https://otro.com', 'http://otro.com', '//otro.com', '/\\otro.com',
      'javascript:alert(1)', 'otro.com', '', null, undefined,
    ]) {
      expect(destinoSeguro(malo), `pasó ${malo}`).toBeNull()
    }
  })
})
