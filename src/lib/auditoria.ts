import { supabaseAdmin, type PerfilUsuario } from './auth-server'

/**
 * Registra una decisión sensible en `audit_logs`.
 *
 * Nunca lanza: que falle la bitácora no debe tumbar la operación que se
 * estaba haciendo. Si la tabla aún no existe, se ignora en silencio.
 */
export async function registrar(opts: {
  actor: PerfilUsuario
  accion: string
  entidad: string
  entidadId?: string | null
  antes?: unknown
  despues?: unknown
}): Promise<void> {
  try {
    await supabaseAdmin().from('audit_logs').insert({
      actor_uid: opts.actor.uid,
      actor_email: opts.actor.email,
      actor_rol: opts.actor.rol,
      accion: opts.accion,
      entidad: opts.entidad,
      entidad_id: opts.entidadId ?? null,
      antes: opts.antes ?? null,
      despues: opts.despues ?? null,
    })
  } catch {
    // Sin bitácora, pero la operación sigue.
  }
}
