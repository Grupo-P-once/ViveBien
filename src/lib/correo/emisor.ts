import { randomUUID } from 'node:crypto'
import { DESTINO_PRUEBAS, entornoCorreo, entornoDeCupo, envioPermitido, type EntornoDeCupo } from './config'
import { marcarEnvio, reservarCupo, type CategoriaCorreo, type DbCorreo } from './enviar'
import { dbDelLibro } from './libro'
import { normalizarCorreo } from './seguridad'
import { llamarResend, modoPruebasActivo } from './resend'

/**
 * EMISOR ÚNICO de los correos que ya existían antes de D-80 (F0, 29-oct-2026): aviso de leads, citas, invitaciones y avisos a clientes.
 *
 * Antes cada uno llamaba a Resend por su cuenta: el modo de pruebas sólo lo alcanzaba si el emisor se acordaba de usarlo, y ninguno
 * contaba contra el cupo del plan gratuito (el de avisos a clientes ni siquiera pasaba por el modo de pruebas). Ahora TODOS llegan aquí:
 *
 *   1. Reservan el cupo en la base (`correo_reservar_envio`, atómica y con cifras fijas: 90/día y 2,700/mes en total).
 *   2. Sólo si la base contesta «enviar», llaman a Resend a través de `llamarResend` (modo de pruebas, destino fijo, ID en el asunto).
 *   3. Anotan el resultado.
 *
 * Si la base no contesta, o contesta algo ilegible, NO se envía: sin cupo confirmado no sale ningún correo (falla cerrada). Que un
 * correo no salga es recuperable (el aviso queda pendiente, la cita se reintenta); pasarse del plan, no.
 * Una prueba estática impide que cualquier otro archivo llame a la API de Resend o lea la clave.
 */

export type PedidoEmisor = {
  /** Única por correo lógico (3–200 caracteres). Es la idempotencia: la misma clave nunca se manda dos veces. */
  clave: string
  /** `transaccional` puede usar todo el cupo; `servicio` (alertas, bajas de precio, avisos legales) respeta la reserva transaccional. */
  categoria: Exclude<CategoriaCorreo, 'marketing'>
  tipo: string
  /** Destinatario original: sirve para el registro de supresiones; en modo de pruebas el correo real va a `DESTINO_PRUEBAS`. */
  para: string
  cuerpo: Record<string, unknown>
  apiKey: string
  fetch?: typeof fetch
  /** Para pruebas; por defecto el libro de cupo del servidor (`libro.ts`). */
  db?: DbCorreo
  entornoCupo?: EntornoDeCupo
  modoPruebas?: boolean
}

export type EstadoEmisor = 'bloqueado' | 'enviado' | 'duplicado' | 'suprimido' | 'sin_cupo' | 'sin_confirmar' | 'sin_clave' | 'invalido' | 'rechazado' | 'error'
export type ResultadoEmisor = {
  /** `true` sólo si el correo salió ahora o ya había salido antes con esta misma clave. */
  ok: boolean
  estado: EstadoEmisor
  status?: number
  /** Recorte del error (sin direcciones ni cuerpos); apto para registros. */
  detalle?: string
  /** Identificador del correo en el proveedor, si lo devolvió. */
  resendId?: string | null
}

/** La clave de Resend. Es el ÚNICO camino de los emisores a la variable: se lee en el momento de usarla, en `config.ts`, y se recorta. */
export const claveResend = (): string => entornoCorreo().resendKey

/** Estados previos de un envío que ya salió: repetir la clave no debe volver a mandarlo. */
const YA_SALIO = new Set(['enviado', 'entregado', 'rebotado', 'queja'])

export async function enviarPorEmisorUnico(p: PedidoEmisor): Promise<ResultadoEmisor> {
  if (!p.apiKey) return { ok: false, estado: 'sin_clave' }
  if (p.clave.length < 3 || p.clave.length > 200) return { ok: false, estado: 'invalido', detalle: 'clave_invalida' }
  const pruebas = p.modoPruebas ?? modoPruebasActivo()
  // En modo de pruebas el destinatario es siempre el de pruebas (lo que el emisor haya puesto no existe para el libro ni para el proveedor);
  // fuera de él, una dirección que no sea UNA dirección válida no se manda (Resend la habría rechazado de todos modos).
  const para = pruebas ? DESTINO_PRUEBAS : normalizarCorreo(p.para)
  if (!para) return { ok: false, estado: 'invalido', detalle: 'destinatario_invalido' }

  if (!envioPermitido(p.entornoCupo ?? entornoDeCupo(), pruebas)) return { ok: false, estado: 'bloqueado', detalle: 'fuera_de_produccion_sin_modo_de_pruebas' }

  let db: DbCorreo
  try {
    db = p.db ?? dbDelLibro()
  } catch {
    console.error('[correo] sin acceso a la base: no se puede confirmar el cupo; no se envía', p.categoria, p.tipo)
    return { ok: false, estado: 'sin_confirmar' }
  }

  const r = await reservarCupo(db, { clave: p.clave, categoria: p.categoria, tipo: p.tipo, para, entornoCupo: p.entornoCupo })
  if (r.accion === 'sin_confirmar') {
    console.error('[correo] no se pudo confirmar el cupo; no se envía', p.categoria, p.tipo)
    return { ok: false, estado: 'sin_confirmar' }
  }
  if (r.accion === 'sin_cupo') {
    console.error('[correo] cupo del plan agotado; no se envía', p.categoria, p.tipo)
    return { ok: false, estado: 'sin_cupo' }
  }
  if (r.accion === 'suprimido') return { ok: false, estado: 'suprimido' }
  if (r.accion === 'duplicado') return { ok: YA_SALIO.has(r.estadoPrevio ?? ''), estado: 'duplicado' }

  try {
    const res = await llamarResend({ apiKey: p.apiKey, cuerpo: p.cuerpo, idempotencia: p.clave, fetch: p.fetch, modoPruebas: pruebas })
    const texto = await res.text().catch(() => '')
    if (!res.ok) {
      await marcarEnvio(db, r.id, 'error', null, `http ${res.status}`)
      return { ok: false, estado: 'rechazado', status: res.status, detalle: texto.slice(0, 200) }
    }
    let resendId: string | null = null
    try { const id = (JSON.parse(texto) as { id?: unknown }).id; resendId = typeof id === 'string' ? id : null } catch { /* sin id */ }
    await marcarEnvio(db, r.id, 'enviado', resendId, null)
    return { ok: true, estado: 'enviado', status: res.status, resendId }
  } catch (e) {
    const motivo = e instanceof Error && e.message === 'fuga_modo_pruebas' ? 'fuga_modo_pruebas' : 'red'
    await marcarEnvio(db, r.id, 'error', null, motivo)
    return { ok: false, estado: 'error', detalle: motivo === 'red' ? (e instanceof Error ? e.message : 'fallo de red') : motivo }
  }
}

/** Clave para un correo que se manda una vez por hecho y no tiene identidad propia (un lead, una invitación). */
export const claveUnica = (prefijo: string) => `${prefijo}/${randomUUID()}`
