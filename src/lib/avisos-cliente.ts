import { aHref, coincide, describir, type Filtros } from './busquedas'
import { rutaDe } from './propiedad-publica'
import { disponible } from './portal/pantallas'
import type { FilaPropiedadPortal } from './portal/tarjeta'

/**
 * Avisos al cliente (28-oct-2026): el motor de las ALERTAS con entrega real. Código puro (sin base ni red): decide QUÉ avisar y CUÁNDO; el servidor lo guarda y lo envía.
 *
 * Cómo lo hacen las inmobiliarias grandes (Inmuebles24, Zillow, Redfin): una búsqueda guardada es una suscripción con frecuencia (inmediata, diaria, semanal);
 * se avisa SOLO de lo que cumple los filtros y salió DESPUÉS del último aviso; varios hallazgos viajan en UN correo (resumen), nunca uno por propiedad; todo correo lleva
 * baja en un clic; y el correo es opcional y se consiente (aquí nace APAGADO). Además: aviso de cambio de Términos/Privacidad (obligación de transparencia).
 *
 * Reglas propias:
 *  · «Nuevo» = disponible, coincide con los filtros y apareció después de max(último aviso, fecha en que se guardó la búsqueda). Lo anterior a guardar la búsqueda NO es nuevo.
 *  · Cada (búsqueda, propiedad) se avisa UNA sola vez: la clave de la notificación es única, así que repetir la tarea no duplica nada.
 *  · Semanal = a lo sumo cada 6 días y medio (la tarea corre cada día; un margen evita que un retraso de minutos se salte la semana).
 */

export type FrecuenciaAviso = 'diaria' | 'semanal'

export type BusquedaParaAviso = {
  id: number
  uid: string
  nombre: string | null
  filtros: Filtros
  alertas: boolean
  frecuencia: FrecuenciaAviso
  creado_en: string
  avisada_en: string | null
}

export type NotificacionNueva = {
  uid: string
  tipo: 'busqueda_nueva' | 'legal' | 'baja_de_precio'
  titulo: string
  cuerpo: string
  enlace: string
  busqueda_id: number | null
  propiedad_id: string | null
  clave: string
}

const DIA = 86_400_000
const SEMANA_CON_MARGEN = 6.5 * DIA
const ms = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : 0 }
const cuando = (p: FilaPropiedadPortal) => ms(p.publicada_en) || ms(p.created_at)

/** ¿Hoy toca revisar esta búsqueda? Diaria: siempre que la tarea corra. Semanal: si nunca se avisó o pasaron ~7 días. */
export function tocaAvisar(b: Pick<BusquedaParaAviso, 'frecuencia' | 'alertas' | 'avisada_en'>, ahora: number): boolean {
  if (!b.alertas) return false
  if (b.frecuencia === 'semanal') return !b.avisada_en || ahora - ms(b.avisada_en) >= SEMANA_CON_MARGEN
  return true
}

/** Lo que apareció para esta búsqueda desde el último aviso (o desde que se guardó), de más nuevo a más viejo. */
export function nuevasParaAviso(b: BusquedaParaAviso, propiedades: FilaPropiedadPortal[]): FilaPropiedadPortal[] {
  const desde = Math.max(ms(b.avisada_en), ms(b.creado_en))
  return propiedades
    .filter((p) => disponible(p) && p.estado_pub === 'publicada' && coincide(p, b.filtros) && cuando(p) > desde)
    .sort((a, c) => cuando(c) - cuando(a))
}

export const claveDeBusqueda = (busquedaId: number, propiedadId: string) => `busqueda:${busquedaId}:prop:${propiedadId}`

const pesos = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? `$${Math.round(n).toLocaleString('es-MX')}` : null)
const TIPO: Record<string, string> = { casa: 'Casa', departamento: 'Departamento', depto: 'Departamento', terreno: 'Terreno', nave: 'Nave industrial', bodega: 'Bodega', local: 'Local', comercial: 'Local comercial', oficina: 'Oficina' }

/** Una notificación por propiedad nueva (la bandeja las junta por búsqueda; el correo, en un solo resumen). */
export function notificacionesDeBusqueda(b: BusquedaParaAviso, nuevas: FilaPropiedadPortal[]): NotificacionNueva[] {
  const nombre = (b.nombre ?? '').trim() || describir(b.filtros)
  return nuevas.map((p) => {
    const que = `${TIPO[p.tipo ?? ''] ?? 'Propiedad'} en ${p.operacion === 'renta' ? 'renta' : 'venta'}`
    const lugar = [p.colonia, p.ciudad].filter(Boolean).join(', ')
    const datos = [pesos(p.precio), lugar].filter(Boolean).join(' · ')
    return {
      uid: b.uid, tipo: 'busqueda_nueva' as const,
      titulo: `Nueva para «${nombre}»: ${que}`.slice(0, 160),
      cuerpo: [(p.titulo ?? '').trim(), datos].filter(Boolean).join(' — ').slice(0, 600),
      enlace: rutaDe(p), busqueda_id: b.id, propiedad_id: p.id, clave: claveDeBusqueda(b.id, p.id),
    }
  })
}

// ── Cambio de Términos / Aviso de Privacidad ────────────────────────────────────────────

export type VersionesLegales = Readonly<Record<string, string>>
export type AceptacionAnterior = { uid: string; documento: string; version: string }
const NOMBRE_LEGAL: Record<string, string> = { terminos: 'Términos y Condiciones', privacidad: 'Aviso de Privacidad' }
const RUTA_LEGAL: Record<string, string> = { terminos: '/terminos', privacidad: '/privacidad' }

/**
 * A quien YA había aceptado una versión anterior de un documento se le avisa de la nueva (una vez por versión). Quien nunca lo aceptó no recibe nada: no hay cambio que
 * notificarle. `aceptadas` trae todas las aceptaciones; si el cliente ya aceptó la vigente, no se le avisa.
 */
export function notificacionesLegales(vigentes: VersionesLegales, aceptadas: AceptacionAnterior[]): NotificacionNueva[] {
  const porPersona = new Map<string, Map<string, Set<string>>>()
  for (const a of aceptadas) {
    if (!(a.documento in vigentes)) continue
    const docs = porPersona.get(a.uid) ?? new Map<string, Set<string>>()
    const vers = docs.get(a.documento) ?? new Set<string>()
    vers.add(a.version); docs.set(a.documento, vers); porPersona.set(a.uid, docs)
  }
  const salida: NotificacionNueva[] = []
  for (const [uid, docs] of porPersona) {
    for (const [documento, versiones] of docs) {
      const vigente = vigentes[documento]
      if (versiones.has(vigente)) continue // ya aceptó la nueva
      const nombre = NOMBRE_LEGAL[documento] ?? documento
      salida.push({
        uid, tipo: 'legal', titulo: `Actualizamos el ${nombre}`,
        cuerpo: `El ${nombre} cambió (versión ${vigente}). Léelo para ver qué cambió; seguir usando Vive Bien después de leerlo es aceptarlo.`,
        enlace: RUTA_LEGAL[documento] ?? '/terminos', busqueda_id: null, propiedad_id: null, clave: `legal:${documento}:${vigente}`,
      })
    }
  }
  return salida
}

// ── Correo ───────────────────────────────────────────────────────────────────────────────

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
export type GrupoDeCorreo = { busquedaNombre: string; href: string; items: Array<{ titulo: string; cuerpo: string; url: string }> }

/** Resumen de alertas en UN correo: agrupado por búsqueda, con enlace a cada propiedad, baja en un clic y la razón por la que se recibe. Todo escapado. */
export function correoDeAlertas(o: { nombre?: string | null; grupos: GrupoDeCorreo[]; sitio: string; urlBaja: string; urlPreferencias: string }): { asunto: string; texto: string; html: string } {
  const total = o.grupos.reduce((n, g) => n + g.items.length, 0)
  const saludo = o.nombre?.trim() ? `Hola ${o.nombre.trim()}:` : 'Hola:'
  const asunto = total === 1 ? 'Hay 1 propiedad nueva para tu búsqueda en Vive Bien' : `Hay ${total} propiedades nuevas para tus búsquedas en Vive Bien`
  const pie = 'Recibes este correo porque activaste los avisos de tus búsquedas guardadas en Vive Bien.'
  const texto = [saludo, '', asunto + '.', '',
    ...o.grupos.flatMap((g) => [`Búsqueda: ${g.busquedaNombre}`, ...g.items.map((i) => `  · ${i.titulo}\n    ${i.cuerpo}\n    ${i.url}`), '']),
    pie, `Cambiar tus avisos: ${o.urlPreferencias}`, `Dejar de recibirlos con un clic: ${o.urlBaja}`].join('\n')
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1a1a1a">
  <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5b6472;margin:0 0 4px">Tus búsquedas guardadas</p>
  <h2 style="margin:0 0 12px;color:#971010;font-size:20px">${escapar(asunto)}</h2>
  <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapar(saludo)}</p>
  ${o.grupos.map((g) => `
  <h3 style="font-size:15px;margin:18px 0 6px;color:#1b365d">${escapar(g.busquedaNombre)}</h3>
  ${g.items.map((i) => `<div style="border:1px solid #ece8e1;border-radius:12px;padding:12px 14px;margin:0 0 8px">
    <a href="${escapar(i.url)}" style="color:#971010;font-weight:700;text-decoration:none;font-size:14px">${escapar(i.titulo)}</a>
    <div style="font-size:13px;color:#4b5563;margin-top:4px">${escapar(i.cuerpo)}</div>
  </div>`).join('')}`).join('')}
  <p style="font-size:12px;line-height:1.6;color:#5b6472;margin:22px 0 0">${escapar(pie)}
    <a href="${escapar(o.urlPreferencias)}" style="color:#1b365d">Cambiar mis avisos</a> ·
    <a href="${escapar(o.urlBaja)}" style="color:#1b365d">Dejar de recibirlos</a></p>
</div>`
  return { asunto, texto, html }
}

/** Correo de cambio de Términos o Aviso de Privacidad (servicio, no publicidad: no depende del consentimiento de alertas). */
export function correoLegal(o: { nombre?: string | null; avisos: NotificacionNueva[]; sitio: string; urlPreferencias: string }): { asunto: string; texto: string; html: string } {
  const saludo = o.nombre?.trim() ? `Hola ${o.nombre.trim()}:` : 'Hola:'
  const asunto = o.avisos.length === 1 ? o.avisos[0].titulo : 'Actualizamos nuestros documentos legales'
  const texto = [saludo, '', ...o.avisos.flatMap((a) => [a.titulo, a.cuerpo, `${o.sitio}${a.enlace}`, '']), `Tus preferencias de aviso: ${o.urlPreferencias}`].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1a1a1a"><h2 style="margin:0 0 12px;color:#971010;font-size:20px">${escapar(asunto)}</h2><p style="font-size:14px;margin:0 0 12px">${escapar(saludo)}</p>${o.avisos.map((a) => `<p style="font-size:14px;line-height:1.6;margin:0 0 10px"><strong>${escapar(a.titulo)}.</strong> ${escapar(a.cuerpo)} <a href="${escapar(o.sitio + a.enlace)}" style="color:#971010">Leerlo</a></p>`).join('')}<p style="font-size:12px;color:#5b6472;margin:18px 0 0">Te lo enviamos porque modifica las condiciones de tu cuenta. <a href="${escapar(o.urlPreferencias)}" style="color:#1b365d">Tus preferencias de aviso</a></p></div>`
  return { asunto, texto, html }
}

export { aHref }

/**
 * Correo de BAJA DE PRECIO (28-oct-2026): UNO por persona y corrida, con todas las propiedades que bajaron. Solo se manda a quien lo activó en «Configuración» (consentimiento PROPIO, apagado
 * por defecto: `correo_precio`), con enlace para dejar de recibirlo con un clic y el motivo por el que se recibe. Lleva el precio de antes y de ahora ya escritos en el aviso (`cuerpo`). Todo escapado.
 */
export function correoDeBajaDePrecio(o: { nombre?: string | null; avisos: NotificacionNueva[]; sitio: string; urlBaja: string; urlPreferencias: string }): { asunto: string; texto: string; html: string } {
  const saludo = o.nombre?.trim() ? `Hola ${o.nombre.trim()}:` : 'Hola:'
  const asunto = o.avisos.length === 1 ? o.avisos[0].titulo : `Bajaron de precio ${o.avisos.length} propiedades que sigues en Vive Bien`
  const pie = 'Recibes este correo porque pulsaste «Avisarme cuando baje de precio» en esas propiedades y activaste los avisos de baja de precio por correo.'
  const texto = [saludo, '', asunto + '.', '', ...o.avisos.flatMap((a) => [`· ${a.titulo}`, `  ${a.cuerpo}`, `  ${o.sitio}${a.enlace}`, '']), pie, `Cambiar tus avisos: ${o.urlPreferencias}`, `Dejar de recibirlos con un clic: ${o.urlBaja}`].join('\n')
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1a1a1a">
  <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5b6472;margin:0 0 4px">Baja de precio</p>
  <h2 style="margin:0 0 12px;color:#971010;font-size:20px">${escapar(asunto)}</h2>
  <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapar(saludo)}</p>
  ${o.avisos.map((a) => `<div style="border:1px solid #ece8e1;border-radius:12px;padding:12px 14px;margin:0 0 8px">
    <a href="${escapar(o.sitio + a.enlace)}" style="color:#971010;font-weight:700;text-decoration:none;font-size:14px">${escapar(a.titulo)}</a>
    <div style="font-size:13px;color:#4b5563;margin-top:4px">${escapar(a.cuerpo)}</div>
  </div>`).join('')}
  <p style="font-size:12px;line-height:1.6;color:#5b6472;margin:22px 0 0">${escapar(pie)}
    <a href="${escapar(o.urlPreferencias)}" style="color:#1b365d">Cambiar mis avisos</a> ·
    <a href="${escapar(o.urlBaja)}" style="color:#1b365d">Dejar de recibirlos</a></p>
</div>`
  return { asunto, texto, html }
}
