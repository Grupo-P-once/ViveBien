import { fechaLarga, horaCorta } from './zona'
import { filaHero, marcoCorreo, TEXTO } from '../correo/plantillas/bloques'
import { botonContorno, botonLleno, fila } from '../correo/plantillas/eventos'
import { COLORES, PONCE_URL } from '../correo/plantillas/marca'

/**
 * Qué correo sale con cada cambio de una cita, a quién, y qué dice.
 *
 * Todo puro (sin red ni base) para poder probarlo. El envío está en
 * `enviar.ts`. Reglas en docs/email-flow.md:
 *
 *   · a quien hizo el cambio no se le avisa de su propio cambio, salvo al
 *     cliente cuando su cita queda confirmada o cambia de hora: ese correo
 *     lleva el `.ics` y lo quiere tener;
 *   · D-3 (5-nov-2026): NINGÚN correo trae botones que cambien algo. Un enlace
 *     nunca confirma, rechaza ni cancela: lleva a la cita en el panel correcto, la
 *     persona inicia sesión si hace falta y la acción se completa DENTRO de VIVE BIEN
 *     con una solicitud autenticada;
 *   · nada de seguimiento comercial: esto no es un CRM.
 */

export type Para = 'cliente' | 'asesor'

export type TipoCorreo =
  | 'solicitud_recibida'
  | 'solicitud_nueva'
  | 'por_confirmar'
  | 'registrada_asesor'
  | 'confirmada'
  | 'confirmada_asesor'
  | 'rechazada'
  | 'cambio_propuesto'
  | 'reprogramada'
  | 'reprogramada_asesor'
  | 'cambio_rechazado'
  | 'cambio_retirado'
  | 'cancelada'
  | 'vencida'
  | 'horario_no_disponible'
  | 'recordatorio_24h'
  | 'recordatorio_1h'

/** Acciones que un correo ofrecía por enlace de un solo uso. Ya no se ofrece ninguna (D-3); el tipo se conserva para los enlaces viejos. */
export type AccionCorreo = 'confirmar' | 'cancelar' | 'aceptar_cambio' | 'rechazar_cambio'

export type CorreoPlaneado = {
  tipo: TipoCorreo
  para: Para
  /** Siempre vacío desde D-3. */
  acciones: AccionCorreo[]
  ics: 'publicar' | 'cancelar' | null
}

/** Eventos del historial que mandan correo (`citas_eventos.tipo`). */
export type EventoCorreo =
  | 'CREATED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'RESCHEDULE_PROPOSED'
  | 'RESCHEDULE_ACCEPTED'
  | 'RESCHEDULE_REJECTED'
  | 'RESCHEDULE_WITHDRAWN'
  | 'CANCELLED'
  | 'EXPIRED'

export type CitaParaPlan = {
  estado: string
  cliente_uid: string
  asesor_uid: string
  propuesta_por: 'cliente' | 'asesor' | 'admin' | null
}

const c = (tipo: TipoCorreo, para: Para, ics: CorreoPlaneado['ics'] = null): CorreoPlaneado =>
  ({ tipo, para, acciones: [], ics })

/** Los que el cliente recibe aunque él mismo haya hecho el cambio. */
const SIEMPRE: TipoCorreo[] = ['solicitud_recibida', 'confirmada', 'reprogramada']

export function planDeCorreos(evento: EventoCorreo, cita: CitaParaPlan, actorUid: string | null): CorreoPlaneado[] {
  let lista: CorreoPlaneado[] = []
  switch (evento) {
    case 'CREATED':
      if (cita.estado === 'REQUESTED') lista = [c('solicitud_recibida', 'cliente'), c('solicitud_nueva', 'asesor')]
      else if (cita.estado === 'CONFIRMED') lista = [c('confirmada', 'cliente', 'publicar'), c('confirmada_asesor', 'asesor')]
      else if (cita.estado === 'PENDING_CONFIRMATION') lista = [c('por_confirmar', 'cliente'), c('registrada_asesor', 'asesor')]
      break
    case 'CONFIRMED':
      lista = [c('confirmada', 'cliente', 'publicar'), c('confirmada_asesor', 'asesor')]
      break
    case 'REJECTED':
      lista = [c('rechazada', 'cliente')]
      break
    case 'RESCHEDULE_PROPOSED':
      lista = [c('cambio_propuesto', cita.propuesta_por === 'cliente' ? 'asesor' : 'cliente')]
      break
    case 'RESCHEDULE_ACCEPTED':
      lista = [c('reprogramada', 'cliente', 'publicar'), c('reprogramada_asesor', 'asesor')]
      break
    case 'RESCHEDULE_REJECTED':
      lista = [c('cambio_rechazado', 'cliente'), c('cambio_rechazado', 'asesor')]
      break
    case 'RESCHEDULE_WITHDRAWN':
      lista = [c('cambio_retirado', 'cliente'), c('cambio_retirado', 'asesor')]
      break
    case 'CANCELLED':
      lista = [c('cancelada', 'cliente', 'cancelar'), c('cancelada', 'asesor')]
      break
    case 'EXPIRED':
      lista = [c('vencida', 'cliente'), c('vencida', 'asesor')]
      break
  }
  const uidDe = (p: Para) => (p === 'cliente' ? cita.cliente_uid : cita.asesor_uid)
  return lista.filter((m) => !actorUid || uidDe(m.para) !== actorUid || (m.para === 'cliente' && SIEMPRE.includes(m.tipo)))
}

/** Llave de no-duplicado: la misma para el mismo correo de la misma versión de la cita. */
export function claveCorreo(citaId: string, tipo: TipoCorreo, version: number, para: Para): string {
  return `cita/${citaId}/${tipo}/v${version}/${para}`
}

// ── Plantillas ───────────────────────────────────────────────────

export type DatosPlantilla = {
  destinatario: string | null
  propiedad: string
  lugar: string | null
  inicio: Date
  /** Horario propuesto (cambio_propuesto). */
  propuesto?: Date | null
  motivo?: string | null
  /** Para los correos al asesor. */
  cliente?: { nombre: string; telefono: string | null } | null
  notasCliente?: string | null
  /** Heredado: ya no se mandan botones de acción (D-3). Si llegaran, se ignoran. */
  acciones?: { accion: AccionCorreo; url: string }[]
  enlacePanel: string
  enlaceGoogle?: string | null
  /** Horarios libres cercanos, para quien perdió su horario (`horario_no_disponible`). */
  alternativas?: Date[]
  ahora: Date
}

export type Correo = { asunto: string; html: string; texto: string }

export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cuando(d: Date, ahora: Date): string {
  return `${fechaLarga(d, ahora)}, ${horaCorta(d)}`
}

type Contenido = { asunto: string; titulo: string; parrafos: string[] }

/** Los correos que piden que la persona haga algo en el panel (no solo enterarse). */
const PIDEN_ACCION: TipoCorreo[] = ['solicitud_nueva', 'por_confirmar', 'cambio_propuesto', 'horario_no_disponible']

function etiquetaDelBoton(tipo: TipoCorreo, para: Para): string {
  if (tipo === 'solicitud_nueva') return 'Responder en mi panel'
  if (tipo === 'por_confirmar') return 'Confirmar en mi portal'
  if (tipo === 'cambio_propuesto') return para === 'asesor' ? 'Responder en mi panel' : 'Responder en mi portal'
  if (tipo === 'horario_no_disponible') return 'Elegir otro horario'
  if (tipo === 'rechazada') return 'Ver horarios disponibles'
  return para === 'asesor' ? 'Abrir en mi panel' : 'Ver mi cita'
}

function contenido(tipo: TipoCorreo, d: DatosPlantilla): Contenido {
  const fecha = cuando(d.inicio, d.ahora)
  const nueva = d.propuesto ? cuando(d.propuesto, d.ahora) : ''
  const cliente = d.cliente?.nombre ?? 'El cliente'
  const alt = (d.alternativas ?? []).map((a) => `<b>${cuando(a, d.ahora)}</b>`)
  switch (tipo) {
    case 'solicitud_recibida':
      return { asunto: `Solicitud de cita enviada · ${d.propiedad}`, titulo: 'Solicitud enviada',
        parrafos: [`Enviamos tu solicitud para visitar <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`,
          'Todavía no está confirmada: el responsable la revisará y te avisaremos por correo y en tu panel si la acepta o la rechaza. Ese horario no queda apartado hasta que se confirme.'] }
    case 'solicitud_nueva':
      return { asunto: `Nueva solicitud de cita · ${d.propiedad}`, titulo: 'Nueva solicitud de cita',
        parrafos: [`<b>${escaparHtml(cliente)}</b> quiere visitar <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`,
          'Revísala en tu panel: puedes confirmarla, rechazarla o proponer otro horario. El horario queda apartado solo cuando la confirmas.'] }
    case 'por_confirmar':
      return { asunto: `Confirma tu cita · ${d.propiedad}`, titulo: 'Te agendamos una cita',
        parrafos: [`Tu asesor de Vive Bien agendó una visita a <b>${escaparHtml(d.propiedad)}</b> para el <b>${fecha}</b>.`, 'Confírmala en tu portal para que quede firme. Si no te queda, puedes cancelarla o pedir otro horario desde ahí.'] }
    case 'registrada_asesor':
      return { asunto: `Se registró una cita · ${d.propiedad}`, titulo: 'Se registró una cita en tu propiedad',
        parrafos: [`Cita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>. Falta que el cliente la confirme.`] }
    case 'confirmada':
      return { asunto: `Tu cita está confirmada · ${d.propiedad}`, titulo: 'Tu cita está confirmada',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`, 'Te adjuntamos el evento para tu calendario. Llega unos minutos antes y lleva una identificación oficial.'] }
    case 'confirmada_asesor':
      return { asunto: `Cita confirmada · ${d.propiedad}`, titulo: 'Cita confirmada',
        parrafos: [`La cita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b> quedó confirmada.`] }
    case 'rechazada':
      return { asunto: `Tu solicitud de cita no fue aceptada · ${d.propiedad}`, titulo: 'Solicitud rechazada',
        parrafos: [`No pudimos aceptar tu solicitud para visitar <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`,
          ...(d.motivo ? [`Motivo: ${escaparHtml(d.motivo)}`] : []),
          'Puedes elegir otro horario disponible desde la ficha de la propiedad.'] }
    case 'cambio_propuesto':
      return { asunto: `Proponen otro horario · ${d.propiedad}`, titulo: 'Proponen otro horario',
        parrafos: [`Para la cita en <b>${escaparHtml(d.propiedad)}</b> proponen cambiar del <b>${fecha}</b> al <b>${nueva}</b>.`, 'Tu cita actual se conserva hasta que el nuevo horario quede confirmado. Responde desde tu panel: si aceptas, pasa a la nueva hora; si no, se mantiene la original.'] }
    case 'reprogramada':
      return { asunto: `Tu cita cambió de horario · ${d.propiedad}`, titulo: 'Tu cita cambió de horario',
        parrafos: [`La cita en <b>${escaparHtml(d.propiedad)}</b> ahora es el <b>${fecha}</b>.`, 'Te adjuntamos el evento actualizado para tu calendario.'] }
    case 'reprogramada_asesor':
      return { asunto: `Cita reprogramada · ${d.propiedad}`, titulo: 'Cita reprogramada',
        parrafos: [`La cita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> ahora es el <b>${fecha}</b>.`] }
    case 'cambio_rechazado':
      return { asunto: `Se mantiene el horario de la cita · ${d.propiedad}`, titulo: 'Se mantiene el horario original',
        parrafos: [`El cambio de horario no se aceptó. La cita en <b>${escaparHtml(d.propiedad)}</b> sigue el <b>${fecha}</b>.`] }
    case 'cambio_retirado':
      return { asunto: `Se retiró el cambio de horario · ${d.propiedad}`, titulo: 'Se retiró el cambio de horario',
        parrafos: [`La propuesta de cambio se retiró. La cita en <b>${escaparHtml(d.propiedad)}</b> sigue el <b>${fecha}</b>.`] }
    case 'cancelada':
      return { asunto: `Cita cancelada · ${d.propiedad}`, titulo: 'La cita se canceló',
        parrafos: [`La cita en <b>${escaparHtml(d.propiedad)}</b> del <b>${fecha}</b> se canceló.`,
          ...(d.motivo ? [`Motivo: ${escaparHtml(d.motivo)}`] : []),
          'Si agregaste la cita a tu calendario, bórrala de ahí.'] }
    case 'vencida':
      return { asunto: `La solicitud de cita expiró · ${d.propiedad}`, titulo: 'La solicitud expiró',
        parrafos: [`Nadie confirmó la cita en <b>${escaparHtml(d.propiedad)}</b> del <b>${fecha}</b> antes de la hora, así que expiró.`, 'Si todavía te interesa, solicita otra desde la ficha de la propiedad.'] }
    case 'horario_no_disponible':
      return { asunto: `Ese horario ya no está disponible · ${d.propiedad}`, titulo: 'Ese horario ya no está disponible',
        parrafos: [`Se confirmó otra cita a la misma hora para <b>${escaparHtml(d.propiedad)}</b> (${fecha}), así que tu solicitud ya no puede confirmarse en ese horario.`,
          ...(alt.length ? [`Estos horarios siguen disponibles: ${alt.join(' · ')}.`] : ['Por ahora no vemos horarios libres cercanos; vuelve a revisar la ficha en unos días.']),
          'Elige uno nuevo desde la ficha de la propiedad. Mientras no lo hagas, tu solicitud sigue pendiente.'] }
    case 'recordatorio_24h':
      return { asunto: `Mañana es tu cita · ${d.propiedad}`, titulo: 'Tu cita es mañana',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`] }
    case 'recordatorio_1h':
      return { asunto: `Tu cita es en 1 hora · ${d.propiedad}`, titulo: 'Tu cita es en 1 hora',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> a las <b>${horaCorta(d.inicio)}</b>.`] }
  }
}

/** Arma el correo (HTML y texto plano) con la marca. Todo lo que viene del usuario va escapado. */
export function plantilla(tipo: TipoCorreo, para: Para, d: DatosPlantilla): Correo {
  const k = contenido(tipo, d)
  const saludo = d.destinatario?.trim() ? `Hola ${d.destinatario.trim()}:` : 'Hola:'
  const boton = etiquetaDelBoton(tipo, para)
  // Mismo marco que el resto de los correos de VIVE BIEN (logotipo, bloque de color, pie con Grupo P-ONCE). Sin emojis: Outlook los dibuja como cuadros.
  const dato = (etiqueta: string, valor: string) =>
    `<tr><td valign="top" style="padding:5px 14px 5px 0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563;white-space:nowrap">${etiqueta}</td><td valign="top" style="padding:5px 0;font-family:${TEXTO};font-size:14px;line-height:21px;color:${COLORES.negro}"><strong>${valor}</strong></td></tr>`
  const filasDeDatos = [
    dato('Propiedad', escaparHtml(d.propiedad)),
    dato(d.propuesto && tipo === 'cambio_propuesto' ? 'Horario actual' : 'Cuándo', escaparHtml(cuando(d.inicio, d.ahora))),
    ...(d.propuesto && tipo === 'cambio_propuesto' ? [dato('Horario propuesto', escaparHtml(cuando(d.propuesto, d.ahora)))] : []),
    ...(d.lugar ? [dato('Lugar', escaparHtml(d.lugar))] : []),
    ...(para === 'asesor' && d.cliente ? [dato('Cliente', escaparHtml(d.cliente.nombre) + (d.cliente.telefono ? ` · ${escaparHtml(d.cliente.telefono)}` : ''))] : []),
    ...(para === 'asesor' && d.notasCliente ? [dato('Nota del cliente', `«${escaparHtml(d.notasCliente)}»`)] : []),
  ].join('')
  const parrafos = [saludo, ...k.parrafos].map((t, i) => `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:${i === 0 ? 15 : 16}px;line-height:26px;color:${i === 0 ? '#535761' : '#303339'}">${i === 0 ? escaparHtml(t) : t}</p>`).join('')
  // D-3: un solo botón principal que LLEVA a la cita en el panel; no cambia nada. La acción se completa dentro, con sesión.
  const principal = fila(botonLleno(boton, d.enlacePanel), 4, 10)
  const calendario = d.enlaceGoogle ? fila(botonContorno('Agregar a Google Calendar', d.enlaceGoogle), 4, 10) : ''
  const aviso = PIDEN_ACCION.includes(tipo)
    ? fila(`<p style="margin:0;font-family:${TEXTO};font-size:12px;line-height:19px;color:#6B7280;text-align:center">Este correo no cambia nada por sí solo: la acción se completa dentro de VIVE BIEN, con tu sesión.</p>`, 6, 28)
    : fila('', 0, 14)
  const filas =
    filaHero({ kicker: 'Cita', titulo: k.titulo }) +
    fila(parrafos, 28, 6) +
    fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORES.fondo}" style="background:${COLORES.fondo};border-radius:8px;padding:14px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${filasDeDatos}</table></td></tr></table>`, 4, 18) +
    principal + calendario + aviso
  const html = marcoCorreo({
    preheader: `${k.titulo} · ${d.propiedad}`.slice(0, 110),
    filas,
    avisoPropiedades: false,
    pie: 'Mensaje de servicio sobre tu cita en VIVE BIEN; no es publicidad. Horarios en hora de León.',
  })

  const quitarEtiquetas = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const texto = [
    saludo,
    '',
    ...k.parrafos.map(quitarEtiquetas),
    ...(d.lugar ? [`Lugar: ${d.lugar}`] : []),
    ...(para === 'asesor' && d.cliente ? [`Cliente: ${d.cliente.nombre}${d.cliente.telefono ? ` · ${d.cliente.telefono}` : ''}`] : []),
    ...(para === 'asesor' && d.notasCliente ? [`Nota del cliente: «${d.notasCliente}»`] : []),
    '',
    `${boton}: ${d.enlacePanel}`,
    ...(d.enlaceGoogle ? [`Agregar a Google Calendar: ${d.enlaceGoogle}`] : []),
    '',
    ...(PIDEN_ACCION.includes(tipo) ? ['Este correo no cambia nada por sí solo: la acción se completa dentro de VIVE BIEN, con tu sesión.'] : []),
    'Vive Bien Grupo Inmobiliario · León, Gto.',
    `VIVE BIEN es una empresa de Grupo P-ONCE: ${PONCE_URL}`,
  ].join('\n')

  return { asunto: k.asunto, html, texto }
}
