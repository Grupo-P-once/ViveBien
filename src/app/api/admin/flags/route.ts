import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { FLAGS, decidirCambioDeFlag, normalizarFlags } from '@/lib/config/flags'
import { leerFlags, olvidarFlags } from '@/lib/config/flags-servidor'

/**
 * Los módulos que se encienden y se apagan, desde el panel (D-31, V-1.1.85).
 *
 * Antes esto sólo se podía hacer entrando a la base a cambiar un JSON: sin
 * saber quién lo hizo, cuándo ni por qué. Ahora pasa por aquí:
 *
 *  · **sólo Super Admin** (`exigir('configuracion.flags')`); un admin normal
 *    recibe 403 y el intento queda registrado;
 *  · **el servidor manda**: el navegador propone `{flag, valor, motivo}` y aquí
 *    se decide (`decidirCambioDeFlag`), se escribe y se devuelve el estado real;
 *  · **motivo obligatorio** y **bitácora** con el antes y el después.
 *
 * `force-dynamic`: encender un módulo no puede quedarse en una copia guardada.
 */
export const dynamic = 'force-dynamic'

/** Quién tocó cada módulo por última vez, de la bitácora. */
async function ultimosCambios(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db
    .from('audit_logs')
    .select('actor_email, entidad_id, despues, creado_en')
    .eq('accion', 'configuracion.flag')
    .order('creado_en', { ascending: false })
    .limit(60)

  const ultimo: Record<string, { por: string | null; en: string; motivo: string | null; a: boolean | null }> = {}
  for (const f of (data ?? []) as Array<Record<string, unknown>>) {
    const clave = typeof f.entidad_id === 'string' ? f.entidad_id : ''
    if (!clave || ultimo[clave]) continue
    const d = (f.despues ?? {}) as Record<string, unknown>
    ultimo[clave] = {
      por: typeof f.actor_email === 'string' ? f.actor_email : null,
      en: String(f.creado_en),
      motivo: typeof d.motivo === 'string' ? d.motivo : null,
      a: typeof d.valor === 'boolean' ? d.valor : null,
    }
  }
  return ultimo
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'configuracion.flags')
  if (auth.error) return auth.error

  const db = supabaseAdmin()
  const flags = await leerFlags()
  return NextResponse.json({ flags, orden: FLAGS, ultimos: await ultimosCambios(db) })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'configuracion.flags')
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`flags:${origenDe(req)}`, TOPES.busquedas)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const db = supabaseAdmin()

  // Se lee de la base, no de la memoria: dos personas pueden estar mirando la
  // misma pantalla y el «estaba apagado» tiene que ser el de ahora mismo.
  const { data, error } = await db.from('configuracion').select('valor, version').eq('clave', 'flags').maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo leer la configuración.' }, { status: 500 })
  const actuales = normalizarFlags(data?.valor)

  const decision = decidirCambioDeFlag(actuales, cuerpo)
  if (!decision.ok) return NextResponse.json({ error: decision.motivo }, { status: 400 })

  // Cambio + bitácora en UNA transacción (`configuracion_cambiar_flag`, migración 31):
  // cambia SÓLO esta clave (no reescribe las demás: dos Super Admin a la vez no se
  // pisan), compara con lo que se leyó (si otro ya lo cambió, conflicto) y escribe
  // la huella. Si algo falla, incluida la bitácora, no queda nada.
  const { data: res, error: errFn } = await db.rpc('configuracion_cambiar_flag', {
    p_flag: decision.flag,
    p_antes: decision.de,
    p_a: decision.a,
    p_audit: {
      actor_uid: perfil.uid,
      actor_email: perfil.email,
      actor_rol: perfil.rol,
      accion: 'configuracion.flag',
      antes: { valor: decision.de },
      despues: { valor: decision.a, motivo: decision.motivo },
    },
  })
  if (errFn) {
    const faltaFuncion = errFn.code === 'PGRST202' || errFn.code === '42883' || /could not find the function|does not exist/i.test(errFn.message ?? '')
    return NextResponse.json(
      { error: faltaFuncion
        ? 'Falta aplicar la migración 31 (cambios de módulos en una sola operación).'
        : 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' },
      { status: 503 },
    )
  }
  const resultado = (res as { resultado?: string } | null)?.resultado
  if (resultado === 'conflicto') {
    return NextResponse.json({ error: 'Otra persona cambió este módulo mientras lo mirabas. Recarga la página para ver cómo quedó.', codigo: 'conflicto' }, { status: 409 })
  }
  if (resultado === 'no_existe') return NextResponse.json({ error: 'No hay configuración de módulos.' }, { status: 404 })
  if (resultado === 'flag_desconocido') return NextResponse.json({ error: 'Ese módulo no existe.' }, { status: 400 })
  if (resultado !== 'ok') return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })

  olvidarFlags()

  // Se devuelve lo que quedó guardado, no lo que se pidió (D-32).
  const { data: despues } = await db.from('configuracion').select('valor').eq('clave', 'flags').maybeSingle()
  return NextResponse.json({ flags: normalizarFlags(despues?.valor), ultimos: await ultimosCambios(db) })
}
