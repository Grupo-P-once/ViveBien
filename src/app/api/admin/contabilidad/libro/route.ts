import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { leerLibro, NO_DISPONIBLE } from '@/lib/contabilidad-servidor'

/**
 * GET /api/admin/contabilidad/libro — todo lo que el diario necesita (25-oct-2026). SOLO Super Admin (`contabilidad.ver`).
 *
 * Devuelve las filas tal cual (operaciones de comisión, movimientos manuales y cuentas de gasto) y la etiqueta de las propiedades mencionadas:
 * las líneas del diario, los totales y el análisis se calculan en `lib/contabilidad.ts` con el mismo código que prueban los tests.
 * Las operaciones traen sus gastos (migración 47) y los movimientos vienen de la migración 48: sin ellas responde 503 y no enseña un libro a medias.
 */

export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const libro = await leerLibro(supabaseAdmin())
  if (!libro) return NO_DISPONIBLE()
  return NextResponse.json(libro)
}
