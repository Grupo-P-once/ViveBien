/**
 * Feature flags de módulos grandes (ADR-0012), guardados en `configuracion`.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.77 — fase 1 del PRD v2.0
 *
 * El primero que se usa es `portalCliente`: el portal nuevo ya está en la rama
 * que se despliega, pero no se abre al público hasta que se encienda.
 *
 * Reglas:
 *  · Todos nacen apagados.
 *  · Si la base no responde o el valor no es válido, el flag cuenta como
 *    APAGADO. Un módulo a medias que se abre solo por un fallo de red es peor
 *    que uno que tarda en abrirse.
 *  · Leerlos de la base es cosa del servidor y vive en `flags-servidor.ts`
 *    (D-42). Este archivo es PURO —constantes, tipos y decisiones— y lo
 *    puede importar cualquiera, cliente incluido.
 *  · Sólo el Super Admin los cambiará (fase 2/13), con auditoría.
 * ─────────────────────────────────────────────────────────────
 */

export const FLAGS = [
  'portalCliente',
  // V-1.1.82 (D-27.5): el portal sólo para admin / super admin, para revisarlo
  // en producción antes de abrirlo a clientes (lib/portal/apertura.ts).
  'portalClienteInterno',
  'publisherPortal',
  'commissionEngine',
  'legalAcceptance',
  'superAdmin',
  'marketingHub',
  'metaPublishing',
  'aiContent',
  // V-1.1.82 (P3-01): crear visitas en línea. Apagado hasta que exista
  // «Mis visitas» y el portal esté abierto a clientes: sin citas no hay correos,
  // y ningún correo puede apuntar a una página que aún no existe.
  'citasEnLinea',
] as const

export type Flag = (typeof FLAGS)[number]
export type Flags = Record<Flag, boolean>

export const FLAGS_APAGADOS: Flags = Object.fromEntries(FLAGS.map((f) => [f, false])) as Flags

/** Sólo cuenta como encendido un `true` literal en una clave conocida. */
export function normalizarFlags(valor: unknown): Flags {
  const limpio = { ...FLAGS_APAGADOS }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return limpio
  for (const f of FLAGS) limpio[f] = (valor as Record<string, unknown>)[f] === true
  return limpio
}

export const MINIMO_MOTIVO_FLAG = 10

export type CambioDeFlag =
  | { ok: true; flag: Flag; de: boolean; a: boolean; motivo: string }
  | { ok: false; motivo: string }

/**
 * ¿Es válido este cambio? Sin base de datos, para poder probarlo entero.
 *
 * Reglas (D-31): la clave existe, el valor es booleano de verdad, hay un motivo
 * escrito —quién y por qué es justo lo que faltaba cuando esto se hacía por
 * SQL— y el cambio cambia algo.
 */
export function decidirCambioDeFlag(
  actuales: Flags,
  entrada: { flag?: unknown; valor?: unknown; motivo?: unknown },
): CambioDeFlag {
  const flag = typeof entrada.flag === 'string' && (FLAGS as readonly string[]).includes(entrada.flag)
    ? (entrada.flag as Flag)
    : null
  if (!flag) return { ok: false, motivo: 'Ese módulo no existe.' }
  if (typeof entrada.valor !== 'boolean') return { ok: false, motivo: 'Hay que decir si se enciende o se apaga.' }
  const motivo = typeof entrada.motivo === 'string' ? entrada.motivo.trim() : ''
  if (motivo.length < MINIMO_MOTIVO_FLAG) {
    return { ok: false, motivo: `Escribe el motivo del cambio (al menos ${MINIMO_MOTIVO_FLAG} caracteres).` }
  }
  const de = actuales[flag]
  if (de === entrada.valor) return { ok: false, motivo: 'Ese módulo ya está así.' }
  return { ok: true, flag, de, a: entrada.valor, motivo }
}

/** Nombres para la pantalla de Super Admin (D-31). */
export const ETIQUETA_FLAG: Record<Flag, string> = {
  portalCliente: 'Portal de cliente',
  portalClienteInterno: 'Portal de cliente (interno)',
  citasEnLinea: 'Citas en línea',
  publisherPortal: 'Portal de publicador',
  commissionEngine: 'Motor de comisiones',
  legalAcceptance: 'Aceptación de términos',
  superAdmin: 'Herramientas de Super Admin',
  marketingHub: 'Marketing Hub',
  metaPublishing: 'Publicación en Meta',
  aiContent: 'Contenido con IA',
}
