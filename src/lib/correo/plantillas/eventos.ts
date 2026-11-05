import { NEGOCIO } from '../../config/negocio'
import { AZUL, filaHero, filaTexto, FUENTE, marcoCorreo, TEXTO } from './bloques'
import { rejillaPropiedades, tarjetaDestacada } from './campana'
import { COLORES, escapar, pieTexto, urlSegura, type Correo, type TarjetaCorreo } from './marca'

/**
 * Plantillas de EVENTOS que el dueño pidió (30-oct-2026), diseñadas con el sistema de VIVE BIEN (marco, logotipo, rojo de marca, tarjetas de propiedad) a partir de
 * la estructura de las capturas de referencia: contacto por WhatsApp con recomendaciones, evaluación de la atención, verificación de cuenta y propiedad publicada.
 * No copian marca, textos ni recursos de terceros.
 *
 * IMPORTANTE: son funciones PURAS y hoy NINGÚN código las envía. Los eventos que las dispararían (contacto por WhatsApp, evaluación de atención, publicación
 * aprobada) no existen todavía y la verificación de cuenta la manda Firebase con su propia plantilla. Aparecen en el panel como «plantilla lista · evento pendiente».
 * Una prueba comprueba que ningún envío las importa. Mismas reglas que el resto: tablas y estilos en línea, https/mailto, alt en toda imagen, todo dato escapado y
 * una versión de texto plano.
 */

const nombreSaludo = (nombre?: string | null) => (nombre ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || null
const hola = (nombre?: string | null) => (nombreSaludo(nombre) ? `Hola ${nombreSaludo(nombre)},` : 'Hola,')
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const PAD = 'class="mobile-pad"'

/** Fila blanca con contenido ya armado (los datos dinámicos ya vienen escapados por quien llama). */
const fila = (contenido: string, arriba = 6, abajo = 12) => `<tr><td ${PAD} style="padding:${arriba}px 42px ${abajo}px;background:${COLORES.blanco}">${contenido}</td></tr>`

function botonContorno(texto: string, url: string, ancho?: number): string {
  const w = ancho ? `width:${ancho}px;` : ''
  const relleno = ancho ? '13px 0' : '15px 20px' // con ancho fijo (Sí / No) no se suma relleno lateral: así caben dos botones en un teléfono de 375 px
  const tabla = ancho ? 'cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"' : 'width="100%" cellpadding="0" cellspacing="0" border="0"' // sin ancho fijo: a todo el ancho, como en las maquetas
  return `<table role="presentation" ${tabla}><tr><td align="center" style="border:1px solid ${COLORES.rojo};border-radius:8px;background:${COLORES.blanco}"><a href="${escapar(urlSegura(url))}" target="_blank" style="display:block;${w}padding:${relleno};font-family:${FUENTE};font-size:15px;line-height:20px;font-weight:700;color:${COLORES.rojo};text-decoration:none;text-align:center">${escapar(texto)}</a></td></tr></table>`
}

function botonLleno(texto: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${COLORES.rojo}" style="background:${COLORES.rojo};border-radius:8px"><a href="${escapar(urlSegura(url))}" target="_blank" style="display:block;padding:17px 20px;font-family:${FUENTE};font-size:17px;line-height:22px;font-weight:700;color:${COLORES.blanco};text-decoration:none;text-align:center">${escapar(texto)}</a></td></tr></table>`
}

/** Propiedad en una sola fila (foto a la izquierda, datos a la derecha), como en la encuesta de atención. */
function tarjetaHorizontal(p: TarjetaCorreo): string {
  const u = escapar(urlSegura(p.url))
  const foto = p.foto ? `<td class="stack" width="38%" valign="top" style="width:38%"><a href="${u}" target="_blank"><img src="${escapar(urlSegura(p.foto))}" width="200" alt="${escapar(p.titulo)}" style="display:block;width:100%;height:auto;border:0;background:${COLORES.fondo}"></a></td>` : ''
  const etiqueta = p.etiqueta ? `<p style="margin:0 0 6px;font-family:${FUENTE};font-size:10px;line-height:15px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${COLORES.rojo}">${escapar(p.etiqueta)}</p>` : ''
  const lugar = p.lugar ? `<p style="margin:0 0 6px;font-family:${TEXTO};font-size:13px;line-height:19px;color:${COLORES.gris}">${escapar(p.lugar)}</p>` : ''
  const precio = p.precio ? `<p style="margin:0;font-family:${FUENTE};font-size:19px;line-height:25px;font-weight:700;color:${COLORES.negro}">${escapar(p.precio)}</p>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E7E3DD"><tr>${foto}<td class="stack" valign="top" style="padding:16px 18px">${etiqueta}<p style="margin:0 0 4px;font-family:${FUENTE};font-size:16px;line-height:22px;font-weight:700;color:${COLORES.negro}"><a href="${u}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(p.titulo)}</a></p>${lugar}${precio}</td></tr></table>`
}

const texto1 = (p: TarjetaCorreo) => `${p.titulo}${p.etiqueta ? ` (${p.etiqueta})` : ''}${p.precio ? ` — ${p.precio}` : ''}${p.lugar ? `\n   ${p.lugar}` : ''}\n   ${p.url}`

/** 1 · Contacto por WhatsApp: resumen del aviso, datos del anunciante y propiedades parecidas. EVENTO PENDIENTE (no existe el disparador). */
export function plantillaContactoWhatsApp(d: {
  nombre?: string | null
  propiedad: TarjetaCorreo
  anunciante: { nombre: string; telefono: string | null; codigo: string | null }
  similares: TarjetaCorreo[]
  urlCatalogo: string
  urlPreferencias: string
}): Correo {
  const asunto = corto(`Tu contacto por WhatsApp sobre ${d.propiedad.titulo}`, 78)
  const a = d.anunciante
  const datos = [
    `<p style="margin:0 0 10px;font-family:${FUENTE};font-size:16px;line-height:22px;font-weight:700;color:${COLORES.negro}">Datos del anunciante</p>`,
    `<p style="margin:0 0 7px;font-family:${TEXTO};font-size:14px;line-height:21px;color:#303339"><strong>Nombre:</strong> ${escapar(a.nombre)}</p>`,
    a.telefono ? `<p style="margin:0 0 7px;font-family:${TEXTO};font-size:14px;line-height:21px;color:#303339"><strong>Teléfono:</strong> ${escapar(a.telefono)}</p>` : '',
    a.codigo ? `<p style="margin:0;font-family:${TEXTO};font-size:14px;line-height:21px;color:#303339"><strong>Código de aviso:</strong> ${escapar(a.codigo)}</p>` : '',
  ].join('')
  const filas =
    filaTexto({ kicker: 'Contacto por WhatsApp', titulo: hola(d.nombre), grande: true, parrafos: [`Te contactaste por WhatsApp con <strong>${escapar(a.nombre)}</strong> por el siguiente aviso:`] }) +
    fila(tarjetaDestacada(d.propiedad), 4, 8) +
    fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:18px 20px;background:${COLORES.fondo};border-radius:6px">${datos}</td></tr></table>`, 0, 22) +
    (d.similares.length
      ? fila(`<h2 style="margin:0 0 14px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro};text-align:center">Más propiedades que podrían gustarte</h2>${rejillaPropiedades(d.similares.slice(0, 4))}`, 6, 6)
      : '') +
    fila(botonContorno('Encontrar más opciones', d.urlCatalogo), 8, 30)
  const pie = `Recibes este correo porque te contactaste por WhatsApp con un anunciante desde vivebienn.com. <a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:${AZUL};text-decoration:underline">Cambiar mis avisos</a>.`
  const texto =
    `${hola(d.nombre)}\n\nTe contactaste por WhatsApp con ${a.nombre} por el siguiente aviso:\n\n${texto1(d.propiedad)}\n\nDatos del anunciante\nNombre: ${a.nombre}\n${a.telefono ? `Teléfono: ${a.telefono}\n` : ''}${a.codigo ? `Código de aviso: ${a.codigo}\n` : ''}` +
    (d.similares.length ? `\nMás propiedades que podrían gustarte:\n${d.similares.slice(0, 4).map((p, i) => `${i + 1}. ${texto1(p)}`).join('\n')}\n` : '') +
    `\nEncontrar más opciones: ${d.urlCatalogo}\n\nRecibes este correo porque te contactaste por WhatsApp con un anunciante desde vivebienn.com. Cambiar mis avisos: ${d.urlPreferencias}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Guardamos los datos del aviso y del anunciante que contactaste.', filas, pie }), texto }
}

/** 2 · Evaluación de la atención: ¿te contactó el anunciante? EVENTO PENDIENTE (no existe el disparador ni las rutas que reciben Sí/No). */
export function plantillaEvaluacionAtencion(d: {
  nombre?: string | null
  anunciante: string
  propiedad: TarjetaCorreo
  urlSi: string
  urlNo: string
  urlActividad: string
}): Correo {
  const asunto = 'Cuéntanos cómo fue tu contacto con el anunciante'
  const n = nombreSaludo(d.nombre)
  const botones = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td style="padding:0 8px">${botonContorno('Sí', d.urlSi, 110)}</td><td style="padding:0 8px">${botonContorno('No', d.urlNo, 110)}</td></tr></table>`
  const filas =
    filaTexto({ kicker: 'Tu opinión', titulo: n ? `${n}, tu opinión nos importa` : 'Tu opinión nos importa', grande: true, parrafos: [`Queremos saber cómo fue la atención que te brindó <strong>${escapar(d.anunciante)}</strong> por este inmueble:`] }) +
    fila(tarjetaHorizontal(d.propiedad), 6, 22) +
    fila(`<p style="margin:0 0 16px;font-family:${FUENTE};font-size:15px;line-height:22px;font-weight:700;color:${COLORES.negro};text-align:center">¿${escapar(d.anunciante)} se contactó contigo?</p>${botones}`, 4, 24) +
    fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:18px 22px;background:${COLORES.fondo};border-radius:8px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#303339">Recuerda que siempre puedes escribirnos o calificar la atención desde <a href="${escapar(urlSegura(d.urlActividad))}" style="color:${COLORES.rojo};font-weight:700">Mi actividad</a>.</td></tr></table>`, 0, 30)
  const texto = `${n ? `${n}, tu` : 'Tu'} opinión nos importa\n\nQueremos saber cómo fue la atención que te brindó ${d.anunciante} por este inmueble:\n\n${texto1(d.propiedad)}\n\n¿${d.anunciante} se contactó contigo?\nSí: ${d.urlSi}\nNo: ${d.urlNo}\n\nSiempre puedes escribirnos o calificar la atención desde Mi actividad: ${d.urlActividad}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Dos toques: dinos si el anunciante se puso en contacto contigo.', filas, avisoPropiedades: false }), texto }
}

/**
 * 3 · Verificación de la cuenta. LA MANDA FIREBASE con su propia plantilla (se configura en la consola de Firebase, no en este código): esto es el DISEÑO PROPUESTO
 * para copiar allí; no está conectado a ningún envío. El enlace es el que Firebase pondría; en la vista previa es inerte.
 */
export function plantillaVerificacionCuenta(d: { nombre?: string | null; urlVerificar: string }): Correo {
  const asunto = 'Verifica tu correo para activar tu cuenta de VIVE BIEN'
  const filas =
    filaTexto({ kicker: 'Verificación de cuenta', titulo: hola(d.nombre), grande: true, parrafos: ['Para terminar de crear tu cuenta en VIVE BIEN, confirma que este correo es tuyo.'] }) +
    fila(botonLleno('Verificar mi correo', d.urlVerificar), 6, 22) +
    fila(`<p style="margin:0 0 8px;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563;text-align:center">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p><p style="margin:0;font-family:${TEXTO};font-size:12px;line-height:19px;color:${COLORES.rojo};text-align:center;word-break:break-all">${escapar(urlSegura(d.urlVerificar))}</p>`, 0, 20) +
    fila(`<p style="margin:0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#6B7280;text-align:center">Si no creaste una cuenta en VIVE BIEN, ignora este correo: no se activará nada.</p>`, 0, 30)
  const texto = `${hola(d.nombre)}\n\nPara terminar de crear tu cuenta en VIVE BIEN, confirma que este correo es tuyo:\n${d.urlVerificar}\n\nSi no creaste una cuenta en VIVE BIEN, ignora este correo: no se activará nada.${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Confirma tu correo para activar tu cuenta.', filas, avisoPropiedades: false, pie: 'Este mensaje es de seguridad de tu cuenta: no es publicidad.' }), texto }
}

/** 4 · Propiedad aprobada y publicada, con consejos para quien publica. EVENTO PENDIENTE (hoy la aprobación no manda correo). */
export function plantillaPublicadorPublicada(d: { nombre?: string | null; propiedad: TarjetaCorreo; folio: string; urlPanel: string }): Correo {
  const asunto = corto(`Tu propiedad ya está publicada: ${d.propiedad.titulo}`, 78)
  const consejos: Array<[string, string]> = [
    ['Mantén tu ficha completa', 'Más fotos y una descripción clara dan confianza a quien te escribe.'],
    ['Responde con rapidez', 'Quien consulta suele hablar con varios anunciantes: una respuesta pronta marca la diferencia.'],
    ['Actualiza precio y estatus', 'Si cambia el precio o la propiedad ya no está disponible, actualízalo desde tu panel.'],
  ]
  const lista = consejos.map(([t, c]) => `<p style="margin:0 0 12px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#303339"><strong style="color:${COLORES.rojo}">${escapar(t)}:</strong> ${escapar(c)}</p>`).join('')
  const filas =
    filaHero({ kicker: 'Propiedad publicada', titulo: 'Gracias por elegirnos', texto: `${hola(d.nombre)} tu propiedad ya está publicada. Ahora prepárate para recibir interesados.`, boton: { texto: 'Ir a mis propiedades', url: d.urlPanel }, nota: `Folio: ${d.folio}` }) +
    fila(tarjetaDestacada(d.propiedad), 26, 8) +
    fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E7E3DD;border-radius:10px"><tr><td style="padding:20px 22px"><h2 style="margin:0 0 14px;font-family:${FUENTE};font-size:18px;line-height:25px;font-weight:700;color:${COLORES.negro};text-align:center">Te ayudamos a gestionar tu propiedad con estos consejos</h2>${lista}</td></tr></table>`, 8, 30)
  const texto = `Gracias por elegirnos\n\n${hola(d.nombre)} tu propiedad ya está publicada. Ahora prepárate para recibir interesados.\n\n${texto1(d.propiedad)}\nFolio: ${d.folio}\n\nIr a mis propiedades: ${d.urlPanel}\n\nConsejos:\n${consejos.map(([t, c]) => `- ${t}: ${c}`).join('\n')}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Tu propiedad ya está en línea. Estos consejos te ayudan a recibir mejores consultas.', filas, avisoPropiedades: false, pie: `Recibes este correo porque publicaste una propiedad en VIVE BIEN. Dudas: <a href="mailto:${escapar(NEGOCIO.email)}" style="color:${AZUL}">${escapar(NEGOCIO.email)}</a>.` }), texto }
}

/** Piezas compartidas con eventos-pendientes.ts. */
export { botonContorno, botonLleno, corto, fila, hola, nombreSaludo, tarjetaHorizontal, texto1 }
