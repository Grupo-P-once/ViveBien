/**
 * Cómo se reparte la pantalla de acceso (V-1.1.93, tarea 03.07).
 *
 * Código puro: sin React, sin DOM, sin APIs del navegador. Los hooks le pasan
 * lo que midieron y esto decide; así cada caso se prueba de verdad.
 *
 * ─────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA TODO: NO SE MIRA EL MODELO
 *
 * Nunca «si es un Fold8 haz X». Se mira **cuánto sitio hay y cómo está
 * partido**: los segmentos del viewport y la postura. Un plegable que no
 * existe todavía funcionará igual el día que salga, y un navegador que no
 * sepa nada de plegables cae en el mismo camino que cualquier móvil.
 *
 * De ahí salen cuatro disposiciones, no tres diseños por dispositivo:
 *
 *   compacta         una zona estrecha → foto arriba, tarjeta montada debajo
 *   amplia           una zona ancha    → dos columnas
 *   dos-zonas        dos segmentos     → marca en uno, formulario en el otro
 *                    lado a lado
 *   apilada          dos segmentos     → marca arriba, formulario abajo
 *                    uno sobre otro
 *   una-zona-de-dos  dos segmentos     → TODO en un segmento, el otro decora
 *                    demasiado estrechos
 *
 * El último caso es el que más se olvida. Cuando hay pliegue pero cada mitad
 * es demasiado estrecha para repartir, la tentación es ignorar la bisagra y
 * pintar la versión compacta a lo ancho — y entonces un campo o un botón
 * queda partido por el pliegue. La respuesta correcta es meter **todo** en un
 * segmento y dejar el otro libre.
 * ─────────────────────────────────────────────────────────────
 */

/** Lo que dice `navigator.devicePosture`, o que no lo sabemos. */
export type Postura = 'continuous' | 'folded' | 'desconocida'

/** Un trozo de pantalla, tal y como lo entrega `window.viewport.segments`. */
export type Segmento = { x: number; y: number; width: number; height: number }

export type Disposicion = 'compacta' | 'amplia' | 'dos-zonas' | 'apilada' | 'una-zona-de-dos'

export type Medida = {
  /** Los segmentos del viewport. Uno solo, o vacío, cuando no hay pliegue. */
  segmentos: Segmento[]
  postura: Postura
  ancho: number
  alto: number
}

/**
 * Anchura mínima de un segmento para repartir marca y formulario. 320 px es
 * el ancho del móvil más estrecho que se sigue usando: por debajo, el
 * formulario va apretado y conviene darle un segmento entero.
 */
export const MINIMO_POR_ZONA = 320

/** Desde aquí una pantalla de una sola zona da para dos columnas. */
export const ANCHO_AMPLIO = 1024

/** Alto mínimo de cada mitad cuando la bisagra es horizontal. */
export const MINIMO_ALTO_POR_ZONA = 260

/**
 * Una pantalla ancha pero baja (un plegable cerrado en horizontal, por
 * ejemplo) también pide dos columnas: apilando no cabría nada.
 */
export const ALTO_ESCASO = 520
export const ANCHO_APAISADO = 720

/** ¿Los segmentos están uno al lado del otro, o uno encima del otro? */
export function ejeDelPliegue(segmentos: Segmento[]): 'vertical' | 'horizontal' | null {
  if (segmentos.length !== 2) return null
  const [a, b] = segmentos
  // Bisagra vertical = los segmentos se separan en X (están lado a lado).
  return Math.abs(a.x - b.x) > Math.abs(a.y - b.y) ? 'vertical' : 'horizontal'
}

/**
 * El hueco que ocupa la bisagra entre los dos segmentos. Nada importante
 * —ni un botón, ni un campo, ni el logo— puede caer ahí.
 */
export function huecoDeLaBisagra(segmentos: Segmento[]): number {
  const eje = ejeDelPliegue(segmentos)
  if (!eje) return 0
  const [a, b] = [...segmentos].sort((p, q) => (eje === 'vertical' ? p.x - q.x : p.y - q.y))
  return eje === 'vertical'
    ? Math.max(0, b.x - (a.x + a.width))
    : Math.max(0, b.y - (a.y + a.height))
}

/**
 * La decisión. El orden importa: primero lo que la pantalla dice de sí misma
 * (los segmentos), y sólo si no hay pliegue se mira el tamaño.
 */
export function disposicionDe(m: Medida): Disposicion {
  const eje = ejeDelPliegue(m.segmentos)

  if (eje === 'vertical') {
    // Dos zonas lado a lado, si en cada una cabe su papel.
    if (m.segmentos.every((s) => s.width >= MINIMO_POR_ZONA)) return 'dos-zonas'
    // Caben mal: todo a un segmento. **La bisagra no se ignora nunca.**
    return 'una-zona-de-dos'
  }

  if (eje === 'horizontal') {
    // Bisagra horizontal: marca arriba, formulario abajo. Cada mitad necesita
    // alto suficiente para no quedar aplastada.
    if (m.segmentos.every((s) => s.height >= MINIMO_ALTO_POR_ZONA)) return 'apilada'
    return 'una-zona-de-dos'
  }

  // Una sola zona de verdad: decide el sitio disponible.
  if (m.ancho >= ANCHO_AMPLIO) return 'amplia'
  // Ancha y baja: apilar no cabe, así que dos columnas.
  if (m.ancho >= ANCHO_APAISADO && m.alto < ALTO_ESCASO) return 'amplia'
  return 'compacta'
}

/**
 * La medida que usan el servidor **y la primera pintada del cliente**.
 *
 * Tiene que ser exactamente la misma en los dos sitios. Si el cliente midiera
 * la pantalla de verdad durante la hidratación, React encontraría atributos
 * que no casan, avisaría de ello y **no los parchearía**: la disposición del
 * servidor se quedaría congelada para siempre. Se empieza igual en ambos lados
 * y se corrige después de montar, que es un render normal y sí se aplica.
 */
export const MEDIDA_SSR: Medida = { segmentos: [], postura: 'desconocida', ancho: 1440, alto: 900 }

/**
 * La medida con la que el SERVIDOR pinta la primera vez, según el dispositivo (R-08 / QA-008, D-62).
 *
 * El servidor no sabe el tamaño de la pantalla, y siempre pintaba la disposición `amplia` (1440 px). En un teléfono (390) o una tableta
 * vertical (768) el navegador la corregía al hidratar y toda la pantalla de acceso SALTABA: CLS 0,31 y 0,48 medidos. Con la pista que el
 * navegador ya manda en cada petición (`Sec-CH-UA-Mobile`, o el `User-Agent` si no existe) se acierta la disposición en el primer pintado en
 * el caso común. Es una HEURÍSTICA de primer pintado, no una decisión: la medida real del navegador sigue mandando en cuanto hidrata (si la
 * pista falla —un iPad que se hace pasar por escritorio— solo se vuelve a ver el salto de antes).
 */
export function medidaInicialDe(userAgent: string | null | undefined, chMovil?: string | null): Medida {
  const ua = userAgent ?? ''
  const movil = chMovil === '?1' || /Mobi|iPhone|iPod|Windows Phone/i.test(ua)
  if (movil) return { ...MEDIDA_SSR, ancho: 390, alto: 844 }
  const tableta = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
  if (tableta) return { ...MEDIDA_SSR, ancho: 820, alto: 1180 }
  return MEDIDA_SSR
}

/** Un sitio de la rejilla, en coordenadas de CSS grid. */
export type Zona = { columna: string; fila: string }

/**
 * Los carriles de la rejilla y quién ocupa cada uno.
 *
 * Cuando hay pliegue, los carriles salen de los **segmentos reales**, no de
 * porcentajes: `[segmento][bisagra][segmento]`. El carril de en medio se queda
 * vacío a propósito, y por eso nada puede caer encima del pliegue. Repartir al
 * 50 % parecía equivalente y no lo es: en un Fold de 884 px con la bisagra en
 * 430–454, la mitad cae en 442, justo dentro del pliegue.
 */
export type Rejilla = {
  columnas: string
  filas: string
  marca: Zona
  formulario: Zona
  /** El carril de la bisagra. Nada se coloca aquí. `null` si no hay pliegue. */
  bisagra: Zona | null
  /** El segmento que queda de adorno en `una-zona-de-dos`. */
  adorno: Zona | null
  /** ¿Marca y formulario comparten zona? Entonces van apilados dentro de ella. */
  juntos: boolean
}

/** Reparto de la pantalla amplia: la foto manda, el formulario acompaña. */
export const COLUMNAS_AMPLIA = 'minmax(0, 1.4fr) minmax(0, 1fr)'

/**
 * De la medida a los carriles. Pura: se prueba sin navegador.
 *
 * Las cinco disposiciones salen de aquí con geometría propia. Ninguna se
 * conforma con «una columna genérica»: eso era justo el fallo que hacía que
 * `apilada`, `compacta` y `una-zona-de-dos` se vieran igual.
 */
export function rejillaDe(m: Medida): Rejilla {
  const d = disposicionDe(m)

  if (d === 'compacta') {
    return {
      columnas: '1fr', filas: 'auto auto',
      marca: { columna: '1', fila: '1' }, formulario: { columna: '1', fila: '2' },
      bisagra: null, adorno: null, juntos: false,
    }
  }

  if (d === 'amplia') {
    return {
      columnas: COLUMNAS_AMPLIA, filas: '1fr',
      marca: { columna: '1', fila: '1' }, formulario: { columna: '2', fila: '1' },
      bisagra: null, adorno: null, juntos: false,
    }
  }

  // De aquí en adelante hay pliegue. Los carriles son los segmentos medidos.
  const eje = ejeDelPliegue(m.segmentos)
  const hueco = huecoDeLaBisagra(m.segmentos)
  const orden = [...m.segmentos].sort((p, q) => (eje === 'vertical' ? p.x - q.x : p.y - q.y))
  const [uno, dos] = orden
  const carriles = eje === 'vertical'
    ? `${uno.width}px ${hueco}px ${dos.width}px`
    : `${uno.height}px ${hueco}px ${dos.height}px`

  if (d === 'dos-zonas') {
    return {
      columnas: carriles, filas: '1fr',
      marca: { columna: '1', fila: '1' }, formulario: { columna: '3', fila: '1' },
      bisagra: { columna: '2', fila: '1' }, adorno: null, juntos: false,
    }
  }

  if (d === 'apilada') {
    return {
      columnas: '1fr', filas: carriles,
      marca: { columna: '1', fila: '1' }, formulario: { columna: '1', fila: '3' },
      bisagra: { columna: '1', fila: '2' }, adorno: null, juntos: false,
    }
  }

  // `una-zona-de-dos`: todo cabe mal repartido, así que TODO va al segmento
  // mayor y el otro se queda de adorno. La tarjeta no se estira por encima
  // del pliegue ni se centra a caballo entre los dos.
  const primero = segmentoPrincipal(orden) === uno
  const dentro = primero ? '1' : '3'
  const fuera = primero ? '3' : '1'
  const vertical = eje === 'vertical'
  const zona: Zona = vertical ? { columna: dentro, fila: '1' } : { columna: '1', fila: dentro }

  return {
    columnas: vertical ? carriles : '1fr',
    filas: vertical ? '1fr' : carriles,
    marca: zona,
    formulario: zona,
    bisagra: vertical ? { columna: '2', fila: '1' } : { columna: '1', fila: '2' },
    adorno: vertical ? { columna: fuera, fila: '1' } : { columna: '1', fila: fuera },
    juntos: true,
  }
}

/** ¿En esta disposición la marca y el formulario van separados? */
export function enDosZonas(d: Disposicion): boolean {
  return d === 'dos-zonas' || d === 'apilada'
}

/** ¿Hay una bisagra que respetar, se reparta el contenido o no? */
export function hayBisagra(d: Disposicion): boolean {
  return enDosZonas(d) || d === 'una-zona-de-dos'
}

/**
 * Con el contenido en un solo segmento, en cuál. El más grande; a igualdad,
 * el primero — así no baila entre renders.
 */
export function segmentoPrincipal(segmentos: Segmento[]): Segmento | null {
  if (!segmentos.length) return null
  return segmentos.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
}

/**
 * Cuánto dura la transición entre disposiciones.
 *
 * Abrir y cerrar el dispositivo sí se animan: es un cambio físico y el ojo
 * agradece seguirlo. Girar la pantalla o redimensionar la ventana **no**, o
 * cada arrastre del ratón sería una animación. Y con `prefers-reduced-motion`
 * no se anima nada.
 */
export function duracionMs(
  de: Disposicion,
  a: Disposicion,
  opciones: { motivo: 'pliegue' | 'tamano'; menosMovimiento: boolean },
): number {
  if (opciones.menosMovimiento) return 0
  if (de === a) return 0
  if (opciones.motivo !== 'pliegue') return 0
  // Abrir (se gana sitio) un poco más largo que cerrar: hay más que recolocar.
  const seAbre = !enDosZonas(de) && enDosZonas(a)
  return seAbre ? 400 : 320
}

/**
 * Lo que se guarda al cambiar de postura, de pestaña o al volver de segundo
 * plano. **La contraseña no está, y no va a estarlo:** dejarla en
 * `sessionStorage` la expone a cualquier script de la página.
 */
export type EstadoDelFormulario = { correo: string; pestana: 'ingresar' | 'crear'; siguiente?: string }

export const CLAVE_ESTADO = 'vivebien:entrar'

export function serializarEstado(e: EstadoDelFormulario): string {
  return JSON.stringify({ correo: e.correo, pestana: e.pestana, siguiente: e.siguiente })
}

export function leerEstado(crudo: string | null): EstadoDelFormulario | null {
  if (!crudo) return null
  try {
    const j = JSON.parse(crudo) as Record<string, unknown>
    const pestana = j.pestana === 'crear' ? 'crear' : 'ingresar'
    const correo = typeof j.correo === 'string' ? j.correo.slice(0, 254) : ''
    const siguiente = typeof j.siguiente === 'string' ? j.siguiente : undefined
    return { correo, pestana, siguiente }
  } catch {
    return null
  }
}

/**
 * A dónde se vuelve tras entrar. **Sólo rutas de este sitio**: un `siguiente`
 * con host propio sería un redirector abierto de manual.
 */
export function destinoSeguro(siguiente: string | null | undefined): string | null {
  if (!siguiente) return null
  if (!siguiente.startsWith('/')) return null
  // `//otro.com` y `/\otro.com` son URLs de otro sitio disfrazadas: el
  // navegador las resuelve como un dominio ajeno.
  if (siguiente.startsWith('//') || siguiente.startsWith('/\\')) return null
  // Un espacio o un carácter de control delante bastaría para colar `/ /otro.com`.
  if (/[\u0000-\u001f\u007f\s]/.test(siguiente)) return null
  return siguiente
}

/**
 * El enlace a la pantalla de acceso, con el destino de vuelta.
 *
 * Es lo que usan las entradas del sistema para converger en `/entrar`. El
 * destino se valida **antes** de escribirlo, así que una ruta de otro sitio no
 * llega siquiera a la URL; y se codifica, para que un `?` o un `&` del camino
 * de vuelta no parta la query.
 */
export function rutaDeEntrada(siguiente?: string | null): string {
  const destino = destinoSeguro(siguiente)
  return destino ? `/entrar?siguiente=${encodeURIComponent(destino)}` : '/entrar'
}
