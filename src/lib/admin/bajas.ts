/**
 * Bajas de cuenta que quedaron a medias — la lógica de la pantalla (D-43, D-44).
 *
 * Código puro: sin React, sin `fetch`, sin base. La pantalla
 * (`components/admin/BajasDeCuenta.tsx`) sólo enseña lo que sale de aquí, y
 * todo lo que importa se prueba sin navegador.
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTE MÓDULO NO PUEDE HACER
 *
 * El trabajo real —revocar en Firebase, borrar la identidad, mover el estado—
 * es **exclusivamente** del endpoint. Desde aquí no se cambia `usuarios`, no se
 * llama a `baja_de_cuenta`, no se tocan propiedades ni invitaciones, y el `uid`
 * nunca se escribe a mano: sale de la lista que devolvió el servidor.
 * ─────────────────────────────────────────────────────────────
 */

export type EstadoProceso =
  | 'solicitada' | 'bloqueada' | 'firebase_eliminada' | 'datos_procesados' | 'completada' | 'error'

/** Una fila tal y como la devuelve `GET /api/admin/bajas`. */
export type FilaBaja = {
  uid: string
  estado: EstadoProceso
  solicitadaEn: string | null
  bloqueadaEn: string | null
  firebaseEliminadaEn: string | null
  completadaEn: string | null
  intentos: number | null
  ultimoIntentoEn: string | null
  /** Código técnico. Llega, pero **no se enseña**: no le sirve a quien mira. */
  ultimoError?: string | null
}

/**
 * Desde qué estados tiene sentido terminar la limpieza. Es la misma lista que
 * aplica el servidor (`lib/cuentas/reintento.ts`); aquí sólo decide si se
 * ofrece el botón. Quien manda es el endpoint.
 *
 * `solicitada` no está: significa que el cierre local no llegó a confirmarse,
 * así que no consta que la cuenta esté cerrada. `completada` tampoco: no queda
 * nada por hacer.
 */
export const SE_PUEDE_TERMINAR: readonly EstadoProceso[] = [
  'error', 'bloqueada', 'firebase_eliminada', 'datos_procesados',
]

export function sePuedeTerminar(estado: EstadoProceso): boolean {
  return SE_PUEDE_TERMINAR.includes(estado)
}

/** En palabras, para quien mira. Nunca el código crudo. */
export const ETIQUETA: Record<EstadoProceso, string> = {
  solicitada: 'Sin confirmar',
  bloqueada: 'Cuenta cerrada, limpieza pendiente',
  firebase_eliminada: 'Identidad borrada, falta cerrar',
  datos_procesados: 'Datos tratados, falta cerrar',
  completada: 'Terminada',
  error: 'Se quedó a medias',
}

/** Lo que se pinta de cada fila. **Ni PII, ni el uid entero, ni códigos.** */
export type VistaDeFila = {
  /** Para poder hablar de una fila sin enseñar el identificador completo. */
  referencia: string
  estado: string
  intentos: number
  ultimoIntentoEn: string | null
  /** La única parte de Firebase que importa aquí. */
  firebase: 'hecha' | 'pendiente'
  requiereReintento: boolean
  sePuedeTerminar: boolean
}

export function vistaDeFila(f: FilaBaja): VistaDeFila {
  return {
    // Seis caracteres bastan para distinguir filas y no identifican a nadie.
    referencia: `${f.uid.slice(0, 6)}…`,
    estado: ETIQUETA[f.estado] ?? 'Desconocido',
    intentos: f.intentos ?? 0,
    ultimoIntentoEn: f.ultimoIntentoEn,
    firebase: f.firebaseEliminadaEn ? 'hecha' : 'pendiente',
    requiereReintento: f.estado === 'error',
    sePuedeTerminar: sePuedeTerminar(f.estado),
  }
}

// ── El controlador ─────────────────────────────────────────────────────────

export type Resultado =
  | { tipo: 'completada' }
  | { tipo: 'pendiente' }        // Firebase volvió a fallar; sigue reintentable
  | { tipo: 'en_curso' }         // otra persona lo tiene tomado ahora mismo
  | { tipo: 'ya_no_procede' }    // 404 o 409: el estado cambió mientras mirabas
  | { tipo: 'fallo'; mensaje: string }

export type RespuestaReintento = { estado: EstadoProceso; terminada: boolean; requiereReintento: boolean }

/** Lo único que necesita del mundo: el `pedir()` autenticado de la sesión. */
export type Dependencias = {
  pedir: <T>(ruta: string, opciones?: RequestInit) => Promise<T>
}

/** Los códigos de estado que significan «esto ya no procede, vuelve a mirar». */
const YA_NO_PROCEDE = new Set([404, 409])

export function crearControlador(d: Dependencias) {
  /** Las que están en vuelo. Evita que dos clics manden dos peticiones. */
  const enVuelo = new Set<string>()

  async function listar(): Promise<FilaBaja[]> {
    const r = await d.pedir<{ bajas: FilaBaja[] }>('/api/admin/bajas')
    return r.bajas ?? []
  }

  /**
   * Termina la limpieza de UNA baja y **vuelve a preguntar al servidor**.
   *
   * La lista nunca se actualiza a mano: pase lo que pase —éxito, `en_curso`,
   * estado cambiado— lo que se pinta después sale de `GET /api/admin/bajas`.
   * Así la pantalla no puede quedarse contando una historia distinta a la de
   * la base.
   */
  async function terminarLimpieza(uid: string): Promise<{ resultado: Resultado; bajas: FilaBaja[] | null }> {
    if (enVuelo.has(uid)) return { resultado: { tipo: 'en_curso' }, bajas: null }
    enVuelo.add(uid)
    try {
      const r = await d.pedir<RespuestaReintento>(
        `/api/admin/bajas/${encodeURIComponent(uid)}/reintentar`,
        { method: 'POST' },
      )
      const resultado: Resultado = r.terminada ? { tipo: 'completada' } : { tipo: 'pendiente' }
      return { resultado, bajas: await listar().catch(() => null) }
    } catch (e) {
      const estado = (e as { estado?: unknown })?.estado
      const codigo = (e as { codigo?: unknown })?.codigo

      if (codigo === 'en_curso') return { resultado: { tipo: 'en_curso' }, bajas: await listar().catch(() => null) }
      if (typeof estado === 'number' && YA_NO_PROCEDE.has(estado)) {
        return { resultado: { tipo: 'ya_no_procede' }, bajas: await listar().catch(() => null) }
      }
      // Cualquier otra cosa: el mensaje que dio el servidor, que ya viene
      // redactado para leerse. Nunca un código interno ni una traza.
      return {
        resultado: { tipo: 'fallo', mensaje: e instanceof Error ? e.message : 'No se pudo completar.' },
        bajas: null,
      }
    } finally {
      enVuelo.delete(uid)
    }
  }

  return { listar, terminarLimpieza }
}

/** El aviso que se lee antes de confirmar. Está aquí para poder probarlo. */
export const LO_QUE_HACE = [
  'La cuenta ya está cerrada: esto no la reactiva.',
  'Su correo sigue liberado: no se restaura.',
  'No se vuelve a ejecutar la baja local, sólo se termina la parte de Firebase.',
  'Si Firebase vuelve a fallar, quedará otra vez pendiente de reintento.',
] as const
