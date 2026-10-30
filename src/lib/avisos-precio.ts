import { nombreDe, rutaDe } from '@/lib/propiedad-publica'
import { estaDisponible } from '@/lib/contactos-cliente'
import { precioTarjeta } from '@/lib/portal/tarjeta'
import type { NotificacionNueva } from '@/lib/avisos-cliente'

/**
 * «Avisarme cuando baje de precio» (28-oct-2026) — la regla, en código puro (sin base ni red).
 *
 * Quien tiene cuenta y toca la campana de una ficha queda en `cliente_avisos_precio` con el precio de ESE momento (`precio_base`). La tarea diaria de avisos compara ese precio con el
 * actual: si BAJÓ (misma moneda, propiedad publicada y disponible) guarda un aviso `baja_de_precio` en su bandeja y mueve el precio de partida al nuevo, de modo que cada nueva baja
 * avisa y la misma nunca avisa dos veces. Una SUBIDA no avisa, pero también mueve el precio de partida (la siguiente baja se mide contra lo último que se vio).
 */
export type SuscripcionDePrecio = { uid: string; propiedad_id: string; precio_base: number | string; moneda: string | null }
export type PropiedadConPrecio = { id: string; slug?: string | null; titulo?: string | null; folio?: string | null; tipo?: string | null; operacion?: string | null; precio: number | string | null; moneda?: string | null; estado_pub?: string | null; estatus?: string | null }

export type CambioDePrecio = { uid: string; propiedadId: string; anterior: number; nuevo: number; aviso: NotificacionNueva | null; /** Solo si la propiedad cambió de moneda: la partida se reinicia en la nueva (sin avisar: no se comparan monedas distintas). */ moneda?: string }

const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Cuánto bajó, en % redondeado (mínimo 1 si bajó algo). */
export const porcentajeDeBaja = (anterior: number, nuevo: number): number => Math.max(1, Math.round(((anterior - nuevo) / anterior) * 100))

/**
 * Qué cambió para cada suscripción. `aviso` es `null` cuando solo hay que mover el precio de partida (subió). Las propiedades que ya no están publicadas/disponibles, sin precio o en otra
 * moneda se ignoran: no se avisa de una «baja» que el cliente no podría aprovechar ni de una comparación entre monedas distintas.
 */
export function cambiosDePrecio(subs: SuscripcionDePrecio[], propiedades: PropiedadConPrecio[], ahora: number = Date.now()): CambioDePrecio[] {
  // El día va en la clave: si el precio baja, sube y vuelve a bajar al MISMO valor, la segunda baja es otro aviso (la clave única por persona no la descarta); el mismo día no se duplica.
  const dia = new Date(ahora).toISOString().slice(0, 10)
  const porId = new Map(propiedades.map((p) => [p.id, p]))
  const salida: CambioDePrecio[] = []
  for (const s of subs) {
    const p = porId.get(s.propiedad_id)
    if (!p || !estaDisponible(p)) continue
    const base = numero(s.precio_base); const nuevo = numero(p.precio)
    if (base === null || nuevo === null || nuevo === base) continue
    if ((s.moneda ?? 'MXN') !== (p.moneda ?? 'MXN')) { salida.push({ uid: s.uid, propiedadId: p.id, anterior: base, nuevo, aviso: null, moneda: (p.moneda ?? 'MXN').toUpperCase().slice(0, 3) }); continue }
    if (nuevo > base) { salida.push({ uid: s.uid, propiedadId: p.id, anterior: base, nuevo, aviso: null }); continue }
    const fmt = (v: number) => precioTarjeta({ precio: v, moneda: p.moneda ?? 'MXN', operacion: p.operacion ?? null } as Parameters<typeof precioTarjeta>[0]) ?? String(v)
    const nombre = nombreDe(p as Parameters<typeof nombreDe>[0])
    salida.push({
      uid: s.uid, propiedadId: p.id, anterior: base, nuevo,
      aviso: {
        uid: s.uid, tipo: 'baja_de_precio', titulo: `Bajó de precio: ${nombre}`.slice(0, 160),
        cuerpo: `${p.folio ? `${p.folio} · ` : ''}Antes ${fmt(base)}, ahora ${fmt(nuevo)} (${porcentajeDeBaja(base, nuevo)}% menos).`.slice(0, 600),
        enlace: rutaDe(p), busqueda_id: null, propiedad_id: p.id, clave: `precio:${p.id}:${nuevo}:${dia}`,
      },
    })
  }
  return salida
}
