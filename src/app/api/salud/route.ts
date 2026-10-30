import { NextResponse } from 'next/server'
import { conMetricas } from '@/lib/http-metricas'

/**
 * GET /api/salud — «¿está vivo el sitio?». Público y MÍNIMO a propósito (R-02 / QA-002, D-62).
 *
 * Antes devolvía qué integraciones estaban configuradas, si había un super admin, qué migraciones estaban aplicadas, el nombre de
 * la nube de Cloudinary y hasta cuántos caracteres tenía el token de Telegram: reconocimiento gratuito para cualquiera. Ahora solo
 * dice que la aplicación responde. El detalle vive en `GET /api/admin/salud` (sesión de administrador o secreto de monitorización).
 *
 * No toca la base de datos ni ninguna variable de entorno: no puede filtrar nada ni cargar al servicio.
 */
export const dynamic = 'force-dynamic'

async function responderSalud() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = conMetricas('salud', responderSalud)
