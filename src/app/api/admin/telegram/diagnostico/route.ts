import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

/**
 * GET /api/admin/telegram/diagnostico — ¿está configurado el canal de Telegram? (E-35 / QA-012)
 *
 * Antes era un `GET` PÚBLICO en el propio webhook: cualquiera podía preguntar si había secreto, token y cuántos remitentes autorizados.
 * Poco, pero es reconocimiento gratis. Ahora exige administrador (401 sin sesión, 403 si no lo es) y solo responde SÍ/NO y un conteo:
 * jamás el valor, el largo ni el prefijo de un secreto, ni nada del webhook.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const remitentes = (process.env.TELEGRAM_CHATS_PERMITIDOS ?? '').split(',').map((s) => s.trim()).filter(Boolean).length
  return NextResponse.json(
    {
      configurado: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      conToken: Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '').trim()),
      remitentes,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
