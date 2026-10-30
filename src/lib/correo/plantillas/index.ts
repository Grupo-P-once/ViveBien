import { NEGOCIO } from '../../config/negocio'
import { SITIO, urlDe } from '../../sitio'
import { AZUL, filaCta, filaHero, filaTarjetas, filaTexto, marcoCorreo } from './bloques'
import { bloquePropiedades, layoutCampana } from './campana'
import { layoutPortal, type ResumenPortal } from './portal'
import { boton, COLORES, escapar, parrafo, pieTexto, urlSegura, type Correo, type TarjetaCorreo } from './marca'

export type { Correo, TarjetaCorreo } from './marca'
export type { ResumenPortal } from './portal'

/**
 * Las plantillas de D-80. Funciones puras: reciben datos y devuelven {asunto, html, texto}. Todo dato dinámico se escapa
 * aquí; nada que no venga de la base o de la persona se inventa (si falta un dato, se omite).
 *
 * Sin emojis, sin MAYÚSCULAS ni signos de exclamación en el asunto (filtros de correo no deseado), y siempre una versión
 * de texto plano.
 */

const nombreSaludo = (nombre?: string | null) => {
  const n = (nombre ?? '').trim().split(/\s+/)[0]
  return n ? n.slice(0, 40) : null
}
const hola = (nombre?: string | null) => (nombreSaludo(nombre) ? `Hola ${nombreSaludo(nombre)},` : 'Hola,')

/** 1 · Confirmación de la solicitud para publicar (transaccional). NO es una aprobación. */
export function plantillaSolicitudPublicador(d: { nombre?: string | null; referencia: string }): Correo {
  const asunto = 'Recibimos tu solicitud para publicar en VIVE BIEN'
  const filas =
    filaHero({ kicker: 'Solicitud recibida', titulo: 'Recibimos tu solicitud', texto: 'Gracias por querer publicar tu propiedad con VIVE BIEN.' }) +
    filaTexto({
      titulo: 'Qué sigue con tu solicitud',
      parrafos: [
        `${escapar(hola(d.nombre))} tu solicitud <strong>ya está con nosotros</strong>, pero <strong>todavía no está aprobada</strong>: un asesor la revisará y se pondrá en contacto contigo.`,
        `<span style="display:inline-block;background:${COLORES.fondo};border-radius:6px;padding:10px 14px;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:${COLORES.negro}">Tu referencia: <strong>${escapar(d.referencia)}</strong></span>`,
      ],
    }) +
    filaTarjetas([
      { titulo: 'Revisión', texto: 'Un asesor revisa tu solicitud.' },
      { titulo: 'Contacto', texto: 'Te llamamos al teléfono que nos dejaste.' },
      { titulo: 'Acceso', texto: 'Si todo está en orden, un administrador te da acceso para publicar. Cada anuncio se revisa antes de salir al público.' },
    ]) +
    filaCta({ titulo: '¿Tienes dudas?', texto: 'Responde este correo o escríbenos y con gusto te ayudamos.', boton: { texto: 'Escribir a VIVE BIEN →', url: `mailto:${NEGOCIO.email}` } })
  const texto =
    `Recibimos tu solicitud\n\n${hola(d.nombre)}\n\nGracias por querer publicar tu propiedad con VIVE BIEN. Recibimos tu solicitud; todavía NO está aprobada: un asesor la revisará y se pondrá en contacto contigo.\n\nTu referencia: ${d.referencia}\n\nQué sigue:\n1. Un asesor revisa tu solicitud.\n2. Te contactamos por el teléfono que nos dejaste.\n3. Si todo está en orden, un administrador te da acceso para publicar. Cada anuncio se revisa antes de salir al público.\n\n¿Dudas? Responde este correo o escríbenos a ${NEGOCIO.email}.${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Tu solicitud fue recibida. Todavía no está aprobada: un asesor te contactará.', filas, avisoPropiedades: false }), texto }
}

/** 2 · Bienvenida a una cuenta nueva (transaccional). No es publicidad. Con la cara del inicio del portal del cliente. */
export function plantillaBienvenida(d: {
  nombre?: string | null
  urlPreferencias: string
  /** Cifras REALES de la cuenta y del sitio al enviar. Sin ellas (no se pudieron leer) la fila no aparece. */
  resumen?: ResumenPortal | null
  /** Propiedades publicadas más recientes (reales). Sin ellas el bloque no aparece. */
  propiedades?: TarjetaCorreo[]
}): Correo {
  const asunto = 'Te damos la bienvenida a VIVE BIEN'
  const catalogo = urlDe('/propiedades')
  const nombre = nombreSaludo(d.nombre)
  const propiedades = d.propiedades ?? []
  const titulo = nombre ? `Te damos la bienvenida, ${nombre}.` : 'Te damos la bienvenida a VIVE BIEN.'
  const intro = 'Tu cuenta está lista. Explora propiedades en León y la región, guarda las que te gusten en Mis guardadas y pide informes o una visita a un asesor.'
  const pie = `Recibes este correo porque creaste una cuenta en vivebienn.com. No es publicidad y no te enviaremos recomendaciones si no lo decides tú en <a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:${AZUL};text-decoration:underline">tus preferencias</a>.`
  const lista = propiedades.slice(0, 3).map((p, i) => `${i + 1}. ${p.titulo}${p.precio ? ` — ${p.precio}` : ''}\n   ${p.url}`).join('\n')
  const cifras = d.resumen
    ? `Tu portal hoy: ${d.resumen.guardadas} guardadas, ${d.resumen.busquedas} búsquedas guardadas, ${d.resumen.citas} visitas agendadas.\n\n`
    : ''
  const texto =
    `${titulo}\n\n${intro}\n\n${cifras}Explorar propiedades: ${catalogo}\nTu portal: ${urlDe('/portal')}\n\n` +
    (lista ? `Lo más reciente:\n${lista}\n\n` : '') +
    `Cuéntanos qué buscas (presupuesto, zonas y tipo de propiedad): ${d.urlPreferencias}\n\n` +
    `Recibes este correo porque creaste una cuenta en vivebienn.com. No es publicidad; sólo te enviaremos recomendaciones si lo decides tú: ${d.urlPreferencias}${pieTexto()}`
  const html = layoutPortal({
    preheader: 'Ya puedes explorar, guardar propiedades y pedir informes.',
    nombre,
    titulo,
    intro,
    boton: { texto: 'Buscar propiedades →', url: catalogo },
    heroImagen: propiedades[0]?.foto ?? null,
    heroAlt: propiedades[0] ? `Foto de ${propiedades[0].titulo}` : 'Propiedad de VIVE BIEN',
    resumen: d.resumen ?? null,
    propiedades,
    urlCatalogo: catalogo,
    urlPreferencias: d.urlPreferencias,
    pie,
  })
  return { asunto, html, texto }
}

/**
 * 3 · Lo primero que recibe quien pide recomendaciones: SUS PRIMERAS PROPIEDADES, ya (o, si hoy no hay ninguna que se ajuste,
 * un aviso de que la alerta quedó creada). La confirmación NO es un trámite previo que parece phishing («confirma tu cuenta»),
 * sino un «sí, quiero seguir recibiéndolas» al final de un correo que ya aportó valor. Si no pulsa el botón no se manda nada más.
 * Es la respuesta a una petición de la persona, no una campaña: sale como transaccional, con su enlace de baja.
 */
export function plantillaPrimerasPropiedades(d: {
  nombre?: string | null
  resumen: string
  propiedades: TarjetaCorreo[]
  urlConfirmar: string
  urlBaja: string
  diasValidez: number
}): Correo {
  const n = d.propiedades.length
  const pidioTexto = d.resumen ? `Pediste recibir propiedades de VIVE BIEN que se ajusten a esto: ${d.resumen}.` : 'Pediste recibir las propiedades más recientes de VIVE BIEN.'
  const asunto = n === 0 ? 'Tu alerta de propiedades de VIVE BIEN está lista' : n === 1 ? 'Tu primera propiedad en VIVE BIEN' : `Tus primeras ${n} propiedades en VIVE BIEN`
  const cierre = n === 0
    ? parrafo('Si quieres que te avisemos cuando aparezca algo, pulsa el botón:')
    : parrafo('<strong>¿Te sirven?</strong> Pulsa el botón y te seguiremos mandando propiedades nuevas, como máximo una vez cada tres días.')
  const cuerpo =
    bloquePropiedades(d.propiedades, 'Y también estas') +
    `<div style="background:${COLORES.fondo};padding:20px 22px 8px;margin:0 0 6px">${cierre}${boton(n === 0 ? 'Sí, avísenme' : 'Sí, quiero seguir recibiéndolas', d.urlConfirmar)}${parrafo(`Si no pulsas el botón, <strong>no te escribiremos más</strong> (el enlace sirve ${d.diasValidez} días). Si no pediste esto, no tienes que hacer nada.`, { pequeno: true, gris: true })}</div>`
  const pie = `Recibes este correo porque lo pediste en vivebienn.com.<br><a href="${escapar(urlSegura(d.urlBaja))}" style="color:#66709F;text-decoration:underline">No quiero recibir correos de VIVE BIEN</a>`
  const saludo = d.nombre && d.nombre.trim() ? `Hola, ${d.nombre.trim()}.` : 'Hola.'
  const intro = n === 0
    ? 'Tu alerta quedó creada. Hoy no tenemos propiedades publicadas que se ajusten, pero las seguiremos buscando por ti.'
    : 'Estas son las primeras propiedades que encontramos según lo que pediste.'
  const lista = d.propiedades
    .map((p, i) => [`${i + 1}. ${p.titulo}`, `   ${[p.etiqueta, p.lugar].filter(Boolean).join(' · ')}`, p.datos.length ? `   ${p.datos.join(' · ')}` : '', p.precio ? `   ${p.precio}` : '', `   ${p.url}`].filter(Boolean).join('\n'))
    .join('\n\n')
  const texto = [
    hola(d.nombre),
    `${pidioTexto} ${n === 0 ? 'Hoy no tenemos propiedades publicadas que se ajusten, pero las seguiremos buscando por ti.' : 'Estas son las primeras:'}`,
    lista,
    `${n === 0 ? 'Si quieres que te avisemos cuando aparezca algo, entra aquí' : '¿Te sirven? Entra aquí y te seguiremos mandando propiedades nuevas, como máximo una vez cada tres días'}: ${d.urlConfirmar}`,
    `Si no entras al enlace, no te escribiremos más (sirve ${d.diasValidez} días). Si no pediste esto, no tienes que hacer nada.`,
    `No quiero recibir correos de VIVE BIEN: ${d.urlBaja}`,
  ].filter(Boolean).join('\n\n') + pieTexto()
  return { asunto, html: layoutCampana({ preheader: n === 0 ? 'Tu alerta quedó creada. Si quieres que te avisemos, confirma con un clic.' : `Elegimos ${n === 1 ? 'una propiedad' : `${n} propiedades`} según lo que pediste.`, kicker: 'Selección VIVE BIEN', saludo, intro: escapar(intro), resumen: d.resumen, cuerpo, pie }), texto }
}

/** 4 · Recomendaciones de propiedades (marketing). Sólo propiedades reales y relevantes; nunca un correo vacío. */
export function plantillaRecomendaciones(d: {
  nombre?: string | null
  propiedades: TarjetaCorreo[]
  motivo: string
  urlBaja: string
  urlPreferencias: string
  urlCatalogo?: string
}): Correo {
  const n = d.propiedades.length
  const asunto = n === 1 ? 'Una propiedad que podría interesarte' : `${n} propiedades que podrían interesarte`
  const catalogo = d.urlCatalogo ?? urlDe('/propiedades')
  const cuerpo =
    bloquePropiedades(d.propiedades) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">${boton('Ver todas las propiedades', catalogo)}</td></tr></table>`
  const pie = `Recibes este correo porque pediste recomendaciones de propiedades en vivebienn.com (como máximo una cada tres días).<br><a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:#66709F;text-decoration:underline">Actualizar preferencias</a> · <a href="${escapar(urlSegura(d.urlBaja))}" style="color:#66709F;text-decoration:underline">Darme de baja</a>`
  const saludo = d.nombre && d.nombre.trim() ? `Hola, ${d.nombre.trim()}.` : 'Hola.'
  const lista = d.propiedades
    .map((p, i) => `${i + 1}. ${p.titulo}\n   ${[p.etiqueta, p.lugar].filter(Boolean).join(' · ')}${p.datos.length ? `\n   ${p.datos.join(' · ')}` : ''}${p.precio ? `\n   ${p.precio}` : ''}\n   ${p.url}`)
    .join('\n\n')
  const texto = `${hola(d.nombre)}\n\n${d.motivo}\n\n${lista}\n\nVer todas las propiedades: ${catalogo}\n\nRecibes este correo porque pediste recomendaciones de propiedades en vivebienn.com (como máximo una cada tres días).\nCambiar mis preferencias: ${d.urlPreferencias}\nDarme de baja: ${d.urlBaja}${pieTexto()}`
  return { asunto, html: layoutCampana({ preheader: `${d.motivo}`.slice(0, 110), kicker: 'Selección VIVE BIEN', saludo, intro: escapar(d.motivo), cuerpo, pie }), texto }
}

/** 5 · Confirmación de baja (transaccional). Preparada; no se envía por correo, la confirma la página de baja. */
export function plantillaBajaConfirmada(d: { urlSuscribir: string }): Correo {
  const asunto = 'Ya no recibirás recomendaciones de VIVE BIEN'
  const filas =
    filaTexto({ kicker: 'Baja registrada', titulo: 'Listo, quedaste dado de baja', grande: true, parrafos: ['Dejaste de recibir recomendaciones de propiedades de VIVE BIEN. No te escribiremos más con ese fin.'] }) +
    filaCta({ titulo: '¿Fue un error?', texto: 'Puedes volver a pedirlas cuando quieras.', boton: { texto: 'Volver a pedir propiedades →', url: d.urlSuscribir } })
  const texto = `Listo, quedaste dado de baja\n\nDejaste de recibir recomendaciones de propiedades de VIVE BIEN. No te escribiremos más con ese fin.\n\nSi fue un error, puedes volver a suscribirte: ${d.urlSuscribir}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Tu baja quedó registrada.', filas, avisoPropiedades: false }), texto }
}

export { SITIO }
