/**
 * Autoguardado del asistente de anuncios que NO pierde lo pendiente (15-oct-2026, E-48).
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ FALLABA
 *
 * La versión anterior vaciaba «lo pendiente» ANTES de mandarlo. Si el servidor respondía con un error (por ejemplo un 400 al guardar
 * las fotos), el mensaje salía pero los cambios ya no estaban en ninguna parte: en pantalla seguían (estado local) y al recargar
 * desaparecían. Además, «enviar a revisión» lanzaba ese mismo guardado sin mirar su resultado, así que seguía adelante y fallaba
 * después con «5 fotos como mínimo (llevas 0)», sin decir que el guardado había fallado.
 *
 * AHORA
 *  · Un cambio que no se pudo guardar VUELVE a la cola (lo más reciente manda sobre lo viejo) y se puede reintentar.
 *  · Los envíos van de uno en uno: nunca dos PATCH a la vez pisándose.
 *  · `vaciar()` devuelve el RESULTADO real; quien envía a revisión debe comprobarlo y detenerse si falló.
 *
 * Código puro (sin React ni red): se prueba con un `enviar` falso y temporizadores simulados.
 * ─────────────────────────────────────────────────────────────
 */

export type ResultadoGuardado = { ok: true } | { ok: false; error: string }
export type EstadoGuardado = 'limpio' | 'guardando' | 'guardado' | 'error'
export type Cambios = Record<string, unknown>

export type OpcionesGuardador = {
  /** Manda los cambios al servidor. Debe devolver el resultado (no lanzar); si lanza se trata como fallo de red. */
  enviar: (cambios: Cambios) => Promise<ResultadoGuardado>
  /** Espera tras el último cambio antes de mandar. */
  retardoMs?: number
  /** Para pintar «Guardando… / Guardado / No se pudo guardar». */
  alCambiarEstado?: (estado: EstadoGuardado, error?: string) => void
}

export const MENSAJE_SIN_RED = 'Se perdió la conexión. Lo escrito sigue aquí y no se ha perdido: reintenta cuando vuelva.'

export function crearGuardador(opciones: OpcionesGuardador) {
  const retardo = opciones.retardoMs ?? 1200
  let pendiente: Cambios = {}
  // Lo que ya salió hacia el servidor y aún no tiene respuesta. Si no se recuerda, una recarga que termine MIENTRAS el PATCH vuela
  // no lo vería en `pendiente()` y pisaría la pantalla con la copia vieja del servidor (E-48, carrera guardador/recarga).
  let enVuelo: Cambios = {}
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let cadena: Promise<ResultadoGuardado> = Promise.resolve({ ok: true })

  const estado = (e: EstadoGuardado, error?: string) => opciones.alCambiarEstado?.(e, error)
  const hayEnCola = () => Object.keys(pendiente).length > 0
  const hayPendiente = () => hayEnCola() || Object.keys(enVuelo).length > 0
  const parar = () => {
    if (temporizador) clearTimeout(temporizador)
    temporizador = null
  }

  async function intentar(): Promise<ResultadoGuardado> {
    // Tras un fallo lo pendiente VUELVE a la cola, así que «nada pendiente» solo ocurre si todo se guardó.
    if (!hayEnCola()) return { ok: true }
    const envio = pendiente
    pendiente = {}
    enVuelo = envio
    estado('guardando')
    let r: ResultadoGuardado
    try {
      r = await opciones.enviar(envio)
    } catch {
      r = { ok: false, error: MENSAJE_SIN_RED }
    }
    enVuelo = {}
    if (!r.ok) {
      // NO se descarta: vuelve a la cola. Lo escrito mientras tanto es más reciente y gana.
      pendiente = { ...envio, ...pendiente }
      estado('error', r.error)
      return r
    }
    estado(hayEnCola() ? 'guardando' : 'guardado')
    return r
  }

  /** Manda lo pendiente YA (uno a la vez). Devuelve el resultado real del último envío. */
  function vaciar(): Promise<ResultadoGuardado> {
    parar()
    const p = cadena.then(intentar)
    cadena = p
    return p
  }

  /** Acumula cambios y los manda tras una pausa. */
  function guardar(cambios: Cambios) {
    pendiente = { ...pendiente, ...cambios }
    estado('guardando')
    parar()
    temporizador = setTimeout(() => {
      temporizador = null
      void vaciar()
    }, retardo)
  }

  return {
    guardar,
    vaciar,
    hayPendiente,
    /**
     * Copia de lo que aún no se guardó (para no pisarlo al recargar desde el servidor): la cola MÁS lo que va en un PATCH sin respuesta.
     * Lo escrito después manda sobre lo que va en vuelo.
     */
    pendiente: (): Cambios => ({ ...enVuelo, ...pendiente }),
    cancelar: parar,
  }
}

export type Guardador = ReturnType<typeof crearGuardador>
