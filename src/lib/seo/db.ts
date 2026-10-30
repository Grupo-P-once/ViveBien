import { NextResponse } from 'next/server'

/**
 * Errores de la base para las rutas del apartado SEO (Fase C). Si la migración 37 aún no está aplicada, la tabla no existe: se responde 503 con un
 * mensaje claro y NO se inventa nada (falla cerrado), igual que el resto del proyecto con migraciones pendientes.
 */
type ErrorBase = { code?: string; message?: string } | null | undefined

export function faltaLaMigracion(e: ErrorBase): boolean {
  if (!e) return false
  // 42P01: undefined_table (Postgres). PGRST205/PGRST204: tabla o columna fuera del esquema que conoce PostgREST.
  return e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204' || /does not exist|schema cache/i.test(e.message ?? '')
}

export function respuestaDeErrorBase(e: ErrorBase, contexto: string): NextResponse {
  console.error(`seo/${contexto}`, e?.code ?? '', e?.message ?? '')
  if (faltaLaMigracion(e)) {
    return NextResponse.json({ error: 'Esta función necesita la migración 37 de la base de datos, que todavía no está aplicada.', codigo: 'migracion_pendiente' }, { status: 503 })
  }
  return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 })
}

/** Lee el cuerpo JSON sin lanzar. */
export async function cuerpoJson(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}
