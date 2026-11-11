import type { DbCorreo } from './enviar'
import { normalizarCorreo } from './seguridad'

/**
 * Alta AUTOMÁTICA al correo de recomendaciones (decisión del dueño, 10-nov-2026): las personas con cuenta y quienes dejaron su correo
 * en un formulario quedan suscritas, con baja en un clic en cada correo. Es consentimiento TÁCITO con oposición (no la casilla previa
 * del texto v3), así que depende de que el Aviso de Privacidad lo diga y de la confirmación del abogado.
 *
 * Interruptor: `MARKETING_A_TODOS` = fecha ISO (AAAA-MM-DD) a partir de la cual empiezan las altas. Vacía o inválida = APAGADO. La
 * fecha es el plazo para que las personas conozcan el Aviso antes del primer correo. Por sí sola NO envía nada: el envío sigue
 * exigiendo `CORREO_MARKETING=1`, la constante `MARKETING_AUTORIZADO` y la tarea diaria.
 *
 * Reglas que NO se negocian:
 *  · quien ya tiene fila en `correo_suscriptores` (en CUALQUIER estado: baja, rebote, queja, activa) se deja como está — jamás se
 *    reactiva a quien se dio de baja;
 *  · las supresiones y los rebotes los decide la función de la base (`correo_cuenta_marketing` responde «bloqueada»);
 *  · las cuentas del equipo (rol admin) y las suspendidas o pendientes no se suscriben;
 *  · el alta guarda la versión y el origen (`-cuenta` / `-formulario`) como prueba de qué se informó.
 */

export const VERSION_ALTA_AUTOMATICA = 'marketing-2026-11-v4-tacito'
export const TOPE_ALTAS_POR_CORRIDA = 200
const LOTE_CONSULTA = 100

/** Fecha (UTC, medianoche) desde la que se permiten las altas; `null` si el interruptor está apagado o mal escrito. */
export function desdeAltaAutomatica(valor: string | undefined | null): Date | null {
  const v = (valor ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d
}

export type ResultadoAltas = { activa: boolean; candidatos: number; altas: number; yaEstaban: number; bloqueadas: number; fallidas: number }

type Candidato = { correo: string; nombre: string | null; uid: string | null; origen: 'cuenta' | 'formulario' }

const vacio = (activa: boolean): ResultadoAltas => ({ activa, candidatos: 0, altas: 0, yaEstaban: 0, bloqueadas: 0, fallidas: 0 })

async function leer(db: DbCorreo, tabla: string, columnas: string, filtro: (q: any) => any, orden: string): Promise<Array<Record<string, unknown>>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await filtro(db.from(tabla).select(columnas)).order(orden, { ascending: true }).limit(1000)
  return r.error ? [] : ((r.data ?? []) as Array<Record<string, unknown>>)
}

export async function suscribirAutomaticamente(
  db: DbCorreo,
  o: { desde?: string | null; ahora?: Date; tope?: number } = {},
): Promise<ResultadoAltas> {
  const desde = desdeAltaAutomatica(o.desde ?? process.env.MARKETING_A_TODOS)
  const ahora = o.ahora ?? new Date()
  if (!desde || ahora.getTime() < desde.getTime()) return vacio(false)
  const tope = o.tope ?? TOPE_ALTAS_POR_CORRIDA
  const r = vacio(true)

  const cand = new Map<string, Candidato>()
  const poner = (correoCrudo: unknown, nombre: unknown, uid: unknown, origen: Candidato['origen']) => {
    const correo = normalizarCorreo(correoCrudo)
    if (!correo || cand.has(correo)) return
    cand.set(correo, { correo, nombre: typeof nombre === 'string' && nombre.trim() ? nombre.trim().slice(0, 120) : null, uid: typeof uid === 'string' ? uid : null, origen })
  }
  // 1) cuentas activas de clientes y publicadores (nunca el equipo)
  for (const u of await leer(db, 'usuarios', 'uid, email, nombre', (q) => q.eq('estado', 'activo').in('rol', ['cliente', 'publicador']), 'creado_en')) poner(u.email, u.nombre, u.uid, 'cuenta')
  // 2) correos dejados en formularios (solicitudes de contacto y registro de leads)
  for (const s of await leer(db, 'solicitudes_contacto', 'email, nombre', (q) => q, 'creado_en')) poner(s.email, s.nombre, null, 'formulario')
  for (const l of await leer(db, 'leads', 'email, nombre', (q) => q.not('email', 'is', null), 'created_at')) poner(l.email, l.nombre, null, 'formulario')
  r.candidatos = cand.size
  if (cand.size === 0) return r

  // Quien ya tiene fila, en cualquier estado, no se toca (una baja nunca se revierte aquí).
  const existentes = new Set<string>()
  const correos = [...cand.keys()]
  for (let i = 0; i < correos.length; i += LOTE_CONSULTA) {
    const e = await db.from('correo_suscriptores').select('email_norm').in('email_norm', correos.slice(i, i + LOTE_CONSULTA))
    // Si no se puede comprobar, se detiene TODO: sin la lista no se sabe a quién no tocar.
    if (e.error) return { ...r, fallidas: cand.size }
    for (const x of (e.data ?? []) as Array<{ email_norm: string }>) existentes.add(x.email_norm)
  }
  r.yaEstaban = existentes.size

  for (const c of cand.values()) {
    if (existentes.has(c.correo)) continue
    if (r.altas >= tope) break
    const { data, error } = await db.rpc('correo_cuenta_marketing', {
      p_uid: c.uid, p_email: c.correo, p_aceptar: true, p_prefs: {}, p_version: `${VERSION_ALTA_AUTOMATICA}-${c.origen}`,
    })
    const estado = !error && data && typeof data === 'object' ? (data as { estado?: string }).estado : null
    if (estado === 'activa') r.altas++
    else if (estado === 'bloqueada') r.bloqueadas++
    else r.fallidas++
  }
  return r
}
