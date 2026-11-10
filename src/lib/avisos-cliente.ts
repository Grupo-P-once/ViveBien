import { aHref, coincide, describir, type Filtros } from './busquedas'
import { rutaDe } from './propiedad-publica'
import { disponible } from './portal/pantallas'
import type { FilaPropiedadPortal } from './portal/tarjeta'
import { filaTexto, marcoCorreo } from './correo/plantillas/bloques'
import { pieTexto } from './correo/plantillas/marca'

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
 * Aviso del cambio de Términos / Aviso de Privacidad (una vez por versión y por persona; la clave lo garantiza).
 *  · Con `cuentas` (decisión del dueño, 10-nov-2026): se avisa a TODA persona con cuenta creada, haya aceptado o no una versión anterior; solo se salta a quien YA aceptó la vigente.
 *  · Sin `cuentas` (comportamiento anterior): solo a quien había aceptado una versión anterior de ese documento.
 * `aceptadas` trae las aceptaciones registradas. Orden estable (por uid) para que las corridas sean reproducibles.
 */
export function notificacionesLegales(vigentes: VersionesLegales, aceptadas: AceptacionAnterior[], cuentas?: string[]): NotificacionNueva[] {
  const porPersona = new Map<string, Map<string, Set<string>>>()
  for (const a of aceptadas) {
    if (!(a.documento in vigentes)) continue
    const docs = porPersona.get(a.uid) ?? new Map<string, Set<string>>()
    const vers = docs.get(a.documento) ?? new Set<string>()
    vers.add(a.version); docs.set(a.documento, vers); porPersona.set(a.uid, docs)
  }
  if (cuentas) {
    // A todas las cuentas: cada documento vigente que la persona no haya aceptado ya en su versión vigente.
    for (const uid of cuentas) {
      const docs = porPersona.get(uid) ?? new Map<string, Set<string>>()
      for (const documento of Object.keys(vigentes)) if (!docs.has(documento)) docs.set(documento, new Set<string>())
      porPersona.set(uid, docs)
    }
  }
  const salida: NotificacionNueva[] = []
  const permitidas = cuentas ? new Set(cuentas) : null
  for (const uid of [...porPersona.keys()].sort()) {
    if (permitidas && !permitidas.has(uid)) continue
    const docs = porPersona.get(uid) as Map<string, Set<string>>
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
const ROJO = '#971010'
const filaDeAviso = (contenido: string) => `<tr><td class="mobile-pad" style="padding:4px 42px 14px;background:#FFFFFF">${contenido}</td></tr>`
const tarjetaDeAviso = (titulo: string, cuerpo: string, url: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;border:1px solid #E7E3DD"><tr><td style="padding:14px 16px"><a href="${escapar(url)}" target="_blank" style="font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:700;color:${ROJO};text-decoration:none">${escapar(titulo)}</a><p style="margin:5px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563">${escapar(cuerpo)}</p></td></tr></table>`
const enlacePie = (texto: string, url: string) => `<a href="${escapar(url)}" style="color:#66709F;text-decoration:underline">${escapar(texto)}</a>`
export type GrupoDeCorreo = { busquedaNombre: string; href: string; items: Array<{ titulo: string; cuerpo: string; url: string }> }

/** Resumen de alertas en UN correo: agrupado por búsqueda, con enlace a cada propiedad, baja en un clic y la razón por la que se recibe. Todo escapado. */
export function correoDeAlertas(o: { nombre?: string | null; grupos: GrupoDeCorreo[]; sitio: string; urlBaja: string; urlPreferencias: string }): { asunto: string; texto: string; html: string } {
  const total = o.grupos.reduce((n, g) => n + g.items.length, 0)
  const saludo = o.nombre?.trim() ? `Hola ${o.nombre.trim()}:` : 'Hola:'
  const asunto = total === 1 ? 'Hay 1 propiedad nueva para tu búsqueda en Vive Bien' : `Hay ${total} propiedades nuevas para tus búsquedas en Vive Bien`
  const pie = 'Recibes este correo porque activaste los avisos de tus búsquedas guardadas en Vive Bien.'
  const texto = [saludo, '', asunto + '.', '',
    ...o.grupos.flatMap((g) => [`Búsqueda: ${g.busquedaNombre}`, ...g.items.map((i) => `  · ${i.titulo}\n    ${i.cuerpo}\n    ${i.url}`), '']),
    pie, `Cambiar tus avisos: ${o.urlPreferencias}`, `Dejar de recibirlos con un clic: ${o.urlBaja}`].join('\n') + pieTexto()
  const filas = filaTexto({ kicker: 'Tus búsquedas guardadas', titulo: asunto, parrafos: [escapar(saludo)] }) +
    o.grupos.map((g) => filaDeAviso(`<h3 style="margin:8px 0 8px;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:21px;color:#66709F">${escapar(g.busquedaNombre)}</h3>` + g.items.map((i) => tarjetaDeAviso(i.titulo, i.cuerpo, i.url)).join(''))).join('')
  const html = marcoCorreo({ preheader: 'Encontramos propiedades nuevas que coinciden con tus búsquedas guardadas.', filas, avisoPropiedades: false,
    pie: `${escapar(pie)} ${enlacePie('Cambiar mis avisos', o.urlPreferencias)} · ${enlacePie('Dejar de recibirlos', o.urlBaja)}` })
  return { asunto, texto, html }
}

/** Correo de cambio de Términos o Aviso de Privacidad (servicio, no publicidad: no depende del consentimiento de alertas). */
export function correoLegal(o: { nombre?: string | null; avisos: NotificacionNueva[]; sitio: string; urlPreferencias: string }): { asunto: string; texto: string; html: string } {
  const saludo = o.nombre?.trim() ? `Hola ${o.nombre.trim()}:` : 'Hola:'
  const asunto = o.avisos.length === 1 ? o.avisos[0].titulo : 'Actualizamos nuestros documentos legales'
  const texto = [saludo, '', ...o.avisos.flatMap((a) => [a.titulo, a.cuerpo, `${o.sitio}${a.enlace}`, '']), `Tus preferencias de aviso: ${o.urlPreferencias}`].join('\n') + pieTexto()
  const filas = filaTexto({ kicker: 'Aviso importante', titulo: asunto, parrafos: [escapar(saludo)] }) +
    o.avisos.map((a) => filaDeAviso(`<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#303339"><strong>${escapar(a.titulo)}.</strong> ${escapar(a.cuerpo)}</p><p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px"><a href="${escapar(o.sitio + a.enlace)}" style="color:${ROJO};font-weight:700">Leerlo</a></p>`)).join('')
  const html = marcoCorreo({ preheader: 'Cambiaron las condiciones de tu cuenta: léelo cuando puedas.', filas, avisoPropiedades: false,
    pie: `Te lo enviamos porque modifica las condiciones de tu cuenta. No es publicidad. ${enlacePie('Tus preferencias de aviso', o.urlPreferencias)}` })
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
  const texto = [saludo, '', asunto + '.', '', ...o.avisos.flatMap((a) => [`· ${a.titulo}`, `  ${a.cuerpo}`, `  ${o.sitio}${a.enlace}`, '']), pie, `Cambiar tus avisos: ${o.urlPreferencias}`, `Dejar de recibirlos con un clic: ${o.urlBaja}`].join('\n') + pieTexto()
  const filas = filaTexto({ kicker: 'Baja de precio', titulo: asunto, parrafos: [escapar(saludo)] }) + filaDeAviso(o.avisos.map((a) => tarjetaDeAviso(a.titulo, a.cuerpo, o.sitio + a.enlace)).join(''))
  const html = marcoCorreo({ preheader: 'Una propiedad que sigues bajó de precio.', filas, avisoPropiedades: false,
    pie: `${escapar(pie)} ${enlacePie('Cambiar mis avisos', o.urlPreferencias)} · ${enlacePie('Dejar de recibirlos', o.urlBaja)}` })
  return { asunto, texto, html }
}
