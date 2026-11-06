import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { vencerCitas } from '@/lib/citas/servicio'
import { avisarCambio, procesarRecordatorios } from '@/lib/citas/enviar'

/**
 * POST /api/citas/tareas — la tarea de las citas, cada minuto (D-4): hace expirar lo que nadie respondió y manda los
 * recordatorios de 24 h y 1 h antes.
 *
 * ─────────────────────────────────────────────────────────────
 * QUIÉN LA LLAMA Y CON QUÉ
 *
 * La llama `pg_cron` + `pg_net` desde la base (Vercel Hobby solo corre un cron al día; para esto hace falta cada minuto).
 * NO viaja ningún secreto. El cron manda solo
 *     X-Citas-Tiempo: <segundos desde 1970>      X-Citas-Firma: HMAC-SHA256(secreto, tiempo) en hexadecimal
 * y el secreto vive SOLO en Supabase Vault. Esta ruta no lo conoce: le pregunta a la base (`citas_tarea_firma_valida`,
 * migración 72) si la firma es buena, si el instante está a ≤ 120 s de ahora y si no se había usado ya.
 *
 * Por qué así: `pg_net` deja los encabezados de la petición descifrados en `net.http_request_queue`, que los roles de la aplicación
 * pueden leer (se comprobó en staging; Supabase no permite revocarlo desde SQL). Quien la leyera vería una firma que caduca en
 * dos minutos y vale una sola vez, no un token reutilizable. Tampoco es la llave de servicio, ni hay nada en variables de Vercel.
 *
 * · Solo POST: un GET (un rastreador, una previsualización) no ejecuta nada.
 * · Si la base no puede validar (migración sin aplicar, caída): 503, falla cerrado. Firma ausente, vieja, repetida o mala: 401.
 * · La respuesta solo trae conteos: ninguna dirección, nombre ni id de cita.
 * ─────────────────────────────────────────────────────────────
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FORMA_TIEMPO = /^\d{10}$/
const FORMA_FIRMA = /^[0-9a-f]{64}$/

export async function POST(req: Request) {
  const tiempo = (req.headers.get('x-citas-tiempo') ?? '').trim()
  const firma = (req.headers.get('x-citas-firma') ?? '').trim()
  // Antes de ir a la base: lo que no tiene forma de firma no merece una consulta.
  if (!FORMA_TIEMPO.test(tiempo) || !FORMA_FIRMA.test(firma)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const validacion = await supabaseAdmin().rpc('citas_tarea_firma_valida', { p_tiempo: Number(tiempo), p_firma: firma })
  if (validacion.error) {
    // Sin el texto del error: podría repetir los parámetros.
    console.error('[citas] la base no pudo validar la firma de la tarea', validacion.error.code ?? '')
    return NextResponse.json({ error: 'La tarea no está configurada.' }, { status: 503 })
  }
  if (validacion.data !== true) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  try {
    const vencidas = await vencerCitas()
    // A las que quedaron «Expirada» se les avisa; una por una para que un fallo no detenga a las demás.
    for (const id of vencidas.expiradas) await avisarCambio(id, 'EXPIRED', null)
    const recordatorios = await procesarRecordatorios()
    return NextResponse.json({ ok: true, revisadas: vencidas.revisadas, expiradas: vencidas.expiradas.length, recordatorios })
  } catch (e) {
    // Sin detalles en la respuesta; el texto del error ya viene sin direcciones de correo.
    console.error('[citas] la tarea falló:', e instanceof Error ? e.message.slice(0, 160) : 'error')
    return NextResponse.json({ ok: false, error: 'No se pudo completar la tarea.' }, { status: 500 })
  }
}
