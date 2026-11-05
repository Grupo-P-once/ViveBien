import type { DbCorreo } from './enviar'
import { claveDeUsoResend, entornoDeCupo } from './config'
import { cuotaDeCabeceras, leerUsoDeResend } from './resend'

/**
 * Registro AUTOMÁTICO de la lectura del consumo de Resend tras un envío real exitoso (D-82): lo que hace a mano el Super Admin en Marketing → «Estado y cupo de
 * Resend», pero con los números de las cabeceras de cuota de la respuesta del propio envío. Pasa por la MISMA función SQL (`correo_conciliar`), con el actor
 * `automatico:cuota-en-envio` y una nota que lo dice, así que la pantalla y la compuerta lo ven igual que una lectura manual. La lectura manual sigue siendo posible
 * y necesaria cuando no hay envíos.
 *
 * Falla cerrado (sin cabeceras, con valores raros o sin base NO guarda nada; se queda la última lectura, que vence a los 8 días). Nunca lanza y tiene tope de tiempo.
 * La tarea diaria con una petición vacía se retiró: Resend no devolvió las cabeceras en la prueba de Producción del 5-nov-2026.
 *
 * ENVÍOS EN VUELO (revisión de Codex): la compuerta suma a la lectura los envíos del libro con `creado_en >= leido_en`. Un envío ya reservado pero que todavía no llegó
 * a Resend tiene `creado_en` ANTERIOR a la lectura y Resend aún no lo cuenta: quedaría sin contar. Por eso, antes de guardar, se SUMAN a los dos números los envíos
 * de producción que siguen «pendiente» (últimos 10 minutos). Es conservador: si alguno ya lo había contado Resend, se cuenta dos veces (sobra, nunca falta). Si no
 * se puede contar, no se guarda.
 */
export const ACTOR_DE_ENVIO = 'automatico:cuota-en-envio'
export const NOTA_DE_ENVIO = 'Lectura automática: cabeceras de cuota de la respuesta de un envío'
/** Como mucho una lectura por envío cada 10 minutos por instancia: la tabla no crece por cada correo. */
export const ESTRANGULADOR_MS = 10 * 60 * 1000
/** Tope de tiempo de guardar una lectura desde la ruta de un envío: las escrituras a la base no tienen tiempo límite propio. */
export const TOPE_DE_ESCRITURA_MS = 2500
const VENTANA_EN_VUELO_MS = 10 * 60 * 1000

/**
 * Envíos de producción reservados en los últimos 10 minutos, en CUALQUIER estado (nulo si no se pudo contar: entonces no se guarda). Revisión de Codex (D-83): uno que terminó
 * DESPUÉS de que Resend tomó su foto pero ANTES de guardar ya no está «pendiente» y tampoco lo ve la compuerta (`creado_en` anterior a la lectura): por eso se cuentan todos.
 * Sobra (si Resend ya lo contó se cuenta dos veces), nunca falta.
 */
async function enVuelo(db: DbCorreo, ahora: number): Promise<number | null> {
  try {
    const desde = new Date(ahora - VENTANA_EN_VUELO_MS).toISOString()
    const r = await db.from('correo_envios').select('id', { count: 'exact', head: true }).eq('entorno', 'produccion').gte('creado_en', desde)
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

export const ACTOR_USO = 'automatico:uso-resend'
export const NOTA_USO = 'Lectura automática: GET /usage de Resend'

export type ResultadoUso = { ok: true; dia: number; mes: number } | { ok: false; motivo: string; estado?: number }

/**
 * Lectura diaria y automática del consumo (D-83): consulta `GET /usage` con la llave aparte y la guarda por la MISMA función SQL que el panel (`correo_conciliar`),
 * con actor automático. Fuera de producción no toca la red. Sin llave no hace nada. Si no se puede leer o guardar, no guarda nada (queda la última lectura, que vence a los 8 días).
 */
export async function conciliarUsoDeResend(db: DbCorreo, o: { apiKey?: string; fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<ResultadoUso> {
  if (entornoDeCupo(o.env) !== 'produccion') return { ok: false, motivo: 'fuera_de_produccion' }
  // La llave sólo se pide a `config.ts`, y sólo desde aquí.
  const lectura = await leerUsoDeResend({ apiKey: o.apiKey ?? claveDeUsoResend(o.env), fetch: o.fetch })
  if (!lectura.ok) return { ok: false, motivo: lectura.motivo, estado: lectura.estado }
  if (!(await guardar(db, lectura.dia, lectura.mes, ACTOR_USO, NOTA_USO, Date.now()))) return { ok: false, motivo: 'no_se_guardo' }
  return { ok: true, dia: lectura.dia, mes: lectura.mes }
}
