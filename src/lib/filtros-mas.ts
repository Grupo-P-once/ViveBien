/**
 * «Más filtros» del catálogo (28-oct-2026) — UNA sola definición para el navegador, el servidor, las alertas y la consulta a la base.
 *
 * ─────────────────────────────────────────────────────────────
 * REGLAS (fijadas por el dueño)
 *  · Solo se filtra por datos ESTRUCTURADOS y autorizados (columnas públicas y `extras.caracteristicas`). NADA se deriva de texto libre (`amenidades` heredado, descripción).
 *  · Un filtro sin dato que lo respalde está BLOQUEADO (`BLOQUEADOS`) y no se muestra como funcional.
 *  · AND entre grupos distintos; OR DENTRO de un grupo de opciones múltiples (ambientes, generales, exteriores, servicios, amenidades, multimedia).
 *  · Dato faltante o que no aplica al tipo/operación = NO coincide cuando ese filtro está activo. Nunca se «adivina».
 *  · Fechas relativas en `America/Mexico_City`: «Hoy» = desde las 00:00 de hoy allá; «Desde ayer» = desde las 00:00 de ayer; «Últimos N días» = desde las 00:00 de hace N−1 días.
 *  · Texto (características, dirección, valores de URL): sin acentos, sin mayúsculas, espacios colapsados.
 *
 * CÓMO SE EJECUTA EN LA CONSULTA
 *  `condicionesDb` convierte los filtros en condiciones (IR) que se aplican en la CONSULTA a la base (antes del `limit`). Las que la base no puede expresar exacto
 *  (acentos) se piden como SUPERCONJUNTO y `coincideMas` —la misma regla que usan el navegador y las alertas— deja el resultado exacto.
 * ─────────────────────────────────────────────────────────────
 */

import { SUBTIPOS } from './esquemas/propiedad'
import { DEFINICIONES, aplica, boolDe, enumDe, etiquetaSubtipo, leerCaracteristicas, listaDe, numeroDe, superficiesDe, tipoBase, type PropiedadConCaracteristicas } from './caracteristicas'

/* ── Normalización de texto ───────────────────────────────────────────────── */

/** Sin acentos, sin mayúsculas, con los espacios colapsados: «  León » y «leon» son lo mismo. */
export function plano(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/* ── Opciones (grupos de selección múltiple) ──────────────────────────────── */

export type GrupoMultiple = 'amb' | 'gen' | 'ext' | 'srv' | 'ame' | 'mm'

type Fuente =
  | { k: 'lista'; clave: string; valor: string }
  | { k: 'enum'; clave: string; valores: readonly string[] }
  | { k: 'bool'; clave: string }
  | { k: 'todos'; clave: string; valores: readonly string[] }
  | { k: 'columna'; col: 'videos' | 'planos' }

export type ItemMas = { id: string; etiqueta: string; grupo: GrupoMultiple; /** Va tras «Ver más». */ extra?: boolean; /** Basta UNA fuente (OR). */ fuentes: readonly Fuente[] }

const L = (clave: string, valor: string): Fuente => ({ k: 'lista', clave, valor })

export const ITEMS_MAS: readonly ItemMas[] = [
  // Ambientes
  { id: 'bodega', etiqueta: 'Bodega', grupo: 'amb', fuentes: [L('interiores', 'bodega_interna'), L('equipamiento', 'bodega_interna')] },
  { id: 'estudio', etiqueta: 'Estudio', grupo: 'amb', fuentes: [L('interiores', 'estudio')] },
  { id: 'cuarto_tv', etiqueta: 'Cuarto de TV', grupo: 'amb', fuentes: [L('interiores', 'sala_tv')] },
  { id: 'cocina_integral', etiqueta: 'Cocina integral', grupo: 'amb', fuentes: [L('interiores', 'cocina_integral')] },
  { id: 'cocina_equipada', etiqueta: 'Cocina equipada', grupo: 'amb', extra: true, fuentes: [L('interiores', 'cocina_equipada')] },
  { id: 'cuarto_servicio', etiqueta: 'Cuarto de servicio', grupo: 'amb', extra: true, fuentes: [L('interiores', 'cuarto_servicio')] },
  { id: 'lavanderia', etiqueta: 'Cuarto de lavado', grupo: 'amb', extra: true, fuentes: [L('interiores', 'lavanderia')] },
  { id: 'closets', etiqueta: 'Clósets', grupo: 'amb', extra: true, fuentes: [L('interiores', 'closets')] },
  // Generales
  { id: 'alberca', etiqueta: 'Alberca', grupo: 'gen', fuentes: [L('exteriores', 'alberca'), L('amenidades_comunes', 'alberca_comun')] },
  { id: 'amueblado', etiqueta: 'Amueblado', grupo: 'gen', fuentes: [{ k: 'enum', clave: 'amueblado', valores: ['si', 'semi'] }] },
  { id: 'elevador', etiqueta: 'Elevador', grupo: 'gen', extra: true, fuentes: [{ k: 'bool', clave: 'elevador' }] },
  { id: 'acceso_controlado', etiqueta: 'Acceso controlado', grupo: 'gen', extra: true, fuentes: [L('seguridad', 'acceso_controlado')] },
  // Exteriores
  { id: 'asador', etiqueta: 'Asador', grupo: 'ext', fuentes: [L('exteriores', 'asador')] },
  { id: 'balcon', etiqueta: 'Balcón', grupo: 'ext', fuentes: [L('exteriores', 'balcon')] },
  { id: 'jardin', etiqueta: 'Jardín privado', grupo: 'ext', fuentes: [L('exteriores', 'jardin')] },
  { id: 'terraza', etiqueta: 'Terraza', grupo: 'ext', fuentes: [L('exteriores', 'terraza')] },
  { id: 'patio', etiqueta: 'Patio', grupo: 'ext', fuentes: [L('exteriores', 'patio')] },
  // Servicios
  { id: 'seguridad_privada', etiqueta: 'Seguridad privada', grupo: 'srv', fuentes: [L('seguridad', 'vigilancia_24h')] },
  { id: 'servicios_basicos', etiqueta: 'Servicios básicos (agua/luz)', grupo: 'srv', fuentes: [{ k: 'todos', clave: 'servicios', valores: ['agua', 'luz'] }] },
  { id: 'caseta', etiqueta: 'Caseta de guardia', grupo: 'srv', fuentes: [L('seguridad', 'caseta')] },
  { id: 'aire_acondicionado', etiqueta: 'Aire acondicionado', grupo: 'srv', fuentes: [L('interiores', 'aire_acondicionado'), L('equipamiento', 'aire_acondicionado')] },
  { id: 'internet', etiqueta: 'Internet/Wifi', grupo: 'srv', fuentes: [L('servicios', 'internet'), L('servicios', 'fibra_optica')] },
  // Amenidades
  { id: 'deportivas', etiqueta: 'Áreas deportivas', grupo: 'ame', fuentes: [L('amenidades_comunes', 'cancha')] },
  { id: 'juegos_infantiles', etiqueta: 'Área de juegos infantiles', grupo: 'ame', fuentes: [L('amenidades_comunes', 'juegos_infantiles')] },
  { id: 'sum', etiqueta: 'Salón de usos múltiples', grupo: 'ame', fuentes: [L('amenidades_comunes', 'salon_usos_multiples')] },
  { id: 'jardines', etiqueta: 'Jardines', grupo: 'ame', fuentes: [L('amenidades_comunes', 'areas_verdes')] },
  { id: 'gimnasio', etiqueta: 'Gimnasio', grupo: 'ame', fuentes: [L('amenidades_comunes', 'gimnasio')] },
  { id: 'coworking', etiqueta: 'Espacio de co-working', grupo: 'ame', fuentes: [L('amenidades_comunes', 'trabajo_compartido')] },
  // Multimedia
  { id: 'video', etiqueta: 'Video', grupo: 'mm', fuentes: [{ k: 'columna', col: 'videos' }] },
  { id: 'planos', etiqueta: 'Planos', grupo: 'mm', fuentes: [{ k: 'columna', col: 'planos' }] },
]

export const GRUPOS_MAS_UI: readonly { id: GrupoMultiple; titulo: string }[] = [
  { id: 'amb', titulo: 'Ambientes' }, { id: 'gen', titulo: 'Generales' }, { id: 'ext', titulo: 'Exteriores' },
  { id: 'srv', titulo: 'Servicios' }, { id: 'ame', titulo: 'Amenidades' }, { id: 'mm', titulo: 'Multimedia' },
]

/** Opciones PEDIDAS que NO tienen dato que las respalde: no se muestran como funcionales. `falta` = qué dato hay que crear (requiere aprobación). */
export const BLOQUEADOS: readonly { etiqueta: string; grupo: string; falta: string }[] = [
  { etiqueta: 'Tipo de anunciante (Inmobiliaria / Trato directo)', grupo: 'Tipo de anunciante', falta: 'Un campo PÚBLICO de tipo de anunciante y la decisión de privacidad (hoy `origen_tipo` es interno de comisiones y el contacto es siempre VIVE BIEN).' },
  { etiqueta: 'Centros comerciales cercanos', grupo: 'Generales', falta: 'Una característica estructurada de cercanías.' },
  { etiqueta: 'Escuelas cercanas', grupo: 'Generales', falta: 'Una característica estructurada de cercanías.' },
  { etiqueta: 'Estacionamiento de visitas', grupo: 'Servicios', falta: 'Una opción estructurada (p. ej. en `seguridad`/`servicios`).' },
  { etiqueta: 'Calefacción', grupo: 'Servicios', falta: 'Una opción estructurada (p. ej. en `interiores`).' },
  { etiqueta: 'Business center', grupo: 'Amenidades', falta: 'Una opción en `amenidades_comunes`.' },
  { etiqueta: 'Área de eventos', grupo: 'Amenidades', falta: 'Una opción en `amenidades_comunes`.' },
  { etiqueta: 'Sauna', grupo: 'Amenidades', falta: 'Una opción en `amenidades_comunes`.' },
  { etiqueta: 'Spa', grupo: 'Amenidades', falta: 'Una opción en `amenidades_comunes`.' },
  { etiqueta: 'Jacuzzi', grupo: 'Amenidades', falta: 'Una opción en `amenidades_comunes`.' },
  { etiqueta: 'Recorrido 360', grupo: 'Multimedia', falta: 'Un campo `recorrido_360` (URL validada) y su captura en el editor del publicador.' },
  { etiqueta: 'En construcción', grupo: 'Antigüedad', falta: 'La opción «en construcción» (hoy `estado_general` no la tiene).' },
]

const ITEMS_POR_ID = new Map(ITEMS_MAS.map((i) => [`${i.grupo}:${i.id}`, i]))
const IDS_POR_GRUPO: Record<GrupoMultiple, string[]> = { amb: [], gen: [], ext: [], srv: [], ame: [], mm: [] }
for (const i of ITEMS_MAS) IDS_POR_GRUPO[i.grupo].push(i.id)

export const ANTIGUEDADES = [['estreno', 'A estrenar'], ['5', 'Hasta 5 años'], ['10', 'Hasta 10 años'], ['20', 'Hasta 20 años'], ['50', 'Hasta 50 años'], ['mas50', 'Más de 50 años']] as const
export const PUBLICACIONES = [['ayer', 'Desde ayer'], ['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['15', 'Últimos 15 días'], ['30', 'Últimos 30 días'], ['45', 'Últimos 45 días']] as const
const DIAS_PUB: Record<string, number> = { hoy: 1, ayer: 2, '7': 7, '15': 15, '30': 30, '45': 45 }

/* ── Filtros ──────────────────────────────────────────────────────────────── */

export type FiltrosMas = {
  /** Términos de «Características» (sin acentos). TODOS deben cumplirse (decisión a confirmar con el dueño: AND entre términos). */
  car?: string[]
  cmin?: number; cmax?: number; tmin?: number; tmax?: number
  amb?: string[]; gen?: string[]; ext?: string[]; srv?: string[]; ame?: string[]; mm?: string[]
  ant?: 'estreno' | '5' | '10' | '20' | '50' | 'mas50'
  pub?: 'hoy' | 'ayer' | '7' | '15' | '30' | '45'
  dir?: string
}

export const CLAVES_MAS = ['car', 'cmin', 'cmax', 'tmin', 'tmax', 'amb', 'gen', 'ext', 'srv', 'ame', 'mm', 'ant', 'pub', 'dir'] as const
const GRUPOS: readonly GrupoMultiple[] = ['amb', 'gen', 'ext', 'srv', 'ame', 'mm']

const MAX_METROS = 100_000_000
export const MAX_TERMINOS = 8
export const LARGO_MAX_TERMINO = 40
export const LARGO_MAX_DIRECCION = 80

function numeroMetros(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(v) ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 && n <= MAX_METROS ? Math.round(n * 100) / 100 : undefined
}

/** Acepta «a,b», «a b» o un arreglo; devuelve solo ids válidos del grupo, sin repetir y en el orden del catálogo (URL estable). */
function idsDe(v: unknown, grupo: GrupoMultiple): string[] | undefined {
  const crudos = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []
  const pedidos = new Set(crudos.filter((x): x is string => typeof x === 'string').map((x) => plano(x)))
  const ids = IDS_POR_GRUPO[grupo].filter((id) => pedidos.has(id))
  return ids.length ? ids : undefined
}

/** Limpia lo que llegue (URL o cuerpo de una petición) y devuelve solo filtros válidos. Nunca lanza. */
export function normalizarMas(entrada: Record<string, unknown>): FiltrosMas {
  const f: FiltrosMas = {}

  for (const g of GRUPOS) { const ids = idsDe(entrada[g], g); if (ids) f[g] = ids }

  const crudoCar = Array.isArray(entrada.car) ? entrada.car.filter((x): x is string => typeof x === 'string').join(',') : typeof entrada.car === 'string' ? entrada.car : ''
  const terminos = [...new Set(crudoCar.split(/[,;]/).map((t) => plano(t).slice(0, LARGO_MAX_TERMINO)).filter((t) => t.length >= 3))].slice(0, MAX_TERMINOS)
  if (terminos.length) f.car = terminos

  let cmin = numeroMetros(entrada.cmin), cmax = numeroMetros(entrada.cmax)
  if (cmin && cmax && cmin > cmax) [cmin, cmax] = [cmax, cmin]   // como pmin/pmax: invertidos se intercambian
  if (cmin) f.cmin = cmin
  if (cmax) f.cmax = cmax
  let tmin = numeroMetros(entrada.tmin), tmax = numeroMetros(entrada.tmax)
  if (tmin && tmax && tmin > tmax) [tmin, tmax] = [tmax, tmin]
  if (tmin) f.tmin = tmin
  if (tmax) f.tmax = tmax

  const ant = typeof entrada.ant === 'string' ? plano(entrada.ant) : ''
  if (ANTIGUEDADES.some(([v]) => v === ant)) f.ant = ant as FiltrosMas['ant']
  const pub = typeof entrada.pub === 'string' ? plano(entrada.pub) : ''
  if (pub in DIAS_PUB) f.pub = pub as FiltrosMas['pub']

  const dir = typeof entrada.dir === 'string' ? plano(entrada.dir).slice(0, LARGO_MAX_DIRECCION) : ''
  if (dir.length >= 2) f.dir = dir

  return f
}

/** ¿Hay algún filtro nuevo activo (ya normalizado)? */
export function hayMas(f: FiltrosMas): boolean { return CLAVES_MAS.some((k) => f[k] !== undefined) }

/** Los filtros nuevos como parámetros de URL (listas con coma). */
export function masAParams(f: FiltrosMas, p: URLSearchParams): void {
  if (f.car?.length) p.set('car', f.car.join(','))
  for (const k of ['cmin', 'cmax', 'tmin', 'tmax'] as const) if (f[k]) p.set(k, String(f[k]))
  for (const g of GRUPOS) { const v = f[g]; if (v?.length) p.set(g, v.join(',')) }
  if (f.ant) p.set('ant', f.ant)
  if (f.pub) p.set('pub', f.pub)
  if (f.dir) p.set('dir', f.dir)
}

/** Etiquetas para describir la búsqueda en una frase (panel y correos). */
export function describirMas(f: FiltrosMas): string[] {
  const partes: string[] = []
  if (f.car?.length) partes.push(f.car.join(', '))
  if (f.cmin && f.cmax) partes.push(`construcción ${f.cmin}–${f.cmax} m²`); else if (f.cmin) partes.push(`construcción desde ${f.cmin} m²`); else if (f.cmax) partes.push(`construcción hasta ${f.cmax} m²`)
  if (f.tmin && f.tmax) partes.push(`terreno ${f.tmin}–${f.tmax} m²`); else if (f.tmin) partes.push(`terreno desde ${f.tmin} m²`); else if (f.tmax) partes.push(`terreno hasta ${f.tmax} m²`)
  for (const g of GRUPOS) for (const id of f[g] ?? []) { const it = ITEMS_POR_ID.get(`${g}:${id}`); if (it) partes.push(it.etiqueta.toLowerCase()) }
  if (f.ant) partes.push((ANTIGUEDADES.find(([v]) => v === f.ant)?.[1] ?? '').toLowerCase())
  if (f.pub) partes.push((PUBLICACIONES.find(([v]) => v === f.pub)?.[1] ?? '').toLowerCase())
  if (f.dir) partes.push(`dirección «${f.dir}»`)
  return partes
}

/* ── Fechas en America/Mexico_City ────────────────────────────────────────── */

const ZONA = 'America/Mexico_City'
const FORMATO_FECHA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
const FORMATO_HORA = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Desfase de la zona (ms) en el instante `t`: hora local − UTC. */
function desfaseMs(t: number): number {
  const p = Object.fromEntries(FORMATO_HORA.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(t / 1000) * 1000
}

/** El instante (ms UTC) de las 00:00 en Ciudad de México del día en que cae `ahora`, retrocediendo `dias` días calendario. */
export function inicioDeDiaEnMexico(ahora: number, dias = 0): number {
  const [y, m, d] = FORMATO_FECHA.format(new Date(ahora)).split('-').map(Number)
  const medianocheComoUtc = Date.UTC(y, m - 1, d - dias)
  let t = medianocheComoUtc - desfaseMs(medianocheComoUtc)
  t = medianocheComoUtc - desfaseMs(t)   // segunda pasada: borde de horario de verano
  return t
}

/** Desde cuándo (ms UTC) cuenta una publicación para el filtro `pub`. */
export function desdePublicacion(pub: NonNullable<FiltrosMas['pub']>, ahora: number): number {
  return inicioDeDiaEnMexico(ahora, DIAS_PUB[pub] - 1)
}

/* ── Coincidencia (la MISMA regla en navegador, servidor y alertas) ───────── */

export type PropiedadMas = PropiedadConCaracteristicas & {
  metros?: unknown; m2?: unknown
  videos?: unknown; planos?: unknown
  publicada_en?: string | null
  ubicacion?: string | null; colonia?: string | null
}

const lleno = (v: unknown) => Array.isArray(v) && v.length > 0

function cumpleFuente(p: PropiedadMas, s: Fuente): boolean {
  switch (s.k) {
    case 'lista': return listaDe(p, s.clave).includes(s.valor)
    case 'enum': { const v = enumDe(p, s.clave); return v !== null && s.valores.includes(v) }
    case 'bool': return boolDe(p, s.clave) === true
    case 'todos': { const l = listaDe(p, s.clave); return s.valores.every((x) => l.includes(x)) }
    case 'columna': return lleno(p[s.col])
  }
}

/** ¿Cumple esta opción? Basta UNA de sus fuentes. */
export function cumpleItem(p: PropiedadMas, item: ItemMas): boolean { return item.fuentes.some((s) => cumpleFuente(p, s)) }

/* — Características (texto): se resuelve contra lo ESTRUCTURADO, nunca contra texto libre — */

type FuenteTermino =
  | { k: 'lista'; clave: string; valor: string }
  | { k: 'enum'; clave: string; valor: string }
  | { k: 'bool'; clave: string }
  | { k: 'subtipo'; valor: string }
  | { k: 'estreno' }

/** Frases derivadas de valores estructurados («permite mascotas» ← `mascotas = permitidas | con_restricciones`). */
const FRASES: readonly { textos: readonly string[]; fuentes: readonly FuenteTermino[] }[] = [
  { textos: ['permite mascotas', 'admite mascotas', 'mascotas', 'pet friendly'], fuentes: [{ k: 'enum', clave: 'mascotas', valor: 'permitidas' }, { k: 'enum', clave: 'mascotas', valor: 'con_restricciones' }] },
  { textos: ['a estrenar', 'estrenar'], fuentes: [{ k: 'estreno' }] },
]

const CACHE_TERMINOS = new Map<string, FuenteTermino[]>()
/** Tope de la caché: el texto lo escribe cualquiera; sin tope cada término distinto quedaría en memoria mientras viva la instancia. */
const MAX_CACHE_TERMINOS = 500
/** Opciones negativas o neutras («No se permiten», «Sin elevador», «A consultar»): buscar «se permiten» NO debe traer los que lo prohíben. */
const esNegativa = (etiqueta: string) => /^(no|sin|a consultar|ninguno|ninguna)( |$)/.test(plano(etiqueta))
/** Todas las fuentes estructuradas cuya etiqueta contiene el término. Vacío = nada puede cumplirlo (el término no existe en el catálogo). */
export function fuentesDeTermino(termino: string): FuenteTermino[] {
  const t = plano(termino)
  const hecho = CACHE_TERMINOS.get(t)
  if (hecho) return hecho
  const salida: FuenteTermino[] = []
  for (const def of DEFINICIONES) {
    if (def.forma === 'lista') for (const [valor, etiqueta] of def.opciones) { if (!esNegativa(etiqueta) && plano(etiqueta).includes(t)) salida.push({ k: 'lista', clave: def.clave, valor }) }
    else if (def.forma === 'enum') for (const [valor, etiqueta] of def.opciones) { if (!esNegativa(etiqueta) && plano(etiqueta).includes(t)) salida.push({ k: 'enum', clave: def.clave, valor }) }
    else if (def.forma === 'bool' && plano(def.etiquetaAmenidad ?? def.etiqueta).includes(t)) salida.push({ k: 'bool', clave: def.clave })
  }
  for (const lista of Object.values(SUBTIPOS)) for (const s of lista) if (plano(s.etiqueta).includes(t) && !salida.some((x) => x.k === 'subtipo' && x.valor === s.valor)) salida.push({ k: 'subtipo', valor: s.valor })
  for (const fr of FRASES) if (fr.textos.some((x) => plano(x).includes(t))) for (const f of fr.fuentes) if (!JSON.stringify(salida).includes(JSON.stringify(f))) salida.push(f)
  if (CACHE_TERMINOS.size >= MAX_CACHE_TERMINOS) CACHE_TERMINOS.clear()
  CACHE_TERMINOS.set(t, salida)
  return salida
}

function cumpleFuenteTermino(p: PropiedadMas, s: FuenteTermino): boolean {
  switch (s.k) {
    case 'lista': return listaDe(p, s.clave).includes(s.valor)
    case 'enum': return enumDe(p, s.clave) === s.valor
    case 'bool': return boolDe(p, s.clave) === true
    case 'subtipo': return etiquetaSubtipo(p.tipo, p.subtipo) !== null && p.subtipo === s.valor
    case 'estreno': return numeroDe(p, 'antiguedad_anos') === 0
  }
}

const dentro = (v: number | null, min?: number, max?: number) => v !== null && (!min || v >= min) && (!max || v <= max)

/**
 * ¿Pasa esta propiedad los filtros NUEVOS? (`ban` y `est` los resuelve `coincide` en busquedas.ts.)
 * `ahora` solo importa para `pub`; se inyecta para poder probar los límites de día.
 */
export function coincideMas(p: PropiedadMas, f: FiltrosMas, ahora = Date.now()): boolean {
  if (f.cmin || f.cmax) { if (!dentro(superficiesDe(p).construccion, f.cmin, f.cmax)) return false }
  if (f.tmin || f.tmax) { if (!dentro(superficiesDe(p).terreno, f.tmin, f.tmax)) return false }

  for (const g of GRUPOS) {
    const ids = f[g]
    if (!ids?.length) continue
    // OR dentro del grupo: basta UNA opción elegida.
    if (!ids.some((id) => { const it = ITEMS_POR_ID.get(`${g}:${id}`); return !!it && cumpleItem(p, it) })) return false
  }

  if (f.ant) {
    const a = numeroDe(p, 'antiguedad_anos')
    if (a === null) return false
    if (f.ant === 'estreno' ? a !== 0 : f.ant === 'mas50' ? !(a > 50) : !(a <= Number(f.ant))) return false
  }

  if (f.pub) {
    const cuando = Date.parse(p.publicada_en ?? '')
    if (!Number.isFinite(cuando) || cuando < desdePublicacion(f.pub, ahora)) return false
  }

  if (f.dir) {
    const donde = plano([p.ubicacion, p.colonia].filter(Boolean).join(' '))
    if (!donde.includes(f.dir)) return false
  }

  if (f.car?.length) {
    // AND entre términos; cada término: basta UNA fuente estructurada que lo cumpla.
    for (const t of f.car) { const fs = fuentesDeTermino(t); if (!fs.some((s) => cumpleFuenteTermino(p, s))) return false }
  }

  return true
}

/* ── Condiciones para la CONSULTA a la base (IR) ──────────────────────────── */

export type Cond =
  | { t: 'col'; col: string; op: 'eq' | 'neq' | 'gte' | 'lte' | 'in'; v: number | string | string[] }
  | { t: 'json'; clave: string; op: 'cs' | 'eqs' | 'ins' | 'eqn' | 'gten' | 'lten' | 'gtn' | 'eqb'; v: number | string | boolean | string[] }
  | { t: 'noVacio'; col: 'videos' | 'planos' }
  | { t: 'ilike'; cols: string[]; patron: string }
  | { t: 'or'; conds: Cond[] }
  | { t: 'and'; conds: Cond[] }

/**
 * Patrón ILIKE tolerante a acentos: cada letra que puede llevarlos pasa a comodín de un carácter. SUPERCONJUNTO: `coincideMas`/`coincide` dejan el resultado exacto.
 * SEGURIDAD: el patrón viaja DENTRO de una expresión `or(…)` de PostgREST, donde `,` `(` `)` `"` `\` tienen significado de sintaxis. Por eso SOLO sobreviven letras
 * (sin vocales ni `n`), dígitos y espacios (→ `%`); cualquier otro carácter pasa a comodín `_`. Así lo que escriba una persona nunca puede inyectar un filtro.
 */
export function patronSinAcentos(texto: string): string {
  // Se recorre el texto ORIGINAL (compuesto, en minúsculas): todo carácter que no sea ASCII alfanumérico (ç, ý, ñ, vocales con acento…) pasa a comodín, porque `plano`
  // lo reduce a una letra ASCII que el ILIKE de la base no iguala con el carácter acentuado guardado («garcon» ≠ «Garçon»).
  let s = ''
  for (const ch of texto.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')) {
    if (ch === ' ') s += '%'
    else if (!/[a-z0-9]/.test(ch) || 'aeiouncy'.includes(ch)) s += '_'
    else s += ch
  }
  return `%${s}%`
}

const condLista = (clave: string, valor: string): Cond => ({ t: 'json', clave, op: 'cs', v: valor })

/**
 * Texto buscado en VARIAS columnas, como superconjunto GARANTIZADO de la regla exacta. La regla exacta busca la frase en el texto UNIDO de las columnas (separadas por un espacio);
 * un `ILIKE` por columna perdería una frase que cruce el límite entre dos campos («Bosco Buenaventura»). Por eso se parte en PALABRAS: cada palabra debe aparecer en ALGUNA columna
 * (una palabra no puede cruzar el espacio que une los campos). `coincide` deja el resultado exacto.
 */
export function condTexto(cols: string[], texto: string): Cond {
  const porPalabra = plano(texto).split(' ').filter(Boolean).map((w): Cond => ({ t: 'ilike', cols, patron: patronSinAcentos(w) }))
  return porPalabra.length === 1 ? porPalabra[0] : { t: 'and', conds: porPalabra }
}

function condDeFuente(s: Fuente): Cond {
  switch (s.k) {
    case 'lista': return condLista(s.clave, s.valor)
    case 'enum': return { t: 'json', clave: s.clave, op: 'ins', v: [...s.valores] }
    case 'bool': return { t: 'json', clave: s.clave, op: 'eqb', v: true }
    case 'todos': return { t: 'and', conds: s.valores.map((x) => condLista(s.clave, x)) }
    case 'columna': return { t: 'noVacio', col: s.col }
  }
}

function condDeTermino(s: FuenteTermino): Cond {
  switch (s.k) {
    case 'lista': return condLista(s.clave, s.valor)
    case 'enum': return { t: 'json', clave: s.clave, op: 'eqs', v: s.valor }
    case 'bool': return { t: 'json', clave: s.clave, op: 'eqb', v: true }
    case 'subtipo': return { t: 'col', col: 'subtipo', op: 'eq', v: s.valor }
    case 'estreno': return { t: 'json', clave: 'antiguedad_anos', op: 'eqn', v: 0 }
  }
}

const unaOVarias = (conds: Cond[]): Cond => (conds.length === 1 ? conds[0] : { t: 'or', conds })

/**
 * Los filtros NUEVOS como condiciones de la consulta (AND entre ellas). `imposible` = un término de «Características» no existe en el catálogo → no puede haber resultados
 * (no se consulta). Las condiciones son un SUPERCONJUNTO de lo que acepta `coincideMas` (la base no distingue tipo/operación ni acentos): el resultado exacto lo da `coincideMas`.
 */
export function condicionesMas(f: FiltrosMas, ahora = Date.now()): { conds: Cond[]; imposible: boolean } {
  const conds: Cond[] = []
  if (f.cmin) conds.push({ t: 'and', conds: [{ t: 'col', col: 'metros', op: 'gte', v: f.cmin }, { t: 'col', col: 'tipo', op: 'neq', v: 'terreno' }] })
  if (f.cmax) conds.push({ t: 'and', conds: [{ t: 'col', col: 'metros', op: 'lte', v: f.cmax }, { t: 'col', col: 'tipo', op: 'neq', v: 'terreno' }] })
  const terreno = (op: 'gte' | 'lte', v: number): Cond => ({ t: 'or', conds: [{ t: 'and', conds: [{ t: 'col', col: 'tipo', op: 'eq', v: 'terreno' }, { t: 'col', col: 'metros', op, v }] }, { t: 'json', clave: 'm_terreno', op: op === 'gte' ? 'gten' : 'lten', v }] })
  if (f.tmin) conds.push(terreno('gte', f.tmin))
  if (f.tmax) conds.push(terreno('lte', f.tmax))
  for (const g of GRUPOS) {
    const ids = f[g]
    if (!ids?.length) continue
    const porItem = ids.map((id) => ITEMS_POR_ID.get(`${g}:${id}`)).filter((x): x is ItemMas => !!x).map((it) => unaOVarias(it.fuentes.map(condDeFuente)))
    conds.push(unaOVarias(porItem))
  }
  if (f.ant) conds.push(f.ant === 'estreno' ? { t: 'json', clave: 'antiguedad_anos', op: 'eqn', v: 0 } : f.ant === 'mas50' ? { t: 'json', clave: 'antiguedad_anos', op: 'gtn', v: 50 } : { t: 'json', clave: 'antiguedad_anos', op: 'lten', v: Number(f.ant) })
  if (f.pub) conds.push({ t: 'col', col: 'publicada_en', op: 'gte', v: new Date(desdePublicacion(f.pub, ahora)).toISOString() })
  if (f.dir) conds.push(condTexto(['ubicacion', 'colonia'], f.dir))
  let imposible = false
  for (const t of f.car ?? []) {
    const fs = fuentesDeTermino(t)
    if (!fs.length) { imposible = true; continue }
    conds.push(unaOVarias(fs.map(condDeTermino)))
  }
  return { conds, imposible }
}
