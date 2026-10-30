import { composicionInventario, type FilaEvento, type FilaPropiedad, type Porcion } from '../analitica'
import { nombreDe } from '../propiedad-publica'
import { claveDeZona, zonasBuscadas } from '../zonas-buscadas'
import {
  agrupacionDe, claveGrupo, clavesDeVentana, contarEn, enVentana, etiquetaGrupo, hayHistorial,
  tasa, tramos, variacionEnPuntos, variacionPorcentual, type Variacion, type Ventana,
} from './periodo'

/**
 * El resumen del panel: indicadores, gráficas y mapa, calculados de las filas.
 *
 * Función pura, como `lib/analitica.ts`: la ruta trae los datos y esto los
 * convierte. Así cada número se prueba con datos de ejemplo.
 *
 * Todo lo que es «del período» respeta la ventana `[desde, hasta)` y su
 * gemela anterior. Lo que es una foto de hoy (cuántas hay publicadas, cuántos
 * días llevan) no se compara con el período anterior: no hay historial de
 * cómo estaba el inventario hace un mes, y fingirlo sería inventar.
 */

export type FilaPropiedadResumen = FilaPropiedad & {
  lat?: number | string | null
  lng?: number | string | null
  slug?: string | null
}

export type FilaContactoResumen = { fecha: string | null; propiedad_id: string | null }

export type FuentesResumen = {
  propiedades: FilaPropiedadResumen[]
  /** Eventos desde el inicio del período anterior. */
  eventos: FilaEvento[]
  /** Leads, solicitudes y mensajes de contacto, de siempre. */
  contactos: FilaContactoResumen[]
  favoritos: { creado_en: string | null; propiedad_id: string | null }[]
  /** Fecha del primer evento guardado, de siempre. */
  inicioEventos: string | null
}

export type Linea = { anterior: (number | null)[]; actual: (number | null)[] }

export type Kpi = {
  clave: 'publicadas' | 'leads' | 'conversion' | 'mercado'
  valor: number | null
  formato: 'entero' | 'porcentaje' | 'dias'
  /** null: este indicador es una foto de hoy y no se compara. */
  variacion: Variacion | null
  nota: string
  linea: Linea | null
}

export type PasoInteraccion = { clave: 'vistas' | 'favoritos' | 'solicitudes'; etiqueta: string; n: number; pct: number | null }
export type PuntoTendencia = { clave: string; etiqueta: string; vistas: number; leads: number }
export type ZonaBuscada = { zona: string; busquedas: number; activas: number }
export type PuntoMapa = { id: string; nombre: string; folio: string; lat: number; lng: number; vistas: number; solicitudes: number }

export type Resumen = {
  kpis: Kpi[]
  interaccion: PasoInteraccion[]
  tendencia: PuntoTendencia[]
  agrupacion: ReturnType<typeof agrupacionDe>
  inventario: { porciones: Porcion[]; total: number }
  zonas: ZonaBuscada[]
  mapa: { puntos: PuntoMapa[]; sinCoordenadas: number }
  historial: { eventos: boolean; contactos: boolean }
}

const N_TRAMOS = 12

function coordenada(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n !== 0 ? n : null
}

function primeraFecha(fechas: (string | null | undefined)[]): string | null {
  let min: number | null = null
  for (const f of fechas) {
    const t = f ? Date.parse(f) : NaN
    if (Number.isFinite(t) && (min === null || t < min)) min = t
  }
  return min === null ? null : new Date(min).toISOString()
}

/** Tasa acumulada tramo a tramo: cuántas solicitudes por cada vista hasta ese punto. */
function tasaAcumulada(partes: number[], bases: number[]): (number | null)[] {
  let p = 0
  let b = 0
  return partes.map((_, i) => {
    p += partes[i]
    b += bases[i]
    return tasa(p, b)
  })
}

/** Cuántas había publicadas al final de cada tramo, según su fecha de publicación. */
function existenciasPorTramo(fechas: string[], desde: Date, hasta: Date, n: number): number[] {
  const antes = fechas.filter((f) => Date.parse(f) < desde.getTime()).length
  return tramos(fechas, desde, hasta, n, true).map((c) => antes + c)
}

export function construirResumen(f: FuentesResumen, v: Ventana, ahora: Date): Resumen {
  const publicadas = f.propiedades.filter((p) => p.estado_pub === 'publicada')

  const vistas = f.eventos.filter((e) => e.nombre === 'property_view').map((e) => e.creado_en)
  const fechasContactos = f.contactos.map((c) => c.fecha)
  const fechasContactosPropiedad = f.contactos.filter((c) => c.propiedad_id).map((c) => c.fecha)

  const conHistorialEventos = hayHistorial(f.inicioEventos, v)
  const conHistorialContactos = hayHistorial(primeraFecha(fechasContactos), v)

  /* ── 1. Propiedades publicadas: foto de hoy ── */
  const fechasPublicacion = publicadas
    .map((p) => p.publicada_en ?? p.created_at ?? null)
    .filter((x): x is string => Boolean(x))
  const nuevas = contarEn(fechasPublicacion, v.desde, v.hasta)

  /* ── 2. Leads del período ── */
  const leadsActual = contarEn(fechasContactos, v.desde, v.hasta)
  const leadsAnterior = contarEn(fechasContactos, v.anteriorDesde, v.anteriorHasta)

  /* ── 3. Conversión: solicitudes sobre propiedades ÷ vistas de propiedades ── */
  const vistasActual = contarEn(vistas, v.desde, v.hasta)
  const vistasAnterior = contarEn(vistas, v.anteriorDesde, v.anteriorHasta)
  const solicitudesActual = contarEn(fechasContactosPropiedad, v.desde, v.hasta)
  const solicitudesAnterior = contarEn(fechasContactosPropiedad, v.anteriorDesde, v.anteriorHasta)
  const conversionActual = tasa(solicitudesActual, vistasActual)
  const conversionAnterior = tasa(solicitudesAnterior, vistasAnterior)

  /* ── 4. Días en el mercado: foto de hoy ── */
  const dias = fechasPublicacion.map((fecha) => Math.max(0, Math.floor((ahora.getTime() - Date.parse(fecha)) / 86_400_000)))
  const promedioDias = dias.length > 0 ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null

  const kpis: Kpi[] = [
    {
      clave: 'publicadas',
      valor: publicadas.length,
      formato: 'entero',
      variacion: null,
      nota: nuevas === 1 ? '1 publicada en el período' : `${nuevas} publicadas en el período`,
      linea: {
        anterior: existenciasPorTramo(fechasPublicacion, v.anteriorDesde, v.anteriorHasta, N_TRAMOS),
        actual: existenciasPorTramo(fechasPublicacion, v.desde, v.hasta, N_TRAMOS),
      },
    },
    {
      clave: 'leads',
      valor: leadsActual,
      formato: 'entero',
      variacion: variacionPorcentual(leadsActual, leadsAnterior, conHistorialContactos),
      nota: 'vs. período anterior',
      linea: {
        anterior: tramos(fechasContactos, v.anteriorDesde, v.anteriorHasta, N_TRAMOS),
        actual: tramos(fechasContactos, v.desde, v.hasta, N_TRAMOS),
      },
    },
    {
      clave: 'conversion',
      valor: conversionActual,
      formato: 'porcentaje',
      variacion: variacionEnPuntos(conversionActual, conversionAnterior, conHistorialEventos),
      nota: 'vs. período anterior',
      linea: {
        anterior: tasaAcumulada(
          tramos(fechasContactosPropiedad, v.anteriorDesde, v.anteriorHasta, N_TRAMOS),
          tramos(vistas, v.anteriorDesde, v.anteriorHasta, N_TRAMOS),
        ),
        actual: tasaAcumulada(
          tramos(fechasContactosPropiedad, v.desde, v.hasta, N_TRAMOS),
          tramos(vistas, v.desde, v.hasta, N_TRAMOS),
        ),
      },
    },
    {
      clave: 'mercado',
      valor: promedioDias,
      formato: 'dias',
      variacion: null,
      nota: publicadas.length === 1 ? 'promedio de 1 publicada' : `promedio de ${publicadas.length} publicadas`,
      linea: null,
    },
  ]

  /* ── Interacción del período ── */
  const favoritosActual = contarEn(f.favoritos.map((x) => x.creado_en), v.desde, v.hasta)
  const interaccion: PasoInteraccion[] = [
    { clave: 'vistas', etiqueta: 'Vistas de propiedades', n: vistasActual, pct: vistasActual > 0 ? 100 : null },
    { clave: 'favoritos', etiqueta: 'Guardados en favoritos', n: favoritosActual, pct: tasa(favoritosActual, vistasActual) },
    { clave: 'solicitudes', etiqueta: 'Solicitudes de contacto', n: solicitudesActual, pct: tasa(solicitudesActual, vistasActual) },
  ]

  /* ── Tendencia: vistas y leads por día, semana o mes ── */
  const agrupacion = agrupacionDe(v.periodo)
  const puntos = new Map<string, PuntoTendencia>()
  for (const clave of clavesDeVentana(v.desde, v.hasta, agrupacion)) {
    puntos.set(clave, { clave, etiqueta: etiquetaGrupo(clave, agrupacion), vistas: 0, leads: 0 })
  }
  for (const fecha of vistas) {
    if (!enVentana(fecha, v.desde, v.hasta)) continue
    const p = puntos.get(claveGrupo(fecha, agrupacion))
    if (p) p.vistas++
  }
  for (const fecha of fechasContactos) {
    if (!enVentana(fecha, v.desde, v.hasta)) continue
    const p = puntos.get(claveGrupo(fecha as string, agrupacion))
    if (p) p.leads++
  }

  /* ── Zonas buscadas en el período ── */
  const busquedas = f.eventos
    .filter((e) => e.nombre === 'search_performed' && enVentana(e.creado_en, v.desde, v.hasta))
    .map((e) => ({ sesion: e.sesion, zona: typeof e.datos?.zona === 'string' ? (e.datos.zona as string) : null, creado: e.creado_en }))
  const ubicaciones = publicadas.map((p) => claveDeZona(p.ubicacion ?? ''))
  const zonas: ZonaBuscada[] = zonasBuscadas(busquedas, 6).map(([zona, n]) => {
    const clave = claveDeZona(zona)
    return { zona, busquedas: n, activas: ubicaciones.filter((u) => u.includes(clave)).length }
  })

  /* ── Mapa: dónde está lo que se mira ── */
  const vistasPorPropiedad = new Map<string, number>()
  for (const e of f.eventos) {
    if (e.nombre !== 'property_view' || !e.propiedad_id || !enVentana(e.creado_en, v.desde, v.hasta)) continue
    vistasPorPropiedad.set(e.propiedad_id, (vistasPorPropiedad.get(e.propiedad_id) ?? 0) + 1)
  }
  const solicitudesPorPropiedad = new Map<string, number>()
  for (const c of f.contactos) {
    if (!c.propiedad_id || !enVentana(c.fecha, v.desde, v.hasta)) continue
    solicitudesPorPropiedad.set(c.propiedad_id, (solicitudesPorPropiedad.get(c.propiedad_id) ?? 0) + 1)
  }
  const puntosMapa: PuntoMapa[] = []
  let sinCoordenadas = 0
  for (const p of publicadas) {
    const lat = coordenada(p.lat)
    const lng = coordenada(p.lng)
    if (lat === null || lng === null) {
      sinCoordenadas++
      continue
    }
    puntosMapa.push({
      id: p.id,
      nombre: nombreDe(p),
      folio: p.folio ?? '',
      lat,
      lng,
      vistas: vistasPorPropiedad.get(p.id) ?? 0,
      solicitudes: solicitudesPorPropiedad.get(p.id) ?? 0,
    })
  }

  const porciones = composicionInventario(f.propiedades)

  return {
    kpis,
    interaccion,
    tendencia: [...puntos.values()],
    agrupacion,
    inventario: { porciones, total: porciones.reduce((s, x) => s + x.n, 0) },
    zonas,
    mapa: { puntos: puntosMapa, sinCoordenadas },
    historial: { eventos: conHistorialEventos, contactos: conHistorialContactos },
  }
}
