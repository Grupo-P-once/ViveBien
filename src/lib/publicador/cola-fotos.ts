/**
 * Cola de subida de fotos del asistente: estado POR ARCHIVO, reintento sin perder los demás y sin carreras (15-oct-2026, E-48).
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ FALLABA
 *
 * `subirImagenes` subía en bucle, calculaba la lista final con una copia vieja de las fotos y la guardaba al terminar: lo que se
 * quitara o reordenara mientras subía se pisaba; las fallidas solo se contaban («2 de 5 no se pudieron subir») sin poder
 * reintentar solo esas; y mientras subía no había vista previa de cada archivo.
 *
 * AHORA
 *  · Cada archivo tiene su estado (`subiendo` / `error`) y su vista previa local; si falla se queda, con su motivo, y se reintenta solo ese.
 *  · Cada foto subida se añade a la lista ACTUAL en el instante en que termina (no a una copia vieja), sin duplicar y respetando el tope.
 *  · Las plazas se cuentan con lo ya guardado MÁS lo que está subiendo.
 *
 * Código puro: el React solo pinta. `subir` y `agregar` se inyectan para probarlo sin red ni Cloudinary.
 * ─────────────────────────────────────────────────────────────
 */

export type EstadoCarga = 'subiendo' | 'error'

export type Carga = {
  id: string
  nombre: string
  estado: EstadoCarga
  /** Motivo del fallo (solo si `estado === 'error'`). */
  motivo?: string
}

export type ResultadoSubida = { ok: true; url: string } | { ok: false; motivo: string }

/** Añade una URL a la lista sin duplicar y sin pasar del tope. */
export function agregarSinDuplicar(actuales: readonly string[], url: string, tope: number): { lista: string[]; agregada: boolean } {
  if (actuales.includes(url)) return { lista: [...actuales], agregada: false }
  if (actuales.length >= tope) return { lista: [...actuales], agregada: false }
  return { lista: [...actuales, url], agregada: true }
}

/** Cuántos archivos más caben: lo guardado + lo que está subiendo cuentan para el tope. */
export function plazasLibres(guardadas: number, enCurso: number, tope: number): number {
  return Math.max(0, tope - guardadas - enCurso)
}

export const MOTIVO_SIN_RED = 'La imagen no se pudo subir. Inténtalo otra vez.'

/**
 * Sube UN archivo. Si sale bien, llama a `agregar(url)` (que debe leer la lista ACTUAL) y devuelve `{ estado: 'ok' }`;
 * si falla —o `subir` lanza— devuelve el motivo y NO toca la lista.
 */
export async function procesarCarga<A>(args: {
  archivo: A
  subir: (archivo: A) => Promise<ResultadoSubida>
  agregar: (url: string) => boolean
}): Promise<{ estado: 'ok'; agregada: boolean } | { estado: 'error'; motivo: string }> {
  let r: ResultadoSubida
  try {
    r = await args.subir(args.archivo)
  } catch {
    return { estado: 'error', motivo: MOTIVO_SIN_RED }
  }
  if (!r.ok) return { estado: 'error', motivo: r.motivo || MOTIVO_SIN_RED }
  return { estado: 'ok', agregada: args.agregar(r.url) }
}
