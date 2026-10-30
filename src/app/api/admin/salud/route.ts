import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { diagnosticoDetallado } from '@/lib/salud-diagnostico'
import { instantanea } from '@/lib/metricas'
import { evaluarUmbrales } from '@/lib/umbrales'

/**
 * GET /api/admin/salud — el diagnóstico detallado que antes servía `/api/salud` a cualquiera (R-02 / QA-002, D-62).
 *
 * Dos formas de entrar:
 *  · sesión de administrador (el aviso de configuración del panel);
 *  · cabecera `x-salud-secreto` igual a la variable `SALUD_SECRETO` (monitorización externa, o cuando justo lo roto es el inicio de
 *    sesión). Si `SALUD_SECRETO` no está configurada, esa vía NO existe (falla cerrado). Se compara en tiempo constante.
 * Solo verdaderos/falsos y textos de qué hacer; nunca valores, claves ni longitudes de secretos.
 */
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'Cache-Control': 'private, no-store' }

function secretoValido(req: Request): boolean {
  const esperado = process.env.SALUD_SECRETO?.trim()
  const recibido = req.headers.get('x-salud-secreto')?.trim()
  if (!esperado || !recibido) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!secretoValido(req)) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error
  }
  // `metricas`: contadores y latencias DE ESTA INSTANCIA (timeouts de Supabase, 429, lecturas de ficha fallidas, memoria, deployment).
  // `umbrales` (E-38): `estado` ok|atencion y qué umbral se pasó (5xx, p95, memoria); un monitor externo puede alertar con `estado !== 'ok'`.
  const metricas = instantanea()
  return NextResponse.json({ ...(await diagnosticoDetallado()), metricas, umbrales: evaluarUmbrales(metricas) }, { headers: SIN_CACHE })
}
