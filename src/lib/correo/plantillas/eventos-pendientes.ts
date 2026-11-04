import { AZUL, filaHero, filaTexto, FUENTE, marcoCorreo, TEXTO } from './bloques'
import { rejillaPropiedades, tarjetaDestacada } from './campana'
import { botonContorno, botonLleno, corto, fila, hola, tarjetaHorizontal, texto1 } from './eventos'
import { COLORES, escapar, pieTexto, urlSegura, type Correo, type TarjetaCorreo } from './marca'

/**
 * Resto de las plantillas del catálogo (30-oct-2026), con la misma estructura que las capturas de referencia: marco con logotipo, saludo grande, tarjeta de propiedad
 * (foto, operación, precio, zona), recuadro de datos o consejos, botón de acción y pie. Todas son funciones PURAS y NINGÚN código las envía todavía: los eventos que las
 * dispararían (cambio de correo, baja de cuenta, consultas, publicación, revisión, nuevos interesados, blog) no existen en el código. Una prueba lo comprueba.
 */

const caja = (titulo: string, cuerpoHtml: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E7E3DD;border-radius:10px"><tr><td style="padding:20px 22px"><h2 style="margin:0 0 12px;font-family:${FUENTE};font-size:17px;line-height:24px;font-weight:700;color:${COLORES.negro}">${escapar(titulo)}</h2>${cuerpoHtml}</td></tr></table>`
const parrafoCaja = (html: string) => `<p style="margin:0 0 10px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#303339">${html}</p>`
const gris = (html: string, align = 'center') => `<p style="margin:0;font-family:${TEXTO};font-size:13px;line-height:20px;color:#6B7280;text-align:${align}">${html}</p>`
const folioHtml = (folio: string) => `<p style="margin:0 0 12px;font-family:${FUENTE};font-size:13px;line-height:20px;color:${COLORES.gris}">Folio: <strong style="color:${COLORES.negro}">${escapar(folio)}</strong></p>`
const PIE_SERVICIO = 'Este mensaje es parte del servicio de tu cuenta en VIVE BIEN; no es publicidad.'

/** Cambio de correo o de datos sensibles (seguridad). Va al correo anterior y al nuevo. EVENTO PENDIENTE. */
export function plantillaCambioCorreo(d: { nombre?: string | null; correoNuevo: string; urlConfirmar: string; urlNoFuiYo: string }): Correo {
  const asunto = 'Confirma el cambio de correo de tu cuenta de VIVE BIEN'
  const filas =
    filaTexto({ kicker: 'Seguridad de tu cuenta', titulo: hola(d.nombre), grande: true, parrafos: [`Recibimos una solicitud para cambiar el correo de tu cuenta a <strong>${escapar(d.correoNuevo)}</strong>.`] }) +
    fila(botonLleno('Confirmar el cambio', d.urlConfirmar), 6, 18) +
    fila(caja('¿No fuiste tú?', parrafoCaja('Si no pediste este cambio, no confirmes nada y avísanos de inmediato: protegeremos tu cuenta.') + `<div style="text-align:center">${botonContorno('No fui yo', d.urlNoFuiYo)}</div>`), 4, 30)
  const texto = `${hola(d.nombre)}\n\nRecibimos una solicitud para cambiar el correo de tu cuenta a ${d.correoNuevo}.\n\nConfirmar el cambio: ${d.urlConfirmar}\n\nSi no fuiste tú, no confirmes nada y avísanos: ${d.urlNoFuiYo}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Alguien pidió cambiar el correo de tu cuenta. Confírmalo solo si fuiste tú.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Confirmación de baja de cuenta. EVENTO PENDIENTE (el proceso de baja existe; hoy no manda correo). */
export function plantillaBajaCuenta(d: { nombre?: string | null; fecha: string; urlAyuda: string }): Correo {
  const asunto = 'Confirmamos la baja de tu cuenta de VIVE BIEN'
  const filas =
    filaTexto({ kicker: 'Baja de cuenta', titulo: hola(d.nombre), grande: true, parrafos: [`Tu cuenta de VIVE BIEN quedó dada de baja el <strong>${escapar(d.fecha)}</strong>. Gracias por haber sido parte de la comunidad.`] }) +
    fila(caja('Qué pasó con tus datos', parrafoCaja('Eliminamos tu cuenta y tus avisos. Solo conservamos lo que la ley nos obliga a conservar y, si te diste de baja de promociones, una marca para no volver a escribirte.') + parrafoCaja('Puedes volver a crear una cuenta cuando quieras.')), 6, 20) +
    fila(botonContorno('Ver el Centro de Ayuda', d.urlAyuda), 4, 30)
  const texto = `${hola(d.nombre)}\n\nTu cuenta de VIVE BIEN quedó dada de baja el ${d.fecha}.\n\nEliminamos tu cuenta y tus avisos. Solo conservamos lo que la ley nos obliga a conservar y, si te diste de baja de promociones, una marca para no volver a escribirte. Puedes volver a crear una cuenta cuando quieras.\n\nCentro de Ayuda: ${d.urlAyuda}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Tu cuenta se dio de baja. Esto es lo que pasó con tus datos.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Respuesta o seguimiento a una consulta: acuse con la propiedad, qué sigue y propiedades parecidas. EVENTO PENDIENTE. */
export function plantillaConsultaRespuesta(d: { nombre?: string | null; propiedad: TarjetaCorreo; anunciante: string; similares: TarjetaCorreo[]; urlConsultas: string; urlCatalogo: string; urlPreferencias: string }): Correo {
  const asunto = corto(`Recibimos tu consulta sobre ${d.propiedad.titulo}`, 78)
  const filas =
    filaTexto({ kicker: 'Tu consulta', titulo: hola(d.nombre), grande: true, parrafos: [`Recibimos tu consulta y <strong>${escapar(d.anunciante)}</strong> te responderá lo antes posible. Esta es la propiedad por la que preguntaste:`] }) +
    fila(tarjetaDestacada(d.propiedad), 4, 10) +
    fila(caja('Qué sigue', parrafoCaja('Te contactarán por el medio que nos dejaste. Puedes ver el estado de tu consulta cuando quieras.') + `<div style="text-align:center">${botonContorno('Ver mis consultas', d.urlConsultas)}</div>`), 4, 22) +
    (d.similares.length ? fila(`<h2 style="margin:0 0 14px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro};text-align:center">Más propiedades que podrían gustarte</h2>${rejillaPropiedades(d.similares.slice(0, 4))}`, 6, 6) : '') +
    fila(botonContorno('Encontrar más opciones', d.urlCatalogo), 8, 30)
  const texto = `${hola(d.nombre)}\n\nRecibimos tu consulta y ${d.anunciante} te responderá lo antes posible.\n\n${texto1(d.propiedad)}\n\nVer mis consultas: ${d.urlConsultas}\n${d.similares.length ? `\nMás propiedades que podrían gustarte:\n${d.similares.slice(0, 4).map((p, i) => `${i + 1}. ${texto1(p)}`).join('\n')}\n` : ''}\nEncontrar más opciones: ${d.urlCatalogo}\n\nCambiar mis avisos: ${d.urlPreferencias}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Recibimos tu consulta: te responderán lo antes posible.', filas, pie: `Recibes este correo porque enviaste una consulta en vivebienn.com. <a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:${AZUL};text-decoration:underline">Cambiar mis avisos</a>.` }), texto }
}

/** Confirmación al subir una propiedad (borrador recibido). EVENTO PENDIENTE. */
export function plantillaPropiedadRecibida(d: { nombre?: string | null; propiedad: TarjetaCorreo; folio: string; porcentaje: number; urlPanel: string }): Correo {
  const asunto = corto(`Recibimos tu propiedad: ${d.propiedad.titulo}`, 78)
  const filas =
    filaTexto({ kicker: 'Propiedad recibida', titulo: hola(d.nombre), grande: true, parrafos: ['Guardamos tu propiedad como borrador. Todavía <strong>no está publicada</strong>: complétala y envíala a revisión.'] }) +
    fila(folioHtml(d.folio) + tarjetaHorizontal(d.propiedad), 4, 16) +
    fila(caja('Cómo va tu ficha', parrafoCaja(`Tu ficha está al <strong>${Math.max(0, Math.min(100, Math.round(d.porcentaje)))} %</strong>. Para enviarla a revisión necesita al menos 80 % y 3 fotos.`)), 0, 20) +
    fila(botonLleno('Completar mi propiedad', d.urlPanel), 4, 30)
  const texto = `${hola(d.nombre)}\n\nGuardamos tu propiedad como borrador. Todavía no está publicada.\n\n${texto1(d.propiedad)}\nFolio: ${d.folio}\nTu ficha está al ${Math.round(d.porcentaje)} %. Para enviarla a revisión necesita al menos 80 % y 3 fotos.\n\nCompletar mi propiedad: ${d.urlPanel}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Tu propiedad quedó como borrador. Complétala y envíala a revisión.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Propiedad enviada a revisión. EVENTO PENDIENTE. */
export function plantillaPropiedadEnRevision(d: { nombre?: string | null; propiedad: TarjetaCorreo; folio: string; urlPanel: string }): Correo {
  const asunto = corto(`Tu propiedad está en revisión: ${d.propiedad.titulo}`, 78)
  const filas =
    filaHero({ kicker: 'En revisión', titulo: 'Estamos revisando tu propiedad', texto: `${hola(d.nombre)} un asesor de VIVE BIEN la revisará antes de publicarla.`, nota: `Folio: ${d.folio}` }) +
    fila(tarjetaHorizontal(d.propiedad), 26, 16) +
    fila(caja('Qué sigue', parrafoCaja('Te avisaremos cuando esté publicada o si necesitamos que cambies algo. Mientras tanto no podrás editarla.')), 0, 20) +
    fila(botonContorno('Ver el estado en mi panel', d.urlPanel), 4, 30)
  const texto = `Estamos revisando tu propiedad\n\n${hola(d.nombre)} un asesor de VIVE BIEN la revisará antes de publicarla.\n\n${texto1(d.propiedad)}\nFolio: ${d.folio}\n\nTe avisaremos cuando esté publicada o si necesitamos que cambies algo.\n\nVer el estado en mi panel: ${d.urlPanel}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Un asesor revisará tu propiedad antes de publicarla.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Propiedad rechazada o con cambios solicitados. EVENTO PENDIENTE. */
export function plantillaPropiedadRechazada(d: { nombre?: string | null; propiedad: TarjetaCorreo; folio: string; motivo: string; pideCambios: boolean; urlEditar: string }): Correo {
  const asunto = corto(d.pideCambios ? `Necesitamos cambios en tu propiedad: ${d.propiedad.titulo}` : `Tu propiedad no pudo publicarse: ${d.propiedad.titulo}`, 78)
  const titulo = d.pideCambios ? 'Necesitamos algunos cambios' : 'No pudimos publicar tu propiedad'
  const filas =
    filaTexto({ kicker: d.pideCambios ? 'Cambios solicitados' : 'Revisión', titulo, grande: true, parrafos: [`${escapar(hola(d.nombre))} revisamos tu propiedad y esto es lo que sigue.`] }) +
    fila(folioHtml(d.folio) + tarjetaHorizontal(d.propiedad), 4, 16) +
    fila(caja('Lo que dijo el revisor', parrafoCaja(escapar(d.motivo))), 0, 20) +
    fila(d.pideCambios ? botonLleno('Corregir mi propiedad', d.urlEditar) : botonContorno('Ver mi propiedad', d.urlEditar), 4, 30)
  const texto = `${titulo}\n\n${hola(d.nombre)} revisamos tu propiedad y esto es lo que sigue.\n\n${texto1(d.propiedad)}\nFolio: ${d.folio}\n\nLo que dijo el revisor: ${d.motivo}\n\n${d.pideCambios ? 'Corregir mi propiedad' : 'Ver mi propiedad'}: ${d.urlEditar}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: d.pideCambios ? 'Tu propiedad necesita unos cambios antes de publicarse.' : 'Tu propiedad no pudo publicarse. Aquí está el motivo.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Aviso al anunciante de un nuevo interesado. Sin datos personales de quien consulta (solo con permiso, y no en el correo). EVENTO PENDIENTE. */
export function plantillaNuevoInteresado(d: { nombre?: string | null; propiedad: TarjetaCorreo; canal: string; urlPanel: string }): Correo {
  const asunto = corto(`Hay un nuevo interesado en ${d.propiedad.titulo}`, 78)
  const filas =
    filaHero({ kicker: 'Nuevo interesado', titulo: 'Alguien preguntó por tu propiedad', texto: `${hola(d.nombre)} recibiste una consulta nueva por ${d.canal}. Respóndela pronto.`, boton: { texto: 'Ver la consulta', url: d.urlPanel } }) +
    fila(tarjetaHorizontal(d.propiedad), 26, 16) +
    fila(caja('Un consejo', parrafoCaja('Quien consulta suele hablar con varios anunciantes: una respuesta pronta marca la diferencia. Los datos de la persona los ves dentro de tu panel, no en este correo.')), 0, 30)
  const texto = `Alguien preguntó por tu propiedad\n\n${hola(d.nombre)} recibiste una consulta nueva por ${d.canal}. Respóndela pronto.\n\n${texto1(d.propiedad)}\n\nVer la consulta: ${d.urlPanel}\n\nLos datos de la persona los ves dentro de tu panel, no en este correo.${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Recibiste una consulta nueva. Respóndela pronto.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

/** Artículos del blog y novedades (PROMOCIONAL: solo con consentimiento vigente, con baja de un clic). EVENTO PENDIENTE y apagado por falta de texto legal. */
export type ArticuloDeCorreo = { titulo: string; resumen: string; url: string; foto: string | null; categoria?: string | null; minutos?: number | null }

/** «CATEGORÍA · 5 min de lectura» (lo que falte se omite). */
function etiquetaDeArticulo(a: ArticuloDeCorreo): string {
  const min = typeof a.minutos === 'number' && Number.isFinite(a.minutos) && a.minutos > 0 ? `${Math.round(a.minutos)} min de lectura` : ''
  return [a.categoria?.trim(), min].filter(Boolean).join(' · ')
}

/** El artículo destacado: portada a todo lo ancho, titular grande, resumen y un botón que invita a leer. */
function articuloDestacado(a: ArticuloDeCorreo, saludo: string): string {
  const u = escapar(urlSegura(a.url))
  const portada = a.foto
    ? `<tr><td style="padding:0"><a href="${u}" target="_blank"><img class="property-image" src="${escapar(urlSegura(a.foto))}" width="640" alt="${escapar(a.titulo)}" style="display:block;width:100%;max-width:640px;height:auto;border:0;background:${COLORES.fondo};font-family:${FUENTE};font-size:18px;font-weight:700;line-height:1.4;color:${COLORES.negro}"></a></td></tr>`
    : ''
  const etiqueta = etiquetaDeArticulo(a)
  return `<tr><td style="padding:0;background:${COLORES.blanco}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${portada}<tr><td class="mobile-pad" style="padding:30px 42px 34px;background:${COLORES.blanco}"><p style="margin:0 0 16px;font-family:${TEXTO};font-size:15px;line-height:24px;color:#535761">${escapar(saludo)} esto es lo nuevo que preparamos para ti.</p><p style="margin:0 0 12px;font-family:${FUENTE};font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:${COLORES.rojo}">El blog de VIVE BIEN${etiqueta ? ` · ${escapar(etiqueta)}` : ''}</p><h2 class="headline" style="margin:0 0 14px;font-family:${FUENTE};font-size:30px;line-height:38px;font-weight:800;letter-spacing:-.5px;color:${COLORES.negro}"><a href="${u}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(a.titulo)}</a></h2><p style="margin:0 0 24px;font-family:${TEXTO};font-size:17px;line-height:28px;color:#535761">${escapar(a.resumen)}</p>${botonLleno('Leer el artículo →', a.url)}</td></tr></table></td></tr>`
}

/** Un artículo secundario: miniatura y texto lado a lado (se apilan en el teléfono). */
function articuloSecundario(a: ArticuloDeCorreo): string {
  const u = escapar(urlSegura(a.url))
  const foto = a.foto
    ? `<td class="stack" width="38%" valign="top" style="width:38%"><a href="${u}" target="_blank"><img src="${escapar(urlSegura(a.foto))}" width="220" alt="${escapar(a.titulo)}" style="display:block;width:100%;height:auto;border:0;background:${COLORES.fondo}"></a></td>`
    : ''
  const etiqueta = etiquetaDeArticulo(a)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid #E7E3DD"><tr>${foto}<td class="stack" valign="top" style="padding:18px 20px">${etiqueta ? `<p style="margin:0 0 6px;font-family:${FUENTE};font-size:10px;line-height:15px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${COLORES.rojo}">${escapar(etiqueta)}</p>` : ''}<p style="margin:0 0 8px;font-family:${FUENTE};font-size:18px;line-height:25px;font-weight:700;color:${COLORES.negro}"><a href="${u}" target="_blank" style="color:${COLORES.negro};text-decoration:none">${escapar(a.titulo)}</a></p><p style="margin:0 0 12px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#535761">${escapar(a.resumen)}</p><a href="${u}" target="_blank" style="font-family:${FUENTE};font-size:14px;font-weight:700;color:${COLORES.rojo};text-decoration:none">Seguir leyendo →</a></td></tr></table>`
}

export function plantillaNovedades(d: { nombre?: string | null; articulos: ArticuloDeCorreo[]; propiedades: TarjetaCorreo[]; urlBlog: string; urlBaja: string; urlPreferencias: string }): Correo {
  const [destacado, ...resto] = d.articulos.slice(0, 3)
  // El asunto y el preheader son el título y el resumen del artículo destacado: es lo que hace abrir el correo. Sin artículos, el texto genérico de siempre.
  const asunto = destacado ? corto(destacado.titulo, 78) : 'Novedades del blog y propiedades de VIVE BIEN'
  const preheader = destacado ? corto(destacado.resumen, 110) : 'Artículos nuevos del blog y propiedades recientes.'
  const filas =
    (destacado ? articuloDestacado(destacado, hola(d.nombre)) : filaTexto({ kicker: 'Novedades', titulo: hola(d.nombre), grande: true, parrafos: ['Esto es lo nuevo en el blog y en el catálogo de VIVE BIEN.'] })) +
    (resto.length ? fila(`<h2 style="margin:0 0 16px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro}">Más para leer</h2>${resto.map(articuloSecundario).join('')}`, 6, 8) : '') +
    (d.propiedades.length ? fila(`<h2 style="margin:0 0 14px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro};text-align:center">Propiedades recientes</h2>${rejillaPropiedades(d.propiedades.slice(0, 4))}`, 6, 6) : '') +
    fila(botonLleno('Ver todos los artículos', d.urlBlog), 8, 30)
  const pie = `Recibes este correo porque aceptaste recibir novedades de VIVE BIEN. <a href="${escapar(urlSegura(d.urlBaja))}" style="color:${AZUL};text-decoration:underline">Darme de baja con un clic</a> · <a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:${AZUL};text-decoration:underline">Mis preferencias</a>.`
  const texto = `${hola(d.nombre)}\n\nEsto es lo nuevo en el blog y en el catálogo de VIVE BIEN.\n\n${d.articulos.slice(0, 3).map((a, i) => `${i + 1}. ${a.titulo}\n   ${a.resumen}\n   ${a.url}`).join('\n')}\n${d.propiedades.length ? `\nPropiedades recientes:\n${d.propiedades.slice(0, 4).map((p, i) => `${i + 1}. ${texto1(p)}`).join('\n')}\n` : ''}\nIr al blog: ${d.urlBlog}\n\nRecibes este correo porque aceptaste recibir novedades de VIVE BIEN.\nDarme de baja con un clic: ${d.urlBaja}\nMis preferencias: ${d.urlPreferencias}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader, filas, pie }), texto }
}

/** Recuperar o cambiar contraseña. LO MANDA FIREBASE: este es el DISEÑO PROPUESTO para configurarlo en su consola (no está conectado). */
export function plantillaRecuperarContrasena(d: { nombre?: string | null; urlRestablecer: string }): Correo {
  const asunto = 'Restablece tu contraseña de VIVE BIEN'
  const filas =
    filaTexto({ kicker: 'Seguridad de tu cuenta', titulo: hola(d.nombre), grande: true, parrafos: ['Recibimos una solicitud para restablecer la contraseña de tu cuenta de VIVE BIEN.'] }) +
    fila(botonLleno('Crear una contraseña nueva', d.urlRestablecer), 6, 22) +
    fila(`<p style="margin:0 0 8px;font-family:${TEXTO};font-size:13px;line-height:20px;color:#4B5563;text-align:center">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p><p style="margin:0;font-family:${TEXTO};font-size:12px;line-height:19px;color:${COLORES.rojo};text-align:center;word-break:break-all">${escapar(urlSegura(d.urlRestablecer))}</p>`, 0, 18) +
    fila(gris('Si tú no lo pediste, ignora este correo: tu contraseña no cambiará.'), 0, 30)
  const texto = `${hola(d.nombre)}\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta de VIVE BIEN:\n${d.urlRestablecer}\n\nSi tú no lo pediste, ignora este correo: tu contraseña no cambiará.${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: 'Crea una contraseña nueva para tu cuenta.', filas, avisoPropiedades: false, pie: 'Este mensaje es de seguridad de tu cuenta: no es publicidad.' }), texto }
}
