import { after } from 'next/server'
import { urlDe } from '../sitio'
import { enviarCorreo, type DbCorreo, type ResultadoEnvio } from './enviar'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '../portal/tarjeta'
import { plantillaBienvenida, plantillaSolicitudPublicador, type ResumenPortal, type TarjetaCorreo } from './plantillas'
import { aTarjetaCorreo, elegirPropiedades } from './recomendaciones'
import { normalizarCorreo } from './seguridad'
import { urlPreferencias } from './suscripcion'

/**
 * Correos transaccionales nuevos de D-80, con las salvaguardas de siempre:
 *  · sólo al correo VERIFICADO de la sesión (nunca a una dirección escrita en un formulario: sería una vía para mandarle
 *    correo a otra persona);
 *  · una sola vez por hecho (clave idempotente: `bienvenida/<uid>`, `publicador/<id de la solicitud>`);
 *  · apagados por defecto (`CORREO_TRANSACCIONAL`); un fallo NUNCA tumba el flujo que los dispara;
 *  · sin publicidad: la bienvenida no es una campaña.
 */

const ESTADOS_CITA_VIVA = ['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED']

/**
 * Lo que enseña el correo de bienvenida del portal: las cifras REALES de la cuenta y del sitio, y las propiedades publicadas
 * más recientes. Cualquier fallo de lectura deja ese bloque fuera (null / vacío): la bienvenida sale igual y nunca con
 * números inventados. Sólo lee; no escribe nada.
 */
export async function datosDelPortal(db: DbCorreo, uid: string): Promise<{ resumen: ResumenPortal | null; propiedades: TarjetaCorreo[] }> {
  try {
    const contar = async (tabla: string, filtro: (q: any) => any): Promise<number | null> => { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const r = await filtro(db.from(tabla).select('*', { count: 'exact', head: true }))
        return r.error || typeof r.count !== 'number' ? null : r.count
      } catch { return null }
    }
    const leerCatalogo = async () => {
      try { return await db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').order('publicada_en', { ascending: false }).limit(500) } catch { return { data: null, error: { message: 'excepcion' } } }
    }
    const [guardadas, busquedas, citas, cat] = await Promise.all([
      contar('favoritos', (q) => q.eq('uid', uid)),
      contar('busquedas_guardadas', (q) => q.eq('uid', uid)),
      contar('citas', (q) => q.eq('cliente_uid', uid).in('estado', ESTADOS_CITA_VIVA)),
      leerCatalogo(),
    ])
    const catalogo = cat.error ? null : ((cat.data ?? []) as FilaPropiedadPortal[])
    const visibles = catalogo ? elegirPropiedades({}, catalogo, new Set(), 1000) : []
    const resumen = guardadas === null || busquedas === null || citas === null || catalogo === null
      ? null
      : { guardadas, busquedas, citas }
    return { resumen, propiedades: visibles.slice(0, 3).map(aTarjetaCorreo) }
  } catch {
    return { resumen: null, propiedades: [] }
  }
}

type Cuenta = { correo: string | null | undefined; verificado: boolean | undefined; nombre?: string | null }

export async function enviarBienvenida(db: DbCorreo, uid: string, c: Cuenta, o: Parameters<typeof enviarCorreo>[2] = {}): Promise<ResultadoEnvio> {
  const correo = normalizarCorreo(c.correo)
  if (!correo || c.verificado !== true) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    // Si esta persona ya había dejado su correo como visitante, se vincula la misma fila a la cuenta (una persona, un registro).
    await db.rpc('correo_vincular_cuenta', { p_uid: uid, p_email: correo })
    const portal = await datosDelPortal(db, uid)
    const p = plantillaBienvenida({ nombre: c.nombre, urlPreferencias: urlPreferencias(), ...portal })
    return await enviarCorreo(db, { clave: `bienvenida/${uid}`, categoria: 'transaccional', tipo: 'bienvenida', para: correo, ...p }, o)
  } catch {
    console.error('[correo] la bienvenida falló sin afectar el registro')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

export async function enviarConfirmacionPublicador(db: DbCorreo, leadId: number | string, c: Cuenta, o: Parameters<typeof enviarCorreo>[2] = {}): Promise<ResultadoEnvio> {
  const correo = normalizarCorreo(c.correo)
  if (!correo || c.verificado !== true) return { estado: 'omitido', motivo: 'correo_sin_verificar' }
  try {
    const p = plantillaSolicitudPublicador({ nombre: c.nombre, referencia: `SOL-${leadId}` })
    return await enviarCorreo(db, { clave: `publicador/${leadId}`, categoria: 'transaccional', tipo: 'solicitud_publicador', para: correo, ...p }, o)
  } catch {
    console.error('[correo] la confirmación de publicador falló sin afectar la solicitud')
    return { estado: 'error', motivo: 'excepcion' }
  }
}

export { urlDe }

/**
 * Corre una tarea DESPUÉS de responder (el registro o la solicitud no esperan al proveedor de correo). Si no hay contexto
 * de petición (pruebas, scripts), simplemente la ejecuta y se traga cualquier error: nunca rompe a quien la llama.
 */
export function despuesDeResponder(tarea: () => Promise<unknown>): void {
  const segura = async () => { try { await tarea() } catch { /* el correo nunca tumba el flujo */ } }
  try {
    after(segura)
  } catch {
    void segura()
  }
}
