import 'server-only'
import { supabaseAdmin, type PerfilUsuario } from './auth-server'
import { leerFlags } from './config/flags-servidor'
import { puede } from './acceso/permisos'
import { estadoLegal, SIN_ACEPTACION_LEGAL, type EstadoLegal } from './aceptacion-legal'

/**
 * ¿Esta persona tiene que aceptar los Términos y el Aviso de Privacidad, y ya lo hizo? Solo servidor.
 *
 * Con el módulo `legalAcceptance` apagado, o siendo del equipo, NO se toca la base: el costo y el riesgo del módulo apagado son cero.
 * Falla cerrado: encendido y sin poder leer la tabla (por ejemplo, la migración 44 sin aplicar) → `ok: false` (la ruta responde 503 y no
 * deja pasar).
 */
export async function estadoDeAceptacionLegal(perfil: PerfilUsuario): Promise<{ ok: true; estado: EstadoLegal } | { ok: false }> {
  const flags = await leerFlags()
  if (!flags.legalAcceptance) return { ok: true, estado: SIN_ACEPTACION_LEGAL }
  const esEquipo = puede(perfil, 'propiedad.moderar')
  if (esEquipo) return { ok: true, estado: SIN_ACEPTACION_LEGAL }
  const r = await supabaseAdmin().from('legal_aceptaciones').select('documento, version').eq('uid', perfil.uid)
  if (r.error) return { ok: false }
  return { ok: true, estado: estadoLegal({ flagEncendida: true, esEquipo, aceptadas: (r.data ?? []) as Array<{ documento: string; version: string }> }) }
}
