import { describe, expect, it } from 'vitest'
import {
  COLUMNAS_AMPLIA, MEDIDA_SSR, disposicionDe, huecoDeLaBisagra, rejillaDe,
  type Medida, type Rejilla, type Segmento,
} from '../src/lib/pantalla/plegables'
import {
  mensajeDeAcceso, mensajeDeContrasena, mensajeDeRecuperacion, mensajeDeRegistro,
  silencioPorPrivacidad,
} from '../src/lib/acceso/google'
import { ocultarBoton } from '../src/components/WAFloat'
import { destinoSeguro, rutaDeEntrada } from '../src/lib/pantalla/plegables'
import { modoClasico } from '../src/lib/acceso/destino-dashboard'

/**
 * V-1.1.93 · tarea 03.07 — Las cinco disposiciones, con geometría de verdad.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ ESTE ARCHIVO EXISTE
 *
 * La revisión visual del 28-sep encontró que la pantalla de acceso sólo
 * distinguía DOS disposiciones (`dos-zonas` y `amplia`) y que las otras tres
 * acababan como una columna estirada. Peor: `dos-zonas` repartía al 50 % en
 * vez de usar los segmentos, así que en un Fold de 884 px el corte caía en
 * 442 — justo dentro de la bisagra, que va de 430 a 454. El formulario se
 * partía por el pliegue.
 *
 * Aquí se fija la geometría **en píxeles concretos**, no «que sea responsive».
 * Si alguien vuelve a `1fr 1fr`, o quita el carril de la bisagra, estas
 * pruebas se ponen rojas. Comprobado reintroduciendo cada fallo a mano.
 * ─────────────────────────────────────────────────────────────
 */

/* ─── Aparatos de verdad, en píxeles ─────────────────────────────────────── */

const seg = (x: number, y: number, width: number, height: number): Segmento => ({ x, y, width, height })

/** Galaxy Z Fold abierto: dos mitades anchas, bisagra vertical de 24 px. */
const FOLD_ABIERTO: Medida = {
  segmentos: [seg(0, 0, 430, 1104), seg(454, 0, 430, 1104)],
  postura: 'continuous', ancho: 884, alto: 1104,
}

/** Surface Duo estrecho: dos mitades de 300 px — no cabe repartir. */
const DUO_ESTRECHO: Medida = {
  segmentos: [seg(0, 0, 300, 900), seg(320, 0, 300, 900)],
  postura: 'continuous', ancho: 620, alto: 900,
}

/** Bisagra horizontal: una mitad arriba y otra abajo. */
const PLIEGUE_HORIZONTAL: Medida = {
  segmentos: [seg(0, 0, 820, 540), seg(0, 560, 820, 540)],
  postura: 'continuous', ancho: 820, alto: 1100,
}

/** Mitades desiguales: la grande manda. Los plegables no son todos simétricos. */
const DESIGUAL: Medida = {
  segmentos: [seg(0, 0, 300, 900), seg(330, 0, 400, 900)],
  postura: 'continuous', ancho: 730, alto: 900,
}

const MOVIL: Medida = { segmentos: [], postura: 'desconocida', ancho: 390, alto: 844 }
const ESCRITORIO: Medida = { segmentos: [], postura: 'desconocida', ancho: 1440, alto: 900 }

/** Los carriles, ya en números, para poder medir bordes. */
function carriles(pista: string): number[] {
  return pista.split(/\s+/).map((t) => {
    const n = Number.parseFloat(t)
    return Number.isFinite(n) && t.endsWith('px') ? n : Number.NaN
  })
}

/** El borde izquierdo (o superior) de un carril, sumando los anteriores. */
function bordeDe(pista: string, indiceDesde1: number): number {
  return carriles(pista).slice(0, indiceDesde1 - 1).reduce((a, b) => a + b, 0)
}

/* ─── A–E · Las cinco disposiciones se pintan cada una a su manera ───────── */

describe('A–E · las cinco disposiciones tienen geometría propia', () => {
  it('A · compacta: una columna, marca arriba y formulario debajo', () => {
    const r = rejillaDe(MOVIL)
    expect(disposicionDe(MOVIL)).toBe('compacta')
    expect(r.columnas).toBe('1fr')
    expect(r.filas).toBe('auto auto')
    expect(r.marca).toEqual({ columna: '1', fila: '1' })
    expect(r.formulario).toEqual({ columna: '1', fila: '2' })
    expect(r.bisagra).toBeNull()
    expect(r.juntos).toBe(false)
  })

  it('B · amplia: dos columnas, la foto más ancha que el formulario', () => {
    const r = rejillaDe(ESCRITORIO)
    expect(disposicionDe(ESCRITORIO)).toBe('amplia')
    expect(r.columnas).toBe(COLUMNAS_AMPLIA)
    expect(r.marca.columna).toBe('1')
    expect(r.formulario.columna).toBe('2')
    expect(r.bisagra).toBeNull()
  })

  it('C · dos-zonas: marca en un segmento, formulario en el otro', () => {
    const r = rejillaDe(FOLD_ABIERTO)
    expect(disposicionDe(FOLD_ABIERTO)).toBe('dos-zonas')
    expect(r.marca).toEqual({ columna: '1', fila: '1' })
    expect(r.formulario).toEqual({ columna: '3', fila: '1' })
    expect(r.juntos).toBe(false)
  })

  it('D · apilada: marca en el segmento de arriba, formulario en el de abajo', () => {
    const r = rejillaDe(PLIEGUE_HORIZONTAL)
    expect(disposicionDe(PLIEGUE_HORIZONTAL)).toBe('apilada')
    expect(r.columnas).toBe('1fr')
    expect(r.filas).toBe('540px 20px 540px')
    expect(r.marca).toEqual({ columna: '1', fila: '1' })
    expect(r.formulario).toEqual({ columna: '1', fila: '3' })
    // No es «una columna genérica»: las filas son los segmentos medidos.
    expect(r.filas).not.toBe('1fr 1fr')
    expect(r.filas).not.toBe('auto auto')
  })

  it('E · una-zona-de-dos: TODO en un segmento, el otro de adorno', () => {
    const r = rejillaDe(DUO_ESTRECHO)
    expect(disposicionDe(DUO_ESTRECHO)).toBe('una-zona-de-dos')
    expect(r.juntos).toBe(true)
    // Marca y formulario comparten zona, y esa zona es UN carril, no dos.
    expect(r.marca).toEqual(r.formulario)
    expect(r.marca.columna).toBe('1')
    expect(r.adorno).toEqual({ columna: '3', fila: '1' })
    expect(r.bisagra).toEqual({ columna: '2', fila: '1' })
  })

  it('E.2 · con mitades desiguales gana la grande, no la primera', () => {
    const r = rejillaDe(DESIGUAL)
    expect(disposicionDe(DESIGUAL)).toBe('una-zona-de-dos')
    // El segmento de 400 px es el tercer carril; el de 300 px queda de adorno.
    expect(r.marca.columna).toBe('3')
    expect(r.adorno?.columna).toBe('1')
  })

  it('las cinco dan rejillas distintas entre sí', () => {
    const firmas = [MOVIL, ESCRITORIO, FOLD_ABIERTO, PLIEGUE_HORIZONTAL, DUO_ESTRECHO]
      .map((m) => { const r = rejillaDe(m); return `${r.columnas}|${r.filas}|${r.marca.columna}${r.marca.fila}|${r.formulario.columna}${r.formulario.fila}` })
    expect(new Set(firmas).size, `hay disposiciones que se pintan igual:\n${firmas.join('\n')}`).toBe(5)
  })
})

/* ─── F–H · La bisagra ───────────────────────────────────────────────────── */

describe('F–H · la geometría sale de los segmentos, no de porcentajes', () => {
  it('F · los carriles SON los segmentos medidos: 430 | 24 | 430', () => {
    const r = rejillaDe(FOLD_ABIERTO)
    expect(r.columnas).toBe('430px 24px 430px')
    // El fallo que se corrigió: repartir la pantalla por la mitad.
    expect(r.columnas).not.toBe('1fr 1fr')
    expect(r.columnas).not.toContain('fr')
  })

  it('G · el carril de en medio mide exactamente el hueco de la bisagra', () => {
    for (const m of [FOLD_ABIERTO, DUO_ESTRECHO, DESIGUAL, PLIEGUE_HORIZONTAL]) {
      const r = rejillaDe(m)
      const eje = m.segmentos[0].y === m.segmentos[1].y ? 'vertical' : 'horizontal'
      const pista = eje === 'vertical' ? r.columnas : r.filas
      expect(carriles(pista)[1], `hueco mal en ${m.ancho}×${m.alto}`).toBe(huecoDeLaBisagra(m.segmentos))
    }
    expect(huecoDeLaBisagra(FOLD_ABIERTO.segmentos)).toBe(24)
    expect(huecoDeLaBisagra(DUO_ESTRECHO.segmentos)).toBe(20)
  })

  it('H · nada se coloca en el carril de la bisagra', () => {
    for (const m of [FOLD_ABIERTO, DUO_ESTRECHO, DESIGUAL, PLIEGUE_HORIZONTAL]) {
      const r = rejillaDe(m)
      expect(r.bisagra, `sin carril de bisagra en ${m.ancho}×${m.alto}`).not.toBeNull()
      const b = r.bisagra as NonNullable<Rejilla['bisagra']>
      for (const quien of ['marca', 'formulario', 'adorno'] as const) {
        const z = r[quien]
        if (!z) continue
        expect(
          z.columna === b.columna && z.fila === b.fila,
          `«${quien}» está encima de la bisagra en ${m.ancho}×${m.alto}`,
        ).toBe(false)
      }
    }
  })

  it('H.2 · el corte entre marca y formulario cae FUERA del pliegue', () => {
    // La prueba que el reparto al 50 % no pasaría: en 884 px la mitad es 442,
    // y la bisagra ocupa de 430 a 454.
    const r = rejillaDe(FOLD_ABIERTO)
    const [izq, der] = [FOLD_ABIERTO.segmentos[0], FOLD_ABIERTO.segmentos[1]]
    const pliegueEmpieza = izq.x + izq.width       // 430
    const pliegueTermina = der.x                   // 454

    const finDeLaMarca = bordeDe(r.columnas, 2)                 // dónde acaba el carril 1
    const inicioDelFormulario = bordeDe(r.columnas, 3)          // dónde empieza el carril 3

    expect(finDeLaMarca).toBeLessThanOrEqual(pliegueEmpieza)
    expect(inicioDelFormulario).toBeGreaterThanOrEqual(pliegueTermina)
    expect(finDeLaMarca).toBe(430)
    expect(inicioDelFormulario).toBe(454)
    // Con `1fr 1fr` ambos valdrían 442 y caerían dentro del pliegue.
    expect(finDeLaMarca).not.toBe(442)
  })

  it('H.3 · en `una-zona-de-dos` la zona cabe entera en un segmento', () => {
    const r = rejillaDe(DUO_ESTRECHO)
    const c = Number(r.marca.columna)
    const inicio = bordeDe(r.columnas, c)
    const ancho = carriles(r.columnas)[c - 1]
    const suyo = DUO_ESTRECHO.segmentos.find((s) => s.x === inicio)
    expect(suyo, 'la zona no coincide con ningún segmento').toBeDefined()
    expect(ancho).toBe(suyo?.width)
    // Y desde luego no ocupa los dos lados.
    expect(ancho).toBeLessThan(DUO_ESTRECHO.ancho)
  })
})

/* ─── I · SSR y cliente arrancan iguales ─────────────────────────────────── */

describe('I · hidratación: el servidor y la primera pintada coinciden', () => {
  it('la medida de SSR es una constante compartida, no una medición', () => {
    expect(MEDIDA_SSR.segmentos).toEqual([])
    expect(disposicionDe(MEDIDA_SSR)).toBe('amplia')
  })

  it('el hook arranca en MEDIDA_SSR y no mide durante la hidratación', async () => {
    // Si midiera aquí, el cliente pintaría algo distinto del servidor, React
    // avisaría de atributos que no casan y NO los parchearía: la disposición
    // se quedaría congelada. Pasó de verdad (28-sep).
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/hooks/usePlegable.ts', import.meta.url), 'utf8'))
    const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // R-08: el valor inicial lo decide el servidor por dispositivo; sin pista, MEDIDA_SSR.
    expect(sinComentarios).toMatch(/useState<Medida>\(inicial\)/)
    expect(sinComentarios).toMatch(/inicial: Medida = MEDIDA_SSR/)
    expect(sinComentarios, 'vuelve a medir durante la hidratación').not.toMatch(/useState<Medida>\(\(\)\s*=>\s*medir\(\)\)/)
    // Y la corrección posterior al montaje tiene que seguir existiendo.
    expect(sinComentarios, 'ya no se mide después de montar').toMatch(/useEffect\(\(\)\s*=>\s*\{\s*actualizar\('tamano'\)/)
    expect(sinComentarios).toMatch(/setMedido\(true\)/)
  })

  it('una vez medido, la misma pantalla da otra disposición que la de SSR', () => {
    // Lo que el DOM tiene que acabar reflejando: `amplia` → `dos-zonas`.
    expect(disposicionDe(MEDIDA_SSR)).toBe('amplia')
    expect(disposicionDe(FOLD_ABIERTO)).toBe('dos-zonas')
    expect(rejillaDe(MEDIDA_SSR).columnas).not.toBe(rejillaDe(FOLD_ABIERTO).columnas)
  })
})

/* ─── J–K · Cambiar de tamaño y de orientación ───────────────────────────── */

describe('J–K · redimensionar y girar recalculan la disposición', () => {
  it('J · cada salto de tamaño cambia la rejilla', () => {
    const saltos: Array<[Medida, Medida]> = [
      [ESCRITORIO, FOLD_ABIERTO],   // amplia → dos-zonas
      [FOLD_ABIERTO, MOVIL],        // dos-zonas → compacta
      [MOVIL, ESCRITORIO],          // compacta → amplia
    ]
    for (const [antes, despues] of saltos) {
      expect(disposicionDe(antes)).not.toBe(disposicionDe(despues))
      expect(rejillaDe(antes).columnas).not.toBe(rejillaDe(despues).columnas)
    }
  })

  it('K · girar el aparato cambia el eje del pliegue y con él el reparto', () => {
    // El mismo plegable, girado: los segmentos pasan de lado a lado a uno
    // encima del otro. La rejilla tiene que pasar de columnas a filas.
    const deLado = rejillaDe(FOLD_ABIERTO)
    const girado = rejillaDe(PLIEGUE_HORIZONTAL)
    expect(deLado.columnas).toBe('430px 24px 430px')
    expect(deLado.filas).toBe('1fr')
    expect(girado.columnas).toBe('1fr')
    expect(girado.filas).toBe('540px 20px 540px')
    expect(deLado.formulario.columna).toBe('3')
    expect(girado.formulario.fila).toBe('3')
  })

  it('un cambio de tamaño sin pliegue no inventa carriles de bisagra', () => {
    expect(rejillaDe({ ...ESCRITORIO, ancho: 1280 }).bisagra).toBeNull()
    expect(rejillaDe({ ...MOVIL, ancho: 320, alto: 720 }).bisagra).toBeNull()
  })
})

/* ─── L–M · Cada fallo con su mensaje ────────────────────────────────────── */

describe('L–M · el mensaje corresponde al flujo que falló', () => {
  const HABLA_DE_GOOGLE = /Google/i

  it('L · una contraseña incorrecta NO menciona Google', () => {
    for (const codigo of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials']) {
      const m = mensajeDeContrasena({ code: codigo })
      expect(m, `«${codigo}» habla de Google`).not.toMatch(HABLA_DE_GOOGLE)
      expect(m).toMatch(/correo o la contraseña/i)
    }
  })

  it('L.2 · el correo no registrado y la contraseña mala dicen lo mismo', () => {
    // A propósito: distinguirlos dejaría averiguar qué correos tienen cuenta.
    expect(mensajeDeContrasena({ code: 'auth/user-not-found' }))
      .toBe(mensajeDeContrasena({ code: 'auth/wrong-password' }))
  })

  it('L.3 · ningún fallo de contraseña acaba en el texto de Google', () => {
    const codigos = [
      'auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found',
      'auth/invalid-email', 'auth/missing-password', 'auth/user-disabled',
      'auth/network-request-failed', 'auth/too-many-requests', 'auth/vaya-usted-a-saber', '',
    ]
    for (const c of codigos) {
      expect(mensajeDeContrasena({ code: c }), `«${c}» habla de Google`).not.toMatch(HABLA_DE_GOOGLE)
    }
  })

  it('M · un fallo de Google SÍ habla de Google', () => {
    expect(mensajeDeAcceso({ code: 'auth/popup-blocked' })).toMatch(/ventana de Google/i)
    expect(mensajeDeAcceso({ code: 'auth/lo-que-sea' })).toMatch(HABLA_DE_GOOGLE)
  })

  it('M.2 · contraseña y Google nunca devuelven la misma frase', () => {
    for (const c of ['auth/invalid-credential', 'auth/user-not-found', 'auth/desconocido']) {
      expect(mensajeDeContrasena({ code: c })).not.toBe(mensajeDeAcceso({ code: c }))
    }
  })

  it('M.3 · registro: acepta el error entero, no sólo el código suelto', () => {
    // Antes recibía el objeto y hacía `switch` sobre él: no acertaba nunca y
    // todo el mundo veía el mensaje genérico.
    expect(mensajeDeRegistro({ code: 'auth/email-already-in-use' })).toMatch(/Ya existe una cuenta/)
    expect(mensajeDeRegistro('auth/email-already-in-use')).toMatch(/Ya existe una cuenta/)
    expect(mensajeDeRegistro({ code: 'auth/weak-password' })).toMatch(/al menos 6/)
    expect(mensajeDeRegistro({ code: 'auth/email-already-in-use' }))
      .not.toBe(mensajeDeRegistro({ code: 'auth/vete-a-saber' }))
  })

  it('M.4 · recuperación: mensaje propio y sin delatar quién tiene cuenta', () => {
    expect(mensajeDeRecuperacion({ code: 'auth/invalid-email' })).toMatch(/no parece válido/)
    expect(mensajeDeRecuperacion({ code: 'auth/raro' })).not.toMatch(HABLA_DE_GOOGLE)
    expect(silencioPorPrivacidad({ code: 'auth/user-not-found' })).toBe(true)
    expect(silencioPorPrivacidad({ code: 'auth/invalid-email' })).toBe(false)
  })

  it('los cuatro flujos dan cuatro textos distintos para el mismo código', () => {
    const c = { code: 'auth/network-request-failed' }
    const textos = [mensajeDeContrasena(c), mensajeDeRegistro(c), mensajeDeRecuperacion(c)]
    // Este código sí comparte frase a propósito (es el mismo problema de red).
    expect(new Set(textos).size).toBe(1)
    // Pero el caso por defecto no.
    const raro = { code: 'auth/nada-de-esto' }
    expect(new Set([
      mensajeDeContrasena(raro), mensajeDeRegistro(raro),
      mensajeDeRecuperacion(raro), mensajeDeAcceso(raro),
    ]).size).toBe(4)
  })
})

/* ─── N · WhatsApp ───────────────────────────────────────────────────────── */

describe('N · el botón de WhatsApp no aparece en `/entrar`', () => {
  it('se esconde en `/entrar` y en el panel', () => {
    expect(ocultarBoton('/entrar')).toBe(true)
    expect(ocultarBoton('/admin')).toBe(true)
    expect(ocultarBoton('/admin/usuarios')).toBe(true)
  })

  it('pero NO se ha quitado del sitio público', () => {
    for (const ruta of ['/', '/propiedades', '/propiedades/123', '/portal', '/dashboard', '/contacto']) {
      expect(ocultarBoton(ruta), `desapareció de ${ruta}`).toBe(false)
    }
  })

  it('no se esconde en una ruta que sólo empieza igual', () => {
    expect(ocultarBoton('/entrarada')).toBe(false)
    expect(ocultarBoton('/administracion')).toBe(false)
  })

  it('sin ruta no se esconde', () => {
    expect(ocultarBoton(null)).toBe(false)
    expect(ocultarBoton(undefined)).toBe(false)
  })
})

/* ─── O · Lo que no se podía romper ──────────────────────────────────────── */

describe('O · `siguiente` y `?clasico=1` siguen enteros', () => {
  it('las rutas propias pasan; las de fuera, no', () => {
    expect(destinoSeguro('/portal/configuracion')).toBe('/portal/configuracion')
    expect(destinoSeguro('https://otro.com')).toBeNull()
    expect(destinoSeguro('//otro.com')).toBeNull()
    expect(rutaDeEntrada('https://otro.com/roban')).toBe('/entrar')
  })

  it('el panel clásico sobrevive al viaje de ida y vuelta', () => {
    expect(modoClasico('?clasico=1')).toBe(true)
    expect(rutaDeEntrada('/dashboard?clasico=1')).toBe('/entrar?siguiente=%2Fdashboard%3Fclasico%3D1')
    expect(destinoSeguro('/dashboard?clasico=1')).toBe('/dashboard?clasico=1')
  })
})
