import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'

/**
 * GET /api/admin/bajas — las bajas que no terminaron (D-43).
 *
 * Sólo metadatos de operación. **Ninguna PII**: la función SQL ya retiró el
 * correo, el nombre y el teléfono de la cuenta, y esta lista no los recupera
 * de ningún sitio. Lo único que identifica es el `uid`, que hace falta para
 * poder reintentar y que no dice nada de quién era esa persona.
 *
 * Tampoco se devuelve `auth_time` ni `motivo`: el motivo lo escribió la
 * persona al darse de baja y no le hace falta a nadie para terminar un paso
 * técnico.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const chequeo = await exigir(req, 'usuarios.gestionar')
  if (chequeo.error) return chequeo.error

  const { data, error } = await supabaseAdmin()
    .from('bajas_de_cuenta')
    .select('uid, estado, solicitada_en, bloqueada_en, firebase_eliminada_en, completada_en, intentos, ultimo_intento_en, ultimo_error')
    .neq('estado', 'completada')
    .order('solicitada_en', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: 'No se pudo leer la lista.' }, { status: 500 })
  }

  return NextResponse.json({
    bajas: (data ?? []).map((b) => ({
      uid: b.uid,
      estado: b.estado,
      solicitadaEn: b.solicitada_en,
      bloqueadaEn: b.bloqueada_en,
      firebaseEliminadaEn: b.firebase_eliminada_en,
      completadaEn: b.completada_en,
      intentos: b.intentos,
      ultimoIntentoEn: b.ultimo_intento_en,
      // Código corto del fallo, tal cual se guardó. Nunca lleva datos dentro.
      ultimoError: b.ultimo_error,
    })),
  })
}
