import { supabaseAdmin } from '../auth-server'
import { SITIO } from '../sitio'
import { NEGOCIO } from '../config/negocio'
import { claveResend, enviarPorEmisorUnico } from '../correo/emisor'
import { claveCorreo, planDeCorreos, plantilla, type CorreoPlaneado, type EventoCorreo, type Para } from './correos'
import { enlaceGoogleCalendar, generarIcs } from './ics'
import type { CitaFila } from './vista'
import { rutaDeVisitas } from './enlaces'
import { cuentasDeCitas } from './asesores'
import { checkAvailability } from './servicio'
import { diaLocal, fechaLarga, horaCorta } from './zona'
import { type CuentaDeCitas } from '../acceso/capacidades'
import { avisar } from '../alertas'

/**
 * Manda los correos que tocan tras un cambio de una cita.
 *
 * ─────────────────────────────────────────────────────────────
 * NO DUPLICAR, EN DOS CAPAS
 *
 *  1. Antes de enviar se guarda la fila en `citas_correos` con una llave
 *     única (`cita/<id>/<tipo>/v<versión>/<para>`). Si ya existe, ese correo
 *     ya se mandó —o se está mandando—: no se vuelve a mandar. Un doble clic,
 *     un reintento de la red o la misma acción repetida no duplican nada.
 *  2. La misma llave va en la cabecera `Idempotency-Key` de Resend: si la red
 *     corta a medio envío y se reintenta, Resend devuelve la respuesta original
 *     sin mandar otro correo.
 *
 * Nunca lanza: el correo es el aviso, no la cita. Si falla, queda la fila con
 * `estado = 'error'` para verlo y reintentarlo; la cita ya está guardada.
 * ─────────────────────────────────────────────────────────────
 */

type Db = ReturnType<typeof supabaseAdmin>

type Filas = {
  cita: CitaFila
  asesor: { nombre: string | null; email: string | null; rol: string | null } | null
  cliente: { nombre: string | null; email: string | null } | null
  /** Permisos efectivos del asesor (ADR-0013): decide qué datos y botones llevan sus correos. */
  asesorCuenta: CuentaDeCitas | null
}

async function leer(db: Db, id: string): Promise<Filas | null> {
  const { data, error } = await db.from('citas')
    .select('*, asesor:usuarios!citas_asesor_uid_fkey(nombre, email, rol), cliente:usuarios!citas_cliente_uid_fkey(nombre, email)')
    .eq('id', id).maybeSingle()
  if (error || !data) return null
  const { asesor, cliente, ...cita } = data as CitaFila & { asesor: Filas['asesor']; cliente: Filas['cliente'] }
  const asesorCuenta = (await cuentasDeCitas(db, [(cita as CitaFila).asesor_uid])).get((cita as CitaFila).asesor_uid) ?? null
  return { cita, asesor, cliente, asesorCuenta }
}

/**
 * Dónde ve la visita cada quien (V-1.1.82, P3-01: las rutas salen de
 * `lib/citas/enlaces.ts`). El asesor es el equipo de VIVE BIEN o, si es un
 * publicador con `recibir_citas` (ADR-0013), va a su propia pantalla.
 */
/** Minutos tras los que un correo en «pendiente» se da por abandonado (el proceso que lo registró ya no lo está mandando). */
const MINUTOS_ABANDONADO = 10

/** ¿Una fila de `citas_correos` quedó «pendiente» tanto tiempo que quien la registró ya no la está mandando? (puro: lo prueba `tests/citas-correo-abandonado.test.ts`). */
export function correoAbandonado(estado: string, creadoEn: string, ahora: Date): boolean {
  if (estado !== 'pendiente') return false
  const t = new Date(creadoEn).getTime()
  return Number.isFinite(t) && ahora.getTime() - t > MINUTOS_ABANDONADO * 60_000
}

export function enlaceParaVer(citaId: string, para: Para, asesorEsPublicador = false): string {
  return `${SITIO}${rutaDeVisitas(para === 'cliente' ? 'cliente' : asesorEsPublicador ? 'publicador' : 'equipo', citaId)}`
}

/** Exportada sólo para que una prueba demuestre que NINGÚN correo de citas salta el modo de pruebas; el único llamador es `uno`. */
export async function mandar(opts: {
  clave: string
  para: string
  asunto: string
  html: string
  texto: string
  ics?: string | null
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const api = claveResend()
  if (!api) return { ok: false, error: 'sin RESEND_API_KEY' }
  try {
    // Pasa por el emisor único (`correo/emisor.ts`): reserva cupo del plan antes de salir y, con CORREO_MODO_PRUEBAS=1, fija destino, respuesta y enlaces con token.
    const res = await enviarPorEmisorUnico({
      apiKey: api,
      clave: opts.clave.slice(0, 200),
      categoria: 'transaccional',
      tipo: 'cita',
      para: opts.para,
      cuerpo: {
        from: process.env.RESEND_FROM || NEGOCIO.remitente,
        to: [opts.para],
        // Quien responda a una cita habla con VIVE BIEN, no con un remitente que no lee nadie.
        reply_to: NEGOCIO.email,
        subject: opts.asunto,
        html: opts.html,
        text: opts.texto,
        ...(opts.ics ? { attachments: [{ filename: 'visita-vive-bien.ics', content: Buffer.from(opts.ics, 'utf8').toString('base64') }] } : {}),
      },
    })
    if (!res.ok) return { ok: false, error: res.status ? `Resend ${res.status}: ${sinCorreos((res.detalle ?? '').slice(0, 200))}` : `no se envió (${res.estado})` }
    return { ok: true, id: res.resendId ?? null }
  } catch (e) {
    return { ok: false, error: sinCorreos(e instanceof Error ? e.message : 'fallo de red') }
  }
}

/**
 * El texto de error del proveedor o de la red podría repetir la dirección del destinatario; ese texto va a un registro de la plataforma y a `citas_correos.error`.
 * Las direcciones se sustituyen por «[correo]» ANTES de salir de `mandar` (revisión de Semgrep, 5-nov-2026).
 */
export function sinCorreos(texto: string): string {
  return texto.replace(/[^\s<>"'`,;()]+@[^\s<>"'`,;()]+/g, '[correo]')
}

/** Qué pasó con un correo. `duplicado`: ya había salido. `en_curso`: otro proceso lo está mandando. */
export type ResultadoUno = { estado: 'enviado' | 'duplicado' | 'en_curso' | 'sin_correo' | 'error'; error?: string }

async function uno(db: Db, f: Filas, m: CorreoPlaneado, ahora: Date, opciones: { sufijoClave?: string; alternativas?: Date[] } = {}): Promise<ResultadoUno> {
  const { cita } = f
  const email = m.para === 'cliente' ? (cita.cliente_email || f.cliente?.email) : f.asesor?.email
  const clave = claveCorreo(cita.id, m.tipo, cita.version, m.para) + (opciones.sufijoClave ? `/${opciones.sufijoClave}` : '')
  if (!email) {
    console.warn(`[citas] sin correo para ${m.para} de la cita ${cita.id}: no se avisó (${m.tipo})`)
    return { estado: 'sin_correo' }
  }

  // Capa 1: si la fila ya existe, este correo ya salió (o está saliendo).
  let filaId: number
  let intentosPrevios = 0
  const ins = await db.from('citas_correos').insert({
    cita_id: cita.id, tipo: m.tipo, destinatario_rol: m.para, destinatario_email: email, clave_idempotencia: clave,
  }).select('id').single()
  if (ins.error) {
    if (ins.error.code !== '23505') {
      console.error('[citas] no se pudo registrar el correo', ins.error.message)
      return { estado: 'error', error: 'no se pudo registrar el correo' }
    }
    // Ya existía. Si salió, no se repite. Si falló antes, se REINTENTA (un solo proceso toma el relevo de forma atómica).
    // Si está en curso, se deja: otro proceso lo está mandando.
    const ex = await db.from('citas_correos').select('id, estado, intentos, creado_en').eq('clave_idempotencia', clave).maybeSingle()
    if (ex.error || !ex.data) return { estado: 'en_curso' }
    if (ex.data.estado === 'enviado') return { estado: 'duplicado' }
    // «pendiente» es la marca de «lo está mandando alguien». Si ese alguien murió tras registrar la fila (el proceso se reinició, se acabó el tiempo), la
    // fila quedaría así para siempre y el recordatorio se perdería (revisión de Codex, 6-nov-2026). Pasados 10 min (`MINUTOS_ABANDONADO`) se considera abandonada y la toma
    // UN solo proceso, de forma atómica (compara el `creado_en` que leyó y lo renueva).
    const abandonado = correoAbandonado(String(ex.data.estado), String(ex.data.creado_en), new Date())
    if (ex.data.estado !== 'error' && !abandonado) return { estado: 'en_curso' }
    const toma = await db.from('citas_correos').update({ estado: 'pendiente', creado_en: new Date().toISOString() }).eq('id', ex.data.id).eq('estado', ex.data.estado).eq('creado_en', ex.data.creado_en).select('id')
    if (toma.error || !toma.data?.length) return { estado: 'en_curso' }
    filaId = ex.data.id as number
    intentosPrevios = Number(ex.data.intentos ?? 0)
  } else {
    filaId = ins.data.id as number
  }

  // Un publicador atendiendo la cita (ADR-0013): sus correos NO llevan los datos
  // del interesado salvo que tenga `ver_datos_interesado`, y enlazan a SUS citas recibidas.
  // Falla CERRADO: si no se pudo leer la cuenta del asesor (error de lectura o
  // cuenta borrada), el correo va sin datos del interesado.
  const sinCuenta = m.para === 'asesor' && !f.asesorCuenta
  const publicador = m.para === 'asesor' && f.asesorCuenta?.rol === 'publicador' ? f.asesorCuenta : null
  // El responsable que atiende (también un asociado) recibe nombre, teléfono y notas de la visita (necesarios para coordinar; el correo del interesado nunca va en estos avisos).
  // Falla CERRADO: si no se pudo leer su cuenta, el correo va sin datos.
  const verInteresado = !sinCuenta
  const inicio = new Date(cita.inicio)

  const titulo = cita.propiedad_titulo ?? 'la propiedad'
  const verla = enlaceParaVer(cita.id, m.para, publicador !== null)
  const fin = new Date(cita.fin)
  const conCalendario = m.ics === 'publicar'
  const correo = plantilla(m.tipo, m.para, {
    destinatario: m.para === 'cliente' ? cita.cliente_nombre : f.asesor?.nombre ?? null,
    propiedad: titulo,
    lugar: cita.lugar,
    inicio,
    propuesto: cita.propuesta_inicio ? new Date(cita.propuesta_inicio) : null,
    motivo: cita.motivo_cancelacion,
    cliente: verInteresado ? { nombre: cita.cliente_nombre, telefono: cita.cliente_telefono } : null,
    notasCliente: verInteresado ? cita.notas_cliente : null,
    enlacePanel: verla,
    enlaceGoogle: conCalendario ? enlaceGoogleCalendar({ inicio, fin, titulo, lugar: cita.lugar, enlace: verla }) : null,
    ...(opciones.alternativas ? { alternativas: opciones.alternativas } : {}),
    ahora,
  })
  const ics = m.ics
    ? generarIcs({ id: cita.id, version: cita.version, inicio, fin, titulo, lugar: cita.lugar, enlace: verla, cancelada: m.ics === 'cancelar', ahora })
    : null

  const r = await mandar({ clave, para: email, asunto: correo.asunto, html: correo.html, texto: correo.texto, ics })
  await db.from('citas_correos').update(r.ok
    ? { estado: 'enviado', resend_id: r.id, enviado_en: new Date().toISOString(), intentos: intentosPrevios + 1, error: null }
    : { estado: 'error', error: r.error.slice(0, 500), intentos: intentosPrevios + 1 },
  ).eq('id', filaId)
  if (!r.ok) console.error('[citas] el correo no salió:', m.tipo, m.para, r.error) // `m.para` es el ROL (cliente/asesor), nunca la dirección
  return r.ok ? { estado: 'enviado' } : { estado: 'error', error: r.error }
}

// ── Avisos en la app ─────────────────────────────────────────────

type Quien = 'cliente' | 'asesor' | 'propietario'

/**
 * El aviso de la bandeja (`notificaciones`) que corresponde a cada evento y a cada parte. El PROPIETARIO (D-1) se entera pero
 * sin ningún dato del interesado: solo propiedad y fecha. `null` = esa parte no recibe aviso por ese evento.
 */
export function avisoDeEvento(evento: EventoCorreo, estadoCita: string, quien: Quien): { titulo: string; extra?: 'motivo' } | null {
  const T = (titulo: string, extra?: 'motivo') => ({ titulo, ...(extra ? { extra } : {}) })
  switch (evento) {
    case 'CREATED':
      if (estadoCita === 'REQUESTED') return quien === 'cliente' ? T('Solicitud de cita enviada') : quien === 'asesor' ? T('Nueva solicitud de cita') : T('Nueva solicitud en tu propiedad')
      if (estadoCita === 'CONFIRMED') return quien === 'propietario' ? T('Se confirmó una cita en tu propiedad') : T('Cita confirmada')
      if (estadoCita === 'PENDING_CONFIRMATION') return quien === 'cliente' ? T('Confirma tu cita') : quien === 'asesor' ? T('Cita registrada: falta que el cliente la confirme') : null
      return null
    case 'CONFIRMED':
      return quien === 'propietario' ? T('Se confirmó una cita en tu propiedad') : T('Cita confirmada')
    case 'REJECTED':
      return quien === 'cliente' ? T('Solicitud de cita rechazada', 'motivo') : quien === 'propietario' ? T('Se rechazó una solicitud en tu propiedad') : null
    case 'RESCHEDULE_PROPOSED':
      return quien === 'propietario' ? null : T('Proponen otro horario para tu cita')
    case 'RESCHEDULE_ACCEPTED':
      return quien === 'propietario' ? T('Cambió el horario de una cita en tu propiedad') : T('La cita cambió de horario')
    case 'RESCHEDULE_REJECTED':
      return quien === 'propietario' ? null : T('Se mantiene el horario original')
    case 'RESCHEDULE_WITHDRAWN':
      return quien === 'propietario' ? null : T('Se retiró el cambio de horario')
    case 'CANCELLED':
      return quien === 'propietario' ? T('Se canceló una cita en tu propiedad') : T('Cita cancelada', 'motivo')
    case 'EXPIRED':
      return quien === 'propietario' ? null : T('La solicitud de cita expiró')
  }
}

const fechaDeAviso = (iso: string, ahora: Date) => `${fechaLarga(new Date(iso), ahora)}, ${horaCorta(new Date(iso))}`

/** Escribe los avisos de la bandeja. Una fila por persona y por hecho (`unique (uid, clave)`): repetirlo no duplica. Nunca lanza. */
async function avisosEnApp(db: Db, f: Filas, evento: EventoCorreo, actorUid: string | null, ahora: Date): Promise<void> {
  try {
    const { cita } = f
    const partes: Array<{ uid: string; quien: Quien }> = [
      { uid: cita.cliente_uid, quien: 'cliente' },
      { uid: cita.asesor_uid, quien: 'asesor' },
    ]
    if (cita.propietario_uid && cita.propietario_uid !== cita.cliente_uid && cita.propietario_uid !== cita.asesor_uid) {
      partes.push({ uid: cita.propietario_uid, quien: 'propietario' })
    }
    const filas = partes.flatMap(({ uid, quien }) => {
      // A quien hizo el cambio no se le avisa de su propio cambio, salvo al cliente de «Solicitud enviada».
      if (actorUid && uid === actorUid && !(evento === 'CREATED' && quien === 'cliente')) return []
      const a = avisoDeEvento(evento, cita.estado, quien)
      if (!a) return []
      const cuerpo = [
        `${cita.propiedad_titulo ?? 'La propiedad'} · ${fechaDeAviso(cita.inicio, ahora)}`,
        ...(a.extra === 'motivo' && cita.motivo_cancelacion ? [`Motivo: ${cita.motivo_cancelacion}`] : []),
        ...(evento === 'CREATED' && cita.estado === 'REQUESTED' && quien === 'cliente' ? ['Todavía no está confirmada: te avisaremos si la aceptan o la rechazan.'] : []),
      ].join('. ').slice(0, 600)
      const enlace = rutaDeVisitas(quien === 'cliente' ? 'cliente' : quien === 'propietario' ? 'propietario' : f.asesorCuenta?.rol === 'publicador' ? 'publicador' : 'equipo', cita.id)
      return [{ uid, tipo: 'cita', titulo: a.titulo, cuerpo, enlace, propiedad_id: cita.propiedad_id, clave: `cita/${cita.id}/${evento}/v${cita.version}/${uid}`.slice(0, 200) }]
    })
    if (!filas.length) return
    const w = await db.from('notificaciones').upsert(filas, { onConflict: 'uid,clave', ignoreDuplicates: true })
    if (w.error) console.error('[citas] no se pudieron guardar los avisos de la app', w.error.code ?? '', w.error.message?.slice(0, 120))
  } catch (e) {
    console.error('[citas] avisosEnApp', e instanceof Error ? e.message : e)
  }
}

// ── Quien pierde el horario (D-2/D-12) ───────────────────────────

/** Los próximos horarios libres para esta propiedad, para ofrecérselos a quien perdió el suyo. */
async function alternativasPara(cita: CitaFila, ahora: Date): Promise<Date[]> {
  if (!cita.propiedad_id) return []
  try {
    const r = await checkAvailability({ propiedadId: cita.propiedad_id, desde: diaLocal(ahora), dias: 14, clienteUid: cita.cliente_uid, excluirCitaId: cita.id, ahora })
    if (!r.ok) return []
    return r.valor.dias.flatMap((d) => d.horarios.map((h) => new Date(h.inicio))).slice(0, 3)
  } catch {
    return []
  }
}

/**
 * Cuando una cita queda CONFIRMADA, las solicitudes pendientes del mismo responsable que pedían ese horario lo perdieron: se
 * les avisa (correo y bandeja) y se les ofrecen alternativas. No se rechazan solas: el cliente puede elegir otro horario y el
 * responsable decide. La clave lleva el id de la cita ganadora, así cada pérdida se avisa una sola vez.
 */
async function avisarConflictos(db: Db, ganadora: CitaFila, ahora: Date): Promise<void> {
  const { data, error } = await db.from('citas').select('id')
    .eq('asesor_uid', ganadora.asesor_uid).eq('estado', 'REQUESTED').neq('id', ganadora.id)
    .lt('ocupa_desde', ganadora.ocupa_hasta).gt('ocupa_hasta', ganadora.ocupa_desde).limit(50)
  if (error || !data?.length) return
  for (const { id } of data as Array<{ id: string }>) {
    const perdedora = await leer(db, id)
    if (!perdedora) continue
    const alternativas = await alternativasPara(perdedora.cita, ahora)
    await uno(db, perdedora, { tipo: 'horario_no_disponible', para: 'cliente', acciones: [], ics: null }, ahora, { sufijoClave: ganadora.id, alternativas })
    const w = await db.from('notificaciones').upsert([{
      uid: perdedora.cita.cliente_uid, tipo: 'cita', titulo: 'Ese horario ya no está disponible',
      cuerpo: `${perdedora.cita.propiedad_titulo ?? 'La propiedad'} · ${fechaDeAviso(perdedora.cita.inicio, ahora)}. Se confirmó otra cita a esa hora; elige otro horario.`.slice(0, 600),
      enlace: rutaDeVisitas('cliente', perdedora.cita.id), propiedad_id: perdedora.cita.propiedad_id,
      clave: `cita/${perdedora.cita.id}/conflicto/${ganadora.id}`.slice(0, 200),
    }], { onConflict: 'uid,clave', ignoreDuplicates: true })
    if (w.error) console.error('[citas] no se pudo guardar el aviso de conflicto', w.error.code ?? '')
  }
}

/** Manda los correos de este cambio. Se llama después de responder (`after()`). */
export async function avisarCambio(citaId: string, evento: EventoCorreo, actorUid: string | null, ahora = new Date()): Promise<void> {
  try {
    const db = supabaseAdmin()
    const f = await leer(db, citaId)
    if (!f) return
    // VIVE BIEN se entera de toda visita en una propiedad de un publicador (los
    // leads son del flujo comercial de VIVE BIEN, ADR-0006). Sin datos personales.
    if (evento === 'CREATED' && f.asesorCuenta?.rol === 'publicador') {
      void avisar({
        nivel: 'aviso',
        titulo: 'Nueva visita en la propiedad de un publicador',
        datos: { Propiedad: f.cita.propiedad_titulo, Atiende: f.asesor?.nombre ?? null, Estado: f.cita.estado },
        clave: `cita-publicador:${f.cita.id}`,
      })
    }
    for (const m of planDeCorreos(evento, f.cita, actorUid)) {
      await uno(db, f, m, ahora)
    }
    await avisosEnApp(db, f, evento, actorUid, ahora)
    // Una cita que queda confirmada (al confirmarla, al aceptar un cambio o al crearla ya confirmada) deja sin su horario a
    // las solicitudes pendientes que lo pedían: se les avisa y se les ofrecen alternativas (D-2/D-12).
    if (evento === 'CONFIRMED' || evento === 'RESCHEDULE_ACCEPTED' || (evento === 'CREATED' && f.cita.estado === 'CONFIRMED')) {
      await avisarConflictos(db, f.cita, ahora)
    }
  } catch (e) {
    console.error('[citas] avisarCambio', e instanceof Error ? e.message : e)
  }
}

// ── Recordatorios (D-4) ──────────────────────────────────────────

export type ResumenRecordatorios = { reclamados: number; enviados: number; omitidos: number; fallidos: number }

/**
 * Manda los recordatorios que ya tocan (24 h y 1 h antes). Lo llama la tarea programada cada minuto.
 *
 * NO DUPLICAR, EN TRES CAPAS:
 *  1. la base los reclama con `for update skip locked` (dos ejecuciones simultáneas no toman el mismo);
 *  2. el correo se registra con la MISMA clave que el recordatorio (`cita/<id>/recordatorio_<tipo>/v<versión>/<para>`):
 *     si ya salió, solo se marca como enviado; si falló antes, se reintenta;
 *  3. esa clave va también como `Idempotency-Key` de Resend.
 * Antes de mandar se vuelve a leer la cita: si cambió de versión o dejó de estar firme, el recordatorio se OMITE.
 * Los fallos quedan en la cola (estado `error`, texto sin direcciones) y se reintentan hasta 5 veces.
 */
export async function procesarRecordatorios(opts: { limite?: number; ahora?: Date } = {}): Promise<ResumenRecordatorios> {
  const ahora = opts.ahora ?? new Date()
  const resumen: ResumenRecordatorios = { reclamados: 0, enviados: 0, omitidos: 0, fallidos: 0 }
  const db = supabaseAdmin()
  const { data, error } = await db.rpc('citas_recordatorios_reclamar', { p_limite: opts.limite ?? 25 })
  if (error) throw new Error(`no se pudo reclamar la cola de recordatorios (${error.code ?? 'sin código'})`)
  const lote = (data ?? []) as Array<{ id: number; cita_id: string; tipo: '24h' | '1h'; para_rol: Para; version_cita: number }>
  resumen.reclamados = lote.length

  const cerrar = async (id: number, ok: boolean, motivo?: string) => {
    await db.rpc('citas_recordatorio_marcar', { p_id: id, p_ok: ok, p_error: ok ? null : sinCorreos(motivo ?? 'error') })
  }
  const omitir = async (id: number) => {
    await db.from('citas_recordatorios').update({ estado: 'omitido' }).eq('id', id).eq('estado', 'enviando')
    resumen.omitidos += 1
  }

  for (const r of lote) {
    try {
      const f = await leer(db, r.cita_id)
      const firme = f && (f.cita.estado === 'CONFIRMED' || f.cita.estado === 'RESCHEDULED' || (f.cita.estado === 'RESCHEDULE_REQUESTED' && (f.cita.estado_previo === 'CONFIRMED' || f.cita.estado_previo === 'RESCHEDULED')))
      if (!f || f.cita.version !== r.version_cita || !firme || new Date(f.cita.inicio).getTime() <= ahora.getTime()) {
        await omitir(r.id)
        continue
      }
      const res = await uno(db, f, { tipo: r.tipo === '24h' ? 'recordatorio_24h' : 'recordatorio_1h', para: r.para_rol, acciones: [], ics: null }, ahora)
      if (res.estado === 'enviado' || res.estado === 'duplicado') { await cerrar(r.id, true); resumen.enviados += 1 }
      else if (res.estado === 'sin_correo') { await omitir(r.id) }
      else { await cerrar(r.id, false, res.error ?? res.estado); resumen.fallidos += 1 }
    } catch (e) {
      await cerrar(r.id, false, e instanceof Error ? e.message : 'error')
      resumen.fallidos += 1
    }
  }
  return resumen
}
