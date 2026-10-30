import { NEGOCIO } from '../config/negocio'
import { CORREO, DESTINO_PRUEBAS, entornoCorreo, type EntornoCorreo, type LimitesCorreo } from './config'
import { normalizarCorreo } from './seguridad'
import { cuerpoDePruebas, exigirSoloDestinoDePruebas, llamarResend, PREFIJO_PRUEBA } from './resend'

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

export type SolicitudCorreo = {
  /** Única por correo lógico: `bienvenida/<uid>`, `reco/<suscriptor>/<día>`… Es la base de la idempotencia. */
  clave: string
  categoria: 'transaccional' | 'marketing'
  tipo: string
  para: string
  asunto: string
  html: string
  texto: string
  suscriptorId?: string | null
  propiedades?: string[]
  /** Enlace de baja (sólo marketing): va en el pie Y en las cabeceras `List-Unsubscribe`. */
  urlBaja?: string
  /** Dirección de respuesta distinta de la institucional (por defecto, `NEGOCIO.email`). */
  responderA?: string
}

export type ResultadoEnvio = {
  estado: 'enviado' | 'duplicado' | 'suprimido' | 'sin_presupuesto' | 'omitido' | 'error'
  motivo?: string
}

export { PREFIJO_PRUEBA, exigirSoloDestinoDePruebas }

type Opciones = { fetch?: typeof fetch; entorno?: EntornoCorreo; limites?: Partial<LimitesCorreo> }

export async function enviarCorreo(db: DbCorreo, s: SolicitudCorreo, o: Opciones = {}): Promise<ResultadoEnvio> {
  const env = o.entorno ?? entornoCorreo()
  // Se valida el destinatario ORIGINAL igual que en producción (una lista, un correo con saltos de línea o uno inválido se omite); en modo de
  // pruebas, DESPUÉS se sustituye por el destino de pruebas, antes de reservar, registrar o enviar nada.
  const original = normalizarCorreo(s.para)
  if (!original) return { estado: 'omitido', motivo: 'destinatario_invalido' }
  const para = env.modoPruebas ? DESTINO_PRUEBAS : original
  if (s.clave.length < 3 || s.clave.length > 200) return { estado: 'omitido', motivo: 'clave_invalida' }
  // Banderas: lo nuevo sale apagado. Sin clave del proveedor no se reserva nada (no se gasta presupuesto ni se deja basura).
  if (s.categoria === 'transaccional' && !env.transaccional) return { estado: 'omitido', motivo: 'transaccional_apagado' }
  if (s.categoria === 'marketing' && (!env.marketing || !env.secreto)) return { estado: 'omitido', motivo: 'marketing_apagado' }
  if (!env.resendKey) return { estado: 'omitido', motivo: 'sin_clave_del_proveedor' }

  const lim = { ...CORREO, ...(o.limites ?? {}) }
  const { data, error } = await db.rpc('correo_reservar_envio', {
    p_clave: s.clave,
    p_categoria: s.categoria,
    p_tipo: s.tipo,
    p_email: para,
    p_suscriptor: s.suscriptorId ?? null,
    p_props: s.propiedades?.length ? s.propiedades : null,
    p_dia_max: lim.diaMax,
    p_mes_max: lim.mesMax,
    p_reserva_transaccional: lim.reservaTransaccional,
  })
  if (error || !data || typeof data !== 'object') {
    console.error('[correo] no se pudo reservar el envío', s.categoria, s.tipo)
    return { estado: 'error', motivo: 'reserva' }
  }
  const r = data as { accion?: string; id?: number }
  if (r.accion === 'duplicado') return { estado: 'duplicado' }
  if (r.accion === 'suprimido') return { estado: 'suprimido' }
  if (r.accion === 'sin_presupuesto') return { estado: 'sin_presupuesto' }
  if (r.accion !== 'enviar' || typeof r.id !== 'number') return { estado: 'error', motivo: 'reserva_desconocida' }

  const marcar = (estado: 'enviado' | 'error', resendId: string | null, texto: string | null) =>
    db.rpc('correo_marcar_envio', { p_id: r.id, p_estado: estado, p_resend_id: resendId, p_error: texto })

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
    from: (s.categoria === 'marketing' ? env.remitenteMarketing : null) || env.remitente || NEGOCIO.remitente,
    to: [para],
    reply_to: s.responderA || NEGOCIO.email,
    subject: s.asunto,
    html: s.html,
    text: s.texto,
    ...(Object.keys(cabeceras).length ? { headers: cabeceras } : {}),
  }
  // Modo de pruebas: el cuerpo se reconstruye (destino fijo, sin copias, sin baja ni enlaces con token) y se revisa ANTES de llamar al proveedor.
  const cuerpo = env.modoPruebas ? cuerpoDePruebas(base) : base
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
    const res = await llamarResend({ apiKey: env.resendKey, cuerpo, idempotencia: s.clave, fetch: o.fetch, modoPruebas: env.modoPruebas === true })
    if (res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { id?: unknown } | null
      await marcar('enviado', typeof cuerpo?.id === 'string' ? cuerpo.id : null, null)
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
