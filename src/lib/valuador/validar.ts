import { TIPOS, type Entrada, type Operacion, type TipoInmueble } from './estimar'

/**
 * Validación de la entrada del valuador, en el SERVIDOR (la del navegador no es una frontera). Devuelve la entrada normalizada o el mensaje, en
 * español y pensado para la persona, del primer problema (con el nombre del campo para marcarlo en pantalla).
 * Vive aparte de la ruta porque un `route.ts` de Next solo puede exportar métodos HTTP.
 */
const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t && t.length <= max ? t : null
}
const entero = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export type Validacion = { ok: true; entrada: Entrada } | { ok: false; error: string; campo: string }

export function validarEntrada(b: unknown): Validacion {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  const operacion = o.operacion === 'venta' || o.operacion === 'renta' ? (o.operacion as Operacion) : null
  if (!operacion) return { ok: false, error: 'Elige si quieres estimar una venta o una renta.', campo: 'operacion' }
  const tipo = TIPOS.includes(o.tipo as TipoInmueble) ? (o.tipo as TipoInmueble) : null
  if (!tipo) return { ok: false, error: 'Elige el tipo de inmueble.', campo: 'tipo' }
  const metros = typeof o.metros === 'number' ? o.metros : typeof o.metros === 'string' ? Number(o.metros.replace(',', '.')) : NaN
  if (!Number.isFinite(metros) || metros < 10 || metros > 200000) return { ok: false, error: 'Escribe la superficie en m² (entre 10 y 200 000).', campo: 'metros' }
  const colonia = o.colonia == null || o.colonia === '' ? null : texto(o.colonia, 80)
  if (o.colonia != null && o.colonia !== '' && colonia === null) return { ok: false, error: 'El nombre de la colonia es demasiado largo o no es válido.', campo: 'colonia' }
  const recamaras = o.recamaras == null || o.recamaras === '' ? null : entero(o.recamaras, 0, 20)
  const banos = o.banos == null || o.banos === '' ? null : entero(o.banos, 0, 20)
  if (o.recamaras != null && o.recamaras !== '' && recamaras === null) return { ok: false, error: 'Las recámaras deben ser un número entre 0 y 20.', campo: 'recamaras' }
  if (o.banos != null && o.banos !== '' && banos === null) return { ok: false, error: 'Los baños deben ser un número entre 0 y 20.', campo: 'banos' }
  return { ok: true, entrada: { operacion, tipo, colonia, metros: Math.round(metros * 100) / 100, recamaras, banos } }
}
