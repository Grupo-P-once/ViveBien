import { AZUL, filaHero, filaTexto, FUENTE, marcoCorreo, TEXTO } from './bloques'
import { rejillaPropiedades } from './campana'
import { botonContorno, botonLleno, corto, fila, hola, tarjetaHorizontal, texto1 } from './eventos'
import { COLORES, escapar, pieTexto, urlSegura, type Correo, type TarjetaCorreo } from './marca'

/**
 * Plantillas de los eventos que NO tenían diseño (4-nov-2026): invitación aceptada o cancelada, cambio de estatus de una propiedad (pausa, vendida, rentada, reactivación) y cambio de
 * disponibilidad de una propiedad guardada. Mismo marco, mismas piezas y mismas reglas que `eventos-pendientes.ts`: funciones PURAS, todo dato se escapa aquí, solo https y mailto.
 */

const caja = (titulo: string, cuerpoHtml: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E7E3DD;border-radius:10px"><tr><td style="padding:20px 22px"><h2 style="margin:0 0 12px;font-family:${FUENTE};font-size:17px;line-height:24px;font-weight:700;color:${COLORES.negro}">${escapar(titulo)}</h2>${cuerpoHtml}</td></tr></table>`
const parrafoCaja = (html: string) => `<p style="margin:0 0 10px;font-family:${TEXTO};font-size:14px;line-height:22px;color:#303339">${html}</p>`
const PIE_SERVICIO = 'Este mensaje es parte del servicio de tu cuenta en VIVE BIEN; no es publicidad.'

const ROL: Record<string, string> = { cliente: 'cliente', publicador: 'publicador', admin: 'administrador' }

/** Quien invitó se entera de que su invitación se aceptó o se canceló. El correo de la persona invitada es un dato que esa misma persona ya conocía: lo escribió quien lo recibe. */
export function plantillaInvitacionEstado(d: { nombre?: string | null; correoInvitado: string; rol: string; estado: 'aceptada' | 'cancelada'; urlPanel: string }): Correo {
  const aceptada = d.estado === 'aceptada'
  const rol = ROL[d.rol] ?? d.rol
  const asunto = aceptada ? 'Aceptaron tu invitación a VIVE BIEN' : 'Se canceló una invitación a VIVE BIEN'
  const titulo = aceptada ? 'Tu invitación fue aceptada' : 'Se canceló la invitación'
  const detalle = aceptada
    ? `${escapar(d.correoInvitado)} aceptó tu invitación y ya entra a VIVE BIEN como <strong>${escapar(rol)}</strong>.`
    : `La invitación para ${escapar(d.correoInvitado)} (rol <strong>${escapar(rol)}</strong>) se canceló: ya no puede usarse.`
  const filas =
    filaTexto({ kicker: 'Invitaciones', titulo, grande: true, parrafos: [`${escapar(hola(d.nombre))} ${detalle}`] }) +
    fila(botonLleno('Ver las invitaciones', d.urlPanel), 6, 22) +
    fila(caja('Qué puedes hacer', parrafoCaja(aceptada ? 'Puedes ajustar sus permisos desde Usuarios en el panel.' : 'Si fue un error, envía una invitación nueva desde Usuarios en el panel.')), 0, 30)
  const texto = `${titulo}\n\n${hola(d.nombre)} ${aceptada ? `${d.correoInvitado} aceptó tu invitación y ya entra a VIVE BIEN como ${rol}.` : `La invitación para ${d.correoInvitado} (rol ${rol}) se canceló: ya no puede usarse.`}\n\nVer las invitaciones: ${d.urlPanel}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: aceptada ? 'La persona invitada ya puede entrar.' : 'La invitación ya no puede usarse.', filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

export type EstatusAviso = 'pausada' | 'vendida' | 'rentada' | 'disponible'

const ESTATUS: Record<EstatusAviso, { asunto: string; kicker: string; titulo: string; texto: string; consejo: string }> = {
  pausada: { asunto: 'Pausamos tu propiedad', kicker: 'Propiedad en pausa', titulo: 'Tu propiedad está en pausa', texto: 'dejó de mostrarse en el catálogo mientras esté en pausa.', consejo: 'Cuando quieras mostrarla otra vez, reactívala desde tu panel.' },
  vendida: { asunto: 'Marcamos tu propiedad como vendida', kicker: 'Propiedad vendida', titulo: 'Tu propiedad se marcó como vendida', texto: 'quedó marcada como vendida. Sigue visible, pero ya no recibe consultas nuevas.', consejo: 'Gracias por publicar con VIVE BIEN. Si algo no es correcto, avísanos.' },
  rentada: { asunto: 'Marcamos tu propiedad como rentada', kicker: 'Propiedad rentada', titulo: 'Tu propiedad se marcó como rentada', texto: 'quedó marcada como rentada. Sigue visible, pero ya no recibe consultas nuevas.', consejo: 'Gracias por publicar con VIVE BIEN. Si algo no es correcto, avísanos.' },
  disponible: { asunto: 'Tu propiedad vuelve a estar disponible', kicker: 'Propiedad disponible', titulo: 'Tu propiedad está disponible otra vez', texto: 'volvió a mostrarse como disponible en el catálogo.', consejo: 'Revisa que el precio y las fotos sigan al día.' },
}

/** Al DUEÑO de una propiedad: su anuncio cambió de estatus (pausa, vendida, rentada o disponible otra vez). */
export function plantillaEstatusPropiedad(d: { nombre?: string | null; propiedad: TarjetaCorreo; folio: string; estatus: EstatusAviso; urlPanel: string }): Correo {
  const e = ESTATUS[d.estatus]
  const asunto = corto(`${e.asunto}: ${d.propiedad.titulo}`, 78)
  const filas =
    filaHero({ kicker: e.kicker, titulo: e.titulo, texto: `${hola(d.nombre)} tu propiedad ${e.texto}`, boton: { texto: 'Ir a mis propiedades', url: d.urlPanel }, nota: `Folio: ${d.folio}` }) +
    fila(tarjetaHorizontal(d.propiedad), 26, 16) +
    fila(caja('Qué sigue', parrafoCaja(escapar(e.consejo))), 0, 30)
  const texto = `${e.titulo}\n\n${hola(d.nombre)} tu propiedad ${e.texto}\n\n${texto1(d.propiedad)}\nFolio: ${d.folio}\n\nIr a mis propiedades: ${d.urlPanel}\n\n${e.consejo}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: e.titulo, filas, avisoPropiedades: false, pie: PIE_SERVICIO }), texto }
}

const DISPONIBILIDAD: Record<EstatusAviso, { asunto: string; titulo: string; texto: string }> = {
  pausada: { asunto: 'Una propiedad guardada está en pausa', titulo: 'Una propiedad que guardaste está en pausa', texto: 'está en pausa y dejó de mostrarse en el catálogo.' },
  vendida: { asunto: 'Una propiedad guardada ya se vendió', titulo: 'Una propiedad que guardaste ya se vendió', texto: 'ya se vendió.' },
  rentada: { asunto: 'Una propiedad guardada ya se rentó', titulo: 'Una propiedad que guardaste ya se rentó', texto: 'ya se rentó.' },
  disponible: { asunto: 'Una propiedad guardada vuelve a estar disponible', titulo: 'Una propiedad que guardaste está disponible otra vez', texto: 'volvió a estar disponible.' },
}

/** A quien guardó una propiedad como favorita (servicio: lo pidió al guardarla): su disponibilidad cambió. `similares` solo si la propiedad ya no está disponible. */
export function plantillaDisponibilidadFavorita(d: { nombre?: string | null; propiedad: TarjetaCorreo; estatus: EstatusAviso; similares: TarjetaCorreo[]; urlFavoritos: string; urlCatalogo: string; urlPreferencias: string }): Correo {
  const e = DISPONIBILIDAD[d.estatus]
  const asunto = corto(`${e.asunto}: ${d.propiedad.titulo}`, 78)
  const sim = d.estatus === 'disponible' ? [] : d.similares.slice(0, 4)
  const filas =
    filaTexto({ kicker: 'Tus guardadas', titulo: e.titulo, grande: true, parrafos: [`${escapar(hola(d.nombre))} <strong>${escapar(d.propiedad.titulo)}</strong> ${e.texto}`] }) +
    fila(tarjetaHorizontal(d.propiedad), 4, 16) +
    fila(botonLleno('Ver mis guardadas', d.urlFavoritos), 4, 22) +
    (sim.length ? fila(`<h2 style="margin:0 0 14px;font-family:${FUENTE};font-size:20px;line-height:27px;font-weight:700;color:${COLORES.negro};text-align:center">Otras opciones parecidas</h2>${rejillaPropiedades(sim)}`, 6, 6) : '') +
    fila(botonContorno('Encontrar más opciones', d.urlCatalogo), 8, 30)
  const pie = `Recibes este correo porque guardaste esta propiedad en vivebienn.com. <a href="${escapar(urlSegura(d.urlPreferencias))}" style="color:${AZUL};text-decoration:underline">Cambiar mis avisos</a>.`
  const texto = `${e.titulo}\n\n${hola(d.nombre)} ${d.propiedad.titulo} ${e.texto}\n\n${texto1(d.propiedad)}\n\nVer mis guardadas: ${d.urlFavoritos}\n${sim.length ? `\nOtras opciones parecidas:\n${sim.map((p, i) => `${i + 1}. ${texto1(p)}`).join('\n')}\n` : ''}\nEncontrar más opciones: ${d.urlCatalogo}\n\nRecibes este correo porque guardaste esta propiedad en vivebienn.com. Cambiar mis avisos: ${d.urlPreferencias}${pieTexto()}`
  return { asunto, html: marcoCorreo({ preheader: e.titulo, filas, pie }), texto }
}
