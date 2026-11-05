import { entornoCorreo } from './config'
import type { DbCorreo } from './enviar'
import { cuotaDeCabeceras, leerCuotaDeResend, type LecturaDeCuota } from './resend'

/**
 * Registro AUTOMÁTICO de la lectura del consumo de Resend (D-82): lo que hacía a mano el Super Admin en Marketing → «Estado y cupo de Resend», pero tomando los
 * números de las cabeceras de cuota que devuelve el propio proveedor. Pasa por la MISMA función SQL (`correo_conciliar`), con el actor `automatico:…`
 * y una nota que lo dice, así que la pantalla y la compuerta lo ven igual que una lectura manual. Una lectura manual sigue siendo posible.
 *
 * Dos caminos, los dos fallan cerrado (sin cabeceras, con valores raros o sin base NO guardan nada; se queda la última lectura, que vence a los 8 días):
 *  · la tarea diaria (`conciliarCuotaDeResend`), que mantiene la lectura fresca aunque no salga ningún correo;
 *  · cada envío real exitoso (`registrarCuotaVista`), que la refresca con la respuesta del propio envío. Nunca lanza y tiene tope de tiempo.
 *
 * ENVÍOS EN VUELO (revisión de Codex): la compuerta suma a la lectura los envíos del libro con `creado_en >= leido_en`. Un envío ya reservado pero que todavía no llegó
 * a Resend tiene `creado_en` ANTERIOR a la lectura y Resend aún no lo cuenta: quedaría sin contar. Por eso, antes de guardar, se SUMAN a los dos números los envíos
 * de producción que siguen «pendiente» (últimos 10 minutos). Es conservador: si alguno ya lo había contado Resend, se cuenta dos veces (sobra, nunca falta). Si no
 * se puede contar, no se guarda.
 */
export const ACTOR_AUTOMATICO = 'automatico:cuota-resend'
export const NOTA_AUTOMATICA = 'Lectura automática: cabeceras de cuota de Resend'
export const ACTOR_DE_ENVIO = 'automatico:cuota-en-envio'
export const NOTA_DE_ENVIO = 'Lectura automática: cabeceras de cuota de la respuesta de un envío'
/** Como mucho una lectura por envío cada 10 minutos por instancia: la tabla no crece por cada correo. */
export const ESTRANGULADOR_MS = 10 * 60 * 1000
/** Tope de tiempo de guardar una lectura desde la ruta de un envío: las escrituras a la base no tienen tiempo límite propio. */
export const TOPE_DE_ESCRITURA_MS = 2500
const VENTANA_EN_VUELO_MS = 10 * 60 * 1000

export type ResultadoConciliacion =
  | { ok: true; dia: number; mes: number }
  | { ok: false; motivo: string; detalle?: Omit<Extract<LecturaDeCuota, { ok: false }>, 'ok' | 'motivo'> }

/** Envíos de producción reservados que todavía no terminaron (nulo si no se pudo contar: entonces no se guarda). */
async function enVuelo(db: DbCorreo, ahora: number): Promise<number | null> {
  try {
    const desde = new Date(ahora - VENTANA_EN_VUELO_MS).toISOString()
    const r = await db.from('correo_envios').select('id', { count: 'exact', head: true }).eq('entorno', 'produccion').eq('estado', 'pendiente').gte('creado_en', desde)
    return !r?.error && typeof r?.count === 'number' && r.count >= 0 ? r.count : null
  } catch {
    return null
  }
}

async function guardar(db: DbCorreo, dia: number, mes: number, actor: string, nota: string, ahora: number): Promise<boolean> {
  try {
    const extra = await enVuelo(db, ahora)
    if (extra === null) return false
    const { data, error } = await db.rpc('correo_conciliar', { p_dia: dia + extra, p_mes: mes + extra, p_actor: actor, p_nota: nota })
    return !error && !!data
  } catch {
    return false
  }
}

export async function conciliarCuotaDeResend(db: DbCorreo, o: { apiKey?: string; fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<ResultadoConciliacion> {
  // La llave sólo se lee en el módulo de configuración (una prueba lo obliga).
  const lectura = await leerCuotaDeResend({ apiKey: o.apiKey ?? entornoCorreo(o.env).resendKey, fetch: o.fetch, env: o.env })
  if (!lectura.ok) return { ok: false, motivo: lectura.motivo, detalle: { estado: lectura.estado, cabeceras: lectura.cabeceras, crudo: lectura.crudo } }
  if (!(await guardar(db, lectura.dia, lectura.mes, ACTOR_AUTOMATICO, NOTA_AUTOMATICA, Date.now()))) return { ok: false, motivo: 'no_se_guardo' }
  return { ok: true, dia: lectura.dia, mes: lectura.mes }
}

let ultimaEscritura = 0
/** Sólo para pruebas. */
export function reiniciarEstranguladorDeCuota(): void {
  ultimaEscritura = 0
}

/** Resuelve con `valor` si `p` no termina en `ms` (sin dejar el temporizador vivo). */
function conTope<T>(p: Promise<T>, ms: number, valor: T): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<T>((resolver) => { temporizador = setTimeout(() => resolver(valor), ms) })
  return Promise.race([p, tope]).finally(() => clearTimeout(temporizador))
}

/**
 * Se llama DESPUÉS de un envío real exitoso, con las cabeceras de la respuesta de Resend. Nunca lanza y nunca espera más de `topeMs`. Una respuesta simulada
 * (fuera de producción) no trae cabeceras de cuota, así que no escribe. Devuelve si guardó.
 */
export async function registrarCuotaVista(db: DbCorreo, cabeceras: Headers, ahora: number = Date.now(), topeMs: number = TOPE_DE_ESCRITURA_MS): Promise<boolean> {
  try {
    if (ahora - ultimaEscritura < ESTRANGULADOR_MS) return false
    const lectura = cuotaDeCabeceras(cabeceras)
    if (!lectura.ok) return false
    ultimaEscritura = ahora // se reserva antes de escribir: dos envíos simultáneos no escriben dos veces
    const ok = await conTope(guardar(db, lectura.dia, lectura.mes, ACTOR_DE_ENVIO, NOTA_DE_ENVIO, ahora), topeMs, false)
    if (!ok) ultimaEscritura = 0 // si no se pudo guardar (o tardó demasiado), el siguiente envío lo intenta
    return ok
  } catch {
    return false
  }
}
