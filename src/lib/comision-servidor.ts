import 'server-only'
import { supabaseAdmin, type PerfilUsuario } from './auth-server'
import { leerFlags } from './config/flags-servidor'
import { puede } from './acceso/permisos'
import { tieneCapacidad } from './acceso/capacidades'
import { origenListo } from './origen-declarado'
import { debeAceptar, SIN_ACEPTACION, type EstadoAceptacion, type TextoComision } from './comision-aceptacion'

/**
 * ¿Esta persona tiene que aceptar la propuesta de comisión, y ya la aceptó? Solo servidor.
 *
 * Con el módulo apagado, o siendo del equipo o exenta (`sin_comision`), NO se toca la base: el costo y el riesgo del módulo apagado son cero.
 * Falla cerrado: si el módulo está encendido y no se puede leer el texto o la aceptación, devuelve `ok: false` (la ruta responde 503 y no deja
 * pasar). Sin texto vigente no hay nada que aceptar: no se exige.
 */
export async function estadoDeAceptacion(perfil: PerfilUsuario): Promise<{ ok: true; estado: EstadoAceptacion } | { ok: false }> {
  const flags = await leerFlags()
  if (!flags.commissionEngine) return { ok: true, estado: SIN_ACEPTACION }
  const esEquipo = puede(perfil, 'propiedad.moderar')
  const exenta = tieneCapacidad(perfil, 'sin_comision')
  if (esEquipo || exenta) return { ok: true, estado: SIN_ACEPTACION }

  const db = supabaseAdmin()
  const t = await db.from('comision_textos').select('id, version, titulo, cuerpo, hash').eq('estado', 'vigente').maybeSingle()
  if (t.error) return { ok: false }
  const texto = (t.data ?? null) as TextoComision | null
  if (!debeAceptar({ flagEncendida: true, esEquipo, exenta, texto })) return { ok: true, estado: SIN_ACEPTACION }

  const a = await db.from('comision_aceptaciones').select('id').eq('uid', perfil.uid).eq('texto_id', texto!.id).maybeSingle()
  if (a.error) return { ok: false }
  return { ok: true, estado: { requerida: true, aceptada: Boolean(a.data), texto } }
}

/**
 * ¿Existe un texto de comisión VIGENTE? Sin él no hay acuerdo que aceptar ni obligaciones que activar. `null` = no se pudo comprobar (falla cerrado).
 * Un módulo encendido sin texto vigente es un estado seguro solo si NADA se presenta como acordado ni se registra como cobrable.
 */
export async function hayTextoVigente(): Promise<boolean | null> {
  const t = await supabaseAdmin().from('comision_textos').select('id').eq('estado', 'vigente').maybeSingle()
  if (t.error) return null
  return Boolean(t.data)
}

/**
 * ¿Esta persona tiene que declarar el origen de ESTA propiedad antes de enviarla, y ya lo hizo? Solo servidor.
 *
 * Aplica con el mismo criterio que la aceptación (módulo encendido, ni equipo ni exenta `sin_comision`), pero NO depende de que exista un
 * texto vigente: saber cómo se maneja la propiedad no es un asunto legal. Apagado/equipo/exenta no toca la base. Si el módulo está
 * encendido y no se puede leer (por ejemplo, la migración 43 sin aplicar), falla cerrado.
 */
export async function estadoDeOrigen(perfil: PerfilUsuario, propiedadId: string): Promise<{ ok: true; aplica: boolean; listo: boolean } | { ok: false }> {
  const flags = await leerFlags()
  if (!flags.commissionEngine) return { ok: true, aplica: false, listo: true }
  if (puede(perfil, 'propiedad.moderar') || tieneCapacidad(perfil, 'sin_comision')) return { ok: true, aplica: false, listo: true }
  const o = await supabaseAdmin().from('propiedad_origen').select('origen_tipo, declara_autorizacion, titular_nombre, titular_empresa, titular_telefono, titular_correo').eq('propiedad_id', propiedadId).maybeSingle()
  if (o.error) return { ok: false }
  return { ok: true, aplica: true, listo: origenListo(o.data) }
}
