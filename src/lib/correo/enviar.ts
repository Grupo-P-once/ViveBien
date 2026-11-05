import { NEGOCIO } from '../config/negocio'
import { DESTINO_PRUEBAS, entornoCorreo, entornoDeCupo, envioHabilitado, envioPermitido, type EntornoCorreo, type EntornoDeCupo } from './config'
import { registrarCuotaVista } from './cuota-resend'
import { normalizarCorreo } from './seguridad'
import { cuerpoDePruebas, exigirSoloDestinoDePruebas, idDePrueba, llamarResend, MARCA_PRUEBA, prefijoDePrueba } from './resend'

/**
 * Envío de correo por Resend (D-80). Código de servidor: la clave nunca sale de aquí.
 *
 * Cada envío pasa por la base ANTES de llamar al proveedor (`correo_reservar_envio`, una transacción): ahí se decide, de una
 * vez y sin carreras, si es un duplicado, si la dirección está suprimida y si queda presupuesto. Sólo si la respuesta es
 * «enviar» se llama a Resend, y se le manda la MISMA clave como `Idempotency-Key` (el proveedor repite sin duplicar durante
 * 24 horas). No hay reintentos automáticos en bucle: un fallo queda como `error` y sólo se reintenta si la acción original
 * se repite pasados 10 minutos.
 *
 * Los logs no llevan direcciones, cuerpos ni la clave: sólo la categoría, el tipo y el resultado.
 */

type RespuestaRpc = { data: unknown; error: { message: string } | null }
export type DbCorreo = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabla: string) => any
}

/** Remitente de un correo: el MISMO cálculo lo usa el envío real y la vista previa del panel (así no pueden diferir). */
export function remitenteDe(categoria: CategoriaCorreo, env: EntornoCorreo = entornoCorreo()): string {
  return (categoria === 'marketing' ? env.remitenteMarketing : null) || env.remitente || NEGOCIO.remitente
}

export type SolicitudCorreo = {
  /** Única por correo lógico: `bienvenida/<uid>`, `reco/<suscriptor>/<día>`… Es la base de la idempotencia. */
  clave: string
  categoria: CategoriaCorreo
  tipo: string
  para: string
  asunto: string
  html: string
  texto: string
  suscriptorId?: string | null
  propiedades?: string[]
  /** Enlace de baja (sólo marketing): va en el pie Y en las cabeceras `List-Unsubscribe`. */
  urlBaja?: string
  /** `true` sólo si html/texto ya son sintéticos (vista previa del diseñador); en modo de pruebas, de lo contrario, el contenido real se descarta. */
  sintetico?: boolean
  /** Dirección de respuesta distinta de la institucional (por defecto, `NEGOCIO.email`). */
  responderA?: string
}

export type ResultadoEnvio = {
  estado: 'enviado' | 'duplicado' | 'suprimido' | 'sin_presupuesto' | 'omitido' | 'error'
  motivo?: string
}

export { MARCA_PRUEBA, prefijoDePrueba, exigirSoloDestinoDePruebas }

/**
 * `transaccional`: lo que la persona o el equipo necesita para operar (citas, invitaciones, avisos internos). Puede usar TODO el cupo.
 * `servicio`: avisos que la persona pidió (alertas de búsquedas, baja de precio) y avisos legales; no son publicidad, pero son opcionales para el cupo:
 *   nunca tocan la reserva transaccional. `marketing`: publicidad (aplazada; exige suscripción activa).
 */
export type CategoriaCorreo = 'transaccional' | 'servicio' | 'marketing'

type Opciones = { fetch?: typeof fetch; entorno?: EntornoCorreo; entornoCupo?: EntornoDeCupo }

export type ReservaDeCupo =
  | { accion: 'enviar'; id: number }
  | { accion: 'duplicado'; estadoPrevio?: string }
  | { accion: 'suprimido' }
  | { accion: 'sin_cupo' }
  /** La base no contestó o contestó algo ilegible: NO se sabe si hay cupo, y sin cupo confirmado no se envía. */
  | { accion: 'sin_confirmar' }

/**
 * Reserva un correo en el libro de cupo (función SQL atómica `correo_reservar_envio`). Es la ÚNICA puerta al cupo: la usan
 * `enviarCorreo` y el emisor único de los correos heredados. Cualquier cosa distinta de «enviar» significa que NO se llama al proveedor.
 */
export async function reservarCupo(
  db: DbCorreo,
  r: { clave: string; categoria: CategoriaCorreo; tipo: string; para: string; suscriptorId?: string | null; propiedades?: string[]; entornoCupo?: EntornoDeCupo },
): Promise<ReservaDeCupo> {
  let res: RespuestaRpc
  try {
    res = await db.rpc('correo_reservar_envio', {
      p_clave: r.clave,
      p_categoria: r.categoria,
      p_tipo: r.tipo,
      p_email: r.para,
      p_suscriptor: r.suscriptorId ?? null,
      p_props: r.propiedades?.length ? r.propiedades : null,
      p_entorno: r.entornoCupo ?? entornoDeCupo(),
    })
  } catch {
    return { accion: 'sin_confirmar' }
  }
  const { data, error } = res
  if (error || !data || typeof data !== 'object') return { accion: 'sin_confirmar' }
  const d = data as { accion?: string; id?: number; estado?: string }
  if (d.accion === 'duplicado') return { accion: 'duplicado', estadoPrevio: typeof d.estado === 'string' ? d.estado : undefined }
  if (d.accion === 'suprimido') return { accion: 'suprimido' }
  if (d.accion === 'sin_presupuesto') return { accion: 'sin_cupo' }
  if (d.accion === 'enviar' && typeof d.id === 'number') return { accion: 'enviar', id: d.id }
  return { accion: 'sin_confirmar' }
}

/** Anota el resultado de un envío reservado. Si la anotación falla, el envío queda «pendiente» y SIGUE contando para el cupo (falla hacia el lado seguro). */
export async function marcarEnvio(db: DbCorreo, id: number, estado: 'enviado' | 'error', resendId: string | null, texto: string | null): Promise<void> {
  try { await db.rpc('correo_marcar_envio', { p_id: id, p_estado: estado, p_resend_id: resendId, p_error: texto }) } catch { /* queda «pendiente»: sigue contando */ }
}

export async function enviarCorreo(db: DbCorreo, s: SolicitudCorreo, o: Opciones = {}): Promise<ResultadoEnvio> {
  const env = o.entorno ?? entornoCorreo()
  // COMPUERTA COMÚN (MKT-60): la misma que usa `enviarPorEmisorUnico`. Va antes de cualquier otra regla; ausente o apagada = no se envía nada.
  if (!envioHabilitado()) return { estado: 'omitido', motivo: 'envio_apagado' }
  // Se valida el destinatario ORIGINAL igual que en producción (una lista, un correo con saltos de línea o uno inválido se omite); en modo de
  // pruebas, DESPUÉS se sustituye por el destino de pruebas, antes de reservar, registrar o enviar nada.
  const original = normalizarCorreo(s.para)
  if (!original) return { estado: 'omitido', motivo: 'destinatario_invalido' }
  const para = env.modoPruebas ? DESTINO_PRUEBAS : original
  if (s.clave.length < 3 || s.clave.length > 200) return { estado: 'omitido', motivo: 'clave_invalida' }
  // Banderas: lo nuevo sale apagado. Sin clave del proveedor no se reserva nada (no se gasta presupuesto ni se deja basura).
  if ((s.categoria === 'transaccional' || s.categoria === 'servicio') && !env.transaccional) return { estado: 'omitido', motivo: 'transaccional_apagado' }
  if (s.categoria === 'marketing' && (!env.marketing || !env.secreto)) return { estado: 'omitido', motivo: 'marketing_apagado' }
  if (!env.resendKey) return { estado: 'omitido', motivo: 'sin_clave_del_proveedor' }

  if (!envioPermitido(o.entornoCupo ?? entornoDeCupo(), env.modoPruebas === true)) return { estado: 'omitido', motivo: 'fuera_de_produccion_sin_modo_de_pruebas' }
  // Cupo duro: si no se puede CONFIRMAR que hay lugar, no se envía (ni se llama al proveedor).
  const r = await reservarCupo(db, { clave: s.clave, categoria: s.categoria, tipo: s.tipo, para, suscriptorId: s.suscriptorId, propiedades: s.propiedades, entornoCupo: o.entornoCupo })
  if (r.accion === 'sin_confirmar') {
    console.error('[correo] no se pudo confirmar el cupo; no se envía', s.categoria, s.tipo)
    return { estado: 'error', motivo: 'cupo_sin_confirmar' }
  }
  if (r.accion === 'duplicado') return { estado: 'duplicado' }
  if (r.accion === 'suprimido') return { estado: 'suprimido' }
  if (r.accion === 'sin_cupo') return { estado: 'sin_presupuesto' }
  const reservaId = r.id

  const marcar = (estado: 'enviado' | 'error', resendId: string | null, texto: string | null) => marcarEnvio(db, reservaId, estado, resendId, texto)

  const cabeceras: Record<string, string> = {}
  if (s.categoria === 'marketing' && !s.urlBaja) {
    await marcar('error', null, 'marketing sin enlace de baja')
    return { estado: 'error', motivo: 'sin_baja' }
  }
  if (s.urlBaja) {
    // Baja con un clic (RFC 8058): Gmail y Yahoo la exigen en el correo comercial; también va en el primer correo de una alerta. La URL recibe el POST sin sesión.
    cabeceras['List-Unsubscribe'] = `<${s.urlBaja}>, <mailto:${NEGOCIO.email}?subject=Baja>`
    cabeceras['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const base: Record<string, unknown> = {
    from: remitenteDe(s.categoria, env),
    to: [para],
    reply_to: s.responderA || NEGOCIO.email,
    subject: s.asunto,
    html: s.html,
    text: s.texto,
    ...(Object.keys(cabeceras).length ? { headers: cabeceras } : {}),
  }
  // Modo de pruebas: el cuerpo se reconstruye (destino fijo, sin copias, sin baja ni enlaces con token) y se revisa ANTES de llamar al proveedor.
  const cuerpo = env.modoPruebas ? cuerpoDePruebas(base, idDePrueba(s.clave), { tipo: s.tipo, sintetico: s.sintetico }) : base
  if (env.modoPruebas) {
    try {
      exigirSoloDestinoDePruebas(cuerpo)
    } catch {
      await marcar('error', null, 'fuga_modo_pruebas')
      console.error('[correo] modo de pruebas: envío bloqueado por destinatarios inesperados')
      return { estado: 'error', motivo: 'fuga_modo_pruebas' }
    }
  }

  try {
    const res = await llamarResend({ apiKey: env.resendKey, cuerpo, idempotencia: s.clave, fetch: o.fetch, modoPruebas: env.modoPruebas === true, tipo: s.tipo, sintetico: s.sintetico })
    if (res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { id?: unknown } | null
      await marcar('enviado', typeof cuerpo?.id === 'string' ? cuerpo.id : null, null)
      await registrarCuotaVista(db, res.headers) // D-82: la respuesta trae el consumo de la cuenta; nunca lanza ni cambia el resultado
      return { estado: 'enviado' }
    }
    // Nada del cuerpo del error llega al usuario ni a los registros: sólo el código HTTP.
    await marcar('error', null, `http ${res.status}`)
    console.error('[correo] el proveedor rechazó un envío', s.categoria, s.tipo, res.status)
    return { estado: 'error', motivo: `http_${res.status}` }
  } catch {
    await marcar('error', null, 'red')
    console.error('[correo] fallo de red al enviar', s.categoria, s.tipo)
    return { estado: 'error', motivo: 'red' }
  }
}
