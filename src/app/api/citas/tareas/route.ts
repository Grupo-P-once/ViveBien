import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
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
 * Se autentica con un TOKEN PROPIO de un solo propósito (`CITAS_TAREAS_TOKEN`, guardado en Vault del lado de la base y como
 * variable de Vercel): NO es la llave de servicio. Si alguien lo viera, solo podría ejecutar esta tarea —que es idempotente—,
 * nunca leer ni escribir la base. `pg_net` deja la llave descifrada en `net.http_request_queue` mientras la petición está
 * pendiente (lo advierte la documentación de Supabase): por eso aquí no viaja una llave con poder.
 *
 * · Solo POST: un GET (un rastreador, una previsualización) no ejecuta nada.
 * · Sin la variable, o demasiado corta, responde 503 (falla cerrado). Sin el token correcto, 401.
 * · La comparación es en tiempo constante. El token nunca se escribe en un registro ni en una respuesta.
 * · La respuesta solo trae conteos: ninguna dirección, nombre ni id de cita.
 * ─────────────────────────────────────────────────────────────
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LARGO_MINIMO = 32

/** Compara dos cadenas en tiempo constante sin filtrar su largo (se comparan los hashes). */
function mismoToken(a: string, b: string): boolean {
  const x = createHash('sha256').update(a, 'utf8').digest()
  const y = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(x, y)
}

export async function POST(req: Request) {
  const esperado = process.env.CITAS_TAREAS_TOKEN?.trim()
  if (!esperado || esperado.length < LARGO_MINIMO) {
    return NextResponse.json({ error: 'La tarea no está configurada.' }, { status: 503 })
  }
  const recibido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!recibido || !mismoToken(recibido, esperado)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

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
