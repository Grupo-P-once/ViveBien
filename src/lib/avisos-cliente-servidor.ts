import 'server-only'
import { SITIO } from '@/lib/sitio'
import { NEGOCIO } from '@/lib/config/negocio'
import { supabaseAdmin } from '@/lib/auth-server'
import { VERSIONES } from '@/lib/aceptacion-legal'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { describir } from '@/lib/busquedas'
import {
  correoDeAlertas, correoDeBajaDePrecio, correoLegal, notificacionesDeBusqueda, notificacionesLegales, nuevasParaAviso, tocaAvisar,
  type BusquedaParaAviso, type GrupoDeCorreo, type NotificacionNueva,
} from '@/lib/avisos-cliente'
import { crearTokenDeBaja } from '@/lib/avisos-token'
import { claveResend, enviarPorEmisorUnico } from '@/lib/correo/emisor'
import { envioHabilitado } from '@/lib/correo/config'
import { createHash } from 'node:crypto'
import { cambiosDePrecio, type PropiedadConPrecio, type SuscripcionDePrecio } from '@/lib/avisos-precio'

/**
 * La tarea de avisos a clientes (28-oct-2026): corre una vez al día (cuelga del parte diario de `/api/alertas/resumen`: el plan de Vercel limita las tareas programadas)
 * y hace tres cosas, todas IDEMPOTENTES (repetirla no duplica nada: cada aviso tiene clave única por persona):
 *   1. Por cada búsqueda guardada con alertas encendidas a la que le toca: guarda un aviso por cada propiedad nueva y anota hasta cuándo se avisó.
 *   2. Cambio de Términos / Aviso de Privacidad: avisa a TODA persona con cuenta (cliente o publicador/asociado, activa; no al equipo), una vez por versión, y no a quien abrió su cuenta
 *      después del primer aviso. La campana a todas de inmediato; el correo con tope diario (`TOPE_CORREOS_LEGALES_POR_CORRIDA`) para no gastar el cupo de Resend que comparten las citas.
 *   3. Correo: UN resumen por persona (alertas, solo con su consentimiento) y/o un correo legal (servicio; se puede apagar), con baja en un clic. Cada correo se marca al
 *      salir bien; si falla, queda pendiente para el día siguiente (sin reenviar lo ya enviado).
 * Tope por corrida para no gastar el plan ni disparar una avalancha por un error.
 */
const TOPE_CORREOS = 400
/**
 * Cuántos correos de AVISO LEGAL salen por corrida (una al día). Resend gratuito tiene 100/día y 3 000/mes y los correos de citas (confirmaciones, recordatorios) comparten ese cupo:
 * un aviso a toda la base no puede gastarlo. Lo que no sale hoy queda pendiente y sale en las corridas siguientes; la notificación de la campana llega a todos de inmediato.
 */
export const TOPE_CORREOS_LEGALES_POR_CORRIDA = 25
/** Cuentas a las que se avisa de un cambio legal: personas (no el equipo), activas. */
const ROLES_CON_AVISO_LEGAL = ['cliente', 'publicador']
const TOPE_BUSQUEDAS = 3000

export type ResumenDeAvisos = { bajasDePrecio?: number; busquedasRevisadas: number; notificacionesNuevas: number; legalesNuevas: number; correosLegales?: number; correosEnviados: number; correosFallidos: number; omitido?: string }

/** Resultado de un intento de envío. `parar`: no hay cupo (o no se pudo confirmar): no tiene caso seguir intentando con los demás en esta corrida. */
type Salida = { ok: boolean; parar: boolean }

/**
 * Manda UN correo por el emisor único (`correo/emisor.ts`): reserva cupo del plan antes de salir, respeta el modo de pruebas y NO sale si no
 * se puede confirmar el cupo. La clave es estable por persona y por conjunto de avisos: si el correo salió pero no se alcanzó a marcar el aviso,
 * la corrida siguiente lo reconoce como ya enviado (`duplicado`) en vez de mandarlo otra vez.
 */
async function enviarCorreo(uid: string, tipo: 'alertas' | 'baja_de_precio' | 'legal', ids: number[], para: string, asunto: string, texto: string, html: string, bajaUrl?: string): Promise<Salida> {
  const clave = claveResend()
  if (!clave) return { ok: false, parar: false }
  const huella = createHash('sha256').update([...ids].sort((a, b) => a - b).join(',')).digest('hex').slice(0, 16)
  try {
    const res = await enviarPorEmisorUnico({
      apiKey: clave,
      clave: `aviso/${tipo}/${uid}/${huella}`,
      categoria: 'servicio',
      tipo: `aviso_${tipo}`,
      para,
      cuerpo: {
        from: process.env.RESEND_FROM || NEGOCIO.remitente, to: [para], subject: asunto, text: texto, html,
        // Baja con un clic desde el propio cliente de correo (RFC 8058).
        ...(bajaUrl ? { headers: { 'List-Unsubscribe': `<${bajaUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
      },
    })
    if (res.ok) return { ok: true, parar: false }
    console.error('[avisos] el envío no salió:', res.estado, res.status ?? '')
    return { ok: false, parar: res.estado === 'sin_cupo' || res.estado === 'sin_confirmar' }
  } catch (e) { console.error('[avisos] no se pudo enviar:', e instanceof Error ? e.message : 'error'); return { ok: false, parar: false } }
}

/**
 * Preferencias de aviso de un lote de personas. Si la migración 60 no está aplicada (no existe `correo_precio`) se lee SIN esa columna: lo demás sigue funcionando y los correos de
 * precio NO salen (falla cerrado). Nunca se asume un consentimiento que no se pudo leer.
 */
async function leerPreferencias(db: ReturnType<typeof supabaseAdmin>, uids: string[]) {
  const con = await db.from('preferencias_notificacion').select('uid, correo_alertas, correo_legal, correo_precio').in('uid', uids)
  if (!con.error) return { ...con, conPrecio: true }
  const sin = await db.from('preferencias_notificacion').select('uid, correo_alertas, correo_legal').in('uid', uids)
  return { ...sin, conPrecio: false }
}

export async function avisosDeClientes(ahora = Date.now()): Promise<ResumenDeAvisos> {
  const db = supabaseAdmin()
  const r: ResumenDeAvisos = { busquedasRevisadas: 0, notificacionesNuevas: 0, legalesNuevas: 0, correosEnviados: 0, correosFallidos: 0 }

  // 1b · «Avisarme cuando baje de precio»: la campana de la ficha. Si la tabla aún no existe (migración 59 sin aplicar) se omite sin ruido.
  const sp = await db.from('cliente_avisos_precio').select('uid, propiedad_id, precio_base, moneda').order('avisado_en', { ascending: true, nullsFirst: true }).limit(5000)
  if (!sp.error && sp.data?.length) {
    const subs = sp.data as unknown as SuscripcionDePrecio[]
    const ids = [...new Set(subs.map((x) => x.propiedad_id))]
    const filas: PropiedadConPrecio[] = []
    for (let i = 0; i < ids.length; i += 100) {
      const lote = await db.from('propiedades').select('id, slug, titulo, folio, tipo, operacion, precio, moneda, estado_pub, estatus').in('id', ids.slice(i, i + 100))
      if (lote.error) { filas.length = 0; break }
      filas.push(...((lote.data ?? []) as unknown as PropiedadConPrecio[]))
    }
    const cambios = filas.length ? cambiosDePrecio(subs, filas, ahora) : []
    const avisos = cambios.flatMap((c) => (c.aviso ? [c.aviso] : []))
    let avisosGuardados = true       // si no se pudieron guardar, el precio de partida NO se mueve: mañana se reintenta y la baja no se pierde
    if (avisos.length) {
      const ya = await db.from('notificaciones').select('uid, clave').in('clave', [...new Set(avisos.map((n) => n.clave))])
      if (ya.error) avisosGuardados = false
      const existentes = new Set(((ya.data ?? []) as Array<{ uid: string; clave: string }>).map((x) => `${x.uid}|${x.clave}`))
      const frescas = avisos.filter((n) => !existentes.has(`${n.uid}|${n.clave}`))
      if (!ya.error && frescas.length) {
        const w = await db.from('notificaciones').upsert(frescas, { onConflict: 'uid,clave', ignoreDuplicates: true })
        if (w.error) avisosGuardados = false
        else { r.bajasDePrecio = frescas.length; r.notificacionesNuevas += frescas.length }
      }
    }
    // El precio de partida se mueve DESPUÉS de guardar el aviso (si falla antes, mañana se vuelve a intentar sin duplicar: la clave lleva el precio).
    for (const c of cambios) {
      if (c.aviso && !avisosGuardados) continue
      await db.from('cliente_avisos_precio').update({ precio_base: c.nuevo, ...(c.moneda ? { moneda: c.moneda } : {}), ...(c.aviso ? { avisado_en: new Date(ahora).toISOString() } : {}) }).eq('uid', c.uid).eq('propiedad_id', c.propiedadId)
    }
  }

  // 1 · Alertas de búsquedas guardadas
  const [bq, pr] = await Promise.all([
    db.from('busquedas_guardadas').select('id, uid, nombre, filtros, alertas, frecuencia, creado_en, avisada_en').eq('alertas', true).limit(TOPE_BUSQUEDAS),
    db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
  ])
  if (bq.error || pr.error) { r.omitido = 'sin_datos'; return r }
  const props = (pr.data ?? []) as unknown as FilaPropiedadPortal[]
  const nuevas: NotificacionNueva[] = []
  const revisadas: number[] = []
  for (const b of (bq.data ?? []) as unknown as BusquedaParaAviso[]) {
    if (!tocaAvisar(b, ahora)) continue
    revisadas.push(b.id)
    nuevas.push(...notificacionesDeBusqueda(b, nuevasParaAviso(b, props)))
  }
  r.busquedasRevisadas = revisadas.length
  if (nuevas.length) {
    // Antes y después, para contar solo lo realmente insertado (las claves repetidas se ignoran).
    const claves = nuevas.map((n) => n.clave)
    const ya = await db.from('notificaciones').select('uid, clave').in('clave', claves)
    const existentes = new Set(((ya.data ?? []) as Array<{ uid: string; clave: string }>).map((x) => `${x.uid}|${x.clave}`))
    const frescas = nuevas.filter((n) => !existentes.has(`${n.uid}|${n.clave}`))
    if (frescas.length) {
      const w = await db.from('notificaciones').upsert(frescas, { onConflict: 'uid,clave', ignoreDuplicates: true })
      if (!w.error) r.notificacionesNuevas = frescas.length
    }
  }
  // Se anota hasta cuándo se avisó DESPUÉS de guardar (si la corrida falla antes, mañana se vuelve a intentar sin duplicar).
  if (revisadas.length) await db.from('busquedas_guardadas').update({ avisada_en: new Date(ahora).toISOString() }).in('id', revisadas)

  // 2 · Cambio de Términos / Privacidad: a TODA persona con cuenta (decisión del dueño, 10-nov-2026), una vez por versión.
  const ac = await db.from('legal_aceptaciones').select('uid, documento, version').limit(20000)
  const cu = await db.from('usuarios').select('uid, rol, estado, creado_en').eq('estado', 'activo').in('rol', ROLES_CON_AVISO_LEGAL).limit(20000)
  if (!ac.error && !cu.error) {
    // CORTE: el momento en que se avisó por primera vez de esta versión. Quien abre su cuenta DESPUÉS ya vio el texto nuevo al registrarse: no se le avisa de un «cambio».
    const clavesLegales = Object.entries(VERSIONES).map(([d, v]) => `legal:${d}:${v}`)
    const previas = await db.from('notificaciones').select('creada_en').in('clave', clavesLegales).limit(50000)
    const tiempos = ((previas.data ?? []) as Array<{ creada_en: string | null }>).map((x) => Date.parse(x.creada_en ?? '')).filter((t) => Number.isFinite(t))
    const corte = previas.error ? 0 : tiempos.length ? Math.min(...tiempos) : ahora
    const cuentas = ((cu.data ?? []) as Array<{ uid: string; creado_en: string | null }>)
      .filter((c) => !c.creado_en || Date.parse(c.creado_en) <= corte)
      .map((c) => c.uid)
    const legales = previas.error ? [] : notificacionesLegales(VERSIONES, (ac.data ?? []) as Array<{ uid: string; documento: string; version: string }>, cuentas)
    if (legales.length) {
      const ya = await db.from('notificaciones').select('uid, clave').in('clave', [...new Set(legales.map((n) => n.clave))])
      const existentes = new Set(((ya.data ?? []) as Array<{ uid: string; clave: string }>).map((x) => `${x.uid}|${x.clave}`))
      const frescas = legales.filter((n) => !existentes.has(`${n.uid}|${n.clave}`))
      if (frescas.length) {
        const w = await db.from('notificaciones').upsert(frescas, { onConflict: 'uid,clave', ignoreDuplicates: true })
        if (!w.error) r.legalesNuevas = frescas.length
      }
    }
  }

  // 3 · Correos. COMPUERTA COMÚN (MKT-60): con `CORREO_ENVIO` apagada los avisos quedan en la bandeja del portal y no se toca ninguna otra cosa.
  if (!envioHabilitado()) { r.omitido = 'envio_apagado'; return r }
  const COLUMNAS_PENDIENTES = 'id, uid, tipo, titulo, cuerpo, enlace, busqueda_id, propiedad_id, clave'
  const [pendientes, pendientesLegales] = await Promise.all([
    db.from('notificaciones').select(COLUMNAS_PENDIENTES).is('correo_enviado_en', null).in('tipo', ['busqueda_nueva', 'baja_de_precio']).order('creada_en', { ascending: true }).limit(3000),
    // Los avisos legales se leen APARTE y con tope: con miles de cuentas no pueden ocupar el cupo ni la lista de las alertas.
    db.from('notificaciones').select(COLUMNAS_PENDIENTES).is('correo_enviado_en', null).eq('tipo', 'legal').order('creada_en', { ascending: true }).limit(TOPE_CORREOS_LEGALES_POR_CORRIDA * 4),
  ])
  if (pendientes.error || pendientesLegales.error) return r
  const filas = [...((pendientes.data ?? []) as Array<NotificacionNueva & { id: number }>), ...((pendientesLegales.data ?? []) as Array<NotificacionNueva & { id: number }>)]
  if (!filas.length) return r
  // Primero quienes tienen alertas; los que solo tienen aviso legal van después.
  const conAlertas = new Set(filas.filter((f) => f.tipo !== 'legal').map((f) => f.uid))
  const todos = [...new Set(filas.map((f) => f.uid))]
  const uids = [...todos.filter((u) => conAlertas.has(u)), ...todos.filter((u) => !conAlertas.has(u))].slice(0, TOPE_CORREOS)
  let legalesEnviadas = 0
  const [us, pf, bn] = await Promise.all([
    db.from('usuarios').select('uid, email, nombre, estado').in('uid', uids),
    leerPreferencias(db, uids),
    db.from('busquedas_guardadas').select('id, nombre, filtros').in('id', [...new Set(filas.map((f) => f.busqueda_id).filter((x): x is number => typeof x === 'number'))]),
  ])
  // FALLA CERRADA: si NO se pudieron leer las preferencias (fallaron las dos consultas), no se sabe qué eligió cada persona. Los valores por omisión ACTIVADOS solo valen cuando la
  // lectura salió bien y esa persona no tiene una elección guardada; con la lectura rota no se usa ninguno y no se manda ningún correo (los avisos siguen en la bandeja del portal).
  if (pf.error || !pf.data) { console.error('[avisos] no se pudieron leer las preferencias: no se manda ningún correo'); r.omitido = 'sin_preferencias'; return r }
  const usuario = new Map(((us.data ?? []) as Array<{ uid: string; email: string | null; nombre: string | null; estado: string | null }>).map((u) => [u.uid, u]))
  const pref = new Map(((pf.data ?? []) as Array<{ uid: string; correo_alertas: boolean; correo_legal: boolean; correo_precio?: boolean }>).map((p) => [p.uid, p]))
  const busqueda = new Map(((bn.data ?? []) as unknown as Array<{ id: number; nombre: string | null; filtros: BusquedaParaAviso['filtros'] }>).map((b) => [b.id, b]))

  for (const uid of uids) {
    if (r.correosEnviados >= TOPE_CORREOS) break
    const u = usuario.get(uid)
    if (!u?.email || (u.estado && u.estado !== 'activo')) continue
    // Sin fila de preferencias = valores por omisión ACTIVADOS (decisión del dueño, 30-oct-2026); quien se dio de baja tiene su fila en false y se respeta.
    // El de precio solo si la columna existe (migración 60 aplicada); si no, falla cerrado.
    const p = pref.get(uid) ?? { correo_alertas: true, correo_legal: true, correo_precio: pf.conPrecio }
    const baja = crearTokenDeBaja(uid)
    const urlBaja = baja ? `${SITIO}/api/avisos/baja?t=${baja}` : `${SITIO}/portal/configuracion`
    const urlPreferencias = `${SITIO}/portal/configuracion`
    const suyas = filas.filter((f) => f.uid === uid)

    // 3a · Alertas (solo con consentimiento)
    const dealertas = p.correo_alertas ? suyas.filter((f) => f.tipo === 'busqueda_nueva') : []
    if (dealertas.length) {
      const porBusqueda = new Map<number, GrupoDeCorreo>()
      for (const f of dealertas) {
        const b = f.busqueda_id != null ? busqueda.get(f.busqueda_id) : undefined
        const clave = f.busqueda_id ?? 0
        const g = porBusqueda.get(clave) ?? { busquedaNombre: (b?.nombre ?? '').trim() || (b ? describir(b.filtros) : 'Tu búsqueda'), href: '/propiedades', items: [] }
        g.items.push({ titulo: f.titulo, cuerpo: f.cuerpo, url: `${SITIO}${f.enlace}` })
        porBusqueda.set(clave, g)
      }
      const c = correoDeAlertas({ nombre: u.nombre, grupos: [...porBusqueda.values()], sitio: SITIO, urlBaja, urlPreferencias })
      const s1 = await enviarCorreo(uid, 'alertas', dealertas.map((f) => f.id), u.email, c.asunto, c.texto, c.html, baja ? urlBaja : undefined)
      if (s1.ok) {
        await db.from('notificaciones').update({ correo_enviado_en: new Date(ahora).toISOString() }).in('id', dealertas.map((f) => f.id))
        r.correosEnviados++
      } else { r.correosFallidos++; if (s1.parar) { r.omitido = 'sin_cupo'; break } }
    }
    // 3a-bis · Baja de precio: SOLO con su consentimiento propio (`correo_precio`, apagado por defecto). Sin él, el aviso queda en la bandeja y no se manda nada.
    const deprecio = p.correo_precio === true ? suyas.filter((f) => f.tipo === 'baja_de_precio') : []
    if (deprecio.length) {
      const c = correoDeBajaDePrecio({ nombre: u.nombre, avisos: deprecio, sitio: SITIO, urlBaja, urlPreferencias })
      const s2 = await enviarCorreo(uid, 'baja_de_precio', deprecio.map((f) => f.id), u.email, c.asunto, c.texto, c.html, baja ? urlBaja : undefined)
      if (s2.ok) {
        await db.from('notificaciones').update({ correo_enviado_en: new Date(ahora).toISOString() }).in('id', deprecio.map((f) => f.id))
        r.correosEnviados++
      } else { r.correosFallidos++; if (s2.parar) { r.omitido = 'sin_cupo'; break } }      // NO se marca como enviado: queda pendiente y se reintenta en la siguiente corrida
    }
    // 3b · Aviso legal (servicio; se puede apagar)
    const legales = p.correo_legal && legalesEnviadas < TOPE_CORREOS_LEGALES_POR_CORRIDA ? suyas.filter((f) => f.tipo === 'legal') : []
    if (legales.length) {
      const c = correoLegal({ nombre: u.nombre, avisos: legales, sitio: SITIO, urlPreferencias })
      const s3 = await enviarCorreo(uid, 'legal', legales.map((f) => f.id), u.email, c.asunto, c.texto, c.html)
      if (s3.ok) {
        await db.from('notificaciones').update({ correo_enviado_en: new Date(ahora).toISOString() }).in('id', legales.map((f) => f.id))
        r.correosEnviados++; legalesEnviadas++; r.correosLegales = legalesEnviadas
      } else { r.correosFallidos++; if (s3.parar) { r.omitido = 'sin_cupo'; break } }
    }
  }
  return r
}
