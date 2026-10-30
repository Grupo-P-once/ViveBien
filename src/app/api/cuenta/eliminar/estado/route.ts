import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { puedeRegistrarseDeNuevo, type EstadoProceso } from '@/lib/cuentas/baja'

/**
 * GET /api/cuenta/eliminar/estado — ¿en qué punto va mi baja? (D-43)
 *
 * Sólo habla de **la cuenta de la sesión**. No acepta ningún identificador:
 * el `uid` sale del token verificado y no hay forma de preguntar por otra
 * persona, ni con query, ni con cabecera, ni con cuerpo.
 *
 * Devuelve lo justo para que la pantalla sepa qué decir. **Nunca** PII, nunca
 * el `ultimo_error` en crudo (es un código técnico que no ayuda a nadie que
 * esté leyendo) y nunca fechas del historial.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lo que ve la pantalla. Deliberadamente corto. */
type Vista = 'activa' | 'procesando' | 'error' | 'completada'

function vistaDe(estadoCuenta: string, proceso: EstadoProceso | null): Vista {
  if (estadoCuenta !== 'eliminada') return 'activa'
  if (proceso === 'completada') return 'completada'
  if (proceso === 'error') return 'error'
  // `bloqueada`, `firebase_eliminada`, `datos_procesados`, o sin registro:
  // la cuenta está cerrada y queda trabajo por delante.
  return 'procesando'
}

export async function GET(req: Request) {
  // Una cuenta ya eliminada recibe 403 de `exigir`, así que este GET sólo lo
  // ve quien todavía puede entrar. Es lo correcto: la pantalla que pregunta
  // por el estado vive dentro de la sesión.
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error
  const { perfil } = chequeo

  let proceso: EstadoProceso | null = null
  try {
    const { data } = await supabaseAdmin()
      .from('bajas_de_cuenta')
      .select('estado')
      .eq('uid', perfil.uid)
      .maybeSingle()
    const e = data?.estado
    if (typeof e === 'string') proceso = e as EstadoProceso
  } catch {
    // Sin registro no se inventa nada: la cuenta se describe por su estado.
  }

  const vista = vistaDe(perfil.estado, proceso)
  return NextResponse.json({
    estado: vista,
    puedeRegistrarseDeNuevo: proceso ? puedeRegistrarseDeNuevo(proceso) : false,
    requiereReintento: vista === 'error',
  })
}
