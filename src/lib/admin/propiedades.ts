import { claveDeZona } from '../zonas-buscadas'
import { contarEn } from './periodo'

/**
 * Pestañas, filtros, indicadores y acciones de la pantalla de propiedades.
 * Funciones puras, probadas aparte.
 *
 * Dos ejes distintos que la tabla anterior mezclaba:
 *
 *  · `estado_pub` — si se ve en el sitio: borrador, en revisión, publicada…
 *  · `estatus`    — la situación comercial: disponible, pausada, vendida,
 *                   rentada o archivada (`eliminada`, borrado suave).
 *
 * Una propiedad puede estar publicada y pausada a la vez. Por eso las pestañas
 * son las preguntas que se hace quien administra, no una columna de la base.
 */

export type PropiedadPanel = {
  id: string
  titulo?: string | null
  tipo?: string | null
  operacion?: string | null
  precio?: number | string | null
  metros?: number | string | null
  ubicacion?: string | null
  colonia?: string | null
  ciudad?: string | null
  estatus?: string | null
  estado_pub?: string | null
  fotos?: string[] | null
  folio?: string | null
  slug?: string | null
  publicada_en?: string | null
  created_at?: string | null
  vistas?: number | null
  completitud?: number | null
}

export type Pestana = 'todas' | 'publicadas' | 'borradores' | 'revision' | 'pausadas' | 'cerradas' | 'archivadas'

export const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'publicadas', etiqueta: 'Publicadas' },
  { clave: 'borradores', etiqueta: 'Borradores' },
  { clave: 'revision', etiqueta: 'Por revisar' },
  { clave: 'pausadas', etiqueta: 'Pausadas' },
  { clave: 'cerradas', etiqueta: 'Rentadas / Vendidas' },
  { clave: 'archivadas', etiqueta: 'Archivadas' },
]

const archivada = (p: PropiedadPanel) => p.estatus === 'eliminada'
/** Ya se rentó o se vendió: no se muestra en el sitio y vive en su propia pestaña (no en «Publicadas»). */
const cerrada = (p: PropiedadPanel) => (p.estatus === 'rentada' || p.estatus === 'vendida') && !archivada(p)

export function enPestana(p: PropiedadPanel, pestana: Pestana): boolean {
  switch (pestana) {
    // «Todas» deja fuera lo archivado: es la papelera, no el inventario.
    case 'todas': return !archivada(p)
    case 'publicadas': return p.estado_pub === 'publicada' && !archivada(p) && !cerrada(p)
    case 'borradores': return ['borrador', 'cambios_solicitados', 'rechazada'].includes(p.estado_pub ?? '') && !archivada(p)
    case 'revision': return p.estado_pub === 'en_revision' && !archivada(p)
    case 'pausadas': return p.estatus === 'pausada'
    case 'cerradas': return cerrada(p)
    case 'archivadas': return archivada(p)
  }
}

export function conteosPorPestana(lista: PropiedadPanel[]): Record<Pestana, number> {
  const c = { todas: 0, publicadas: 0, borradores: 0, revision: 0, pausadas: 0, cerradas: 0, archivadas: 0 } as Record<Pestana, number>
  for (const p of lista) for (const t of PESTANAS) if (enPestana(p, t.clave)) c[t.clave]++
  return c
}

export function filtrarPropiedades(lista: PropiedadPanel[], pestana: Pestana, texto: string): PropiedadPanel[] {
  const clave = claveDeZona(texto)
  return lista.filter((p) => {
    if (!enPestana(p, pestana)) return false
    if (!clave) return true
    const en = claveDeZona([p.titulo, p.folio, p.ubicacion, p.colonia, p.ciudad, p.tipo].filter(Boolean).join(' '))
    return en.includes(clave)
  })
}

export type KpiPropiedades = { clave: 'publicadas' | 'borradores' | 'revision' | 'fuera'; valor: number; nota: string }

/** Cuatro indicadores: lo que se ve, lo que falta, lo que espera y lo que está fuera. */
export function kpisPropiedades(lista: PropiedadPanel[], ahora: Date): KpiPropiedades[] {
  const c = conteosPorPestana(lista)
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000)
  const nuevas = contarEn(
    lista.filter((p) => p.estado_pub === 'publicada' && !archivada(p) && !cerrada(p)).map((p) => p.publicada_en ?? null),
    hace30,
    ahora,
  )
  const pausadas = c.pausadas
  const fuera = pausadas + c.cerradas + c.archivadas
  return [
    { clave: 'publicadas', valor: c.publicadas, nota: nuevas === 1 ? '1 nueva en 30 días' : `${nuevas} nuevas en 30 días` },
    { clave: 'borradores', valor: c.borradores, nota: c.borradores === 0 ? 'nada a medias' : 'a medias o devueltas' },
    { clave: 'revision', valor: c.revision, nota: c.revision === 0 ? 'nada esperando' : 'esperan tu aprobación' },
    { clave: 'fuera', valor: fuera, nota: `${pausadas} ${pausadas === 1 ? 'pausada' : 'pausadas'} · ${c.cerradas} ${c.cerradas === 1 ? 'rentada/vendida' : 'rentadas/vendidas'} · ${c.archivadas} ${c.archivadas === 1 ? 'archivada' : 'archivadas'}` },
  ]
}

/* ── Qué se puede hacer con cada una ─────────────────────────── */

export type Accion =
  | { tipo: 'estatus'; valor: 'pausada' | 'disponible' | 'eliminada'; etiqueta: string; peligrosa?: boolean }
  | { tipo: 'publicacion'; valor: 'publicada' | 'borrador'; etiqueta: string }
  | { tipo: 'borrar'; etiqueta: string; peligrosa: true }
  /**
   * «Vendida» / «Rentada»: lleva al motor de comisiones con los datos de la propiedad ya puestos. `marcar` = además cambia su estatus a vendida/rentada
   * (no se archiva: sigue siendo la misma propiedad y su historial de comisiones queda ligado a ella).
   */
  | { tipo: 'cierre'; operacion: 'venta' | 'renta'; marcar: boolean; etiqueta: string }

/**
 * Las acciones que tienen sentido para una propiedad, y sólo esas.
 *
 * Ofrecer un botón que el servidor va a rechazar es peor que no ofrecerlo: las
 * transiciones de publicación siguen las de `lib/publicacion.ts` para admin.
 * Borrar para siempre sólo aparece en lo archivado, y pide confirmación.
 */
export function accionesDe(p: PropiedadPanel): Accion[] {
  const acciones: Accion[] = []

  if (archivada(p)) {
    acciones.push({ tipo: 'estatus', valor: 'disponible', etiqueta: 'Restaurar' })
    acciones.push({ tipo: 'borrar', etiqueta: 'Eliminar para siempre', peligrosa: true })
    return acciones
  }

  const ep = p.estado_pub ?? 'borrador'
  if (ep === 'publicada') acciones.push({ tipo: 'publicacion', valor: 'borrador', etiqueta: 'Quitar del sitio (a borrador)' })
  if (['borrador', 'en_revision', 'cambios_solicitados', 'rechazada'].includes(ep)) {
    acciones.push({ tipo: 'publicacion', valor: 'publicada', etiqueta: ep === 'en_revision' ? 'Aprobar y publicar' : 'Publicar' })
  }

  const cerrada = p.estatus === 'vendida' || p.estatus === 'rentada'
  const operacion = p.operacion === 'venta' || p.operacion === 'renta' ? p.operacion : null
  if (operacion && !cerrada) {
    acciones.push({ tipo: 'cierre', operacion, marcar: true, etiqueta: operacion === 'venta' ? 'Vendida: registrar comisión' : 'Rentada: registrar comisión' })
  } else if (cerrada) {
    const op = p.estatus === 'vendida' ? 'venta' : 'renta'
    acciones.push({ tipo: 'cierre', operacion: op, marcar: false, etiqueta: 'Registrar comisión de esta ' + (op === 'venta' ? 'venta' : 'renta') })
  }

  if (cerrada) acciones.push({ tipo: 'estatus', valor: 'disponible', etiqueta: 'Volver a disponible' })
  else if (p.estatus === 'pausada') acciones.push({ tipo: 'estatus', valor: 'disponible', etiqueta: 'Reactivar' })
  else acciones.push({ tipo: 'estatus', valor: 'pausada', etiqueta: 'Pausar' })

  acciones.push({ tipo: 'estatus', valor: 'eliminada', etiqueta: 'Archivar', peligrosa: true })
  return acciones
}

export const ETIQUETA_ESTATUS: Record<string, { texto: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }> = {
  disponible: { texto: 'Disponible', tono: 'bien' },
  pausada: { texto: 'Pausada', tono: 'aviso' },
  vendida: { texto: 'Vendida', tono: 'neutro' },
  rentada: { texto: 'Rentada', tono: 'neutro' },
  eliminada: { texto: 'Archivada', tono: 'mal' },
}

export const ETIQUETA_PUBLICACION: Record<string, { texto: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }> = {
  publicada: { texto: 'Publicada', tono: 'bien' },
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  borrador: { texto: 'Borrador', tono: 'neutro' },
  cambios_solicitados: { texto: 'Con cambios pedidos', tono: 'aviso' },
  rechazada: { texto: 'Rechazada', tono: 'mal' },
}
