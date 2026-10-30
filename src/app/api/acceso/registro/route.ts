import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { registroValido } from '@/lib/acceso/google'

/**
 * Bitácora de fallos al entrar con Google (V-1.1.83).
 *
 * Quien falla al entrar todavía no tiene sesión: el registro es anónimo
 * (`actor_uid = 'anonimo'`). Sólo se guardan campos acotados —el código de
 * Firebase, la pantalla, el paso, la app que lo envolvía y la dirección
 * (con o sin www)—; nunca el mensaje de Firebase, que puede traer el correo.
 * Siempre responde 204: a la persona le da igual si se guardó.
 *
 * SEC-3 (29-oct-2026): es una ESCRITURA ANÓNIMA en `audit_logs`. El tope por origen vive en la memoria de cada instancia (no es frontera) y la clave
 * `x-forwarded-for` la puede variar quien ataca, así que además hay un TOPE GLOBAL respaldado en la base: como mucho 15 filas anónimas de esta bitácora
 * por hora (decisión del dueño: «límite de 15 intentos») y 100 por 24 h; pasado el tope, ya no se escribe (la consola de Vercel sigue teniendo la
 * línea). Si el conteo falla, tampoco se escribe (falla cerrado). El cuerpo se acota a 4 KB antes de leerlo.
 */
const MAX_CUERPO_BYTES = 4096
const TOPE_POR_HORA = 15
const TOPE_POR_DIA = 100

type Base = ReturnType<typeof supabaseAdmin>

async function hayCupo(db: Base): Promise<boolean> {
  for (const [ventanaMs, tope] of [[3_600_000, TOPE_POR_HORA], [86_400_000, TOPE_POR_DIA]] as const) {
    const { count, error } = await db.from('audit_logs').select('id', { count: 'exact', head: true })
      .eq('actor_uid', 'anonimo').eq('accion', 'acceso.google_fallo')
      .gte('creado_en', new Date(Date.now() - ventanaMs).toISOString())
    if (error || typeof count !== 'number' || count >= tope) return false
  }
  return true
}

export async function POST(req: Request) {
  const frenado = await frenarAsync(`acceso:${origenDe(req)}`, TOPES.acceso)
  if (frenado) return new NextResponse(null, { status: 204 })

  // Cuerpo acotado ANTES de leerlo: este registro nunca necesita más de unos cientos de bytes.
  const largo = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(largo) && largo > MAX_CUERPO_BYTES) return new NextResponse(null, { status: 204 })

  let cuerpo: unknown = null
  try { cuerpo = await req.json() } catch { /* cuerpo vacío o no JSON */ }
  const r = registroValido(cuerpo)
  if (!r) return new NextResponse(null, { status: 204 })

  const anfitrion = (req.headers.get('host') ?? '').toLowerCase().slice(0, 60)
  // Aparece en los registros de Vercel aunque la base falle.
  console.warn('[acceso con Google]', r.codigo, r.paso, r.donde, anfitrion, r.incrustado ?? '', r.planB ? 'plan-b' : '')
  try {
    const db = supabaseAdmin()
    if (!(await hayCupo(db))) return new NextResponse(null, { status: 204 })
    await db.from('audit_logs').insert({
      actor_uid: 'anonimo',
      accion: 'acceso.google_fallo',
      entidad: 'acceso',
      entidad_id: r.codigo,
      despues: { donde: r.donde, paso: r.paso, incrustado: r.incrustado, planB: r.planB, anfitrion },
    })
  } catch {
    // Sin bitácora; la consola de Vercel ya lo tiene.
  }
  return new NextResponse(null, { status: 204 })
}
