import { lugarDe } from '../ubicacion'

/**
 * Propiedades recomendadas al pie de la ficha (22-oct-2026). Antes solo salían 4 del mismo tipo; ahora se ordenan por parecido —mismo tipo, misma
 * operación, misma ciudad y precio cercano— y, si faltan, se completan con otras que podrían interesar (hasta 10). Código puro: se prueba sin red.
 * No filtra visibilidad: quien llama le pasa solo lo que el público puede ver (`esVisibleAlPublico`).
 */
type Base = { id: string; tipo?: string | null; operacion?: string | null; precio?: number | null; ciudad?: string | null; ubicacion?: string | null; estado_dir?: string | null }

const tipoDe = (t?: string | null) => (t === 'depto' ? 'departamento' : (t ?? ''))

export function puntuar(base: Base, otra: Base): number {
  let p = 0
  if (tipoDe(base.tipo) && tipoDe(base.tipo) === tipoDe(otra.tipo)) p += 4
  if (base.operacion && base.operacion === otra.operacion) p += 3
  if (lugarDe(base).ciudad === lugarDe(otra).ciudad) p += 2
  const a = Number(base.precio) || 0, b = Number(otra.precio) || 0
  if (a > 0 && b > 0 && Math.abs(b - a) / a <= 0.35) p += 2
  return p
}

export function recomendadasPara<T extends Base>(base: Base, lista: readonly T[], max = 10): T[] {
  const vistos = new Set<string>([base.id])
  return lista
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    .map((p, i) => ({ p, puntos: puntuar(base, p), i }))
    .sort((x, y) => y.puntos - x.puntos || x.i - y.i)            // a igual parecido, se respeta el orden recibido (más recientes primero)
    .slice(0, max)
    .map((x) => x.p)
}
