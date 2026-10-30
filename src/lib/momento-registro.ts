/**
 * Cuándo pedirle los datos a un visitante.
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ CAMBIA Y POR QUÉ
 *
 * Antes: a los **cuatro segundos** de entrar a la portada, un formulario a
 * pantalla completa pidiendo nombre, teléfono y correo. En un Galaxy Fold
 * cerrado eso es literalmente **todo lo que el visitante ve** antes de haber
 * visto una sola propiedad.
 *
 * Es pedir antes de dar. La persona todavía no sabe si el sitio tiene lo que
 * busca, así que lo cierra por reflejo — y de paso aprende que este sitio
 * interrumpe. [[Investigacion - Onboarding y tours de primera vez]] lo dice
 * medido: lo que se dispara solo se descarta; lo que el usuario pide, se
 * completa **123 % más**.
 *
 * Ahora: se ofrece **al segundo anuncio que abre**. Ahí ya hay una conversación
 * — está mirando propiedades concretas, y dejar el teléfono tiene sentido para
 * él, no sólo para nosotros.
 * ─────────────────────────────────────────────────────────────
 *
 * Todo vive en el navegador de cada quien. Si no hay almacenamiento —modo
 * privado— nunca se ofrece: mejor perder la oportunidad que insistir en cada
 * página a alguien que no podemos recordar.
 */

const VISTAS = 'vivebien:fichas-vistas'
const OFRECIDO = 'vivebien:registro-ofrecido'
/** Marca antigua, de cuando el modal se abría solo. Se respeta: ya dijo que no. */
const REGISTRADO = 'vb_registered'

/** A partir de cuántas fichas se ofrece. La segunda ya es interés, no curiosidad. */
export const FICHAS_ANTES_DE_OFRECER = 2

/** Cuántos días se espera antes de volver a ofrecerlo a quien lo cerró. */
export const DIAS_DE_ESPERA = 30

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave) } catch { return null }
}

function escribir(clave: string, valor: string): void {
  try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento: se sigue igual */ }
}

/** Cuenta una ficha abierta y devuelve el total. */
export function contarFichaVista(id: string): number {
  const previas = (leer(VISTAS) ?? '').split(',').filter(Boolean)
  // Por propiedad distinta, no por recarga: abrir tres veces la misma casa es
  // una propiedad mirada, no tres.
  if (!previas.includes(id)) previas.push(id)
  const lista = previas.slice(-20)
  escribir(VISTAS, lista.join(','))
  return lista.length
}

export type Contexto = {
  /** ¿Hay sesión iniciada? A quien ya entró no se le pide que se registre. */
  conSesion: boolean
  /** Cuántas fichas distintas lleva vistas. */
  fichasVistas: number
  ahora?: number
}

/**
 * ¿Es momento de ofrecer el registro?
 *
 * Nunca: con sesión, si ya lo dio, si ya se le ofreció hace poco, o si todavía
 * no ha mirado lo suficiente como para que la pregunta tenga sentido.
 */
export function debeOfrecerRegistro(ctx: Contexto): boolean {
  if (ctx.conSesion) return false
  if (leer(REGISTRADO)) return false
  if (ctx.fichasVistas < FICHAS_ANTES_DE_OFRECER) return false

  const ultimo = Number(leer(OFRECIDO) ?? 0)
  if (Number.isFinite(ultimo) && ultimo > 0) {
    const dias = ((ctx.ahora ?? Date.now()) - ultimo) / 86_400_000
    if (dias < DIAS_DE_ESPERA) return false
  }
  return true
}

/** Deja constancia de que ya se ofreció, para no repetirlo mañana. */
export function marcarOfrecido(ahora: number = Date.now()): void {
  escribir(OFRECIDO, String(ahora))
}
