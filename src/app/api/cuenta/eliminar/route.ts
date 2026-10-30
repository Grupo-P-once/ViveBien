import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin, type PerfilUsuario } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { registrar } from '@/lib/auditoria'
import { olvidarCorreoDeCuenta } from '@/lib/correo/retencion'
import type { DbCorreo } from '@/lib/correo/enviar'
import { borrarIdentidad, revocarSesiones } from '@/lib/firebase-admin'
import {
  ANTERIORES, ejecutarBaja, reautenticacionReciente,
  type DependenciasBaja, type EstadoProceso, type ResultadoRpc,
} from '@/lib/cuentas/baja'

/**
 * POST /api/cuenta/eliminar — cerrar la propia cuenta (D-35, D-43).
 *
 * ─────────────────────────────────────────────────────────────
 * DOS REGLAS QUE MANDAN SOBRE TODO LO DEMÁS
 *
 * 1. **El `uid` sale del token verificado, nunca del navegador.** No se lee del
 *    cuerpo, ni de la query, ni de la URL, ni de una cabecera. Si el cuerpo
 *    trae un `uid`, la petición se rechaza: es señal de un cliente mal escrito
 *    o de alguien probando.
 *
 * 2. **Fuera de los flags del portal.** Cerrar tu cuenta no es una función que
 *    se encienda y se apague: por eso esta ruta NO pasa por `exigirPortal`.
 * ─────────────────────────────────────────────────────────────
 *
 * El orden: sesión → reautenticación reciente → autorización → tope →
 * cierre local (una transacción, `COMMIT`) → Firebase → respuesta.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 428: la sesión vale, pero esta acción exige haberse identificado hace poco. */
const REAUTENTICACION_REQUERIDA = 428

type Cuerpo = { motivo?: unknown; uid?: unknown }

export async function POST(req: Request) {
  // ── 1 · SESIÓN Y AUTORIZACIÓN ──────────────────────────────────────────
  // `exigir` corta sin sesión (401), con la cuenta suspendida (403) y con la
  // cuenta ya eliminada (403 `cuenta.eliminada`).
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error
  const { perfil } = chequeo

  // ── 2 · EL CUERPO NO PUEDE TRAER UN uid ────────────────────────────────
  const cuerpo = (await req.json().catch(() => ({}))) as Cuerpo
  if (cuerpo.uid !== undefined) {
    await registrar({
      actor: perfil,
      accion: 'seguridad.denegado',
      entidad: 'permiso',
      entidadId: 'cuenta.baja:uid_en_el_cuerpo',
    })
    return NextResponse.json(
      { error: 'La cuenta que se cierra es la de la sesión; no se indica en la petición.', codigo: 'uid_no_permitido' },
      { status: 400 },
    )
  }

  // ── 3 · REAUTENTICACIÓN RECIENTE ───────────────────────────────────────
  // Antes del tope, para que un rechazo por reautenticación no gaste cupo: no
  // ejecuta nada, no toca la base y no llama a Firebase.
  if (!reautenticacionReciente(perfil.authTime)) {
    return NextResponse.json(
      {
        error: 'Por seguridad, vuelve a identificarte antes de cerrar tu cuenta.',
        codigo: 'reautenticacion_requerida',
      },
      { status: REAUTENTICACION_REQUERIDA },
    )
  }

  // ── 4 · TOPE DE PETICIONES ─────────────────────────────────────────────
  // Por cuenta, no por IP, y después de autorizar: si fuera antes, cualquiera
  // podría gastarle el cupo a otra persona.
  const frenado = await frenarAsync(`baja:${perfil.uid}`, TOPES.bajaCuenta)
  if (frenado) return frenado

  // ── 5 · LA BAJA ────────────────────────────────────────────────────────
  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim().slice(0, 500) || null : null
  const r = await ejecutarBaja(dependencias(perfil), perfil, { motivo })

  if (!r.ok) {
    if (r.motivo === 'ultimo_super_admin') {
      return NextResponse.json(
        {
          error: 'Eres el único Super Admin activo. Nombra a otro antes de cerrar tu cuenta.',
          codigo: 'ultimo_super_admin',
        },
        { status: 409 },
      )
    }
    if (r.motivo === 'sin_cuenta') {
      return NextResponse.json(
        { error: 'No encontramos tu cuenta. Escríbenos y lo revisamos.', codigo: 'sin_cuenta' },
        { status: 409 },
      )
    }
    // Nada del motor interno sale al navegador.
    return NextResponse.json(
      { error: 'No pudimos completar la baja. Inténtalo otra vez en un momento.', codigo: 'fallo_interno' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    estado: r.estado,
    puedeRegistrarseDeNuevo: r.puedeRegistrarseDeNuevo,
    requiereReintento: r.requiereReintento,
  })
}

/**
 * Las dependencias de verdad. El `uid` que viaja a la función SQL es
 * `perfil.uid`, que viene del token verificado por `verifyIdToken`.
 */
export function dependencias(perfil: PerfilUsuario): DependenciasBaja {
  const db = supabaseAdmin()
  return {
    cerrarEnLaBase: async (uid, authTime, motivo) => {
      // Privacidad (F1): ANTES de cerrar (después el correo del perfil vale null) se borra el rastro de correo de la persona. Nunca bloquea la baja.
      await olvidarCorreoDeCuenta(db as unknown as DbCorreo, uid, perfil.email)
      const { data, error } = await db.rpc('baja_de_cuenta', {
        p_uid: uid,
        p_solicitada_por: 'titular',
        p_auth_time: authTime.toISOString(),
        p_motivo: motivo,
      })
      if (error) throw Object.assign(new Error('rpc'), { code: error.code ?? 'rpc_error' })
      const j = (data ?? {}) as { resultado?: string; estado_proceso?: string }
      return {
        resultado: (j.resultado ?? 'no_existe') as ResultadoRpc,
        estadoProceso: j.estado_proceso,
      }
    },
    revocarSesiones: async (uid) => {
      const r = await revocarSesiones(uid)
      return r.ok ? { ok: true } : { ok: false, codigo: r.codigo }
    },
    borrarIdentidad: async (uid) => {
      const r = await borrarIdentidad(uid)
      return r.ok ? { ok: true } : { ok: false, codigo: r.codigo }
    },
    marcarProceso: async (uid, estado: EstadoProceso, error) => {
      const campos: Record<string, unknown> = { estado, ultimo_error: error ?? null }
      if (estado === 'firebase_eliminada') campos.firebase_eliminada_en = new Date().toISOString()
      if (estado === 'completada') {
        campos.procesada_en = new Date().toISOString()
        campos.completada_en = new Date().toISOString()
      }
      if (estado === 'error') {
        campos.ultimo_intento_en = new Date().toISOString()
        // PostgREST no sabe expresar `intentos = intentos + 1`, así que se lee
        // y se escribe. Si dos reintentos coincidieran al milisegundo, el
        // contador podría quedarse corto: es un dato de diagnóstico, no una
        // condición de nada, y no merece una migración para arreglarlo.
        const { data } = await db.from('bajas_de_cuenta').select('intentos').eq('uid', uid).maybeSingle()
        campos.intentos = ((data?.intentos as number | undefined) ?? 0) + 1
      }
      // `in(ANTERIORES)`: el proceso sólo avanza. Si otro intento ya lo movió
      // más adelante, esta escritura no encuentra fila y se queda sin efecto.
      await db.from('bajas_de_cuenta').update(campos).eq('uid', uid).in('estado', [...ANTERIORES[estado]])
    },
    auditar: async (accion, datos) => {
      // Tras el cierre, el correo del perfil ya no debe volver a la bitácora:
      // la función SQL acaba de retirarlo de `audit_logs`. Se audita con el
      // `uid` y el rol, nunca con la PII.
      await registrar({
        actor: { ...perfil, email: null },
        accion,
        entidad: 'cuenta',
        entidadId: perfil.uid,
        despues: datos,
      })
    },
  }
}
