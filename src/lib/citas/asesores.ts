import { supabaseAdmin, resolverPerfil, type PerfilUsuario } from '../auth-server'
import { capacidadesEfectivas, type CuentaDeCitas } from '../acceso/capacidades'
import { esNivelAdmin } from '../acceso/permisos'

/**
 * Las cuentas de quienes atienden citas, con sus permisos ya calculados.
 *
 * Un publicador puede ser el asesor de una cita (ADR-0013), así que el
 * servicio necesita saber —por cada asesor— si es del equipo o publicador y,
 * si es publicador, qué puede (recibir, aceptar, ver datos del interesado…).
 *
 * La modalidad y los overrides (migración 28) se leen APARTE y sólo para
 * publicadores: si las columnas aún no existen, o la lectura falla, vale
 * `publicador` sin overrides —lo más restrictivo— en vez de romper las citas.
 */

type Db = ReturnType<typeof supabaseAdmin>

export type Extra = { uid: string; tipo_publicador?: unknown; permisos_override?: unknown }

/**
 * `ok = false` cuando la lectura falló (columnas de la migración 28 sin aplicar,
 * caída): quien llama decide, y por defecto valen los defaults restrictivos.
 */
export async function leerExtrasDePublicadores(db: Db, uids: string[]): Promise<{ ok: boolean; mapa: Map<string, Extra> }> {
  const mapa = new Map<string, Extra>()
  if (!uids.length) return { ok: true, mapa }
  try {
    const { data, error } = await db.from('usuarios').select('uid, tipo_publicador, permisos_override').in('uid', uids)
    if (error) return { ok: false, mapa }
    for (const f of (data ?? []) as Extra[]) mapa.set(f.uid, f)
    return { ok: true, mapa }
  } catch {
    return { ok: false, mapa }
  }
}

async function extrasDePublicadores(db: Db, uids: string[]): Promise<Map<string, Extra>> {
  return (await leerExtrasDePublicadores(db, uids)).mapa
}

/** uid → { rol efectivo, permisos efectivos }. Un uid que no existe no aparece (no atiende nada). */
export async function cuentasDeCitas(db: Db, uids: string[]): Promise<Map<string, CuentaDeCitas>> {
  const unicos = [...new Set(uids.filter(Boolean))]
  const salida = new Map<string, CuentaDeCitas>()
  if (!unicos.length) return salida

  const { data } = await db.from('usuarios').select('uid, rol').in('uid', unicos)
  const filas = (data ?? []) as Array<{ uid: string; rol: string | null }>
  const publicadores = filas.filter((f) => f.rol === 'publicador').map((f) => f.uid)
  const extras = await extrasDePublicadores(db, publicadores)

  for (const f of filas) {
    if (esNivelAdmin(f.rol)) { salida.set(f.uid, { rol: 'admin' }); continue }
    if (f.rol === 'publicador') {
      const e = extras.get(f.uid)
      salida.set(f.uid, { rol: 'publicador', capacidades: capacidadesEfectivas({ rol: 'publicador', tipo: e?.tipo_publicador, overrides: e?.permisos_override }) })
      continue
    }
    salida.set(f.uid, { rol: 'cliente' })
  }
  return salida
}

/**
 * El perfil de una cuenta, con sus permisos, para actuar «como esa persona»
 * (enlaces de los correos). Misma resolución que una sesión normal.
 */
export async function perfilDeCuenta(db: Db, uid: string): Promise<PerfilUsuario | null> {
  const { data } = await db.from('usuarios').select('uid, email, nombre, rol, estado').eq('uid', uid).maybeSingle()
  if (!data) return null
  const extras = data.rol === 'publicador' ? await extrasDePublicadores(db, [uid]) : new Map<string, Extra>()
  const e = extras.get(uid)
  return resolverPerfil(
    { uid, email: data.email ?? null, emailVerified: false },
    { rol: data.rol, estado: data.estado ?? 'activo', nombre: data.nombre, tipo_publicador: e?.tipo_publicador, permisos_override: e?.permisos_override },
  )
}
