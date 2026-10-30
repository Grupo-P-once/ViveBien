import { supabaseAdmin } from '../auth-server'
import { SITIO } from '../sitio'
import { NEGOCIO } from '../config/negocio'
import { claveResend, enviarPorEmisorUnico } from '../correo/emisor'
import { claveCorreo, planDeCorreos, plantilla, type CorreoPlaneado, type EventoCorreo, type Para } from './correos'
import { enlaceGoogleCalendar, generarIcs } from './ics'
import { caducidad, nuevoToken } from './tokens'
import type { CitaFila } from './vista'
import { rutaDeVisitas } from './enlaces'
import { cuentasDeCitas } from './asesores'
import { puedeActuarEnCita, veDatosDelInteresado, type CuentaDeCitas } from '../acceso/capacidades'
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
    if (!res.ok) return { ok: false, error: res.status ? `Resend ${res.status}: ${(res.detalle ?? '').slice(0, 200)}` : `no se envió (${res.estado})` }
    return { ok: true, id: res.resendId ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fallo de red' }
  }
}

async function uno(db: Db, f: Filas, m: CorreoPlaneado, ahora: Date): Promise<void> {
  const { cita } = f
  const email = m.para === 'cliente' ? (cita.cliente_email || f.cliente?.email) : f.asesor?.email
  const clave = claveCorreo(cita.id, m.tipo, cita.version, m.para)
  if (!email) {
    console.warn(`[citas] sin correo para ${m.para} de la cita ${cita.id}: no se avisó (${m.tipo})`)
    return
  }

  // Capa 1: si la fila ya existe, este correo ya salió (o está saliendo).
  const { data: fila, error: errFila } = await db.from('citas_correos').insert({
    cita_id: cita.id, tipo: m.tipo, destinatario_rol: m.para, destinatario_email: email, clave_idempotencia: clave,
  }).select('id').single()
  if (errFila) {
    if (errFila.code !== '23505') console.error('[citas] no se pudo registrar el correo', errFila.message)
    return
  }

  // Un publicador atendiendo la cita (ADR-0013): sus correos NO llevan los datos
  // del interesado salvo que tenga `ver_datos_interesado`, sólo traen los
  // botones (y los tokens) de lo que su permiso le deja hacer, y enlazan a SUS
  // citas recibidas.
  // Falla CERRADO: si no se pudo leer la cuenta del asesor (error de lectura o
  // cuenta borrada), el correo va sin datos del interesado y sin botones.
  const sinCuenta = m.para === 'asesor' && !f.asesorCuenta
  const publicador = m.para === 'asesor' && f.asesorCuenta?.rol === 'publicador' ? f.asesorCuenta : null
  const verInteresado = !sinCuenta && (!publicador || veDatosDelInteresado(publicador))
  const accionesPermitidas = sinCuenta
    ? []
    : publicador
      ? m.acciones.filter((a) => puedeActuarEnCita(publicador, a, cita.estado))
      : m.acciones

  // Un token por acción, para esta persona y esta versión de la cita.
  const inicio = new Date(cita.inicio)
  const acciones: { accion: typeof m.acciones[number]; url: string }[] = []
  if (accionesPermitidas.length) {
    const expira = caducidad(inicio, ahora)
    const filasToken = accionesPermitidas.map((accion) => {
      const t = nuevoToken()
      acciones.push({ accion, url: `${SITIO}/citas/accion#${t.plano}` })
      return { cita_id: cita.id, accion, para_rol: m.para, hash: t.hash, version_cita: cita.version, expira_en: expira.toISOString() }
    })
    const { error } = await db.from('citas_tokens').insert(filasToken)
    if (error) {
      // Sin tokens guardados los botones no servirían: se manda sin botones.
      console.error('[citas] no se pudieron guardar los enlaces', error.message)
      acciones.length = 0
    }
  }

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
    acciones,
    enlacePanel: verla,
    enlaceGoogle: conCalendario ? enlaceGoogleCalendar({ inicio, fin, titulo, lugar: cita.lugar, enlace: verla }) : null,
    ahora,
  })
  const ics = m.ics
    ? generarIcs({ id: cita.id, version: cita.version, inicio, fin, titulo, lugar: cita.lugar, enlace: verla, cancelada: m.ics === 'cancelar', ahora })
    : null

  const r = await mandar({ clave, para: email, asunto: correo.asunto, html: correo.html, texto: correo.texto, ics })
  await db.from('citas_correos').update(r.ok
    ? { estado: 'enviado', resend_id: r.id, enviado_en: new Date().toISOString(), intentos: 1, error: null }
    : { estado: 'error', error: r.error.slice(0, 500), intentos: 1 },
  ).eq('id', fila.id)
  if (!r.ok) console.error(`[citas] correo ${m.tipo} a ${m.para} no salió:`, r.error)
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
  } catch (e) {
    console.error('[citas] avisarCambio', e instanceof Error ? e.message : e)
  }
}
