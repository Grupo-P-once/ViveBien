import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin, type PerfilUsuario } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { borrarIdentidad, revocarSesiones } from '@/lib/firebase-admin'
import { reintentarFirebase, type DependenciasReintento, type MotivoRechazo } from '@/lib/cuentas/reintento'
import { ANTERIORES, type EstadoProceso } from '@/lib/cuentas/baja'

/**
 * POST /api/admin/bajas/[uid]/reintentar — terminar la parte de Firebase de
 * una baja que se quedó a medias (D-43).
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTA RUTA NO PUEDE HACER, POR CONSTRUCCIÓN
 *
 * · No llama a `baja_de_cuenta`. La función SQL destructiva no se ejecuta aquí
 *   en ningún caso: lo único pendiente cuando un proceso se atasca es Firebase.
 * · No escribe en `usuarios`. Una cuenta eliminada **no vuelve a estar activa**.
 * · No acepta un `uid` cualquiera: tiene que existir una baja registrada, en un
 *   estado pendiente, y la cuenta tiene que constar como `eliminada`. Si no,
 *   se rechaza sin tocar Firebase.
 * ─────────────────────────────────────────────────────────────
 *
 * El permiso es `usuarios.gestionar` (admin y super admin), del catálogo que ya
 * existe. No hay un sistema de roles paralelo para esto.
 *
 * La auditoría **sí** guarda el correo del administrador: es su operación, y
 * no tiene nada que ver con la PII que la baja retiró de la persona eliminada.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ESTADO_HTTP: Record<MotivoRechazo, number> = {
  sin_registro: 404,
  ya_completada: 409,
  sin_paso_pendiente: 409,
  cuenta_no_eliminada: 409,
  en_curso: 409,
}

const MENSAJE: Record<MotivoRechazo, string> = {
  sin_registro: 'No hay ninguna baja registrada para esa cuenta.',
  ya_completada: 'Esa baja ya está terminada.',
  sin_paso_pendiente: 'Esa baja no tiene ningún paso pendiente que reintentar.',
  cuenta_no_eliminada: 'Esa cuenta no consta como eliminada. No se toca nada.',
  en_curso: 'Ya hay un reintento en curso. Espera un par de minutos.',
}

export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const chequeo = await exigir(req, 'usuarios.gestionar')
  if (chequeo.error) return chequeo.error
  const { perfil } = chequeo

  const { uid } = await params
  if (!uid || uid.length > 128) {
    return NextResponse.json({ error: 'Falta la cuenta.', codigo: 'uid_invalido' }, { status: 400 })
  }

  const r = await reintentarFirebase(dependencias(perfil), uid)

  if (!r.ok) {
    return NextResponse.json(
      { error: MENSAJE[r.motivo], codigo: r.motivo },
      { status: ESTADO_HTTP[r.motivo] },
    )
  }

  return NextResponse.json({
    estado: r.estado,
    // `true` sólo cuando el proceso terminó del todo.
    terminada: r.estado === 'completada',
    requiereReintento: r.estado === 'error',
  })
}

export function dependencias(perfil: PerfilUsuario): DependenciasReintento {
  const db = supabaseAdmin()
  return {
    leer: async (uid) => {
      const { data: baja } = await db
        .from('bajas_de_cuenta')
        .select('uid, estado, intentos, ultimo_intento_en')
        .eq('uid', uid)
        .maybeSingle()
      if (!baja) return null

      const { data: cuenta } = await db
        .from('usuarios').select('estado').eq('uid', uid).maybeSingle()

      return {
        baja: {
          uid: baja.uid as string,
          estado: baja.estado as EstadoProceso,
          intentos: (baja.intentos as number | null) ?? 0,
          ultimoIntentoEn: (baja.ultimo_intento_en as string | null) ?? null,
        },
        // Sin fila de cuenta no se puede afirmar que esté cerrada: se dice
        // «no eliminada» y la operación se rechaza.
        estadoCuenta: (cuenta?.estado as string | undefined) ?? 'sin_fila',
      }
    },

    tomarElRelevo: async (uid, intentos, limite) => {
      // Un solo `UPDATE` condicional. PostgreSQL reevalúa la condición tras un
      // `UPDATE` concurrente, así que de dos reintentos a la vez sólo uno ve
      // filas afectadas. El arriendo por tiempo recupera además un reintento
      // que se murió a mitad, sin necesidad de una columna nueva.
      const { data } = await db
        .from('bajas_de_cuenta')
        .update({ ultimo_intento_en: new Date().toISOString(), intentos })
        .eq('uid', uid)
        .in('estado', ['error', 'bloqueada', 'firebase_eliminada', 'datos_procesados'])
        .or(`ultimo_intento_en.is.null,ultimo_intento_en.lt.${limite}`)
        .select('uid')
      return (data ?? []).length === 1
    },

    revocarSesiones: async (uid) => {
      const x = await revocarSesiones(uid)
      return x.ok ? { ok: true } : { ok: false, codigo: x.codigo }
    },
    borrarIdentidad: async (uid) => {
      const x = await borrarIdentidad(uid)
      return x.ok ? { ok: true, yaNoExistia: x.yaNoExistia } : { ok: false, codigo: x.codigo }
    },

    marcar: async (uid, estado, error) => {
      const campos: Record<string, unknown> = { estado, ultimo_error: error }
      if (estado === 'firebase_eliminada') campos.firebase_eliminada_en = new Date().toISOString()
      if (estado === 'completada') {
        campos.procesada_en = new Date().toISOString()
        campos.completada_en = new Date().toISOString()
      }
      // `in(ANTERIORES)`: el proceso SÓLO avanza. Un intento que estuvo colgado
      // más de lo que dura el arriendo y vuelve tarde no puede pisar hacia atrás
      // lo que otro ya terminó. Nunca se toca `usuarios`: la cuenta sigue
      // eliminada, pase lo que pase.
      const { data } = await db
        .from('bajas_de_cuenta')
        .update(campos)
        .eq('uid', uid)
        .in('estado', [...ANTERIORES[estado]])
        .select('estado')
      if ((data ?? []).length === 1) return estado

      // No se aplicó: otro lo movió. Se devuelve lo que hay de verdad.
      const { data: fila } = await db
        .from('bajas_de_cuenta').select('estado').eq('uid', uid).maybeSingle()
      return ((fila?.estado as EstadoProceso | undefined) ?? estado)
    },

    auditar: async (accion, uid, datos) => {
      await registrar({ actor: perfil, accion, entidad: 'cuenta', entidadId: uid, despues: datos })
    },
  }
}
