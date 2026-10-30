import { coincide, plano, type Filtros } from '../busquedas'
import { aTarjeta, datosTarjeta, lugarTarjeta, type FilaPropiedadPortal } from '../portal/tarjeta'
import { fotoOptimizada } from '../medios/optimizar'
import { urlDe } from '../sitio'
import { CORREO } from './config'
import { TIPOS_RECOMENDACION } from './constantes'
import type { TarjetaCorreo } from './plantillas/marca'

/**
 * Qué propiedades se recomiendan a quién (D-80). Funciones puras sobre las filas REALES del catálogo: nada se inventa.
 *
 * Una propiedad sólo entra si está publicada y disponible (`coincide` ya descarta pausadas, vendidas, rentadas y eliminadas)
 * y se ajusta a lo que la persona dijo buscar. No se repiten las de los últimos envíos. Si no queda ninguna, NO se manda
 * correo: la frecuencia de tres días es un máximo, no una obligación.
 */

export type Preferencias = {
  operacion?: 'venta' | 'renta' | null
  tipos?: string[] | null
  zonas?: string[] | null
  presupuestoMax?: number | null
}

const LIMPIO = (xs: unknown): string[] =>
  Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 60)).slice(0, 8) : []

/** Preferencias guardadas (JSON de la base) → forma segura. Cualquier cosa rara se ignora. */
export function leerPreferencias(crudo: unknown): Preferencias {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  const pm = Number(o.presupuestoMax)
  return {
    operacion: o.operacion === 'venta' || o.operacion === 'renta' ? o.operacion : null,
    tipos: LIMPIO(o.tipos),
    zonas: LIMPIO(o.zonas),
    presupuestoMax: Number.isFinite(pm) && pm > 0 ? Math.round(pm) : null,
  }
}

/**
 * Valores iniciales del formulario a partir de la URL (`/recomendaciones?operacion=renta&tipo=casa,nave&zona=Centro&presupuesto=25000`).
 * Pasan por el MISMO filtro que las preferencias guardadas: un valor raro se descarta, nunca se pinta tal cual ni llega a una consulta.
 */
export function valoresInicialesDeUrl(q: Record<string, string | string[] | undefined>): { operacion: string; tipos: string[]; zona: string; presupuesto: string } {
  const uno = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').slice(0, 200)
  const pref = leerPreferencias({ operacion: uno(q.operacion), tipos: uno(q.tipo).split(','), zonas: [uno(q.zona)], presupuestoMax: uno(q.presupuesto) })
  return { operacion: pref.operacion ?? '', tipos: (pref.tipos ?? []).map((x) => (plano(x) === 'depto' ? 'departamento' : plano(x))).filter((x, i, a) => TIPOS_RECOMENDACION.some(([k]) => k === x) && a.indexOf(x) === i), zona: pref.zonas?.[0] ?? '', presupuesto: pref.presupuestoMax ? String(pref.presupuestoMax) : '' }
}

/** Una consulta por cada combinación tipo × zona (vacío = «cualquiera»), con la MISMA regla que el catálogo. */
function filtrosDe(p: Preferencias): Filtros[] {
  const tipos = p.tipos?.length ? p.tipos : [undefined]
  const zonas = p.zonas?.length ? p.zonas : [undefined]
  const out: Filtros[] = []
  for (const tipo of tipos) {
    for (const zona of zonas) {
      const f: Filtros = {}
      if (p.operacion) f.op = p.operacion
      if (tipo) f.tipo = plano(tipo) === 'depto' ? 'departamento' : plano(tipo)
      if (zona) f.zona = zona
      if (p.presupuestoMax) f.pmax = p.presupuestoMax
      out.push(f)
    }
  }
  return out
}

export const sinPreferencias = (p: Preferencias) => !p.operacion && !p.tipos?.length && !p.zonas?.length && !p.presupuestoMax

const fecha = (p: FilaPropiedadPortal) => Date.parse(p.publicada_en || p.created_at || '') || 0

export function elegirPropiedades(
  prefs: Preferencias,
  catalogo: FilaPropiedadPortal[],
  yaEnviadas: ReadonlySet<string>,
  max: number = CORREO.propiedadesPorCorreo,
): FilaPropiedadPortal[] {
  const filtros = filtrosDe(prefs)
  const elegidas: FilaPropiedadPortal[] = []
  const vistas = new Set<string>()
  const candidatas = catalogo
    .filter((p) => p.estado_pub === 'publicada' && !yaEnviadas.has(p.id))
    .sort((a, b) => fecha(b) - fecha(a))
  for (const p of candidatas) {
    if (vistas.has(p.id)) continue
    if (!filtros.some((f) => coincide(p, f))) continue
    vistas.add(p.id)
    elegidas.push(p)
    if (elegidas.length >= max) break
  }
  return elegidas
}

/** La foto de un correo: a 2× del ancho que se pinta (544 px), JPG (Outlook no entiende WebP/AVIF), recortada 16:9. */
export function fotoParaCorreo(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\//.test(url)) return null
  if (!url.includes('/image/upload/')) return url
  return fotoOptimizada(url, 1088).replace('f_auto,q_auto,w_1088', 'c_fill,w_1088,h_612,f_jpg,q_auto')
}

export function aTarjetaCorreo(p: FilaPropiedadPortal): TarjetaCorreo {
  const t = aTarjeta(p)
  return {
    titulo: t.titulo,
    url: urlDe(t.ruta),
    foto: fotoParaCorreo(p.fotos?.[0] ?? null),
    lugar: lugarTarjeta(p),
    precio: t.precio,
    etiqueta: [t.tipoEtiqueta, p.operacion === 'renta' ? 'En renta' : p.operacion === 'venta' ? 'En venta' : null].filter(Boolean).join(' · ') || null,
    datos: datosTarjeta(p),
  }
}

/** La frase que explica POR QUÉ se manda este correo (sin datos sensibles). */
export function motivoDe(prefs: Preferencias): string {
  if (sinPreferencias(prefs)) return 'Estas son las propiedades publicadas más recientes en VIVE BIEN.'
  const partes: string[] = []
  if (prefs.tipos?.length) partes.push(prefs.tipos.join(' o '))
  if (prefs.operacion) partes.push(prefs.operacion === 'renta' ? 'en renta' : 'en venta')
  if (prefs.zonas?.length) partes.push(`en ${prefs.zonas.join(' o ')}`)
  if (prefs.presupuestoMax) partes.push(`hasta $${new Intl.NumberFormat('es-MX').format(prefs.presupuestoMax)}`)
  return `Elegimos estas propiedades publicadas según lo que pediste: ${partes.join(', ')}.`
}

export function resumenDe(prefs: Preferencias): string {
  if (sinPreferencias(prefs)) return ''
  return motivoDe(prefs).replace(/^Elegimos estas propiedades publicadas según lo que pediste: /, '').replace(/\.$/, '')
}
