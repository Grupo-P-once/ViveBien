import { SITIO } from '../sitio'
import { NEGOCIO } from '../config/negocio'
import { remitenteDe } from './enviar'
import { plantilla as plantillaDeCita, type DatosPlantilla as DatosDeCita, type Para as ParaDeCita, type TipoCorreo as TipoDeCita } from '../citas/correos'
import { correoDeAlertas, correoDeBajaDePrecio, correoLegal, type NotificacionNueva } from '../avisos-cliente'
import { plantillaBienvenida, plantillaPrimerasPropiedades, plantillaRecomendaciones, plantillaSolicitudPublicador, type TarjetaCorreo } from './plantillas'

/**
 * BIBLIOTECA de correos (F1, 30-oct-2026): los correos que YA existen en el código, con una vista previa hecha SOLO con datos SINTÉTICOS (ninguna persona,
 * propiedad, búsqueda ni enlace con token reales). La vista previa se calcula en el servidor, no dispara ningún evento ni envía nada, y no lee la base.
 * Es la parte de «solo lectura» de la Fase 1 de la propuesta del diseñador; el editor, las campañas y la aprobación NO existen todavía.
 */
export type Categoria = 'transaccional' | 'servicio' | 'marketing'
export type EstadoDeEnvio = 'envia_hoy' | 'codigo_apagado' | 'apagado_por_texto_legal'

export type TipoDeCorreo = {
  id: string
  nombre: string
  categoria: Categoria
  estado: EstadoDeEnvio
  /** Qué hace que este correo salga (disparador real en el código). */
  disparador: string
  vista: (m: Muestra) => { asunto: string; html: string; texto: string }
}

/**
 * Lo único que el administrador puede cambiar en una vista previa. Es una LISTA BLANCA: el servidor ignora cualquier otro valor, así que la vista
 * previa no puede pedir una persona, una propiedad ni un enlace reales (no hay nada que leer de la base).
 */
export const NOMBRES_DE_MUESTRA = ['Persona Sintética', 'Ana Ejemplo', 'Luis Ejemplo'] as const
export const MAX_PROPIEDADES_DE_MUESTRA = 3
/** `origenImagenes` NUNCA viene del navegador: lo pone la ruta (el propio despliegue) para servir las imágenes de ejemplo de /correo-ejemplo/. */
export type Muestra = { nombre: string; propiedades: number; imagenes: boolean; origenImagenes?: string }
export const MUESTRA_POR_OMISION: Muestra = { nombre: NOMBRES_DE_MUESTRA[0], propiedades: 2, imagenes: true }

/** Normaliza lo que llega del navegador a una muestra permitida (cualquier valor fuera de la lista vuelve al valor por omisión). */
export function muestraPermitida(nombre: unknown, propiedades: unknown, imagenes: unknown = undefined): Muestra {
  const n = (NOMBRES_DE_MUESTRA as readonly string[]).find((x) => x === nombre) ?? MUESTRA_POR_OMISION.nombre
  const p = Number(propiedades)
  return { nombre: n, propiedades: Number.isInteger(p) && p >= 1 && p <= MAX_PROPIEDADES_DE_MUESTRA ? p : MUESTRA_POR_OMISION.propiedades, imagenes: imagenes === undefined || imagenes === null ? MUESTRA_POR_OMISION.imagenes : imagenes === '1' || imagenes === true }
}

const PROPIEDADES_SINTETICAS: TarjetaCorreo[] = [
  { titulo: 'Nave industrial de ejemplo A', url: `${SITIO}/propiedades`, foto: null, lugar: 'Zona de ejemplo, León', precio: '$12,000,000', etiqueta: 'Nave · En venta', datos: ['1,800 m²', 'Altura libre 10 m'] },
  { titulo: 'Casa de ejemplo B', url: `${SITIO}/propiedades`, foto: null, lugar: 'Colonia de ejemplo, León', precio: '$3,200,000', etiqueta: 'Casa · En venta', datos: ['3 recámaras', '2 baños'] },
  { titulo: 'Terreno de ejemplo C', url: `${SITIO}/propiedades`, foto: null, lugar: 'Zona de ejemplo, León', precio: '$1,450,000', etiqueta: 'Terreno · En venta', datos: ['600 m²'] },
]
/** Fotos de EJEMPLO (marcadas «FOTO DE EJEMPLO» en la propia imagen); los correos reales llevan la foto de cada propiedad. */
const tarjetas = (m: Muestra) => PROPIEDADES_SINTETICAS.slice(0, m.propiedades).map((p, i) => (m.imagenes ? { ...p, foto: `${m.origenImagenes ?? SITIO}/correo-ejemplo/propiedad-${'abc'[i]}.svg` } : p))
const AVISO_PRECIO: NotificacionNueva = { uid: 'sintetico', tipo: 'baja_de_precio', titulo: 'Bajó de precio: Casa de ejemplo B', cuerpo: 'Antes $3,400,000, ahora $3,200,000.', enlace: '/propiedades', busqueda_id: null, propiedad_id: null, clave: 'sintetico/1' }
const AVISO_LEGAL: NotificacionNueva = { uid: 'sintetico', tipo: 'legal', titulo: 'Actualizamos los Términos y Condiciones', cuerpo: 'Texto de ejemplo del aviso. Versión de ejemplo.', enlace: '/terminos', busqueda_id: null, propiedad_id: null, clave: 'sintetico/2' }
const PREFERENCIAS = `${SITIO}/portal/configuracion`
const BAJA_INERTE = `${SITIO}/?enlace=deshabilitado-en-pruebas`

const aVista = (c: { asunto: string; html: string; texto: string }) => ({ asunto: c.asunto, html: c.html, texto: c.texto })

export const BIBLIOTECA: TipoDeCorreo[] = [
  { id: 'alertas', nombre: 'Alertas de búsquedas guardadas', categoria: 'servicio', estado: 'envia_hoy', disparador: 'Tarea diaria, solo con el consentimiento propio de la persona (apagado por defecto)',
    vista: (m) => aVista(correoDeAlertas({ nombre: m.nombre, grupos: [{ busquedaNombre: 'Naves en venta (ejemplo)', href: '/propiedades', items: [{ titulo: 'Nave industrial de ejemplo A', cuerpo: '1,800 m²', url: `${SITIO}/propiedades` }] }], sitio: SITIO, urlBaja: BAJA_INERTE, urlPreferencias: PREFERENCIAS })) },
  { id: 'baja_de_precio', nombre: 'Baja de precio', categoria: 'servicio', estado: 'envia_hoy', disparador: 'Tarea diaria, solo con el consentimiento propio y la campana de esa propiedad (apagado por defecto)',
    vista: (m) => aVista(correoDeBajaDePrecio({ nombre: m.nombre, avisos: [AVISO_PRECIO], sitio: SITIO, urlBaja: BAJA_INERTE, urlPreferencias: PREFERENCIAS })) },
  { id: 'legal', nombre: 'Aviso de cambio de Términos o Aviso de Privacidad', categoria: 'servicio', estado: 'envia_hoy', disparador: 'Cuando se sube una versión legal y la persona aceptó una anterior (texto y tratamiento pendientes de asesoría legal)',
    vista: (m) => aVista(correoLegal({ nombre: m.nombre, avisos: [AVISO_LEGAL], sitio: SITIO, urlPreferencias: PREFERENCIAS })) },
  { id: 'bienvenida', nombre: 'Bienvenida a una cuenta nueva', categoria: 'transaccional', estado: 'codigo_apagado', disparador: 'Alta de cuenta; apagado por defecto (CORREO_TRANSACCIONAL)',
    vista: (m) => aVista(plantillaBienvenida({ nombre: m.nombre, urlPreferencias: PREFERENCIAS, resumen: { guardadas: 2, busquedas: 1, citas: 0 }, propiedades: tarjetas(m) })) },
  { id: 'solicitud_publicador', nombre: 'Confirmación de solicitud para publicar', categoria: 'transaccional', estado: 'codigo_apagado', disparador: 'Solicitud «Quiero publicar»; apagado por defecto (CORREO_TRANSACCIONAL)',
    vista: (m) => aVista(plantillaSolicitudPublicador({ nombre: m.nombre, referencia: 'SOL-EJEMPLO' })) },
  { id: 'primeras_propiedades', nombre: 'Primeras propiedades (suscripción)', categoria: 'marketing', estado: 'apagado_por_texto_legal', disparador: 'Suscripción pública: APLAZADA; sin texto legal aprobado nada de marketing sale',
    vista: (m) => aVista(plantillaPrimerasPropiedades({ nombre: m.nombre, resumen: 'naves en venta en León', propiedades: tarjetas(m), urlConfirmar: BAJA_INERTE, urlBaja: BAJA_INERTE, diasValidez: 7 })) },
  { id: 'recomendaciones', nombre: 'Recomendaciones de propiedades', categoria: 'marketing', estado: 'apagado_por_texto_legal', disparador: 'Digest periódico: APAGADO por una constante de código hasta tener texto legal y consentimiento aprobados',
    vista: (m) => aVista(plantillaRecomendaciones({ nombre: m.nombre, propiedades: tarjetas(m), motivo: 'Elegimos estas propiedades según lo que pediste (ejemplo).', urlBaja: BAJA_INERTE, urlPreferencias: PREFERENCIAS })) },
]

/** Correos que existen pero cuya plantilla está escrita DENTRO del emisor (no se pueden previsualizar sin refactorizar el emisor). */
export const SIN_VISTA_PREVIA: ReadonlyArray<{ nombre: string; motivo: string }> = [
  { nombre: 'Aviso interno de nuevo contacto (lead)', motivo: 'Su plantilla está escrita dentro del emisor, mezclada con los datos reales del contacto; mostrarla exigiría ejecutarla con datos reales o separarla en una plantilla (refactor pendiente).' },
  { nombre: 'Invitación al panel', motivo: 'Su plantilla está escrita dentro de la ruta que invita y usa un enlace con token; no hay una plantilla independiente que se pueda ejecutar con datos de muestra.' },
  { nombre: '14 tipos de cita (citas en línea apagadas)', motivo: 'Sus plantillas dependen de una cita real (fechas, asesor, enlaces con token) y las citas en línea están apagadas; falta una versión con datos de muestra.' },
]

export type VistaDeCorreo = {
  asunto: string; html: string; texto: string
  remitente: string; responderA: string; para: string; categoria: Categoria
  /** Texto corto que el buzón muestra junto al asunto; `null` si esa plantilla no lo trae. */
  preencabezado: string | null
  /** Lo que la bandeja muestra tras el asunto: el preencabezado o, si no hay, el inicio del texto. */
  extracto: string
  /** Enlaces del HTML tal como saldrían (los de la muestra son sintéticos: nunca llevan token ni persona). */
  enlaces: string[]
  imagenes: string[]
  muestra: Muestra
}

const unicos = (xs: string[]) => [...new Set(xs)]
export const DESTINATARIO_DE_EJEMPLO = 'persona.ejemplo@ejemplo.invalid'

// ── Citas (visitas): las plantillas reales de citas/correos.ts, ejecutadas con una cita FICTICIA ──
const AHORA_DE_EJEMPLO = new Date('2026-10-30T18:00:00Z')
const INICIO_DE_EJEMPLO = new Date('2026-11-05T17:00:00Z')
const CITAS: Array<{ tipo: TipoDeCita; para: ParaDeCita; nombre: string }> = [
  { tipo: 'solicitud_recibida', para: 'cliente', nombre: 'Recibimos tu solicitud de visita' },
  { tipo: 'por_confirmar', para: 'cliente', nombre: 'Confirma tu visita (la agendó el asesor)' },
  { tipo: 'confirmada', para: 'cliente', nombre: 'Tu visita está confirmada' },
  { tipo: 'cambio_propuesto', para: 'cliente', nombre: 'Proponen otro horario para la visita' },
  { tipo: 'reprogramada', para: 'cliente', nombre: 'Tu visita cambió de horario' },
  { tipo: 'cambio_rechazado', para: 'cliente', nombre: 'Se mantiene el horario de la visita' },
  { tipo: 'cambio_retirado', para: 'cliente', nombre: 'Se retiró el cambio de horario' },
  { tipo: 'cancelada', para: 'cliente', nombre: 'Visita cancelada' },
  { tipo: 'vencida', para: 'cliente', nombre: 'La solicitud de visita venció' },
  { tipo: 'recordatorio_24h', para: 'cliente', nombre: 'Recordatorio: tu visita es mañana' },
  { tipo: 'recordatorio_2h', para: 'cliente', nombre: 'Recordatorio: tu visita es en 2 horas' },
  { tipo: 'solicitud_nueva', para: 'asesor', nombre: 'Aviso al asesor: nueva solicitud de visita' },
  { tipo: 'registrada_asesor', para: 'asesor', nombre: 'Aviso al asesor: se registró una visita' },
  { tipo: 'confirmada_asesor', para: 'asesor', nombre: 'Aviso al asesor: visita confirmada' },
  { tipo: 'reprogramada_asesor', para: 'asesor', nombre: 'Aviso al asesor: visita reprogramada' },
]
const datosDeCita = (m: Muestra, para: ParaDeCita): DatosDeCita => ({
  destinatario: m.nombre, propiedad: 'Casa de ejemplo B', lugar: 'Colonia de ejemplo, León', inicio: INICIO_DE_EJEMPLO, propuesto: new Date(INICIO_DE_EJEMPLO.getTime() + 86_400_000),
  motivo: 'Motivo de ejemplo', cliente: para === 'asesor' ? { nombre: 'Persona Sintética', telefono: null } : null, notasCliente: null,
  acciones: [{ accion: 'confirmar', url: BAJA_INERTE }], enlacePanel: `${SITIO}/?enlace=deshabilitado-en-pruebas`, enlaceGoogle: null, ahora: AHORA_DE_EJEMPLO,
})

function renderizar(id: string, m: Muestra): { categoria: Categoria; para: string; c: { asunto: string; html: string; texto: string } } | null {
  const t = BIBLIOTECA.find((x) => x.id === id)
  if (t) return { categoria: t.categoria, para: PARA_BIBLIOTECA[t.id] ?? 'La persona destinataria', c: t.vista(m) }
  const cita = CITAS.find((x) => `cita_${x.tipo}` === id)
  if (cita) return { categoria: 'transaccional', para: cita.para === 'asesor' ? 'El asesor de la propiedad' : 'La persona que pidió la visita', c: plantillaDeCita(cita.tipo, cita.para, datosDeCita(m, cita.para)) }
  return null
}

/**
 * Vista previa FIEL: ejecuta la MISMA función de plantilla que usa el envío real (`correoDeAlertas`, `plantilla…`, `plantilla` de citas), el MISMO remitente
 * (`remitenteDe`) y los mismos pies/enlaces de baja y preferencias; lo único distinto son los datos, que son de muestra. No lee la base ni dispara nada.
 */
export function vistaPrevia(id: string, muestra: Muestra = MUESTRA_POR_OMISION): VistaDeCorreo | null {
  const r = renderizar(id, muestra)
  if (!r) return null
  const pre = r.c.html.match(/<div style="display:none[^>]*>([\s\S]*?)<\/div>/)
  const preencabezado = pre && pre[1].trim() ? pre[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : null
  return {
    ...r.c,
    remitente: remitenteDe(r.categoria),
    responderA: NEGOCIO.email,
    para: r.para,
    categoria: r.categoria,
    preencabezado,
    extracto: (preencabezado ?? r.c.texto.replace(/\s+/g, ' ').trim()).slice(0, 110),
    enlaces: unicos([...r.c.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, '&'))),
    imagenes: unicos([...r.c.html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((x) => x[1])),
    muestra,
  }
}

// ── CATÁLOGO completo, por grupo, con su existencia RASTREADA hasta el mecanismo de envío ─────────────────────────────
export type Existencia = 'envia_hoy' | 'codigo_apagado' | 'apagado_por_texto_legal' | 'lo_manda_firebase' | 'pendiente'
export const GRUPOS_DE_CATALOGO = ['Cuenta y seguridad', 'Cliente', 'Visitas a propiedades (citas)', 'Publicador', 'Equipo de VIVE BIEN', 'Avisos legales', 'Marketing'] as const
export type GrupoDeCatalogo = (typeof GRUPOS_DE_CATALOGO)[number]
export type EntradaDeCatalogo = {
  id: string; nombre: string; grupo: GrupoDeCatalogo; categoria: string; existencia: Existencia
  /** Qué lo dispara (o qué lo dispararía, si está pendiente). */
  disparador: string
  /** Archivo del repositorio donde se arma y se manda (llama al emisor). `null` si no existe en el código o lo manda otro servicio. */
  rastro: string | null
  /** ¿Se puede previsualizar con la plantilla real? */
  conVista: boolean
  /** Por qué no hay vista previa (existe sin plantilla separada, lo manda Firebase o está pendiente). */
  motivoSinVista: string | null
}

const E2 = (id: string, nombre: string, grupo: GrupoDeCatalogo, categoria: string, existencia: Existencia, disparador: string, rastro: string | null, motivoSinVista: string | null = null): EntradaDeCatalogo =>
  ({ id, nombre, grupo, categoria, existencia, disparador, rastro, conVista: motivoSinVista === null, motivoSinVista })
const PENDIENTE = 'Pendiente de implementación: no hay plantilla ni evento en el código que lo envíe.'
const FIREBASE = 'Lo manda Firebase Auth con su propia plantilla (fuera de este código): aquí no se puede previsualizar.'

const PARA_BIBLIOTECA: Record<string, string> = {
  alertas: 'La persona con cuenta que pidió el aviso', baja_de_precio: 'La persona con cuenta que guardó la propiedad', legal: 'Quien aceptó una versión anterior de los textos legales',
  bienvenida: 'La persona que acaba de crear su cuenta', solicitud_publicador: 'La persona que pidió publicar', primeras_propiedades: 'Visitante que pidió la suscripción (con confirmación)', recomendaciones: 'Persona con consentimiento de marketing vigente',
}
const META_BIBLIOTECA: Record<string, { grupo: GrupoDeCatalogo; rastro: string }> = {
  alertas: { grupo: 'Cliente', rastro: 'src/lib/avisos-cliente-servidor.ts' },
  baja_de_precio: { grupo: 'Cliente', rastro: 'src/lib/avisos-cliente-servidor.ts' },
  legal: { grupo: 'Avisos legales', rastro: 'src/lib/avisos-cliente-servidor.ts' },
  bienvenida: { grupo: 'Cuenta y seguridad', rastro: 'src/lib/correo/transaccionales.ts' },
  solicitud_publicador: { grupo: 'Publicador', rastro: 'src/lib/correo/transaccionales.ts' },
  primeras_propiedades: { grupo: 'Marketing', rastro: 'src/lib/correo/suscripcion.ts' },
  recomendaciones: { grupo: 'Marketing', rastro: 'src/lib/correo/tarea.ts' },
}

const CATALOGO_FIJO: EntradaDeCatalogo[] = [
  // Cuenta y seguridad
  E2('verificacion_correo', 'Verificación de correo / registro', 'Cuenta y seguridad', 'seguridad', 'lo_manda_firebase', 'Firebase Auth al registrarse', null, FIREBASE),
  E2('recuperar_contrasena', 'Recuperar o cambiar contraseña', 'Cuenta y seguridad', 'seguridad', 'lo_manda_firebase', 'Firebase Auth al pedir el cambio', null, FIREBASE),
  E2('cambio_correo', 'Cambio de correo o de datos sensibles', 'Cuenta y seguridad', 'seguridad', 'pendiente', 'Cambio de correo en la cuenta', null, PENDIENTE),
  E2('baja_cuenta', 'Confirmación de baja de cuenta', 'Cuenta y seguridad', 'transaccional', 'pendiente', 'Baja de cuenta (el proceso de baja existe; no manda correo)', null, PENDIENTE),
  // Cliente
  E2('consulta_respuesta', 'Respuesta o seguimiento a una consulta', 'Cliente', 'transaccional', 'pendiente', 'Formulario de contacto de una propiedad', null, PENDIENTE),
  E2('contacto_whatsapp', 'Contacto por WhatsApp (resumen del aviso y datos del anunciante)', 'Cliente', 'transaccional', 'pendiente', 'La persona toca el botón de WhatsApp de una propiedad', null, PENDIENTE),
  E2('evaluacion_atencion', 'Evaluación de la atención recibida', 'Cliente', 'servicio', 'pendiente', 'Días después de una consulta', null, PENDIENTE),
  // Publicador
  E2('propiedad_recibida', 'Confirmación al subir una propiedad', 'Publicador', 'transaccional', 'pendiente', 'La propiedad pasa a borrador / se sube', null, PENDIENTE),
  E2('propiedad_en_revision', 'Propiedad enviada a revisión', 'Publicador', 'transaccional', 'pendiente', 'borrador → en_revision', null, PENDIENTE),
  E2('propiedad_aprobada', 'Propiedad aprobada y publicada', 'Publicador', 'transaccional', 'pendiente', 'en_revision → publicada', null, PENDIENTE),
  E2('propiedad_rechazada', 'Propiedad rechazada o con cambios solicitados', 'Publicador', 'transaccional', 'pendiente', 'en_revision → rechazada / cambios', null, PENDIENTE),
  E2('nuevo_interesado', 'Aviso al anunciante de un nuevo interesado', 'Publicador', 'transaccional', 'pendiente', 'Consulta sobre su propiedad', null, PENDIENTE),
  // Equipo
  E2('aviso_lead', 'Aviso interno de nuevo contacto (buzón institucional)', 'Equipo de VIVE BIEN', 'transaccional', 'envia_hoy', 'Formularios de contacto', 'src/lib/aviso-lead.ts', 'Su plantilla está escrita dentro de aviso-lead.ts, mezclada con los datos reales del contacto: mostrarla exigiría ejecutarla con datos reales o separarla (refactor pendiente).'),
  E2('invitacion_equipo', 'Invitación al panel', 'Equipo de VIVE BIEN', 'transaccional', 'envia_hoy', 'Un administrador invita a una persona', 'src/lib/invitacion-correo.ts', 'Su plantilla está escrita dentro de invitacion-correo.ts y usa un enlace con token: no hay una plantilla independiente para ejecutar con datos de muestra.'),
  // Marketing
  E2('articulos_blog', 'Artículos del blog y novedades', 'Marketing', 'marketing', 'pendiente', 'Campaña manual o digest (no existe módulo de campañas)', null, PENDIENTE),
]

const ESTADO_A_EXISTENCIA: Record<EstadoDeEnvio, Existencia> = { envia_hoy: 'envia_hoy', codigo_apagado: 'codigo_apagado', apagado_por_texto_legal: 'apagado_por_texto_legal' }

/** Todos los tipos de correo conocidos, por grupo. Cada uno con su rastro (archivo que lo manda) o su motivo de no tenerlo: nada se afirma sin rastro. */
export function catalogoCompleto(): EntradaDeCatalogo[] {
  const desdeBiblioteca = BIBLIOTECA.map((t) => ({ id: t.id, nombre: t.nombre, grupo: META_BIBLIOTECA[t.id].grupo, categoria: t.categoria, existencia: ESTADO_A_EXISTENCIA[t.estado], disparador: t.disparador, rastro: META_BIBLIOTECA[t.id].rastro, conVista: true, motivoSinVista: null }) as EntradaDeCatalogo)
  const desdeCitas = CITAS.map((x) => E2(`cita_${x.tipo}`, x.nombre, 'Visitas a propiedades (citas)', 'transaccional', 'codigo_apagado', 'Cambio de una cita (citas en línea apagadas: flag citasEnLinea)', 'src/lib/citas/enviar.ts'))
  const todo = [...desdeBiblioteca, ...desdeCitas, ...CATALOGO_FIJO]
  return GRUPOS_DE_CATALOGO.flatMap((g) => todo.filter((e) => e.grupo === g))
}

/** Bandeja de entrada de ejemplo: remitente, asunto y extracto de cada correo que se puede previsualizar. */
export function bandejaDeEjemplo(muestra: Muestra = MUESTRA_POR_OMISION): Array<{ id: string; remitente: string; asunto: string; extracto: string; grupo: GrupoDeCatalogo }> {
  return catalogoCompleto().filter((e) => e.conVista).flatMap((e) => { const v = vistaPrevia(e.id, muestra); return v ? [{ id: e.id, remitente: v.remitente, asunto: v.asunto, extracto: v.extracto, grupo: e.grupo }] : [] })
}

/**
 * MATRIZ de eventos (catálogo tentativo del dueño, §13 de la propuesta, + lo que el código ya hace). `existe`: lo que hay HOY en el código y si sale.
 * La campana y el correo son canales independientes; las categorías son PROVISIONALES hasta la asesoría legal. Lo marcado `no_existe` NO está implementado.
 */
export type EstadoEvento = 'envia_hoy' | 'codigo_apagado' | 'apagado_por_texto_legal' | 'lo_manda_firebase' | 'no_existe'
export type EventoDeCorreo = { grupo: string; evento: string; destinatario: string; canal: string; categoria: string; preferencia: string; frecuencia: string; plantilla: string; disparador: string; idempotencia: string; estado: EstadoEvento }

const E = (grupo: string, evento: string, destinatario: string, canal: string, categoria: string, preferencia: string, frecuencia: string, plantilla: string, disparador: string, idempotencia: string, estado: EstadoEvento): EventoDeCorreo => ({ grupo, evento, destinatario, canal, categoria, preferencia, frecuencia, plantilla, disparador, idempotencia, estado })

export const MATRIZ_DE_EVENTOS: EventoDeCorreo[] = [
  E('Cuenta y seguridad', 'Bienvenida', 'La persona (correo verificado)', 'correo', 'transaccional', 'sin preferencia (es de servicio)', 'una vez', 'bienvenida', 'Alta de cuenta nueva', 'bienvenida/<uid>', 'codigo_apagado'),
  E('Cuenta y seguridad', 'Verificación de correo / registro', 'La persona', 'correo (Firebase)', 'seguridad', 'n/a', 'por solicitud', 'la manda Firebase', 'Firebase Auth', 'Firebase', 'lo_manda_firebase'),
  E('Cuenta y seguridad', 'Recuperar o cambiar contraseña', 'La persona', 'correo (Firebase)', 'seguridad', 'n/a', 'por solicitud', 'la manda Firebase', 'Firebase Auth', 'Firebase', 'lo_manda_firebase'),
  E('Cuenta y seguridad', 'Cambio de correo o de datos sensibles', 'La persona (correo anterior y nuevo)', 'correo', 'seguridad', 'n/a', 'por evento', 'por crear', 'Cambio de correo en la cuenta', 'seguridad/<uid>/<cambio>', 'no_existe'),
  E('Cuenta y seguridad', 'Inicio de sesión inusual', 'La persona', 'correo', 'seguridad', 'n/a', 'por evento', 'por crear', 'Regla de riesgo (por definir)', 'seguridad/<uid>/<huella>', 'no_existe'),
  E('Cuenta y seguridad', 'Invitación al equipo', 'La persona invitada', 'correo', 'transaccional', 'n/a', 'por evento', 'inline en invitacion-correo.ts', 'Un administrador invita', 'invitacion/<uuid>', 'envia_hoy'),
  E('Cuenta y seguridad', 'Invitación aceptada / vencida / revocada', 'Quien invitó', 'campana y correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'Cambio de estado de la invitación', 'invitacion/<id>/<estado>', 'no_existe'),
  E('Cuenta y seguridad', 'Eliminación de cuenta (solicitud y confirmación)', 'La persona', 'correo', 'transaccional', 'n/a', 'por evento', 'por crear', 'Baja de cuenta', 'baja/<uid>/<fase>', 'no_existe'),
  E('Propiedades', 'Solicitud para publicar recibida', 'La persona', 'correo', 'transaccional', 'sin preferencia', 'una vez por solicitud', 'solicitud_publicador', 'Formulario «Quiero publicar»', 'publicador/<lead>', 'codigo_apagado'),
  E('Propiedades', 'Propiedad enviada a revisión', 'El anunciante', 'campana y correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'borrador → en_revision', 'propiedad/<id>/<estado>/<v>', 'no_existe'),
  E('Propiedades', 'Aprobada y publicada', 'El anunciante', 'campana y correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'en_revision → publicada', 'propiedad/<id>/<estado>/<v>', 'no_existe'),
  E('Propiedades', 'Rechazada o con cambios solicitados', 'El anunciante', 'campana y correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'en_revision → rechazada / cambios', 'propiedad/<id>/<estado>/<v>', 'no_existe'),
  E('Propiedades', 'Pausa, vencimiento, reactivación o venta', 'El anunciante', 'campana (correo por decidir)', 'transaccional', 'por decidir (evitar ruido)', 'por evento', 'por crear', 'Cambio de estatus', 'propiedad/<id>/<estatus>/<v>', 'no_existe'),
  E('Consultas y citas', 'Aviso interno de nuevo contacto', 'El equipo (buzón institucional)', 'correo y Telegram', 'transaccional', 'n/a', 'por evento', 'inline en aviso-lead.ts', 'Formularios de contacto', 'lead/<uuid>', 'envia_hoy'),
  E('Consultas y citas', 'Confirmación a quien consulta', 'La persona', 'correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'Formulario de contacto', 'consulta/<id>', 'no_existe'),
  E('Consultas y citas', 'Aviso al anunciante de una consulta nueva', 'El anunciante (según permisos)', 'campana y correo', 'transaccional', 'sin preferencia', 'por evento', 'por crear', 'Consulta sobre su propiedad', 'consulta/<id>/anunciante', 'no_existe'),
  E('Consultas y citas', 'Citas (solicitud, confirmación, cambio, cancelación, recordatorios)', 'Cliente y asesor', 'correo', 'transaccional', 'sin preferencia', 'por evento y recordatorios 24 h / 2 h', 'citas/correos.ts (14 tipos)', 'Citas en línea (apagadas: flag citasEnLinea)', 'cita/<id>/<tipo>/v<n>/<para>', 'codigo_apagado'),
  E('Alertas solicitadas', 'Nueva coincidencia con una búsqueda guardada', 'La persona', 'campana y correo (independientes)', 'servicio (provisional)', 'correo_alertas (apagada por defecto)', 'resumen diario como máximo', 'alertas', 'Tarea diaria', 'aviso/alertas/<uid>/<huella>', 'envia_hoy'),
  E('Alertas solicitadas', 'Baja de precio', 'La persona', 'campana y correo (independientes)', 'servicio (provisional)', 'correo_precio (apagada por defecto)', 'por detección diaria', 'baja_de_precio', 'Tarea diaria', 'aviso/baja_de_precio/<uid>/<huella>', 'envia_hoy'),
  E('Alertas solicitadas', 'Cambio de disponibilidad de una propiedad guardada', 'La persona', 'campana y correo', 'servicio (provisional)', 'por crear', 'por evento', 'por crear', 'Cambio de estatus de una favorita', 'aviso/disponibilidad/<uid>/<huella>', 'no_existe'),
  E('Alertas solicitadas', 'Resumen opcional de búsqueda', 'La persona', 'campana y correo (independientes)', 'servicio (provisional)', 'frecuencia elegida por la persona', 'configurable', 'por crear', 'Tarea diaria', 'aviso/resumen/<uid>/<periodo>', 'no_existe'),
  E('Avisos legales', 'Cambio de Términos o Aviso de Privacidad', 'Quien aceptó una versión anterior', 'campana y correo', 'servicio (provisional, por validar con asesoría)', 'correo_legal (encendida por defecto, con baja)', 'por cambio de versión', 'legal', 'Nueva versión legal', 'aviso/legal/<uid>/<huella>', 'envia_hoy'),
  E('Marketing', 'Primeras propiedades (suscripción pública)', 'Visitante o persona con cuenta', 'correo', 'marketing', 'consentimiento expreso separado (texto sin aprobar)', 'una vez', 'primeras_propiedades', 'Suscripción pública: aplazada', 'inicial/<id>/<dia>', 'apagado_por_texto_legal'),
  E('Marketing', 'Digest de propiedades relacionadas', 'Personas con consentimiento de marketing vigente', 'correo', 'marketing', 'consentimiento expreso separado (texto sin aprobar)', 'propuesta del dueño: cada 2 días, pausable y configurable; nunca vacío', 'recomendaciones', 'Tarea de recomendaciones (sin cron programado)', 'reco/<id>/<dia>', 'apagado_por_texto_legal'),
  E('Marketing', 'Artículos del blog, guías y novedades', 'Personas con consentimiento de marketing', 'correo', 'marketing', 'consentimiento expreso separado', 'por campaña', 'por crear (editor)', 'Campaña manual', 'campana/<id>/<persona>', 'no_existe'),
  E('Marketing', 'Campañas y promociones manuales', 'Audiencia filtrada y aprobada', 'correo', 'marketing', 'consentimiento expreso separado', 'por campaña, con tope', 'por crear (editor)', 'Aprobación del Super Admin', 'campana/<id>/<persona>', 'no_existe'),
]
