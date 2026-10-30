import { nombreDe } from './propiedad-publica'
import type { FilaContacto, FilaEvento, FilaPropiedad } from './analitica'

/**
 * Rendimiento de CADA propiedad (24-oct-2026): cuánta gente la ve, la elige en el catálogo y se comunica, con el cambio contra el periodo anterior y
 * una señal en palabras de qué revisar. Funciones puras: la ruta trae las filas y esto las convierte; cada regla se prueba con datos de ejemplo.
 *
 * REGLAS DE HONESTIDAD:
 *  · Con muy pocos datos en todo el sitio NO se dan diagnósticos («pocos_datos»): una señal segura sobre 6 visitas es ruido que parece información.
 *  · Los números son tal como se registraron: «vistas» es una por persona/sesión (la base lo deduplica), los clics de contacto son los que se midieron
 *    desde la tarjeta o la ficha; no se infiere nada que no se haya registrado.
 */

export type Senal = 'pocos_datos' | 'sin_vistas' | 'sin_contacto' | 'poca_visibilidad' | 'bien' | 'nueva' | 'sin_publicar'

export type FilaPropiedadMetricas = FilaPropiedad & { vistas?: number | null }

export type RendimientoPropiedad = {
  id: string
  folio: string
  nombre: string
  tipo: string
  operacion: string
  /** Estado de publicación: `publicada`, `borrador`, `en_revision`… */
  estado: string
  precio: number | null
  diasPublicada: number | null
  vistas: number
  vistasAnteriores: number
  /** Cambio de las vistas contra el periodo anterior, en %. `null` si antes no había vistas (no se puede dividir). */
  cambioVistas: number | null
  tarjeta: number
  /** Veces que se compartió (hoja nativa del teléfono o enlace copiado). */
  compartidas: number
  compartidasNativo: number
  compartidasCopiado: number
  /** Solo con datos de citas (cuentas que atienden citas): citas pedidas, confirmadas y ya hechas. 0 si no se pasaron citas. */
  citas: number
  citasConfirmadas: number
  citasCompletadas: number
  whatsapp: number
  telefono: number
  correo: number
  /** Clics de contacto (WhatsApp + teléfono + correo) medidos desde la tarjeta o la ficha. */
  contactos: number
  solicitudes: number
  guardadas: number
  /** Contactos (clics + solicitudes) por cada 100 vistas. `null` si no hay vistas. */
  contactosPor100: number | null
  vistasHistorico: number
  senal: Senal
}

/** Texto de cada señal (lo que se le dice a la persona). */
export const TEXTO_SENAL: Record<Senal, string> = {
  sin_publicar: 'Aún no está publicada',
  pocos_datos: 'Pocos datos todavía',
  nueva: 'Publicada hace poco',
  sin_vistas: 'Sin vistas: revisar portada y título',
  sin_contacto: 'Muchas vistas, sin contacto: revisar precio o fotos',
  poca_visibilidad: 'Pocas vistas frente al resto',
  bien: 'Va bien',
}

const MIN_VISTAS_SITIO = 20      // por debajo, ninguna propiedad recibe diagnóstico
const MIN_VISTAS_SIN_CONTACTO = 10
const DIAS_NUEVA = 7
const DIAS_VISIBILIDAD = 14

const ahora = (f: Date) => f.getTime()
function mediana(n: number[]): number {
  if (n.length === 0) return 0
  const s = [...n].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const numeroOnulo = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null }

export function rendimientoPorPropiedad(entrada: {
  eventos: FilaEvento[]              // periodo actual
  eventosAnteriores: FilaEvento[]    // el periodo de la misma duración justo antes
  props: FilaPropiedadMetricas[]
  contactos: FilaContacto[]          // leads + solicitudes DEL periodo actual
  citas?: Array<{ propiedad_id: string | null; estado: string }>   // solo para cuentas con la capacidad de recibir citas
  favoritos: { propiedad_id: string | null }[]
  hoy: Date
  /** `true` incluye TODAS las de `props` (el publicador ve también sus borradores); por defecto solo las publicadas o con actividad. */
  todas?: boolean
}): RendimientoPropiedad[] {
  const { eventos, eventosAnteriores, props, contactos, favoritos, hoy, todas, citas } = entrada

  type Cuenta = { vistas: number; tarjeta: number; whatsapp: number; telefono: number; correo: number; nativo: number; copiado: number }
  const vacio = (): Cuenta => ({ vistas: 0, tarjeta: 0, whatsapp: 0, telefono: 0, correo: 0, nativo: 0, copiado: 0 })
  const por = new Map<string, Cuenta>()
  const dame = (id: string) => { let c = por.get(id); if (!c) { c = vacio(); por.set(id, c) } return c }
  for (const e of eventos) {
    if (!e.propiedad_id) continue
    if (e.nombre === 'property_view') dame(e.propiedad_id).vistas++
    else if (e.nombre === 'property_card_click') dame(e.propiedad_id).tarjeta++
    else if (e.nombre === 'property_share') {
      const canal = String((e.datos as Record<string, unknown> | null)?.canal ?? '')
      const c = dame(e.propiedad_id)
      if (canal === 'nativo') c.nativo++; else if (canal === 'copiado') c.copiado++
    }
    else if (e.nombre === 'property_contact_click') {
      const canal = String((e.datos as Record<string, unknown> | null)?.canal ?? '')
      const c = dame(e.propiedad_id)
      if (canal === 'whatsapp') c.whatsapp++; else if (canal === 'telefono') c.telefono++; else if (canal === 'correo') c.correo++
    }
  }
  const antes = new Map<string, number>()
  for (const e of eventosAnteriores) if (e.nombre === 'property_view' && e.propiedad_id) antes.set(e.propiedad_id, (antes.get(e.propiedad_id) ?? 0) + 1)
  const solicitudes = new Map<string, number>()
  for (const c of contactos) if (c.propiedad_id) solicitudes.set(c.propiedad_id, (solicitudes.get(c.propiedad_id) ?? 0) + 1)
  const citasPor = new Map<string, { total: number; confirmadas: number; completadas: number }>()
  for (const c of citas ?? []) {
    if (!c.propiedad_id) continue
    const x = citasPor.get(c.propiedad_id) ?? { total: 0, confirmadas: 0, completadas: 0 }
    x.total++
    if (c.estado === 'CONFIRMED' || c.estado === 'RESCHEDULED') x.confirmadas++
    if (c.estado === 'COMPLETED') x.completadas++
    citasPor.set(c.propiedad_id, x)
  }
  const guardadas = new Map<string, number>()
  for (const f of favoritos) if (f.propiedad_id) guardadas.set(f.propiedad_id, (guardadas.get(f.propiedad_id) ?? 0) + 1)

  // Solo las publicadas, y cualquiera con actividad en el periodo (una pausada que aún recibe visitas importa).
  const visibles = todas ? props : props.filter((p) => p.estado_pub === 'publicada' || por.has(p.id))
  const vistasSitio = visibles.reduce((s, p) => s + (por.get(p.id)?.vistas ?? 0), 0)
  // La mediana se calcula entre las publicadas: un borrador sin vistas no debe bajar la vara de las demás.
  const med = mediana(visibles.filter((p) => p.estado_pub === 'publicada').map((p) => por.get(p.id)?.vistas ?? 0).filter((v) => v > 0))

  const filas = visibles.map((p): RendimientoPropiedad => {
    const c = por.get(p.id) ?? vacio()
    const previo = antes.get(p.id) ?? 0
    const publicada = p.publicada_en || p.created_at
    const dias = publicada ? Math.max(0, Math.floor((ahora(hoy) - Date.parse(publicada)) / 86_400_000)) : null
    const contactosClic = c.whatsapp + c.telefono + c.correo
    const sol = solicitudes.get(p.id) ?? 0
    const total = contactosClic + sol

    let senal: Senal
    if (p.estado_pub && p.estado_pub !== 'publicada') senal = 'sin_publicar'
    else if (vistasSitio < MIN_VISTAS_SITIO) senal = 'pocos_datos'
    else if (dias != null && dias < DIAS_NUEVA) senal = 'nueva'
    else if (c.vistas === 0) senal = 'sin_vistas'
    else if (c.vistas >= MIN_VISTAS_SIN_CONTACTO && total === 0) senal = 'sin_contacto'
    else if (c.vistas < med / 2 && (dias == null || dias >= DIAS_VISIBILIDAD)) senal = 'poca_visibilidad'
    else senal = 'bien'

    return {
      id: p.id, folio: (p.folio ?? '').trim(), nombre: nombreDe(p), tipo: p.tipo ?? '', operacion: p.operacion ?? '', estado: p.estado_pub ?? '',
      precio: numeroOnulo(p.precio), diasPublicada: dias,
      vistas: c.vistas, vistasAnteriores: previo,
      cambioVistas: previo > 0 ? Math.round(((c.vistas - previo) / previo) * 100) : null,
      tarjeta: c.tarjeta, compartidas: c.nativo + c.copiado, compartidasNativo: c.nativo, compartidasCopiado: c.copiado,
      citas: citasPor.get(p.id)?.total ?? 0, citasConfirmadas: citasPor.get(p.id)?.confirmadas ?? 0, citasCompletadas: citasPor.get(p.id)?.completadas ?? 0,
      whatsapp: c.whatsapp, telefono: c.telefono, correo: c.correo, contactos: contactosClic,
      solicitudes: sol, guardadas: guardadas.get(p.id) ?? 0,
      contactosPor100: c.vistas > 0 ? Math.round((total / c.vistas) * 1000) / 10 : null,
      vistasHistorico: Math.max(0, Number(p.vistas ?? 0) || 0),
      senal,
    }
  })
  return filas.sort((a, b) => b.vistas - a.vistas || b.tarjeta - a.tarjeta || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Totales del sitio y el embudo vistas → contacto, para la fila de arriba de la tabla. */
export function totalesDe(filas: RendimientoPropiedad[]) {
  const t = filas.reduce((s, f) => ({ vistas: s.vistas + f.vistas, tarjeta: s.tarjeta + f.tarjeta, compartidas: s.compartidas + f.compartidas, citas: s.citas + f.citas, contactos: s.contactos + f.contactos, solicitudes: s.solicitudes + f.solicitudes, sinVistas: s.sinVistas + (f.vistas === 0 ? 1 : 0) }), { vistas: 0, tarjeta: 0, compartidas: 0, citas: 0, contactos: 0, solicitudes: 0, sinVistas: 0 })
  return { ...t, propiedades: filas.length, contactosPor100: t.vistas > 0 ? Math.round(((t.contactos + t.solicitudes) / t.vistas) * 1000) / 10 : null }
}
