import type { supabaseAdmin } from '@/lib/auth-server'
import { avisar } from '@/lib/alertas'
import { construirLineas, type ExternaContable, type MovimientoContable } from '@/lib/contabilidad'
import type { OperacionComision } from '@/lib/comision-resumen'
import { alertaDelReporte, construirReporteQuincenal, quincenaACerrar, type ReporteQuincenal } from '@/lib/contabilidad-quincenal'
import { leerLibro } from '@/lib/contabilidad-servidor'

/**
 * Lado servidor del reporte quincenal (26-oct-2026): lo comparten el cron y el botón «Enviar ahora» del Super Admin.
 *
 * ENVIAR ES SALIR AL MUNDO. Un mensaje a Telegram no se recoge. Por eso: (1) se RESERVA la quincena en la base antes de mandar (`contab_reporte_reservar`) y se marca como enviada
 * después: el cron corre varios días por si falló y no manda dos veces; (2) si la reserva no se puede hacer (falta la migración 50) NO se manda nada; (3) sin Telegram configurado
 * no se reserva (para poder enviarla cuando se configure).
 */

type Db = ReturnType<typeof supabaseAdmin>

/** La fecha de hoy en México (el cron corre a las 9:00 hora local, pero el servidor está en UTC). */
export const hoyEnMexico = (ahora = new Date()) => ahora.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
export const telegramConfigurado = () => Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ALERTAS?.trim())

export type Preparado = { reporte: ReporteQuincenal; alerta: ReturnType<typeof alertaDelReporte> }

/** Lee el libro y arma el reporte de la quincena que ya terminó. `null` si la contabilidad no está disponible. */
export async function prepararReporte(db: Db, hoy: string): Promise<Preparado | null> {
  const libro = await leerLibro(db)
  if (!libro) return null
  const lineas = construirLineas({ operaciones: libro.operaciones as unknown as OperacionComision[], movimientos: libro.movimientos as unknown as MovimientoContable[], etiquetasDePropiedad: libro.etiquetasDePropiedad, externas: libro.externas as unknown as ExternaContable[] })
  const reporte = construirReporteQuincenal(lineas, quincenaACerrar(hoy), hoy)
  return { reporte, alerta: alertaDelReporte(reporte) }
}

export type ResultadoDeEnvio = 'enviado' | 'ya_enviado' | 'en_curso' | 'telegram_sin_configurar' | 'no_disponible' | 'fallo'

export async function enviarQuincenal(db: Db, hoy: string, origen: 'cron' | 'manual'): Promise<{ estado: ResultadoDeEnvio; reporte?: ReporteQuincenal }> {
  if (!telegramConfigurado()) return { estado: 'telegram_sin_configurar' }
  const p = await prepararReporte(db, hoy)
  if (!p) return { estado: 'no_disponible' }
  const { desde, hasta } = p.reporte.quincena
  const reserva = await db.rpc('contab_reporte_reservar', { p_tipo: 'quincenal', p_desde: desde, p_hasta: hasta, p_origen: origen })
  if (reserva.error) return { estado: 'no_disponible' }
  const r = (reserva.data as { resultado?: string } | null)?.resultado
  if (r === 'ya_enviado' || r === 'en_curso') return { estado: r, reporte: p.reporte }
  if (r !== 'ok') return { estado: 'no_disponible' }
  const salio = await avisar(p.alerta)
  if (!salio) return { estado: 'fallo', reporte: p.reporte }
  await db.rpc('contab_reporte_marcar_enviado', { p_tipo: 'quincenal', p_desde: desde, p_hasta: hasta })
  return { estado: 'enviado', reporte: p.reporte }
}
