import { fechaLarga, horaCorta } from './zona'
import { bloqueGrupoPOnce, PONCE_URL } from '../correo/plantillas/marca'

/**
 * Qué correo sale con cada cambio de una cita, a quién, y qué dice.
 *
 * Todo puro (sin red ni base) para poder probarlo. El envío está en
 * `enviar.ts`. Reglas en docs/email-flow.md:
 *
 *   · a quien hizo el cambio no se le avisa de su propio cambio, salvo al
 *     cliente cuando su visita queda confirmada o cambia de hora: ese correo
 *     lleva el `.ics` y lo quiere tener;
 *   · los enlaces de acción son sólo los que esa persona puede usar por
 *     correo (el asesor no cancela por correo: cancelar le pide un motivo);
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
  | 'cambio_propuesto'
  | 'reprogramada'
  | 'reprogramada_asesor'
  | 'cambio_rechazado'
  | 'cambio_retirado'
  | 'cancelada'
  | 'vencida'
  | 'recordatorio_24h'
  | 'recordatorio_2h'

export type AccionCorreo = 'confirmar' | 'cancelar' | 'aceptar_cambio' | 'rechazar_cambio'

export type CorreoPlaneado = {
  tipo: TipoCorreo
  para: Para
  acciones: AccionCorreo[]
  ics: 'publicar' | 'cancelar' | null
}

/** Eventos del historial que mandan correo (`citas_eventos.tipo`). */
export type EventoCorreo =
  | 'CREATED'
  | 'CONFIRMED'
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

const c = (tipo: TipoCorreo, para: Para, acciones: AccionCorreo[] = [], ics: CorreoPlaneado['ics'] = null): CorreoPlaneado =>
  ({ tipo, para, acciones, ics })

/** Los que el cliente recibe aunque él mismo haya hecho el cambio. */
const SIEMPRE: TipoCorreo[] = ['solicitud_recibida', 'confirmada', 'reprogramada']

export function planDeCorreos(evento: EventoCorreo, cita: CitaParaPlan, actorUid: string | null): CorreoPlaneado[] {
  let lista: CorreoPlaneado[] = []
  switch (evento) {
    case 'CREATED':
      if (cita.estado === 'REQUESTED') lista = [c('solicitud_recibida', 'cliente'), c('solicitud_nueva', 'asesor', ['confirmar'])]
      else if (cita.estado === 'CONFIRMED') lista = [c('confirmada', 'cliente', ['cancelar'], 'publicar'), c('confirmada_asesor', 'asesor')]
      else if (cita.estado === 'PENDING_CONFIRMATION') lista = [c('por_confirmar', 'cliente', ['confirmar', 'cancelar']), c('registrada_asesor', 'asesor')]
      break
    case 'CONFIRMED':
      lista = [c('confirmada', 'cliente', ['cancelar'], 'publicar'), c('confirmada_asesor', 'asesor')]
      break
    case 'RESCHEDULE_PROPOSED':
      lista = [c('cambio_propuesto', cita.propuesta_por === 'cliente' ? 'asesor' : 'cliente', ['aceptar_cambio', 'rechazar_cambio'])]
      break
    case 'RESCHEDULE_ACCEPTED':
      lista = [c('reprogramada', 'cliente', ['cancelar'], 'publicar'), c('reprogramada_asesor', 'asesor')]
      break
    case 'RESCHEDULE_REJECTED':
      lista = [c('cambio_rechazado', 'cliente'), c('cambio_rechazado', 'asesor')]
      break
    case 'RESCHEDULE_WITHDRAWN':
      lista = [c('cambio_retirado', 'cliente'), c('cambio_retirado', 'asesor')]
      break
    case 'CANCELLED':
      lista = [c('cancelada', 'cliente', [], 'cancelar'), c('cancelada', 'asesor')]
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
  acciones: { accion: AccionCorreo; url: string }[]
  enlacePanel: string
  enlaceGoogle?: string | null
  ahora: Date
}

export type Correo = { asunto: string; html: string; texto: string }

const ETIQUETA_BOTON: Record<AccionCorreo, string> = {
  confirmar: 'Confirmar visita',
  cancelar: 'Cancelar visita',
  aceptar_cambio: 'Aceptar el nuevo horario',
  rechazar_cambio: 'Mantener el horario original',
}

export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cuando(d: Date, ahora: Date): string {
  return `${fechaLarga(d, ahora)}, ${horaCorta(d)}`
}

type Contenido = { asunto: string; titulo: string; parrafos: string[] }

function contenido(tipo: TipoCorreo, d: DatosPlantilla): Contenido {
  const fecha = cuando(d.inicio, d.ahora)
  const nueva = d.propuesto ? cuando(d.propuesto, d.ahora) : ''
  const cliente = d.cliente?.nombre ?? 'El cliente'
  switch (tipo) {
    case 'solicitud_recibida':
      return { asunto: `Recibimos tu solicitud de visita · ${d.propiedad}`, titulo: 'Recibimos tu solicitud',
        parrafos: [`Pediste visitar <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`, 'El asesor la revisa y te confirmamos por correo. Mientras tanto, ese horario queda apartado para ti.'] }
    case 'solicitud_nueva':
      return { asunto: `Nueva solicitud de visita · ${d.propiedad}`, titulo: 'Nueva solicitud de visita',
        parrafos: [`<b>${escaparHtml(cliente)}</b> quiere visitar <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`, 'Confírmala aquí o, si no puedes a esa hora, propón otro horario desde el panel.'] }
    case 'por_confirmar':
      return { asunto: `Confirma tu visita · ${d.propiedad}`, titulo: 'Te agendamos una visita',
        parrafos: [`Tu asesor de Vive Bien agendó una visita a <b>${escaparHtml(d.propiedad)}</b> para el <b>${fecha}</b>.`, 'Confírmala para que quede firme. Si no te queda, puedes cancelarla o proponer otro horario desde tu portal.'] }
    case 'registrada_asesor':
      return { asunto: `Se registró una visita · ${d.propiedad}`, titulo: 'Se registró una visita en tu propiedad',
        parrafos: [`Visita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>. Falta que el cliente la confirme.`] }
    case 'confirmada':
      return { asunto: `Tu visita está confirmada · ${d.propiedad}`, titulo: 'Tu visita está confirmada',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`, 'Te adjuntamos el evento para tu calendario. Llega unos minutos antes y lleva una identificación oficial.'] }
    case 'confirmada_asesor':
      return { asunto: `Visita confirmada · ${d.propiedad}`, titulo: 'Visita confirmada',
        parrafos: [`La visita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b> quedó confirmada.`] }
    case 'cambio_propuesto':
      return { asunto: `Proponen otro horario · ${d.propiedad}`, titulo: 'Proponen otro horario',
        parrafos: [`Para la visita a <b>${escaparHtml(d.propiedad)}</b> proponen cambiar del <b>${fecha}</b> al <b>${nueva}</b>.`, 'Si aceptas, la visita pasa a la nueva hora. Si no, se mantiene la original.'] }
    case 'reprogramada':
      return { asunto: `Tu visita cambió de horario · ${d.propiedad}`, titulo: 'Tu visita cambió de horario',
        parrafos: [`La visita a <b>${escaparHtml(d.propiedad)}</b> ahora es el <b>${fecha}</b>.`, 'Te adjuntamos el evento actualizado para tu calendario.'] }
    case 'reprogramada_asesor':
      return { asunto: `Visita reprogramada · ${d.propiedad}`, titulo: 'Visita reprogramada',
        parrafos: [`La visita de <b>${escaparHtml(cliente)}</b> a <b>${escaparHtml(d.propiedad)}</b> ahora es el <b>${fecha}</b>.`] }
    case 'cambio_rechazado':
      return { asunto: `Se mantiene el horario de la visita · ${d.propiedad}`, titulo: 'Se mantiene el horario original',
        parrafos: [`El cambio de horario no se aceptó. La visita a <b>${escaparHtml(d.propiedad)}</b> sigue el <b>${fecha}</b>.`] }
    case 'cambio_retirado':
      return { asunto: `Se retiró el cambio de horario · ${d.propiedad}`, titulo: 'Se retiró el cambio de horario',
        parrafos: [`La propuesta de cambio se retiró. La visita a <b>${escaparHtml(d.propiedad)}</b> sigue el <b>${fecha}</b>.`] }
    case 'cancelada':
      return { asunto: `Visita cancelada · ${d.propiedad}`, titulo: 'La visita se canceló',
        parrafos: [`La visita a <b>${escaparHtml(d.propiedad)}</b> del <b>${fecha}</b> se canceló.`,
          ...(d.motivo ? [`Motivo: ${escaparHtml(d.motivo)}`] : []),
          'Si agregaste la visita a tu calendario, bórrala de ahí.'] }
    case 'vencida':
      return { asunto: `La solicitud de visita venció · ${d.propiedad}`, titulo: 'La solicitud venció',
        parrafos: [`Nadie confirmó la visita a <b>${escaparHtml(d.propiedad)}</b> del <b>${fecha}</b> antes de la hora, así que se canceló sola.`, 'Si todavía te interesa, agenda otra desde el portal.'] }
    case 'recordatorio_24h':
      return { asunto: `Mañana es tu visita · ${d.propiedad}`, titulo: 'Tu visita es mañana',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> el <b>${fecha}</b>.`] }
    case 'recordatorio_2h':
      return { asunto: `Tu visita es en 2 horas · ${d.propiedad}`, titulo: 'Tu visita es en 2 horas',
        parrafos: [`Te esperamos en <b>${escaparHtml(d.propiedad)}</b> a las <b>${horaCorta(d.inicio)}</b>.`] }
  }
}

/** Arma el correo (HTML y texto plano) con la marca. Todo lo que viene del usuario va escapado. */
export function plantilla(tipo: TipoCorreo, para: Para, d: DatosPlantilla): Correo {
  const k = contenido(tipo, d)
  const saludo = d.destinatario?.trim() ? `Hola ${d.destinatario.trim()}:` : 'Hola:'
  const lugar = d.lugar ? `<p style="margin:6px 0 0;font-size:14px;color:#5C5B57">📍 ${escaparHtml(d.lugar)}</p>` : ''
  const datosCliente = para === 'asesor' && d.cliente
    ? `<p style="margin:12px 0 0;font-size:14px;color:#374151">Cliente: <b>${escaparHtml(d.cliente.nombre)}</b>${d.cliente.telefono ? ` · ${escaparHtml(d.cliente.telefono)}` : ''}</p>`
      + (d.notasCliente ? `<p style="margin:6px 0 0;font-size:14px;color:#374151">Nota del cliente: «${escaparHtml(d.notasCliente)}»</p>` : '')
    : ''
  const botones = d.acciones.map((a, i) =>
    `<a href="${escaparHtml(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:9px;font-weight:700;font-size:14px;text-decoration:none;${
      i === 0 ? 'background:#971010;color:#ffffff' : 'background:#ffffff;color:#971010;border:1px solid #971010'}">${ETIQUETA_BOTON[a.accion]}</a>`).join('')
  const google = d.enlaceGoogle
    ? `<a href="${escaparHtml(d.enlaceGoogle)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:9px;font-weight:600;font-size:14px;text-decoration:none;background:#ffffff;color:#1c1c1f;border:1px solid #d6d3cd">Agregar a Google Calendar</a>`
    : ''

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f4f2">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:'Open Sans',system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="background:#971010;border-radius:14px 14px 0 0;padding:18px 24px">
    <span style="color:#ffffff;font-family:Montserrat,system-ui,sans-serif;font-weight:700;letter-spacing:.08em;font-size:15px">VIVE BIEN</span>
    <span style="color:#f7eaea;font-size:12px;margin-left:8px">Grupo Inmobiliario</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:24px;border:1px solid #ece9e4;border-top:0">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8A8882">Visita</p>
    <h1 style="margin:0 0 14px;font-size:21px;color:#1c1c1f;font-family:Montserrat,system-ui,sans-serif">${escaparHtml(k.titulo)}</h1>
    <p style="margin:0 0 10px;font-size:15px;color:#374151">${escaparHtml(saludo)}</p>
    ${k.parrafos.map((p) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#374151">${p}</p>`).join('')}
    ${lugar}
    ${datosCliente}
    <div style="margin:20px 0 4px">${botones}${google}</div>
    <p style="margin:12px 0 0;font-size:13px;color:#5C5B57">
      <a href="${escaparHtml(d.enlacePanel)}" style="color:#971010">Ver la visita${para === 'asesor' ? ' en el panel' : ' en tu portal'}</a>
    </p>
    ${d.acciones.length ? '<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#8A8882">Abrir este correo o el enlace no cambia nada: la acción sólo cuenta cuando pulses el botón en la página. Los enlaces sirven una vez y caducan.</p>' : ''}
  </div>
  <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#8A8882">Vive Bien Grupo Inmobiliario · León, Gto. · Horarios en hora de León</p>
  ${bloqueGrupoPOnce()}
</div></body></html>`

  const quitarEtiquetas = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const texto = [
    saludo,
    '',
    ...k.parrafos.map(quitarEtiquetas),
    ...(d.lugar ? [`Lugar: ${d.lugar}`] : []),
    ...(para === 'asesor' && d.cliente ? [`Cliente: ${d.cliente.nombre}${d.cliente.telefono ? ` · ${d.cliente.telefono}` : ''}`] : []),
    ...(para === 'asesor' && d.notasCliente ? [`Nota del cliente: «${d.notasCliente}»`] : []),
    '',
    ...d.acciones.map((a) => `${ETIQUETA_BOTON[a.accion]}: ${a.url}`),
    ...(d.enlaceGoogle ? [`Agregar a Google Calendar: ${d.enlaceGoogle}`] : []),
    `Ver la visita: ${d.enlacePanel}`,
    '',
    ...(d.acciones.length ? ['Abrir el enlace no cambia nada: la acción sólo cuenta cuando pulses el botón en la página.'] : []),
    'Vive Bien Grupo Inmobiliario · León, Gto.',
    `VIVE BIEN es una empresa de Grupo P-ONCE: ${PONCE_URL}`,
  ].join('\n')

  return { asunto: k.asunto, html, texto }
}
