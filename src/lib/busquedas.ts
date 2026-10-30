/**
 * Búsquedas guardadas del cliente.
 *
 * La tabla `busquedas_guardadas` existe desde la migración 05 y **nunca tuvo
 * pantalla**. Es el pendiente 14: quien busca casa vuelve varias veces a lo
 * mismo, y rehacer los filtros cada vez es la razón por la que no vuelve.
 *
 * Aquí vive todo lo que no es interfaz, para que el listado, la API y el
 * panel apliquen **exactamente las mismas reglas**: si «coincide» significara
 * una cosa en el listado y otra en el contador de nuevas, el cliente vería
 * «3 nuevas» y al abrirla encontraría 2.
 */

import { enumDe, numeroDe } from './caracteristicas'
import { coincideMas, describirMas, masAParams, normalizarMas, type FiltrosMas } from './filtros-mas'

export type Filtros = FiltrosMas & {
  op?: 'venta' | 'renta'
  tipo?: string
  zona?: string
  pmin?: number
  pmax?: number
  /** Mínimos: «2 o más». Sin el dato en el anuncio, no entra (igual que el precio). */
  rec?: number
  ban?: number
  /** Estacionamientos: `N` = «N o más»; **`0` = «declarado sin estacionamiento»** (un anuncio que no lo declara NO entra, ni siquiera con 0). */
  est?: number
  /** Superficie (m²) del campo `metros`. */
  smin?: number
  smax?: number
  /** Sólo renta: amueblado (sí o semi) y acepta mascotas (permitidas o con restricciones). */
  amu?: 1
  masc?: 1
  /** Subtipo (consultorio, corporativa, compartida, industrial…): sólo con un tipo elegido. */
  sub?: string
}

/** Tope por persona. Diez búsquedas ya son una agenda, no un hábito. */
export const MAXIMO_BUSQUEDAS = 10

/** Cómo se nombra cada tipo en plural, que es como se busca. */
const TIPOS_ETIQUETA: Record<string, string> = {
  casa: 'Casas',
  departamento: 'Departamentos',
  terreno: 'Terrenos',
  nave: 'Naves industriales',
  bodega: 'Bodegas',
  local: 'Locales comerciales',
  oficina: 'Oficinas',
  comercial: 'Inmuebles comerciales',
  quinta: 'Quintas',
}

function numero(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/**
 * Limpia lo que llega —de la URL o del cuerpo de una petición— y devuelve
 * sólo filtros válidos. `null` si no queda ninguno: guardar «todo el catálogo»
 * como búsqueda no sirve de nada.
 */
export function normalizarFiltros(entrada: Record<string, unknown>): Filtros | null {
  const f: Filtros = {}

  // 28-oct-2026 (decisión del dueño: comportamiento COHERENTE): `?op=Venta` y `?op=venta` significan lo mismo. Antes «Venta» se ignoraba en silencio mientras la página
  // creía que había un filtro activo. Solo cambia el valor (mayúsculas/espacios); los NOMBRES de parámetro siguen siendo en minúsculas.
  const op = typeof entrada.op === 'string' ? entrada.op.trim().toLowerCase() : ''
  if (op === 'venta' || op === 'renta') f.op = op

  const tipo = typeof entrada.tipo === 'string' ? entrada.tipo.trim().toLowerCase() : ''
  if (/^[a-z_]{2,30}$/.test(tipo)) f.tipo = tipo === 'depto' ? 'departamento' : tipo

  const zona = typeof entrada.zona === 'string' ? entrada.zona.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
  if (zona.length >= 2) f.zona = zona

  let pmin = numero(entrada.pmin ?? entrada.precioMin)
  let pmax = numero(entrada.pmax ?? entrada.precioMax)
  // Alguien que escribe 5 millones en «mínimo» y 2 en «máximo» quiso lo
  // contrario; dar cero resultados para siempre sería castigarle por ello.
  if (pmin && pmax && pmin > pmax) [pmin, pmax] = [pmax, pmin]
  if (pmin) f.pmin = pmin
  if (pmax) f.pmax = pmax

  const topado = (v: unknown, max: number) => { const n = numero(v); return n && n <= max ? n : undefined }
  const rec = topado(entrada.rec, 20)
  const ban = topado(entrada.ban, 20)
  const est = topado(entrada.est, 50)
  if (rec) f.rec = rec
  if (ban) f.ban = ban
  if (est) f.est = est
  else if (entrada.est === 0 || (typeof entrada.est === 'string' && entrada.est.trim() === '0')) f.est = 0   // «0» = declarado sin estacionamiento
  let smin = topado(entrada.smin, 100_000_000)
  let smax = topado(entrada.smax, 100_000_000)
  if (smin && smax && smin > smax) [smin, smax] = [smax, smin]
  if (smin) f.smin = smin
  if (smax) f.smax = smax
  const sub = typeof entrada.sub === 'string' ? entrada.sub.trim().toLowerCase() : ''
  if (f.tipo && /^[a-z_]{2,30}$/.test(sub)) f.sub = sub
  const si = (v: unknown) => v === 1 || v === '1' || v === true || v === 'si'
  // Sólo tienen sentido en renta: sin «renta» elegida se descartan.
  if (f.op === 'renta') {
    if (si(entrada.amu)) f.amu = 1
    if (si(entrada.masc)) f.masc = 1
  }

  // «Más filtros» (28-oct-2026): ver `filtros-mas.ts` (reglas, trazabilidad y bloqueados).
  Object.assign(f, normalizarMas(entrada))

  return Object.keys(f).length ? f : null
}

/** Lee los filtros de la URL del listado. */
export function filtrosDeUrl(params: URLSearchParams): Filtros | null {
  return normalizarFiltros(Object.fromEntries(params.entries()))
}

/** El enlace al listado con esos filtros aplicados. */
export function aHref(f: Filtros): string {
  const p = new URLSearchParams()
  if (f.op) p.set('op', f.op)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.zona) p.set('zona', f.zona)
  if (f.pmin) p.set('pmin', String(f.pmin))
  if (f.pmax) p.set('pmax', String(f.pmax))
  // El ORDEN de los parámetros no cambia (los enlaces guardados y compartidos dependen de él). `est` es el único que admite 0 («sin estacionamiento»): viaja aunque sea falsy.
  for (const k of ['rec', 'ban', 'est', 'smin', 'smax', 'amu', 'masc', 'sub'] as const) if (k === 'est' ? f.est !== undefined : f[k]) p.set(k, String(f[k]))
  masAParams(f, p)
  const q = p.toString()
  return q ? `/propiedades?${q}` : '/propiedades'
}

function pesosCortos(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${Number.isInteger(m) ? m : m.toFixed(1)} M`
  }
  if (n >= 1000) return `$${Math.round(n / 1000)} mil`
  return `$${n}`
}

/**
 * La búsqueda en una frase: «Casas en venta · Campestre · hasta $3 M».
 * Es lo que se enseña en el panel, así que tiene que leerse sin pensar.
 */
export function describir(f: Filtros): string {
  const plural = f.tipo ? (TIPOS_ETIQUETA[f.tipo] ?? f.tipo) : 'Inmuebles'
  const que = f.op ? `${plural} en ${f.op}` : plural

  const partes = [que]
  if (f.zona) partes.push(f.zona)
  if (f.pmin && f.pmax) partes.push(`${pesosCortos(f.pmin)} – ${pesosCortos(f.pmax)}`)
  else if (f.pmax) partes.push(`hasta ${pesosCortos(f.pmax)}`)
  else if (f.pmin) partes.push(`desde ${pesosCortos(f.pmin)}`)
  if (f.sub) partes.push(f.sub.replace(/_/g, ' '))
  if (f.rec) partes.push(`${f.rec}+ recámaras`)
  if (f.ban) partes.push(`${f.ban}+ baños`)
  if (f.est === 0) partes.push('sin estacionamiento')
  else if (f.est) partes.push(`${f.est}+ estacionamientos`)
  if (f.smin && f.smax) partes.push(`${f.smin}–${f.smax} m²`)
  else if (f.smin) partes.push(`desde ${f.smin} m²`)
  else if (f.smax) partes.push(`hasta ${f.smax} m²`)
  if (f.amu) partes.push('amueblado')
  if (f.masc) partes.push('admite mascotas')
  partes.push(...describirMas(f))
  return partes.join(' · ')
}

/** Quita acentos y mayúsculas: «León» y «leon» son la misma zona. */
export function plano(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export type PropiedadBuscable = {
  operacion?: string | null
  tipo?: string | null
  ubicacion?: string | null
  colonia?: string | null
  ciudad?: string | null
  precio?: number | null
  estatus?: string | null
  estado?: string | null
  subtipo?: string | null
  recamaras?: number | null
  banos?: number | null
  metros?: number | null
  /** Alias histórico de `metros` en el catálogo del navegador. */
  m2?: number | string | null
  extras?: unknown
  /** «Más filtros»: multimedia (arreglos de URL) y fecha de publicación. Si la fila no los trae, esos filtros no pueden cumplirse (nunca se adivina). */
  videos?: unknown
  planos?: unknown
  publicada_en?: string | null
}

const ESTATUS_FUERA = ['pausada', 'vendida', 'rentada', 'eliminada']

/** ¿Esta propiedad sale en esta búsqueda? La misma regla que el listado. */
export function coincide(p: PropiedadBuscable, f: Filtros, ahora = Date.now()): boolean {
  const estatus = p.estatus || p.estado || 'disponible'
  if (ESTATUS_FUERA.includes(estatus)) return false

  if (f.op && p.operacion !== f.op) return false

  const tipo = p.tipo === 'depto' ? 'departamento' : p.tipo
  if (f.tipo && tipo !== f.tipo) return false

  if (f.zona) {
    const donde = plano([p.ubicacion, p.colonia, p.ciudad].filter(Boolean).join(' '))
    if (!donde.includes(plano(f.zona))) return false
  }

  // Sin precio no se puede decir que entra en el rango: fuera.
  if ((f.pmin || f.pmax) && !(typeof p.precio === 'number' && p.precio > 0)) return false
  if (f.pmin && (p.precio as number) < f.pmin) return false
  if (f.pmax && (p.precio as number) > f.pmax) return false

  if (f.sub && p.subtipo !== f.sub) return false

  // Mínimos y superficie: sin el dato no se puede decir que cumple, así que no entra.
  const mayorOIgual = (v: number | null | undefined, min?: number) => !min || (typeof v === 'number' && v >= min)
  if (!mayorOIgual(p.recamaras, f.rec)) return false
  if (!mayorOIgual(p.banos, f.ban)) return false
  if (f.est !== undefined) {
    const e = numeroDe(p, 'estacionamientos')
    if (f.est === 0 ? e !== 0 : !mayorOIgual(e, f.est)) return false   // 0 = DECLARADO sin estacionamiento; sin el dato no entra
  }
  if (f.smin || f.smax) {
    const m = typeof p.metros === 'number' && p.metros > 0 ? p.metros : null
    if (m === null) return false
    if (f.smin && m < f.smin) return false
    if (f.smax && m > f.smax) return false
  }
  if (f.amu) {
    if (p.operacion !== 'renta') return false
    const a = enumDe(p, 'amueblado')
    if (a !== 'si' && a !== 'semi') return false
  }
  if (f.masc) {
    if (p.operacion !== 'renta') return false
    const m = enumDe(p, 'mascotas')
    if (m !== 'permitidas' && m !== 'con_restricciones') return false
  }

  return coincideMas(p, f, ahora)   // «Más filtros»: la MISMA regla en navegador, servidor y alertas
}

/**
 * Cuántas coinciden y cuántas son **nuevas** desde `desde` — la fecha en que
 * se guardó la búsqueda, o la última vez que se abrió.
 *
 * «Nueva» es publicada después, no creada después: un borrador de hace un
 * mes que se aprobó ayer es nuevo para quien busca.
 */
export function contar(
  lista: (PropiedadBuscable & { publicada_en?: string | null; created_at?: string | null })[],
  f: Filtros,
  desde?: string | null,
): { total: number; nuevas: number } {
  const limite = desde ? Date.parse(desde) : NaN
  let total = 0
  let nuevas = 0
  for (const p of lista) {
    if (!coincide(p, f)) continue
    total++
    const cuando = Date.parse(p.publicada_en || p.created_at || '')
    if (Number.isFinite(limite) && Number.isFinite(cuando) && cuando > limite) nuevas++
  }
  return { total, nuevas }
}

/** Dos búsquedas iguales son la misma, aunque los filtros vengan en otro orden. */
export function mismaBusqueda(a: Filtros, b: Filtros): boolean {
  const clave = (f: Filtros) =>
    JSON.stringify([f.op ?? '', f.tipo ?? '', plano(f.zona ?? ''), f.pmin ?? 0, f.pmax ?? 0, f.rec ?? 0, f.ban ?? 0, f.est ?? -1, f.smin ?? 0, f.smax ?? 0, f.amu ?? 0, f.masc ?? 0, f.sub ?? '',
      f.car ?? [], f.cmin ?? 0, f.cmax ?? 0, f.tmin ?? 0, f.tmax ?? 0, f.amb ?? [], f.gen ?? [], f.ext ?? [], f.srv ?? [], f.ame ?? [], f.mm ?? [], f.ant ?? '', f.pub ?? '', plano(f.dir ?? '')])
  return clave(a) === clave(b)
}
