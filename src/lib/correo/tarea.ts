import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '../portal/tarjeta'
import { CORREO, entornoCorreo, SECRETO_MINIMO, type EntornoCorreo, type EntornoDeCupo, type LimitesCorreo } from './config'
import { enviarCorreo, type DbCorreo } from './enviar'
import { plantillaRecomendaciones } from './plantillas'
import { aTarjetaCorreo, conParecidoA, elegirPropiedades, leerPreferencias, motivoDe, motivoParecido, type PropiedadVista } from './recomendaciones'
import { suscribirAutomaticamente } from './auto-suscripcion'
import { urlBaja, urlBajaUnClic, urlPreferencias } from './suscripcion'

/**
 * La tarea diaria de recomendaciones (D-80). Vercel Hobby sólo permite UNA ejecución al día (±59 min), así que la
 * frecuencia de «cada siete días» se logra con la fecha `proximo_envio_en` de cada persona, no con el reloj del cron.
 *
 * Antes de cada envío, y por persona: se vuelve a leer su estado (una baja o un rebote de hace un minuto cuenta), se
 * consulta el catálogo VIGENTE, se descartan las propiedades de los últimos correos y se reserva el envío en la base (que
 * decide duplicado / supresión / presupuesto). Si no hay nada relevante no se manda nada. Un fallo en una persona no
 * detiene a las demás; un agotamiento del presupuesto sí.
 */

/** Personas que se procesan por ejecución de la tarea cuando está activo el modo de pruebas. */
export const TOPE_LOTE_PRUEBAS = 3

export type ResumenTarea = {
  estado: 'desactivada' | 'pausada' | 'terminada' | 'error'
  motivo?: string
  procesadas: number
  enviadas: number
  sinNovedades: number
  suprimidas: number
  fallidas: number
  presupuestoAgotado: boolean
  /** Altas automáticas hechas en esta corrida (sólo si el interruptor MARKETING_A_TODOS está vigente). */
  altasAutomaticas?: number
}

const vacio = (estado: ResumenTarea['estado'], motivo?: string): ResumenTarea => ({
  estado, motivo, procesadas: 0, enviadas: 0, sinNovedades: 0, suprimidas: 0, fallidas: 0, presupuestoAgotado: false,
})

const DIA = 86_400_000

/** ¿Hay señales de que enviar más correo comercial sería dañino para la reputación del dominio? */
export function debePausarse(s: { enviados7?: number; rebotados7?: number; quejas7?: number } | null): string | null {
  if (!s) return 'salud_desconocida'
  const p = CORREO.pausa
  if ((s.quejas7 ?? 0) >= p.quejas7d) return 'quejas'
  const enviados = s.enviados7 ?? 0
  if (enviados >= p.minimoEnvios && ((s.rebotados7 ?? 0) / enviados) * 100 > p.rebotePorcentaje) return 'rebotes'
  return null
}

/**
 * La última propiedad que esta cuenta abrió (evento `property_view`). Se busca primero en el catálogo ya leído y, si ya no está
 * publicada (vendida, pausada), en la tabla: su tipo sigue sirviendo. Cualquier fallo = sin referencia (se manda lo de siempre).
 */
export async function ultimaPropiedadVista(db: DbCorreo, uid: string, catalogo: Array<PropiedadVista & { id: string }>): Promise<PropiedadVista | null> {
  const ev = await db.from('eventos').select('propiedad_id').eq('uid', uid).eq('nombre', 'property_view').order('creado_en', { ascending: false }).limit(5)
  if (ev.error) return null
  const id = ((ev.data ?? []) as Array<{ propiedad_id: string | null }>).map((x) => x.propiedad_id).find((x): x is string => !!x)
  if (!id) return null
  const enCatalogo = catalogo.find((c) => c.id === id)
  if (enCatalogo) return { tipo: enCatalogo.tipo, operacion: enCatalogo.operacion }
  const fila = await db.from('propiedades').select('tipo, operacion').eq('id', id).maybeSingle()
  return fila.error || !fila.data ? null : { tipo: fila.data.tipo, operacion: fila.data.operacion }
}

export async function ejecutarTareaMarketing(
  db: DbCorreo,
  o: { entorno?: EntornoCorreo; entornoCupo?: EntornoDeCupo; fetch?: typeof fetch; ahora?: Date; limites?: Partial<LimitesCorreo> } = {},
): Promise<ResumenTarea> {
  const env = o.entorno ?? entornoCorreo()
  if (!env.marketing || !env.resendKey || env.secreto.length < SECRETO_MINIMO) return vacio('desactivada', 'banderas_o_claves')
  const ahora = o.ahora ?? new Date()
  const lim = { ...CORREO, ...(o.limites ?? {}) }
  // Modo de pruebas: todo va a UNA bandeja, así que se procesan pocas personas por ejecución (no se inunda ni se gasta la cuota diaria).
  if (env.modoPruebas) lim.loteMarketing = Math.min(lim.loteMarketing, TOPE_LOTE_PRUEBAS)

  const salud = await db.rpc('correo_salud')
  const pausa = debePausarse(salud.error ? null : (salud.data as { enviados7?: number; rebotados7?: number; quejas7?: number }))
  if (pausa) return vacio('pausada', pausa)

  // Alta automática (interruptor MARKETING_A_TODOS, apagado por omisión). Un fallo aquí nunca detiene los envíos a quien YA está suscrito.
  let altas: number | undefined
  try {
    const a = await suscribirAutomaticamente(db, { ahora })
    if (a.activa) altas = a.altas
  } catch { altas = undefined }

  const personas = await db
    .from('correo_suscriptores')
    .select('id, email, nombre, preferencias, uid')
    .eq('estado', 'activa')
    .lte('proximo_envio_en', ahora.toISOString())
    .order('proximo_envio_en', { ascending: true })
    .limit(lim.loteMarketing)
  if (personas.error) return vacio('error', 'leer_suscriptores')
  const lista = (personas.data ?? []) as Array<{ id: string; email: string; nombre: string | null; preferencias: unknown; uid: string | null }>
  const r = vacio('terminada')
  if (altas !== undefined) r.altasAutomaticas = altas
  if (lista.length === 0) return r

  const cat = await db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(500)
  if (cat.error) return vacio('error', 'leer_catalogo')
  const catalogo = (cat.data ?? []) as FilaPropiedadPortal[]

  const proximo = (dias: number) => new Date(ahora.getTime() + dias * DIA).toISOString()
  for (const p of lista) {
    r.procesadas++
    // Estado FRESCO de esta persona: una baja posterior a la lectura de la lista la detiene aquí.
    const fresca = await db.from('correo_suscriptores').select('estado').eq('id', p.id).maybeSingle()
    if (fresca.error || fresca.data?.estado !== 'activa') { r.suprimidas++; continue }

    const previos = await db
      .from('correo_envios')
      .select('propiedades')
      .eq('suscriptor_id', p.id)
      .in('estado', ['enviado', 'entregado'])
      .order('creado_en', { ascending: false })
      .limit(lim.memoriaEnvios)
    const ya = new Set<string>(((previos.data ?? []) as Array<{ propiedades: string[] | null }>).flatMap((x) => x.propiedades ?? []))

    const declaradas = leerPreferencias(p.preferencias)
    // «Parecidas a la última que vio»: sólo si la persona no eligió tipos a mano y tiene cuenta (el historial es por uid).
    const vista = !declaradas.tipos?.length && p.uid ? await ultimaPropiedadVista(db, p.uid, catalogo) : null
    const prefs = conParecidoA(declaradas, vista)
    const elegidas = elegirPropiedades(prefs, catalogo, ya, lim.propiedadesPorCorreo)
    if (elegidas.length === 0) {
      // Nada nuevo y relevante: no se escribe. Se vuelve a mirar dentro de un periodo normal.
      r.sinNovedades++
      await db.from('correo_suscriptores').update({ proximo_envio_en: proximo(lim.entreMarketingDias) }).eq('id', p.id)
      continue
    }

    const correo = plantillaRecomendaciones({
      nombre: p.nombre,
      propiedades: elegidas.map(aTarjetaCorreo),
      motivo: vista && prefs !== declaradas ? motivoParecido(prefs) : motivoDe(prefs),
      urlBaja: urlBaja(env.secreto, p.id),
      urlPreferencias: urlPreferencias(),
    })
    const dia = ahora.toISOString().slice(0, 10)
    const e = await enviarCorreo(
      db,
      {
        clave: `reco/${p.id}/${dia}`,
        categoria: 'marketing',
        tipo: 'recomendaciones',
        para: p.email,
        ...correo,
        suscriptorId: p.id,
        propiedades: elegidas.map((x) => x.id),
        urlBaja: urlBajaUnClic(env.secreto, p.id),
      },
      { entorno: env, fetch: o.fetch, entornoCupo: o.entornoCupo },
    )
    if (e.estado === 'enviado') {
      r.enviadas++
      await db.from('correo_suscriptores').update({ ultimo_envio_en: ahora.toISOString(), proximo_envio_en: proximo(lim.entreMarketingDias) }).eq('id', p.id)
    } else if (e.estado === 'sin_presupuesto') {
      r.presupuestoAgotado = true
      break
    } else if (e.estado === 'error' && e.motivo === 'cupo_sin_confirmar') {
      // No se pudo confirmar el cupo: no se sigue intentando con los demás (el plan gratuito no se arriesga).
      r.presupuestoAgotado = true
      r.fallidas++
      break
    } else if (e.estado === 'suprimido') {
      r.suprimidas++
    } else if (e.estado === 'duplicado') {
      // Ya se mandó (o se está mandando) hoy: se agenda como si se hubiera enviado.
      await db.from('correo_suscriptores').update({ proximo_envio_en: proximo(lim.entreMarketingDias) }).eq('id', p.id)
    } else {
      r.fallidas++
    }
  }
  return r
}
